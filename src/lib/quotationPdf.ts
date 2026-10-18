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
  /** Only name and phone are asked for today; email and address are printed when present. Empty fields are left out. */
  customer: { name: string; phone: string; email?: string; address?: string };
  /** Room size is optional: a customer's own photo has no known dimensions. */
  room: { label: string; presetName: string | null; lengthFt?: number; widthFt?: number; heightFt?: number; wallAreaSqFt?: number };
  quote: Quote;
  /** Plain-language finish notes (pattern, grout, paint, panels). */
  finishes: string[];
  /** JPEG data URL of the 3D (or 2D room photo) view, if available. */
  snapshot: string | null;
  /** Caption of the picture; defaults to the 3D wording. */
  previewCaption?: string;
  /** The provider's own terms. When absent, neutral estimate notes are printed. */
  terms?: string[];
  /** Extra lines between the tile subtotal and the total: a positive amount is a charge or tax, a negative one a discount. */
  charges?: { label: string; amount: number }[];
}

// ── Page and monochrome Tile Studio Plus+ theme (A4 portrait, millimetres) ──
const PAGE_W = 210;
const PAGE_H = 297;
/** Content margin; the page frame sits outside it. */
const M = 17;
const CW = PAGE_W - M * 2;
/** Black frame, with a fine grey frame just inside it. */
const FRAME_OUT = 9;
const FRAME_IN = 11;
/** Content stops here so it never runs into the footer. */
const BOTTOM = PAGE_H - 27;
const FOOT_RULE = PAGE_H - 23;

type Rgb = readonly [number, number, number];
const BLACK: Rgb = [0, 0, 0];
const INK: Rgb = [17, 17, 17]; // deep charcoal, used for text
const WHITE: Rgb = [255, 255, 255];
const LIGHT: Rgb = [245, 245, 245];
const BORDER: Rgb = [217, 217, 217];
const MUTED: Rgb = [102, 102, 102];

const LOGO_TS = '/Logo/TS+.BK.png';
// The Echilion logo in its own colours, for a white page
const LOGO_ECHILION = '/Logo/logo_echilion_wh_tight.png';

/** Echilion, the technology partner, credited on the last page of every quotation. */
const ECHILION = {
  phone: '+94 74 155 9898',
  email: 'info@echilion.com',
  website: 'https://echilion.com/',
  websiteLabel: 'echilion.com',
};

/** The standard PDF fonts only cover Latin-1; swap anything else for a safe equivalent. */
function clean(s: string): string {
  return s
    .replace(/✕/g, 'x')
    .replace(/[•]/g, '-')
    .replace(/[–—]/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\x20-\xFF]/g, '');
}

function money(n: number): string {
  return `LKR ${Math.round(n).toLocaleString('en-US')}`;
}

