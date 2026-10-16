import type { jsPDF as JsPDF } from "jspdf";
import type { Report } from "./reports";

export interface RevenueReportPdfInput {
  report: Report;
  /** Shown in the header, e.g. "08 Oct 2026". */
  generatedOn: string;
  /** Active showrooms and monthly recurring revenue right now. */
  platform: { activeShowrooms: number; totalShowrooms: number; monthlyRecurring: number };
}

// A4 portrait, millimetres
const PAGE_W = 210;
const PAGE_H = 297;
const M = 14;
const CONTENT_W = PAGE_W - M * 2;
const INK = [16, 18, 22] as const;
const MUTED = [107, 110, 118] as const;
const RULE = [229, 231, 235] as const;
const PANEL = [243, 244, 246] as const;
const SOLID = [24, 24, 27] as const;
const SOFT = [214, 216, 220] as const;

/** The standard PDF fonts only cover Latin-1; drop anything else rather than print boxes. */
const clean = (s: string) => s.replace(/[–—]/g, "-").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[^\x20-\xFF]/g, "");
const money = (n: number) => `LKR ${Math.round(n).toLocaleString("en-US")}`;
const short = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}...` : s);
const day = (iso: string | null) => (iso ? iso.slice(0, 10) : "-");

/** Builds the revenue report as a PDF (jsPDF is loaded on demand, so it never weighs on the page). */
export async function buildRevenueReportPdf({ report, generatedOn, platform }: RevenueReportPdfInput): Promise<JsPDF> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  let y = M;

  const text = (s: string, x: number, yy: number, opts: { size?: number; bold?: boolean; color?: readonly number[]; align?: "left" | "right" | "center" } = {}) => {
    doc.setFont("helvetica", opts.bold ? "bold" : "normal");
    doc.setFontSize(opts.size ?? 9);
    doc.setTextColor(...((opts.color ?? INK) as [number, number, number]));
    doc.text(clean(s), x, yy, { align: opts.align ?? "left" });
  };
  const rule = (yy: number) => {
    doc.setDrawColor(...RULE);
    doc.setLineWidth(0.2);
    doc.line(M, yy, PAGE_W - M, yy);
  };
  /** Start a new page when `needed` mm will not fit. Returns true if it did. */
  const ensure = (needed: number) => {
    if (y + needed > PAGE_H - M) {
      doc.addPage();
      y = M;
      return true;
    }
    return false;
  };

  // ── Header ──
  text("Tile Studio Plus+", M, y + 4, { size: 9, bold: true, color: MUTED });
  text(`Generated ${generatedOn}`, PAGE_W - M, y + 4, { size: 9, color: MUTED, align: "right" });
  y += 12;
  text("Revenue report", M, y, { size: 20, bold: true });
  y += 6;
  text(`${report.title}  -  ${report.subtitle}`, M, y, { size: 10, color: MUTED });
  y += 8;

  // ── Summary tiles ──
  const tiles = [
    { label: "Collected", value: money(report.collected) },
    { label: "Still to collect", value: money(report.owed) },
    { label: "Collection rate", value: report.rate === null ? "-" : `${report.rate}%` },
    { label: "Overdue now", value: money(report.overdueAmount) },
  ];
  const tileW = (CONTENT_W - 3 * 3) / 4;
  tiles.forEach((t, i) => {
    const x = M + i * (tileW + 3);
    doc.setFillColor(...PANEL);
    doc.roundedRect(x, y, tileW, 17, 2, 2, "F");
    text(t.label.toUpperCase(), x + 3, y + 5.5, { size: 6.5, bold: true, color: MUTED });
    text(t.value, x + 3, y + 12.5, { size: 11, bold: true });
  });
  y += 21;
  text(
    `${platform.activeShowrooms} of ${platform.totalShowrooms} showrooms active  -  monthly recurring revenue ${money(platform.monthlyRecurring)}`,
    M, y, { size: 8.5, color: MUTED },
  );
  y += 9;

  // ── Chart ──
  text(report.range === "month" ? "Revenue by week" : "Revenue by month", M, y, { size: 11, bold: true });
  y += 4;
  const chartH = 48;
  const axisW = 14;
  const plotX = M + axisW;
  const plotW = CONTENT_W - axisW;
  const max = Math.max(1, ...report.buckets.map((b) => b.collected + b.owed));
  const raw = max / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const nrm = raw / mag;
  const step = (nrm <= 1 ? 1 : nrm <= 2 ? 2 : nrm <= 2.5 ? 2.5 : nrm <= 5 ? 5 : 10) * mag;
  const top = step * 4;
  const baseY = y + chartH;
  const yOf = (v: number) => baseY - (v / top) * chartH;
  const axis = (n: number) => (n >= 1_000_000 ? `${+(n / 1_000_000).toFixed(2)}M` : n >= 1000 ? `${+(n / 1000).toFixed(1)}K` : `${n}`);
  for (let i = 0; i <= 4; i++) {
    const v = i * step;
    doc.setDrawColor(...RULE);
    doc.setLineWidth(0.15);
    doc.line(plotX, yOf(v), PAGE_W - M, yOf(v));
    text(axis(v), plotX - 2, yOf(v) + 1, { size: 6.5, color: MUTED, align: "right" });
  }
  const band = plotW / report.buckets.length;
  const barW = Math.min(14, band * 0.55);
  report.buckets.forEach((b, i) => {
    const cx = plotX + band * (i + 0.5);
    const hCol = (b.collected / top) * chartH;
    const hOwed = (b.owed / top) * chartH;
    if (hCol > 0.1) {
      doc.setFillColor(...SOLID);
      doc.rect(cx - barW / 2, baseY - hCol, barW, hCol, "F");
    }
    if (hOwed > 0.1) {
      doc.setFillColor(...SOFT);
      doc.rect(cx - barW / 2, baseY - hCol - hOwed, barW, hOwed, "F");
    }
    text(b.label, cx, baseY + 4.5, { size: 6.5, color: MUTED, align: "center" });
  });
  y = baseY + 8;
  doc.setFillColor(...SOLID);
  doc.rect(M, y - 2.2, 3, 3, "F");
  text("Collected", M + 4.5, y, { size: 7.5, color: MUTED });
  doc.setFillColor(...SOFT);
  doc.rect(M + 24, y - 2.2, 3, 3, "F");
  text("Still to collect (Pending or Failed)", M + 28.5, y, { size: 7.5, color: MUTED });
  y += 8;

  // ── Small tables: by plan / top showrooms / payment methods / overdue ──
  const list = (title: string, rows: [string, string][], empty: string) => {
    ensure(10 + Math.max(1, rows.length) * 5.5);
    text(title, M, y, { size: 11, bold: true });
    y += 2;
    rule(y);
    y += 5;
    if (rows.length === 0) {
      text(empty, M, y, { size: 8.5, color: MUTED });
      y += 6;
    }
    rows.forEach(([a, b]) => {
      text(short(a, 60), M, y, { size: 8.5 });
      text(b, PAGE_W - M, y, { size: 8.5, bold: true, align: "right" });
      y += 5.5;
    });
    y += 4;
  };
  list(
    "Revenue by plan",
    report.byPlan.map((p) => [`${p.plan} (${p.count} invoice${p.count === 1 ? "" : "s"})`, `${money(p.collected)} collected  -  ${money(p.owed)} to collect`]),
    "No invoices in this period.",
  );
  list(
    "Top showrooms",
    report.byShop.slice(0, 8).map((s) => [s.shopName, `${money(s.collected)} collected${s.owed > 0 ? `  -  ${money(s.owed)} to collect` : ""}`]),
    "No invoices in this period.",
  );
  list("How payments were received", report.byMethod.map((m) => [`${m.method} (${m.count})`, money(m.amount)]), "No payments received in this period.");
  if (report.overdue.length > 0) {
    list(
      "Overdue invoices",
      report.overdue.slice(0, 10).map((p) => [`${p.shopName}  -  ${p.invoiceNo}`, `${money(p.amount)}  -  ${p.daysLate} day${p.daysLate === 1 ? "" : "s"} late`]),
      "",
    );
  }

  // ── Invoice list ──
  const cols = [
    { h: "Invoice", x: M, w: 24 },
    { h: "Showroom", x: M + 24, w: 52 },
    { h: "Plan", x: M + 76, w: 24 },
    { h: "Due", x: M + 100, w: 22 },
    { h: "Received", x: M + 122, w: 22 },
    { h: "Status", x: M + 144, w: 18 },
  ];
  const header = () => {
    text(`Invoices (${report.invoices.length})`, M, y, { size: 11, bold: true });
    y += 3;
    doc.setFillColor(...PANEL);
    doc.rect(M, y, CONTENT_W, 6.5, "F");
    cols.forEach((c) => text(c.h.toUpperCase(), c.x + 1.5, y + 4.4, { size: 6.5, bold: true, color: MUTED }));
    text("AMOUNT", PAGE_W - M - 1.5, y + 4.4, { size: 6.5, bold: true, color: MUTED, align: "right" });
    y += 6.5;
  };
  ensure(24);
  header();
  if (report.invoices.length === 0) {
    y += 5;
    text("No invoices in this period.", M + 1.5, y, { size: 8.5, color: MUTED });
    y += 6;
  }
  report.invoices.forEach((p) => {
    if (ensure(7)) header();
    y += 5;
    const cells = [p.invoiceNo, short(p.shopName, 30), short(p.plan, 14), day(p.dueDate), day(p.paidAt), p.overdue ? "Overdue" : p.status];
    cols.forEach((c, i) => text(cells[i], c.x + 1.5, y, { size: 7.5, color: i === 5 && p.overdue ? [185, 28, 28] : INK }));
    text(money(p.amount), PAGE_W - M - 1.5, y, { size: 7.5, bold: true, align: "right" });
    y += 1.6;
    rule(y);
  });

  // ── Page numbers ──
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    text(`Page ${i} of ${pages}`, PAGE_W - M, PAGE_H - 7, { size: 7.5, color: MUTED, align: "right" });
  }
  return doc;
}
