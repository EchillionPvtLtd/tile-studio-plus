/**
 * Subscription terms per package, so picking a plan fills in its dates automatically:
 *   Free Trial    14 days
 *   Starter       1 month
 *   Professional  1 month
 *   Custom        custom (the admin sets the dates and the price)
 * All dates are plain YYYY-MM-DD strings and are calculated in UTC so a timezone never shifts a day.
 */
export type PlanTerm =
  | { kind: "days"; days: number }
  | { kind: "months"; months: number }
  | { kind: "custom" };

export const PLAN_TERMS: Record<string, PlanTerm> = {
  "Free Trial": { kind: "days", days: 14 },
  Starter: { kind: "months", months: 1 },
  Professional: { kind: "months", months: 1 },
  Custom: { kind: "custom" },
};

export const termOf = (plan: string): PlanTerm => PLAN_TERMS[plan] ?? { kind: "custom" };

/**
 * The stored name of a plan. The Enterprise plan was renamed Custom Plan; a showroom saved as "Enterprise" before the
 * rename is the same plan, so it is read as "Custom" (nothing in the database has to be migrated).
 */
export function normalizePlan(plan: string | null | undefined): string {
  const p = (plan ?? "").trim();
  return p.toLowerCase() === "enterprise" ? "Custom" : p;
}

/** Whether a plan is the Custom Plan (custom dates and an agreed price). */
export const isCustomPlan = (plan: string | null | undefined): boolean => normalizePlan(plan).toLowerCase() === "custom";

/** The name shown to people: "Custom Plan" for the Custom Plan, otherwise the plan's own name. */
export function planLabel(plan: string | null | undefined): string {
  return isCustomPlan(plan) ? "Custom Plan" : (plan ?? "").trim();
}

const pad = (n: number) => String(n).padStart(2, "0");
const toISO = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

