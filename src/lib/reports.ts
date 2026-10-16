/**
 * Revenue report numbers for the admin Reports tab.
 * Pure functions (no database, no React), so they can be tested and shared by the screen, the CSV and the PDF.
 *
 * Money rules match the dashboard chart:
 *   - an invoice belongs to the month it falls due
 *   - Received = collected; Pending and Failed = still to collect; Refunded is listed but never counted
 *   - an unpaid invoice is overdue once its due date (or the extra-time date the admin gave) has passed
 */

import { planLabel } from "./subscriptionPlans";

export type ReportRange = "month" | "6m" | "12m";

export interface ReportPayment {
  id: string;
  invoiceNo: string;
  shopId: string;
  shopName: string;
  email: string;
  plan: string;
  amount: number;
  status: "Pending" | "Received" | "Failed" | "Refunded";
  /** ISO timestamps; dates are midnight UTC calendar days. */
  dueDate: string;
  graceUntil: string | null;
  paidAt: string | null;
  method: string | null;
  reference: string | null;
}

export interface ReportInvoice extends ReportPayment {
  dueKey: string;
  overdue: boolean;
  daysLate: number;
}

export interface Bucket {
  key: string;
  label: string;
  collected: number;
  owed: number;
}

export interface Report {
  range: ReportRange;
  title: string;
  subtitle: string;
  buckets: Bucket[];
  collected: number;
  owed: number;
  billed: number;
  /** Share of the billed amount that was collected, or null when nothing was billed. */
  rate: number | null;
  refunded: number;
  invoices: ReportInvoice[];
  byPlan: { plan: string; collected: number; owed: number; count: number }[];
  byShop: { shopId: string; shopName: string; collected: number; owed: number; count: number }[];
  byMethod: { method: string; amount: number; count: number }[];
  /** Everything unpaid and past its date, whatever period is shown. Longest overdue first. */
  overdue: ReportInvoice[];
  overdueAmount: number;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const pad = (n: number) => String(n).padStart(2, "0");
const isOwed = (s: ReportPayment["status"]) => s === "Pending" || s === "Failed";

/** Whole days from one YYYY-MM-DD to another. */
function daysBetween(fromISO: string, toISO: string): number {
  const t = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
  return Math.round((t(toISO) - t(fromISO)) / 86_400_000);
}

/** The `count` months ending with the month of `todayISO`, oldest first, as YYYY-MM. */
export function monthKeys(todayISO: string, count: number): string[] {
  let y = +todayISO.slice(0, 4);
  let m = +todayISO.slice(5, 7);
  const keys: string[] = [];
  for (let i = 0; i < count; i++) {
    keys.unshift(`${y}-${pad(m)}`);
    m -= 1;
    if (m === 0) { m = 12; y -= 1; }
  }
  return keys;
}

export const monthShort = (key: string) => `${MONTHS[+key.slice(5, 7) - 1]} '${key.slice(2, 4)}`;
export const monthLong = (key: string) => `${MONTHS_LONG[+key.slice(5, 7) - 1]} ${key.slice(0, 4)}`;

export function rangeTitle(range: ReportRange, todayISO: string): { title: string; subtitle: string } {
  const thisMonth = todayISO.slice(0, 7);
  if (range === "month") return { title: monthLong(thisMonth), subtitle: "week by week" };
  const count = range === "6m" ? 6 : 12;
  const keys = monthKeys(todayISO, count);
  return { title: `Last ${count} months`, subtitle: `${monthLong(keys[0])} to ${monthLong(keys[keys.length - 1])}` };
}

export function buildReport(payments: ReportPayment[], range: ReportRange, todayISO: string): Report {
  const thisMonth = todayISO.slice(0, 7);
  const keys = range === "month" ? [thisMonth] : monthKeys(todayISO, range === "6m" ? 6 : 12);
  const inPeriod = new Set(keys);

  const all: ReportInvoice[] = payments.map((p) => {
    const deadline = (p.graceUntil ?? p.dueDate).slice(0, 10);
    const overdue = isOwed(p.status) && deadline < todayISO;
    return { ...p, dueKey: p.dueDate.slice(0, 7), overdue, daysLate: overdue ? daysBetween(deadline, todayISO) : 0 };
  });
  const invoices = all
    .filter((p) => inPeriod.has(p.dueKey))
    .sort((a, b) => (a.dueDate === b.dueDate ? a.invoiceNo.localeCompare(b.invoiceNo) : a.dueDate < b.dueDate ? 1 : -1));

  const weekOf = (p: ReportInvoice) => Math.min(3, Math.floor((+p.dueDate.slice(8, 10) - 1) / 7));
  const buckets: Bucket[] =
    range === "month"
      ? Array.from({ length: 4 }, (_, i) => ({ key: `w${i + 1}`, label: `Week ${i + 1}`, collected: 0, owed: 0 }))
      : keys.map((key) => ({ key, label: monthShort(key), collected: 0, owed: 0 }));
  const bucketOf = (p: ReportInvoice) => (range === "month" ? buckets[weekOf(p)] : buckets[keys.indexOf(p.dueKey)]);

  const plans = new Map<string, { plan: string; collected: number; owed: number; count: number }>();
  const shops = new Map<string, { shopId: string; shopName: string; collected: number; owed: number; count: number }>();
  const methods = new Map<string, { method: string; amount: number; count: number }>();
  let collected = 0;
  let owed = 0;
  let refunded = 0;

  for (const p of invoices) {
    const planName = planLabel(p.plan); // an invoice raised under the old "Enterprise" name counts as the Custom Plan
    const plan = plans.get(planName) ?? { plan: planName, collected: 0, owed: 0, count: 0 };
    const shop = shops.get(p.shopId) ?? { shopId: p.shopId, shopName: p.shopName, collected: 0, owed: 0, count: 0 };
    plan.count++;
    shop.count++;
    if (p.status === "Received") {
      collected += p.amount;
      bucketOf(p).collected += p.amount;
      plan.collected += p.amount;
      shop.collected += p.amount;
      const name = p.method?.trim() || "Not recorded";
      const m = methods.get(name) ?? { method: name, amount: 0, count: 0 };
      m.amount += p.amount;
      m.count++;
      methods.set(name, m);
    } else if (isOwed(p.status)) {
      owed += p.amount;
      bucketOf(p).owed += p.amount;
      plan.owed += p.amount;
      shop.owed += p.amount;
    } else if (p.status === "Refunded") {
      refunded += p.amount;
    }
    plans.set(planName, plan);
    shops.set(p.shopId, shop);
  }

  const overdue = all.filter((p) => p.overdue).sort((a, b) => b.daysLate - a.daysLate || b.amount - a.amount);
  const billed = collected + owed;
  const byBilled = <T extends { collected: number; owed: number }>(a: T, b: T) => b.collected + b.owed - (a.collected + a.owed);

  return {
    range,
    ...rangeTitle(range, todayISO),
    buckets,
    collected,
    owed,
    billed,
    rate: billed > 0 ? Math.round((collected / billed) * 100) : null,
    refunded,
    invoices,
    byPlan: [...plans.values()].sort(byBilled),
    byShop: [...shops.values()].sort((a, b) => b.collected - a.collected || byBilled(a, b)),
    byMethod: [...methods.values()].sort((a, b) => b.amount - a.amount),
    overdue,
    overdueAmount: overdue.reduce((sum, p) => sum + p.amount, 0),
  };
}

// ── CSV ──────────────────────────────────────────────────────────────────────────────────────────

/** One CSV cell. Quotes are doubled, and text a spreadsheet would run as a formula (=, +, -, @) is defused. */
export function csvCell(value: string | number | null | undefined): string {
  if (typeof value === "number" && Number.isFinite(value)) return String(value); // numbers stay numbers in a spreadsheet
  let s = value == null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

const day = (iso: string | null) => (iso ? iso.slice(0, 10) : "");

export function invoicesToCsv(invoices: ReportInvoice[]): string {
  const header = ["Invoice", "Showroom", "Email", "Plan", "Status", "Due date", "Extra time until", "Date received", "Method", "Reference", "Amount (LKR)"];
  const rows = invoices.map((p) =>
    [p.invoiceNo, p.shopName, p.email, p.plan, p.overdue ? `${p.status} (overdue)` : p.status, day(p.dueDate), day(p.graceUntil), day(p.paidAt), p.method ?? "", p.reference ?? "", p.amount]
      .map(csvCell)
      .join(",")
  );
  return [header.map(csvCell).join(","), ...rows].join("\r\n");
}

export function reportFileName(report: Report, todayISO: string, ext: "csv" | "pdf"): string {
  const span = report.range === "month" ? "this-month" : report.range === "6m" ? "6-months" : "12-months";
  return `tilestudio-revenue-${span}-${todayISO}.${ext}`;
}