function num(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export interface LoadedImage {
  data: string;
  w: number;
  h: number;
  format: 'JPEG' | 'PNG';
}

/** Everything the layout needs that has to be fetched first; kept apart so the layout can be run without a browser. */
export interface QuotationImages {
  logo: LoadedImage | null;
  tsLogo: LoadedImage | null;
  echilion: LoadedImage | null;
  snapshot: LoadedImage | null;
  /** One per quote line, in order. */
  thumbs: (LoadedImage | null)[];
}

/**
 * The part of a picture that is not a plain border: rows and columns around the edge that are one flat colour
 * (the colour of the four corners) are cut away, so a render never sits inside a big empty frame. Does nothing when the
 * corners differ, when very little would go, or when the picture would be cut by more than a quarter on a side.
 */
function contentBox(ctx: CanvasRenderingContext2D, w: number, h: number): { x: number; y: number; w: number; h: number } {
  const whole = { x: 0, y: 0, w, h };
  let px: Uint8ClampedArray;
  try {
    px = ctx.getImageData(0, 0, w, h).data;
  } catch {
    return whole;
  }
  const at = (x: number, y: number) => (y * w + x) * 4;
  const corners = [at(0, 0), at(w - 1, 0), at(0, h - 1), at(w - 1, h - 1)];
  const TOL = 14;
  const same = (i: number, j: number) => Math.abs(px[i] - px[j]) <= TOL && Math.abs(px[i + 1] - px[j + 1]) <= TOL && Math.abs(px[i + 2] - px[j + 2]) <= TOL;
  if (!corners.every((c) => same(c, corners[0]))) return whole;
  const bg = corners[0];
  const rowFlat = (y: number) => {
    for (let x = 0; x < w; x += 2) if (!same(at(x, y), bg)) return false;
    return true;
  };
  const colFlat = (x: number) => {
    for (let y = 0; y < h; y += 2) if (!same(at(x, y), bg)) return false;
    return true;
  };
  const maxY = Math.floor(h * 0.25);
  const maxX = Math.floor(w * 0.25);
  let top = 0;
  while (top < maxY && rowFlat(top)) top++;
  let bottom = 0;
  while (bottom < maxY && rowFlat(h - 1 - bottom)) bottom++;
  let left = 0;
  while (left < maxX && colFlat(left)) left++;
  let right = 0;
  while (right < maxX && colFlat(w - 1 - right)) right++;
  if ((top + bottom) / h < 0.04 && (left + right) / w < 0.04) return whole;
  const padX = Math.round(w * 0.015);
  const padY = Math.round(h * 0.015);
  const x = Math.max(0, left - padX);
  const y = Math.max(0, top - padY);
  return { x, y, w: Math.max(1, Math.min(w, w - right + padX) - x), h: Math.max(1, Math.min(h, h - bottom + padY) - y) };
}

/**
 * Loads any image (same-origin, data URL or remote via the tile proxy) onto a white background.
 * Photos come back as JPEG; pass `lossless` for a logo, so its flat colours and sharp edges stay crisp.
 * Pass `trim` for a rendered view, to cut away a flat-coloured margin around the room.
 */
async function loadImage(src: string | null | undefined, maxPx = 600, lossless = false, trim = false): Promise<LoadedImage | null> {
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
    let canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    let ctx = canvas.getContext('2d');
    if (!ctx) return null;
    // A see-through picture is flattened onto white, never onto black
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    let outW = w;
    let outH = h;
    if (trim) {
      const box = contentBox(ctx, w, h);
      if (box.w < w || box.h < h) {
        const cropped = document.createElement('canvas');
        cropped.width = box.w;
        cropped.height = box.h;
        const cctx = cropped.getContext('2d');
        if (cctx) {
          cctx.drawImage(canvas, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
          canvas = cropped;
          ctx = cctx;
          outW = box.w;
          outH = box.h;
        }
      }
    }
    return lossless
      ? { data: canvas.toDataURL('image/png'), w: outW, h: outH, format: 'PNG' }
      : { data: canvas.toDataURL('image/jpeg', 0.9), w: outW, h: outH, format: 'JPEG' };
  } catch {
    return null;
  }
}

function fit(img: LoadedImage, maxW: number, maxH: number) {
  const r = Math.min(maxW / img.w, maxH / img.h);
  return { w: img.w * r, h: img.h * r };
}

type Font = 'normal' | 'bold' | 'italic';

/**
 * Lays the quotation out on a jsPDF document. Pure drawing: no network or browser calls, so it can be exercised
 * from tests with pre-made images.
 */
export function renderQuotation(jsPDF: typeof JsPDF, input: QuotationPdfInput, img: QuotationImages): JsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const shop = input.shop;
  doc.setProperties({
    title: `Quotation ${input.quoteNo}`,
    subject: '3D Tile Visualization & Project Quotation',
    author: shop?.shopName || 'Tile Studio Plus+',
    creator: 'Tile Studio Plus+',
  });

  // ── drawing helpers ──
  const text = (s: string, x: number, y: number, opts?: Parameters<JsPDF['text']>[3]) => doc.text(clean(s), x, y, opts);
  const font = (size: number, style: Font = 'normal', color: Rgb = INK) => {
    doc.setFont('helvetica', style);
    doc.setFontSize(size);
    doc.setTextColor(color[0], color[1], color[2]);
  };
  const fill = (c: Rgb) => doc.setFillColor(c[0], c[1], c[2]);
  const stroke = (c: Rgb, w = 0.25) => {
    doc.setDrawColor(c[0], c[1], c[2]);
    doc.setLineWidth(w);
  };
  const hline = (y: number, x1 = M, x2 = PAGE_W - M, c: Rgb = BORDER, w = 0.25) => {
    stroke(c, w);
    doc.line(x1, y, x2, y);
  };
  /** Wraps `s` to `w` mm at the given font; returns the lines (measured with that font, so call font() first via this). */
  const wrap = (s: string, w: number, size: number, style: Font = 'normal'): string[] => {
    font(size, style);
    return doc.splitTextToSize(clean(s), w) as string[];
  };
  const limit = (lines: string[], max: number): string[] => {
    if (lines.length <= max) return lines;
    const kept = lines.slice(0, max);
    kept[max - 1] = kept[max - 1].replace(/\s*\S{0,3}$/, '') + '...';
    return kept;
  };
  const addImg = (i: LoadedImage, x: number, y: number, w: number, h: number) => doc.addImage(i.data, i.format, x, y, w, h);

  let y = M;

  // Pages after the first carry a slim running header, so a continued table never looks orphaned.
  const continuationHeader = () => {
    if (img.tsLogo) {
      const s = fit(img.tsLogo, 22, 6.5);
      addImg(img.tsLogo, M, M, s.w, s.h);
    } else {
      font(9, 'bold');
      text('Tile Studio Plus+', M, M + 5);
    }
    font(7.5, 'normal', MUTED);
    text(`Quotation ${input.quoteNo}`, PAGE_W - M, M + 4.6, { align: 'right' });
    hline(M + 9, M, PAGE_W - M, BLACK, 0.4);
    y = M + 15;
  };
  const newPage = () => {
    doc.addPage();
    continuationHeader();
  };
  /** Starts a new page unless `h` mm still fit. Keeps a heading together with the content that follows it. */
  const ensure = (h: number) => {
    if (y + h > BOTTOM) newPage();
  };
  /** A small caps heading with a fine grey rule under it. */
  const section = (title: string, x = M, w = CW) => {
    font(8, 'bold', BLACK);
    text(title, x, y + 3.2, { charSpace: 0.35 });
    hline(y + 5.4, x, x + w, BORDER, 0.25);
    y += 8.6;
  };

  // ── Header ──
  {
    let leftBottom = y;
    if (img.tsLogo) {
      const s = fit(img.tsLogo, 40, 13);
      addImg(img.tsLogo, M, y, s.w, s.h);
      leftBottom = y + s.h;
    } else {
      font(18, 'bold', BLACK);
      text('Tile Studio Plus+', M, y + 9);
      leftBottom = y + 11;
    }
    font(7.5, 'normal', MUTED);
    text('3D Tile Visualization & Project Quotation', M, leftBottom + 5);

    const right = PAGE_W - M;
    font(22, 'bold', BLACK);
    text('QUOTATION', right, y + 8.5, { align: 'right' });
    font(8, 'normal', MUTED);
    const valid = new Date(input.date.getTime() + input.validDays * 86400000);
    text(`No. ${input.quoteNo}`, right, y + 14.5, { align: 'right' });
    text(`Issued: ${fmtDate(input.date)}`, right, y + 18.7, { align: 'right' });
    text(`Valid until: ${fmtDate(valid)}`, right, y + 22.9, { align: 'right' });

    y += 28;
    hline(y, M, PAGE_W - M, BLACK, 0.6);
    y += 6;
  }

  // ── Prepared for / Prepared by ──
  {
    type Row = { lines: string[]; size: number; style: Font; color: Rgb; lh: number };
    const gap = 6;
    const PADX = 5;

    const forRows: Row[] = [];
    const c = input.customer;
    // Dimensions are read before the rows are made, so each column wraps to its own width
    const hasCustomer = [c.name, c.phone, c.email, c.address].some((v) => v && v.trim());
    const pw = hasCustomer ? (CW - gap) / 2 : CW;
    const pushRow = (rows: Row[], s: string | null | undefined, w: number, size: number, style: Font, color: Rgb, lh: number, maxLines = 3) => {
      if (!s || !s.trim()) return;
      rows.push({ lines: limit(wrap(s.trim(), w, size, style), maxLines), size, style, color, lh });
    };
    const forW = pw - PADX * 2;
    // Whatever the customer left blank is simply not printed
    pushRow(forRows, c.name, forW, 10.5, 'bold', INK, 4.8, 2);
    pushRow(forRows, c.phone ? `Tel: ${c.phone}` : null, forW, 8, 'normal', MUTED, 3.9);
    pushRow(forRows, c.email, forW, 8, 'normal', MUTED, 3.9);
    pushRow(forRows, c.address, forW, 8, 'normal', MUTED, 3.9);

    const byRows: Row[] = [];
    const logoBox = img.logo ? fit(img.logo, 24, 13) : null;
    const byW = pw - PADX * 2 - (logoBox ? logoBox.w + 3 : 0);
    pushRow(byRows, shop?.shopName || 'Showroom', byW, 10.5, 'bold', INK, 4.8, 2);
    pushRow(byRows, shop?.companyName && shop.companyName !== shop.shopName ? shop.companyName : null, byW, 8, 'normal', MUTED, 3.9, 2);
    pushRow(byRows, shop?.address, byW, 8, 'normal', MUTED, 3.9);
    pushRow(
      byRows,
      [shop?.phone ? `Tel: ${shop.phone}` : null, shop?.whatsapp && shop.whatsapp !== shop.phone ? `WhatsApp: ${shop.whatsapp}` : null].filter(Boolean).join('   '),
      pw - PADX * 2,
      8,
      'normal',
      MUTED,
      3.9,
    );
    pushRow(byRows, [shop?.email, shop?.website].filter(Boolean).join('   '), pw - PADX * 2, 8, 'normal', MUTED, 3.9, 2);
    pushRow(byRows, shop?.vatNo ? (/^vat/i.test(shop.vatNo) ? shop.vatNo : `VAT ${shop.vatNo}`) : null, pw - PADX * 2, 8, 'normal', MUTED, 3.9, 1);

    const height = (rows: Row[]) => 11 + rows.reduce((s, r) => s + r.lines.length * r.lh, 0) + 3.5;
    const h = Math.max(hasCustomer ? height(forRows) : 0, height(byRows), logoBox ? logoBox.h + 12 : 0, 24);
    ensure(h + 4);

    const panel = (x: number, label: string, rows: Row[]) => {
      stroke(BORDER, 0.3);
      doc.roundedRect(x, y, pw, h, 1.6, 1.6, 'S');
      font(7, 'bold', MUTED);
      text(label, x + PADX, y + 6, { charSpace: 0.4 });
      let ty = y + 11.5;
      for (const r of rows) {
        font(r.size, r.style, r.color);
        for (const l of r.lines) {
          doc.text(l, x + PADX, ty);
          ty += r.lh;
        }
      }
    };
    if (hasCustomer) panel(M, 'PREPARED FOR', forRows);
    const byX = hasCustomer ? M + pw + gap : M;
    panel(byX, 'PREPARED BY', byRows);
    if (img.logo && logoBox) addImg(img.logo, byX + pw - PADX - logoBox.w, y + 9.5, logoBox.w, logoBox.h);
    y += h + 7;
  }

  // ── Project details ──
  {
    const r = input.room;
    const ft2m = (ft: number) => (ft * 0.3048).toFixed(1);
    const items: { label: string; value: string }[] = [];
    if (r.presetName) items.push({ label: 'PROJECT', value: r.presetName });
    items.push({ label: 'ROOM', value: r.label });
    if (r.lengthFt && r.widthFt && r.heightFt) {
      items.push({
        label: 'ROOM DIMENSIONS (L × W × H)',
        value: `${r.lengthFt} × ${r.widthFt} × ${r.heightFt} ft  (${ft2m(r.lengthFt)} × ${ft2m(r.widthFt)} × ${ft2m(r.heightFt)} m)`,
      });
      items.push({ label: 'FLOOR AREA', value: `${num(r.lengthFt * r.widthFt)} sq ft` });
    } else {
      items.push({ label: 'MEASUREMENTS', value: 'Areas measured from the room photo' });
    }
    if (r.wallAreaSqFt && r.wallAreaSqFt > 0) items.push({ label: 'NET WALL AREA (AFTER OPENINGS)', value: `${num(r.wallAreaSqFt)} sq ft` });
    if (input.quote.lines.length > 0) {
      items.push({ label: 'SURFACES QUOTED', value: String(input.quote.lines.length) });
      const names = [...new Set(input.quote.lines.map((l) => l.tile.name))];
      items.push({ label: names.length > 1 ? 'SELECTED TILE PRODUCTS' : 'SELECTED TILE PRODUCT', value: names.length > 3 ? `${names.length} products selected` : names.join(', ') });
    }

    const colW = CW / 2;
    const valueW = colW - 9;
    const measured = items.map((it) => ({ ...it, lines: limit(wrap(it.value, valueW, 9, 'bold'), 3) }));
    const rowsH: number[] = [];
    for (let i = 0; i < measured.length; i += 2) {
      rowsH.push(Math.max(...measured.slice(i, i + 2).map((m) => 5.6 + m.lines.length * 4.1)) + 2);
    }
    const total = rowsH.reduce((s, v) => s + v, 0) + 3;
    ensure(8.6 + Math.min(total, 40));
    section('PROJECT DETAILS');
    ensure(total);
    fill(LIGHT);
    stroke(BORDER, 0.3);
    doc.roundedRect(M, y, CW, total, 1.6, 1.6, 'FD');
    let ry = y + 3;
    rowsH.forEach((rh, ri) => {
      for (let k = 0; k < 2; k++) {
        const m = measured[ri * 2 + k];
        if (!m) continue;
        const x = M + 5 + k * colW;
        font(6.5, 'bold', MUTED);
        text(m.label, x, ry + 2.6, { charSpace: 0.3 });
        font(9, 'bold', BLACK);
        m.lines.forEach((l, li) => doc.text(l, x, ry + 6.8 + li * 4.1));
      }
      ry += rh;
    });
    y += total + 6;
  }

  // ── Room visualization: the largest picture the page leaves room for, on a light panel ──
  if (img.snapshot) {
    const PAD = 3;
    const room = BOTTOM - y - 8.6 - PAD * 2;
    if (room < 60) newPage();
    const maxH = Math.min(130, BOTTOM - y - 8.6 - PAD * 2);
    const s = fit(img.snapshot, CW - PAD * 2, maxH);
    section((input.previewCaption || '3D ROOM VISUALIZATION').toUpperCase());
    const ph = s.h + PAD * 2;
    fill(LIGHT);
    stroke(BORDER, 0.3);
    doc.roundedRect(M, y, CW, ph, 1.6, 1.6, 'FD');
    const x = M + (CW - s.w) / 2;
    addImg(img.snapshot, x, y + PAD, s.w, s.h);
    stroke(BORDER, 0.3);
    doc.rect(x, y + PAD, s.w, s.h, 'S');
    y += ph + 6;
  }

  const lines = input.quote.lines;

  // ── Tile selection & surface breakdown (starts on page 2 when page 1 carries the room picture) ──
  {
    if (img.snapshot) newPage();
    type Col = { head: string[]; w: number; align: 'left' | 'right' };
    const cols: Col[] = [
      { head: ['SURFACE'], w: 27, align: 'left' },
      { head: ['TILE PRODUCT'], w: 50, align: 'left' },
      { head: ['SIZE', '(MM)'], w: 18, align: 'left' },
      { head: ['AREA', '(SQ FT)'], w: 16, align: 'right' },
      { head: ['WASTE'], w: 12, align: 'right' },
      { head: ['TILES'], w: 13, align: 'right' },
      { head: ['RATE', '(LKR/SQ FT)'], w: 17, align: 'right' },
      { head: ['AMOUNT', '(LKR)'], w: 23, align: 'right' },
    ];
    const colX: number[] = [];
    cols.reduce((x, c) => (colX.push(x), x + c.w), M);
    const cellX = (i: number) => (cols[i].align === 'right' ? colX[i] + cols[i].w - 2 : colX[i] + 2);
    const HEAD_H = 9;

    const drawHead = () => {
      fill(BLACK);
      doc.rect(M, y, CW, HEAD_H, 'F');
      font(6.3, 'bold', WHITE);
      cols.forEach((c, i) => {
        const base = c.head.length === 1 ? y + HEAD_H / 2 + 0.9 : y + 3.9;
        c.head.forEach((h, li) => text(h, cellX(i), base + li * 2.9, { align: c.align }));
      });
      y += HEAD_H;
    };

    const rows = lines.map((l, idx) => {
      const thumbW = img.thumbs[idx] ? 11.5 : 0;
      const tw = cols[1].w - 4 - thumbW;
      const name = limit(wrap(l.tile.name, tw, 8, 'bold'), 3);
      const meta = limit(wrap([l.tile.sku, l.tile.finish].filter(Boolean).join(' · '), tw, 6.8), 2);
      const label = limit(wrap(l.label, cols[0].w - 4, 8.2, 'bold'), 3);
      const contentH = name.length * 3.7 + meta.length * 3.1;
      const h = Math.max(14, contentH + 5, label.length * 3.8 + 5);
      return { l, idx, name, meta, label, contentH, h, thumbW };
    });

    ensure(8.6 + HEAD_H + (rows[0]?.h ?? 12));
    section('TILE SELECTION & SURFACE BREAKDOWN');
    drawHead();

    if (rows.length === 0) {
      font(8.5, 'italic', MUTED);
      text('No tile products selected for this quotation yet.', M + CW / 2, y + 9, { align: 'center' });
      hline(y + 14);
      y += 14;
    }

    rows.forEach((r, n) => {
      if (y + r.h > BOTTOM) {
        newPage();
        drawHead();
      }
      if (n % 2 === 1) {
        fill(LIGHT);
        doc.rect(M, y, CW, r.h, 'F');
      }
      const mid = y + r.h / 2;
      font(8.2, 'bold', BLACK);
      const labelTop = mid - (r.label.length * 3.8) / 2 + 2.8;
      r.label.forEach((t, li) => doc.text(t, cellX(0), labelTop + li * 3.8));

      let tx = colX[1] + 2;
      const thumb = img.thumbs[r.idx];
      if (thumb) {
        addImg(thumb, tx, mid - 4.5, 9, 9);
        stroke(BORDER, 0.2);
        doc.rect(tx, mid - 4.5, 9, 9, 'S');
        tx += r.thumbW;
      }
      let ty = mid - r.contentH / 2 + 2.9;
      font(8, 'bold', BLACK);
      r.name.forEach((t) => {
        doc.text(t, tx, ty);
        ty += 3.7;
      });
      font(6.8, 'normal', MUTED);
      r.meta.forEach((t) => {
        doc.text(t, tx, ty);
        ty += 3.1;
      });

      const vy = mid + 1.1;
      font(7.3, 'normal');
      text(`${r.l.tile.widthMm} × ${r.l.tile.heightMm}`, cellX(2), vy);
      font(8, 'normal');
      text(r.l.areaSqFt.toFixed(1), cellX(3), vy, { align: 'right' });
      text(`${Math.round(WASTAGE * 100)}%`, cellX(4), vy, { align: 'right' });
      text(num(r.l.tiles), cellX(5), vy, { align: 'right' });
      text(num(r.l.tile.pricePerSqFt || 0), cellX(6), vy, { align: 'right' });
      font(8, 'bold', BLACK);
      text(num(r.l.amount), cellX(7), vy, { align: 'right' });

      y += r.h;
      hline(y);
    });
    y += 8;
  }

  // ── Quantity & waste calculation ──
  if (lines.length > 0) {
    type Col = { head: string; w: number; align: 'left' | 'right' };
    const cols: Col[] = [
      { head: 'SURFACE', w: 32, align: 'left' },
      { head: 'NET AREA', w: 23, align: 'right' },
      { head: 'WASTE %', w: 16, align: 'right' },
      { head: 'WASTE ALLOWANCE', w: 28, align: 'right' },
      { head: 'AREA INCL. WASTE', w: 29, align: 'right' },
      { head: 'TILES REQUIRED', w: 24, align: 'right' },
      { head: 'AREA PURCHASED', w: 24, align: 'right' },
    ];
    const colX: number[] = [];
    cols.reduce((x, c) => (colX.push(x), x + c.w), M);
    const cellX = (i: number) => (cols[i].align === 'right' ? colX[i] + cols[i].w - 2 : colX[i] + 2);
    const ROW = 7.6;
    const HEAD_H = 7.5;
    const drawHead = () => {
      fill(LIGHT);
      doc.rect(M, y, CW, HEAD_H, 'F');
      hline(y + HEAD_H, M, PAGE_W - M, BLACK, 0.35);
      font(5.9, 'bold', INK);
      cols.forEach((c, i) => text(c.head, cellX(i), y + HEAD_H / 2 + 0.85, { align: c.align }));
      y += HEAD_H;
    };

    ensure(8.6 + HEAD_H + ROW * 2);
    section('QUANTITY & WASTE CALCULATION');
    drawHead();
    lines.forEach((l) => {
      if (y + ROW > BOTTOM) {
        newPage();
        drawHead();
      }
      const withWaste = l.areaSqFt * (1 + WASTAGE);
      const vy = y + ROW / 2 + 1.1;
      font(8, 'bold', BLACK);
      text(limit(wrap(l.label, cols[0].w - 4, 8, 'bold'), 1)[0], cellX(0), vy);
      font(8);
      text(`${l.areaSqFt.toFixed(1)} sq ft`, cellX(1), vy, { align: 'right' });
      text(`${Math.round(WASTAGE * 100)}%`, cellX(2), vy, { align: 'right' });
      text(`+${(withWaste - l.areaSqFt).toFixed(1)} sq ft`, cellX(3), vy, { align: 'right' });
      text(`${withWaste.toFixed(1)} sq ft`, cellX(4), vy, { align: 'right' });
      font(8, 'bold', BLACK);
      text(`${num(l.tiles)} tiles`, cellX(5), vy, { align: 'right' });
      font(8);
      text(`${l.purchaseSqFt.toFixed(1)} sq ft`, cellX(6), vy, { align: 'right' });
      y += ROW;
      hline(y);
    });
    y += 7;
  }

  // ── Finishes & specifications (left) and pricing summary (right) ──
  {
    const boxW = 84;
    const boxX = PAGE_W - M - boxW;
    const leftW = boxX - M - 8;

    const specs = input.finishes.filter((f) => f && f.trim()).map((f) => limit(wrap(f, leftW - 4, 8), 6));
    const leftH = specs.length ? 8.6 + specs.reduce((s, l) => s + l.length * 3.9 + 1.6, 0) : 0;

    const hasTotal = lines.length > 0;
    const charges = hasTotal ? (input.charges ?? []).filter((c) => c.label.trim() && Number.isFinite(c.amount) && c.amount !== 0) : [];
    const grand = input.quote.total + charges.reduce((s, c) => s + c.amount, 0);
    const rightH = 8.6 + 3 + 6.5 + charges.length * 5.5 + 3.6 + 17 + 9;
    ensure(Math.max(leftH, rightH));
    const top = y;

    // Finishes
    if (specs.length) {
      section('FINISHES & SPECIFICATIONS', M, leftW);
      let sy = y + 1;
      for (const lns of specs) {
        fill(BLACK);
        doc.rect(M + 0.1, sy - 1.6, 1.2, 1.2, 'F');
        font(8, 'normal');
        lns.forEach((t, i) => doc.text(t, M + 4, sy + i * 3.9));
        sy += lns.length * 3.9 + 1.6;
      }
    }

    // Pricing summary
    y = top;
    {
      const x0 = boxX;
      section('PRICING SUMMARY', x0, boxW);
      let py = y + 1.4;
      const row = (label: string, value: string, bold = false) => {
        font(8.3, 'normal', MUTED);
        text(label, x0, py);
        font(8.3, bold ? 'bold' : 'normal', INK);
        text(value, x0 + boxW, py, { align: 'right' });
        py += 5.5;
      };
      if (hasTotal) {
        row('Tile material subtotal', money(input.quote.total), true);
        for (const c of charges) row(c.label, `${c.amount < 0 ? '-' : ''}${money(Math.abs(c.amount))}`);
      } else {
        font(8.3, 'normal', MUTED);
        text('No tile products selected yet', x0, py);
        py += 5.5;
      }
      py += 0.2;

      fill(BLACK);
      doc.rect(x0, py, boxW, 17, 'F');
      font(7.3, 'bold', BORDER);
      text('ESTIMATED TOTAL', x0 + 5, py + 10.4, { charSpace: 0.3 });
      if (hasTotal) {
        font(14.5, 'bold', WHITE);
        text(money(grand), x0 + boxW - 5, py + 10.9, { align: 'right' });
      } else {
        font(8.5, 'italic', BORDER);
        text('Not yet available', x0 + boxW - 5, py + 10.4, { align: 'right' });
      }
      font(6.5, 'normal', MUTED);
      text('Excludes installation, delivery and taxes unless stated.', x0, py + 21.5);
    }
    y = top + Math.max(leftH, rightH) + 3;
  }

  // ── Notes & terms ──
  {
    const valid = new Date(input.date.getTime() + input.validDays * 86400000);
    const terms = input.terms?.length
      ? input.terms
      : [
          'Prices are indicative and subject to stock availability.',
          'Adhesive, grout, skirting, installation labour, delivery and any other charges are not included unless stated.',
        ];
    const notes = [
      `Waste allowance: tile quantities include ${Math.round(WASTAGE * 100)}% for cutting and breakage. Tiles are supplied whole, so the area purchased is rounded up to the next full tile.`,
      'Measurements: areas are taken from the saved design, and wall areas exclude door and window openings. Quantities are confirmed by a site measurement before ordering.',
      ...terms,
      `This quotation is valid for ${input.validDays} days, until ${fmtDate(valid)}.`,
    ];
    const wrapped = notes.map((n, i) => limit(wrap(`${i + 1}. ${n}`, CW - 3, 7.4), 4));
    const h = 8.6 + wrapped.reduce((s, l) => s + l.length * 3.5 + 0.8, 0);
    ensure(h);
    section('NOTES & TERMS');
    font(7.4, 'normal', MUTED);
    let ny = y + 0.5;
    for (const lns of wrapped) {
      lns.forEach((t, i) => doc.text(t, M + 1 + (i ? 3 : 0), ny + i * 3.5));
      ny += lns.length * 3.5 + 0.8;
    }
    y = ny;
  }

  // ── Echilion technology-partner panel: foot of the last page, in the same grey and black ──
  {
    const H = 23;
    // Sits at the foot of the page; when the notes run low it follows them, and only a full page moves it on
    let by = Math.max(BOTTOM - H, y + 4);
    if (by + H > BOTTOM + 1) {
      newPage();
      by = BOTTOM - H;
    }

    fill(LIGHT);
    stroke(BORDER, 0.3);
    doc.roundedRect(M, by, CW, H, 1.6, 1.6, 'FD');

    const x0 = M + 6;
    font(6, 'bold', MUTED);
    text('POWERED BY ECHILION', x0, by + 6.4, { charSpace: 0.4 });
    if (img.echilion) {
      const s = fit(img.echilion, 26, 9);
      addImg(img.echilion, x0, by + 8.6, s.w, s.h);
    } else {
      font(13, 'bold', BLACK);
      text('Echilion', x0, by + 16.5);
    }
    const dx = x0 + 34;
    stroke(BORDER, 0.3);
    doc.line(dx, by + 4.5, dx, by + H - 4.5);

    const contacts: { label: string; value: string; url: string }[] = [
      { label: 'PHONE', value: ECHILION.phone, url: `tel:${ECHILION.phone.replace(/\s/g, '')}` },
      { label: 'EMAIL', value: ECHILION.email, url: `mailto:${ECHILION.email}` },
      { label: 'WEBSITE', value: ECHILION.websiteLabel, url: ECHILION.website },
    ];
    const cx0 = dx + 7;
    const colW = (M + CW - 6 - cx0) / 3;
    contacts.forEach((c, i) => {
      const cx = cx0 + i * colW;
      font(6, 'bold', MUTED);
      text(c.label, cx, by + 9.2, { charSpace: 0.45 });
      font(9.2, 'bold', BLACK);
      text(c.value, cx, by + 14.8);
      doc.link(cx, by + 11.4, Math.min(doc.getTextWidth(c.value), colW - 2), 4.6, { url: c.url });
    });
  }

  // ── Page frame and footer on every page ──
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);

    // Black outer frame, fine grey inner frame
    stroke(BLACK, 0.4);
    doc.rect(FRAME_OUT, FRAME_OUT, PAGE_W - FRAME_OUT * 2, PAGE_H - FRAME_OUT * 2, 'S');
    stroke(BORDER, 0.25);
    doc.rect(FRAME_IN, FRAME_IN, PAGE_W - FRAME_IN * 2, PAGE_H - FRAME_IN * 2, 'S');

    // Tile-grid detail, in two opposite corners only: a small staircase of tiles
    const CELL = 1.1;
    const GAP = 0.3;
    const INSET = 0.9;
    const motif: (Rgb | null)[][] = [
      [BLACK, BLACK, BORDER],
      [BLACK, BORDER, null],
      [BORDER, null, null],
    ];
    const corner = (flipX: boolean, flipY: boolean) => {
      motif.forEach((row, r) =>
        row.forEach((c, k) => {
          if (!c) return;
          const off = INSET + k * (CELL + GAP);
          const offY = INSET + r * (CELL + GAP);
          const x = flipX ? PAGE_W - FRAME_IN - off - CELL : FRAME_IN + off;
          const yy = flipY ? PAGE_H - FRAME_IN - offY - CELL : FRAME_IN + offY;
          fill(c);
          doc.rect(x, yy, CELL, CELL, 'F');
        }),
      );
    };
    corner(true, false);
    corner(false, true);

    hline(FOOT_RULE, M, PAGE_W - M, BORDER, 0.25);

    let fx = M;
    if (img.tsLogo) {
      const s = fit(img.tsLogo, 18, 4.6);
      addImg(img.tsLogo, fx, FOOT_RULE + 2.8, s.w, s.h);
      fx += s.w;
    } else {
      font(7, 'bold', BLACK);
      text('Tile Studio Plus+', fx, FOOT_RULE + 6);
      fx += doc.getTextWidth('Tile Studio Plus+');
    }
    fx += 3;
    stroke(BORDER, 0.25);
    doc.line(fx, FOOT_RULE + 2.8, fx, FOOT_RULE + 7.2);
    fx += 3;
    font(6.5, 'normal', MUTED);
    text('Powered by', fx, FOOT_RULE + 5.9);
    fx += doc.getTextWidth('Powered by') + 1.6;
    if (img.echilion) {
      const s = fit(img.echilion, 14, 4.8);
      addImg(img.echilion, fx, FOOT_RULE + 7.2 - s.h, s.w, s.h);
    } else {
      font(6.5, 'bold', BLACK);
      text('Echilion', fx, FOOT_RULE + 5.9);
    }

    font(7, 'normal', MUTED);
    text(`Ref ${input.quoteNo}   |   Page ${p} of ${pages}`, PAGE_W - M, FOOT_RULE + 5.9, { align: 'right' });

    const contact = [shop?.shopName, shop?.phone, shop?.email, shop?.website].filter(Boolean).join('   |   ');
    if (contact) {
      font(6.8, 'normal', MUTED);
      text(limit(wrap(contact, CW - 14, 6.8), 1)[0], M, FOOT_RULE + 11);
    }
  }

  return doc;
}

export async function createQuotationPdf(input: QuotationPdfInput): Promise<JsPDF> {
  const { jsPDF } = await import('jspdf');
  const [logo, tsLogo, echilion, snapshot, ...thumbs] = await Promise.all([
    loadImage(input.shop?.logoUrl, 900, true),
    loadImage(LOGO_TS, 900, true),
    loadImage(LOGO_ECHILION, 600, true),
    input.snapshot ? loadImage(input.snapshot, 1800, false, true) : Promise.resolve(null),
    ...input.quote.lines.map((l) => loadImage(l.tile.previewUrl || l.tile.textureUrl, 160)),
  ]);
  return renderQuotation(jsPDF, input, { logo, tsLogo, echilion, snapshot, thumbs });
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