function parse(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

/** Today in the browser's own calendar, as YYYY-MM-DD. */
export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function addDaysISO(iso: string, days: number): string {
  const d = parse(iso);
  if (!d) return "";
  d.setUTCDate(d.getUTCDate() + days);
  return toISO(d);
}

/** Adds calendar months; 31 Jan + 1 month is 28/29 Feb, not 3 March. */
export function addMonthsISO(iso: string, months: number): string {
  const d = parse(iso);
  if (!d) return "";
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return toISO(d);
}

/**
 * The dates a plan starting on `startISO` should have.
 * `end` is the paid-until date, `trialEnd` the free-trial end; custom plans return null (leave dates to the admin).
 */
export function planDates(plan: string, startISO: string, billingDay: BillingDay = "plan"): { end: string; trialEnd: string } | null {
  const term = termOf(normalizePlan(plan));
  if (term.kind === "custom" || !startISO) return null;
  if (term.kind === "days") return { end: "", trialEnd: addDaysISO(startISO, term.days) };
  // The first term runs until the second invoice falls due (1 month on "plan" billing)
  const end = billingDay === "plan" ? addMonthsISO(startISO, term.months) : nextBillingDate(firstBillingDate(startISO, billingDay), billingDay);
  return { end, trialEnd: "" };
}

// ── Duration (1 to 12 months) ────────────────────────────────────────────────
export const DURATION_MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

export const durationLabel = (months: number): string => `${months} ${months === 1 ? "month" : "months"}`;

/** A stored duration as a whole number of months from 1 to 12, or null when it is not one. */
export function asDurationMonths(v: unknown): number | null {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  return typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= 12 ? n : null;
}

/** The expiry date for a plan that starts on `startISO` and runs `months` months (month-end safe: 31 Jan + 1 month is 28 Feb). */
export function expiryAfterMonths(startISO: string, months: number): string {
  const n = asDurationMonths(months);
  return n === null || !parse(startISO) ? "" : addMonthsISO(startISO, n);
}

/** The whole number of months (1 to 12) between two dates when the end is exactly that many months after the start, else null. */
export function monthsBetweenISO(startISO: string, endISO: string): number | null {
  if (!parse(startISO) || !parse(endISO)) return null;
  return DURATION_MONTHS.find((m) => addMonthsISO(startISO, m) === endISO) ?? null;
}

/** An expiry date written the way people read it: 17 January 2027. */
export function formatLongDate(iso: string): string {
  const d = parse(iso);
  return d ? d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : "";
}

// ── Packages made in the admin dashboard ─────────────────────────────────────
/**
 * A showroom stores its package by name. The three original packages keep the names the database already holds
 * (Starter, Professional, Custom) whatever the package is called now, so no showroom has to be migrated; a package
 * made later is stored under its own name.
 */
export function storedPackageName(plan: { id: string; name: string }): string {
  const id = plan.id.trim().toLowerCase();
  const name = plan.name.trim().toLowerCase();
  if (id === "starter" || name === "starter") return "Starter";
  if (id === "pro-studio" || name === "pro studio" || name === "professional" || name === "pro") return "Professional";
  if (id === "custom-plan" || name === "custom plan" || name === "custom" || name === "enterprise") return "Custom";
  return plan.name.trim();
}

/** The package a showroom is on, found among the saved packages (null when that package no longer exists). */
export function findPackage<T extends { id: string; name: string }>(stored: string | null | undefined, plans: readonly T[]): T | null {
  const key = normalizePlan(stored).toLowerCase();
  if (!key) return null;
  return plans.find((p) => storedPackageName(p).toLowerCase() === key) ?? plans.find((p) => p.name.trim().toLowerCase() === key || p.id.toLowerCase() === key) ?? null;
}

/** What a package is called to people: its current name in the dashboard, else the stored name. */
export function packageName(stored: string | null | undefined, plans: readonly { id: string; name: string }[]): string {
  if (normalizePlan(stored).toLowerCase() === "free trial") return "Free Trial";
  return findPackage(stored, plans)?.name.trim() || planLabel(stored);
}

/** A package's usual term in months: the one chosen in the Plans builder, else its billing cycle (yearly = 12). */
export function planDurationMonths(plan: { billingCycle?: string; durationMonths?: number } | null | undefined): number {
  return asDurationMonths(plan?.durationMonths) ?? (plan?.billingCycle === "yearly" ? 12 : 1);
}

export interface PackageChoice {
  /** What is stored on the showroom. */
  value: string;
  label: string;
  price: number;
  tileQuota: number;
  /** The package's usual term in months (1 for the Free Trial, which is 14 days). */
  durationMonths: number;
  /** Fixed price, so the amount is the package's own; false for the Custom Plan, whose amount is agreed per showroom. */
  fixedPrice: boolean;
}

/** The packages that can be given to a showroom: the Free Trial, then every active package, in the order saved. */
export function packageChoices(plans: readonly { id: string; name: string; price: number; tileQuota: number; active: boolean; sortOrder: number; billingCycle?: string; durationMonths?: number }[], current?: string | null): PackageChoice[] {
  const list: PackageChoice[] = [{ value: "Free Trial", label: "Free Trial", price: 0, tileQuota: 50, durationMonths: 1, fixedPrice: true }];
  for (const p of [...plans].filter((x) => x.active).sort((a, b) => a.sortOrder - b.sortOrder)) {
    const value = storedPackageName(p);
    if (list.some((c) => c.value.toLowerCase() === value.toLowerCase())) continue;
    list.push({ value, label: p.name.trim(), price: p.price, tileQuota: p.tileQuota, durationMonths: planDurationMonths(p), fixedPrice: !isCustomPlan(value) });
  }
  // A showroom on a package that was switched off or deleted keeps it listed, so opening the editor never changes its package
  const cur = normalizePlan(current);
  if (cur && !list.some((c) => c.value.toLowerCase() === cur.toLowerCase())) {
    const hit = findPackage(cur, plans);
    list.push({ value: cur, label: hit?.name.trim() || planLabel(cur), price: hit?.price ?? 0, tileQuota: hit?.tileQuota ?? 50, durationMonths: planDurationMonths(hit), fixedPrice: !isCustomPlan(cur) });
  }
  return list;
}

/** One-line explanation shown under the date fields. */
export function planTermHint(plan: string): string {
  const term = termOf(normalizePlan(plan));
  const name = planLabel(plan);
  if (term.kind === "days") return `${name}: ${term.days} days from the start date.`;
  if (term.kind === "months") return `${name}: billed monthly. The end date follows the billing day below.`;
  return `${name}: set the start and end dates you agreed with the showroom.`;
}

// ── Billing day ──────────────────────────────────────────────────────────────
/**
 * When the full monthly fee is collected:
 *   start  on the 1st of each month
 *   end    on the last day of each month
 *   plan   on the same day each month as the plan started
 */
export type BillingDay = "start" | "end" | "plan";
export const DEFAULT_BILLING_DAY: BillingDay = "start";

export const BILLING_DAY_LABELS: Record<BillingDay, string> = {
  start: "Start of month (1st)",
  end: "End of month (last day)",
  plan: "Same day as the plan started",
};

export const asBillingDay = (v: unknown): BillingDay => (v === "start" || v === "end" || v === "plan" ? v : DEFAULT_BILLING_DAY);

function lastDayOfMonthISO(year: number, monthIndex: number): string {
  return toISO(new Date(Date.UTC(year, monthIndex + 1, 0)));
}

/** The first invoice of a plan that starts on `startISO`: due now, or at the end of that month. */
export function firstBillingDate(startISO: string, billingDay: BillingDay): string {
  const d = parse(startISO);
  if (!d) return "";
  return billingDay === "end" ? lastDayOfMonthISO(d.getUTCFullYear(), d.getUTCMonth()) : startISO;
}

/** The date a month's invoice falls due, given how this showroom is billed. */
export function dueDateInMonth(year: number, month: number, billingDay: BillingDay, planStartDay: number): string {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (billingDay === "start") return `${year}-${pad(month)}-01`;
  if (billingDay === "end") return `${year}-${pad(month)}-${pad(lastDay)}`;
  return `${year}-${pad(month)}-${pad(Math.min(planStartDay, lastDay))}`;
}

/** The invoice date that follows one due on `dueISO`. */
export function nextBillingDate(dueISO: string, billingDay: BillingDay): string {
  const d = parse(dueISO);
  if (!d) return "";
  if (billingDay === "start") return toISO(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)));
  if (billingDay === "end") return lastDayOfMonthISO(d.getUTCFullYear(), d.getUTCMonth() + 1);
  return addMonthsISO(dueISO, 1);
}

// ── Re-export dynamic plan types ───────────────────────────────────────────
export * from "./subscriptionPlanTypes";
