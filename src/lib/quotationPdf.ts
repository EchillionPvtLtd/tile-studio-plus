import type { jsPDF as JsPDF } from 'jspdf';
import type { Quote } from './quotation';
import { WASTAGE } from './quotation';

export interface ShopProfile {
  shopName: string;
  logoUrl: string | null;
  /** Cover banner shown in the visualizer; the quotation PDF does not use it. */
  coverPhotoUrl?: string | null;
  coverLinkUrl?: string | null;
  companyName: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
  vatNo: string | null;
}

export interface QuotationPdfInput {
  quoteNo: string;
  date: Date;
  validDays: number;
  shop: ShopProfile | null;
  customer: { name: string; phone: string };
  /** Room size is optional: a customer's own photo has no known dimensions. */
  room: { label: string; presetName: string | null; lengthFt?: number; widthFt?: number; heightFt?: number };
  quote: Quote;
  /** Plain-language finish notes (pattern, grout, paint, panels). */
  finishes: string[];
  /** JPEG data URL of the 3D (or 2D room photo) view, if available. */
  snapshot: string | null;
}

// A4 portrait, millimetres
const PAGE_W = 210;
const PAGE_H = 297;
const M = 16;
const CONTENT_W = PAGE_W - M * 2;
const INK = [16, 18, 22] as const;
const MUTED = [107, 110, 118] as const;
const RULE = [229, 231, 235] as const;
const PANEL = [243, 244, 246] as const;

/** The standard PDF fonts only cover Latin-1; swap anything else for a safe equivalent. */
function clean(s: string): string {
  return s
    .replace(/[×✕]/g, 'x')
    .replace(/[•·]/g, '-')
    .replace(/[–—]/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\x20-\xFF]/g, '');
}

function money(n: number): string {
  return `LKR ${Math.round(n).toLocaleString('en-US')}`;
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

interface LoadedImage {
  data: string;
  w: number;
  h: number;
  format: 'JPEG' | 'PNG';
}

/**
 * Loads any image (same-origin, data URL or remote via the tile proxy) onto a white background.
 * Photos come back as JPEG; pass `lossless` for a logo, so its flat colours and sharp edges stay crisp.
 */
async function loadImage(src: string | null | undefined, maxPx = 600, lossless = false): Promise<LoadedImage | null> {
  if (!src) return null;
  let url = src;
  if (/^https?:\/\//i.test(src) && !src.startsWith(window.location.origin)) {
    url = `/api/tiles/proxy?url=${encodeURIComponent(src)}`;
  }
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.crossOrigin = 'anonymous';
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = url;
    });
    const scale = Math.min(1, maxPx / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    return lossless
      ? { data: canvas.toDataURL('image/png'), w, h, format: 'PNG' }
      : { data: canvas.toDataURL('image/jpeg', 0.88), w, h, format: 'JPEG' };
  } catch {
    return null;
  }
}

function fit(img: LoadedImage, maxW: number, maxH: number) {
  const r = Math.min(maxW / img.w, maxH / img.h);
  return { w: img.w * r, h: img.h * r };
}

export async function createQuotationPdf(input: QuotationPdfInput): Promise<JsPDF> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  doc.setProperties({ title: `Quotation ${input.quoteNo}`, creator: 'Tile Studio Plus+' });

  const [logo, snapshot, ...thumbs] = await Promise.all([
    loadImage(input.shop?.logoUrl, 900, true),
    input.snapshot ? loadImage(input.snapshot, 1600) : Promise.resolve(null),
    ...input.quote.lines.map((l) => loadImage(l.tile.previewUrl || l.tile.textureUrl, 160)),
  ]);

  const text = (s: string, x: number, y: number, opts?: Parameters<JsPDF['text']>[3]) => doc.text(clean(s), x, y, opts);
  const font = (size: number, style: 'normal' | 'bold' = 'normal', color: readonly number[] = INK) => {
    doc.setFont('helvetica', style);
    doc.setFontSize(size);
    doc.setTextColor(color[0], color[1], color[2]);
  };
  const rule = (y: number) => {
    doc.setDrawColor(RULE[0], RULE[1], RULE[2]);
    doc.setLineWidth(0.3);
    doc.line(M, y, PAGE_W - M, y);
  };

  // ── Header: showroom identity (left) and quote meta (right) ──
  let y = M;
  let textX = M;
  const shop = input.shop;
  // The logo sits in a thin frame so it reads clearly on white paper, even when the logo itself has a white background.
  // A showroom whose logo is missing or will not load gets its initial instead, so the header never looks unbranded.
  let brandH = 0;
  if (logo) {
    const PAD = 2;
    const s = fit(logo, 44, 24);
    doc.setDrawColor(RULE[0], RULE[1], RULE[2]);
    doc.setLineWidth(0.3);
    doc.roundedRect(M, y, s.w + PAD * 2, s.h + PAD * 2, 2, 2, 'S');
    doc.addImage(logo.data, logo.format, M + PAD, y + PAD, s.w, s.h);
    textX = M + s.w + PAD * 2 + 6;
    brandH = s.h + PAD * 2;
  } else if (shop) {
    const SIZE = 22;
    doc.setFillColor(INK[0], INK[1], INK[2]);
    doc.roundedRect(M, y, SIZE, SIZE, 3, 3, 'F');
    font(18, 'bold', [255, 255, 255]);
    text((shop.shopName.trim()[0] || 'S').toUpperCase(), M + SIZE / 2, y + SIZE / 2 + 2.3, { align: 'center' });
    textX = M + SIZE + 6;
    brandH = SIZE;
  }
  font(14, 'bold');
  text(shop?.shopName || 'Showroom', textX, y + 5);
  font(8, 'normal', MUTED);
  const shopLines = [
    shop?.companyName,
    shop?.address,
    [shop?.phone ? `Tel: ${shop.phone}` : null, shop?.whatsapp && shop.whatsapp !== shop.phone ? `WhatsApp: ${shop.whatsapp}` : null].filter(Boolean).join('  |  '),
    [shop?.email, shop?.website].filter(Boolean).join('  |  '),
    shop?.vatNo ? (/^vat/i.test(shop.vatNo) ? shop.vatNo : `VAT ${shop.vatNo}`) : null,
  ].filter((l): l is string => !!l && l.trim().length > 0);
  let sy = y + 10;
  for (const line of shopLines) {
    const wrapped = doc.splitTextToSize(clean(line), 100) as string[];
    doc.text(wrapped, textX, sy);
    sy += wrapped.length * 3.6;
  }

  const rightX = PAGE_W - M;
  font(18, 'bold');
  text('QUOTATION', rightX, y + 6, { align: 'right' });
  font(8.5, 'normal', MUTED);
  const valid = new Date(input.date.getTime() + input.validDays * 86400000);
  text(`No. ${input.quoteNo}`, rightX, y + 12, { align: 'right' });
  text(`Date: ${fmtDate(input.date)}`, rightX, y + 16, { align: 'right' });
  text(`Valid until: ${fmtDate(valid)}`, rightX, y + 20, { align: 'right' });

  y = Math.max(sy, y + 24, y + brandH) + 3;
  rule(y);
  y += 7;

  // ── Customer and room ──
  const colW = CONTENT_W / 2;
  font(7.5, 'bold', MUTED);
  text('PREPARED FOR', M, y);
  text('ROOM', M + colW, y);
  font(10, 'bold');
  text(input.customer.name.trim() || 'Walk-in customer', M, y + 5.5);
  const r = input.room;
  text(r.presetName ? `${r.label} - ${r.presetName}` : r.label, M + colW, y + 5.5);
  font(8.5, 'normal', MUTED);
  if (input.customer.phone.trim()) text(input.customer.phone.trim(), M, y + 10);
  const m = (ft: number) => (ft * 0.3048).toFixed(1);
  if (r.lengthFt && r.widthFt && r.heightFt) {
    text(`${r.lengthFt} x ${r.widthFt} ft, ${r.heightFt} ft ceiling  (${m(r.lengthFt)} x ${m(r.widthFt)} x ${m(r.heightFt)} m)`, M + colW, y + 10);
    text(`Floor area ${Math.round(r.lengthFt * r.widthFt)} sq.ft`, M + colW, y + 14);
  } else {
    text('Areas measured from the room photo', M + colW, y + 10);
  }
  y += 21;

  // ── 3D view ──
  if (snapshot) {
    const s = fit(snapshot, CONTENT_W, 92);
    const x = M + (CONTENT_W - s.w) / 2;
    doc.addImage(snapshot.data, 'JPEG', x, y, s.w, s.h);
    doc.setDrawColor(RULE[0], RULE[1], RULE[2]);
    doc.rect(x, y, s.w, s.h);
    y += s.h + 8;
  }

  // ── Line items ──
  const cols = [
    { key: 'surface', label: 'Surface', w: 34, align: 'left' as const },
    { key: 'tile', label: 'Tile', w: 62, align: 'left' as const },
    { key: 'area', label: 'Area (sq.ft)', w: 20, align: 'right' as const },
    { key: 'qty', label: 'Tiles', w: 14, align: 'right' as const },
    { key: 'rate', label: 'Rate / sq.ft', w: 22, align: 'right' as const },
    { key: 'amount', label: 'Amount', w: 26, align: 'right' as const },
  ];
  const colX: number[] = [];
  cols.reduce((x, c) => (colX.push(x), x + c.w), M);
  const cellX = (i: number) => (cols[i].align === 'right' ? colX[i] + cols[i].w - 2 : colX[i] + 2);

  const drawTableHeader = () => {
    doc.setFillColor(PANEL[0], PANEL[1], PANEL[2]);
    doc.rect(M, y, CONTENT_W, 8, 'F');
    font(7.5, 'bold', MUTED);
    cols.forEach((c, i) => text(c.label.toUpperCase(), cellX(i), y + 5.2, { align: c.align }));
    y += 8;
  };

  const footerReserve = 24;
  drawTableHeader();
  const ROW_H = 14;

  if (input.quote.lines.length === 0) {
    font(9, 'normal', MUTED);
    text('No tiles have been selected yet.', M + 2, y + 8);
    y += ROW_H;
  }

  input.quote.lines.forEach((line, idx) => {
    if (y + ROW_H > PAGE_H - footerReserve) {
      doc.addPage();
      y = M;
      drawTableHeader();
    }
    const mid = y + ROW_H / 2;
    font(9, 'bold');
    text(line.label, cellX(0), mid + 1.2);

    const thumb = thumbs[idx];
    let tx = colX[1] + 2;
    if (thumb) {
      doc.addImage(thumb.data, 'JPEG', tx, y + 2.5, 9, 9);
      tx += 11.5;
    }
    font(8.5, 'bold');
    const name = doc.splitTextToSize(clean(line.tile.name), cols[1].w - (tx - colX[1]) - 2) as string[];
    doc.text(name[0], tx, mid - 0.6);
    font(7, 'normal', MUTED);
    text(`${line.tile.sku} - ${line.tile.widthMm}x${line.tile.heightMm} mm - ${line.tile.finish}`, tx, mid + 3.2);

    font(8.5, 'normal');
    text(line.areaSqFt.toFixed(1), cellX(2), mid + 1.2, { align: 'right' });
    text(String(line.tiles), cellX(3), mid + 1.2, { align: 'right' });
    text(money(line.tile.pricePerSqFt || 0), cellX(4), mid + 1.2, { align: 'right' });
    font(8.5, 'bold');
    text(money(line.amount), cellX(5), mid + 1.2, { align: 'right' });

    y += ROW_H;
    rule(y);
  });

  // ── Total ──
  if (y + 40 > PAGE_H - footerReserve) {
    doc.addPage();
    y = M;
  }
  y += 5;
  const boxW = 74;
  const boxX = PAGE_W - M - boxW;
  doc.setFillColor(INK[0], INK[1], INK[2]);
  doc.roundedRect(boxX, y, boxW, 13, 2, 2, 'F');
  font(8, 'bold', [200, 200, 205]);
  text('ESTIMATED TOTAL', boxX + 4, y + 8);
  font(12, 'bold', [255, 255, 255]);
  text(money(input.quote.total), boxX + boxW - 4, y + 8.4, { align: 'right' });

  // ── Finishes and notes (left of / below the total) ──
  font(7.5, 'bold', MUTED);
  text('FINISHES', M, y + 4);
  font(8.5, 'normal');
  let ny = y + 9;
  for (const f of input.finishes) {
    const wrapped = doc.splitTextToSize(clean(f), boxX - M - 8) as string[];
    if (ny + wrapped.length * 4 > PAGE_H - footerReserve) {
      doc.addPage();
      ny = M;
    }
    doc.text(wrapped, M, ny);
    ny += wrapped.length * 4;
  }
  y = Math.max(ny, y + 17) + 6;

  const notes = [
    `Tile quantities include ${Math.round(WASTAGE * 100)}% for cutting and breakage; wall areas exclude door and window openings.`,
    'Prices are indicative and subject to site measurement and stock availability.',
    'Adhesive, grout, skirting and installation labour are not included unless stated.',
  ];
  if (y + 22 > PAGE_H - footerReserve) {
    doc.addPage();
    y = M;
  }
  font(7.5, 'bold', MUTED);
  text('NOTES', M, y);
  font(7.5, 'normal', MUTED);
  notes.forEach((n, i) => {
    const wrapped = doc.splitTextToSize(clean(`${i + 1}. ${n}`), CONTENT_W) as string[];
    doc.text(wrapped, M, y + 4.5 + i * 4);
  });

  // ── Footer on every page ──
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    rule(PAGE_H - 14);
    font(7.5, 'normal', MUTED);
    const contact = [shop?.shopName, shop?.phone, shop?.email].filter(Boolean).join('  |  ');
    text(contact || 'Tile Studio Plus+', M, PAGE_H - 9);
    text(`Page ${p} of ${pages}`, PAGE_W - M, PAGE_H - 9, { align: 'right' });
  }

  return doc;
}

export function quotationFileName(quoteNo: string) {
  return `Quotation-${quoteNo}.pdf`;
}

export async function downloadQuotationPdf(input: QuotationPdfInput) {
  const doc = await createQuotationPdf(input);
  doc.save(quotationFileName(input.quoteNo));
}

/** Opens the browser print dialog for the same PDF the customer would download. */
export async function printQuotationPdf(input: QuotationPdfInput) {
  const doc = await createQuotationPdf(input);
  const url = URL.createObjectURL(doc.output('blob'));
  const frame = document.createElement('iframe');
  // Off-screen but real-sized: Chrome's PDF viewer won't print from a zero-size or hidden frame.
  frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:800px;height:600px;border:0';
  frame.src = url;
  const cleanup = () => {
    frame.remove();
    URL.revokeObjectURL(url);
  };
  frame.onload = () => {
    try {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
      // Keep the frame alive while the dialog is open; release it afterwards.
      setTimeout(cleanup, 60_000);
    } catch {
      // Some browsers refuse to print a PDF inside a frame — open it in a tab instead.
      window.open(url, '_blank', 'noopener');
      setTimeout(cleanup, 60_000);
    }
  };
  document.body.appendChild(frame);
}
