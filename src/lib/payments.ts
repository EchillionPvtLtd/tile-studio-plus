import { prisma } from "@/lib/prisma";
import { asBillingDay, dueDateInMonth, type BillingDay } from "@/lib/subscriptionPlans";

/**
 * Server-only payment helpers (no "use server": these are not callable from the browser).
 * Statuses: Pending (billed, not collected), Received (collected), Failed (still owed), Refunded.
 *
 * Invoice dates (due date, extra-time date, date received) are calendar dates stored as midnight UTC,
 * so a date never shifts by a day whatever timezone the server or the browser is in.
 */
export type PaymentStatus = "Pending" | "Received" | "Failed" | "Refunded";
export const PAYMENT_STATUSES: PaymentStatus[] = ["Pending", "Received", "Failed", "Refunded"];

const pad = (n: number) => String(n).padStart(2, "0");

/** The calendar day of a stored (UTC-midnight) date, as YYYY-MM-DD. */
export const isoDay = (d: Date) => d.toISOString().slice(0, 10);
/** A moment in time as the calendar day on this server's clock. */
export const localDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayISO = () => localDay(new Date());

/** YYYY-MM-DD becomes midnight UTC; any other string or Date is taken as the exact moment given. */
export const asDate = (v?: string | Date | null) => {
  if (!v) return null;
  const d = typeof v === "string" ? new Date(v.length === 10 ? `${v}T00:00:00Z` : v) : v;
  return isNaN(d.getTime()) ? null : d;
};

export function parseMeta(details: string | null): Record<string, any> {
  if (!details) return {};
  try {
    const m = JSON.parse(details);
    return m && typeof m === "object" ? m : {};
  } catch {
    return {};
  }
}

/** Next free invoice number, e.g. INV-2026-1007. */
export async function nextInvoiceNo(): Promise<string> {
  const year = new Date().getFullYear();
  let n = (await prisma.payment.count()) + 1001;
  for (;;) {
    const candidate = `INV-${year}-${n}`;
    const clash = await prisma.payment.findUnique({ where: { invoiceNo: candidate }, select: { id: true } });
    if (!clash) return candidate;
    n++;
  }
}

/** Keep the older per-shop summary in `details` in step, so the shop detail screens agree with the ledger. */
export async function syncShopMeta(shopId: string, patch: Record<string, any>) {
  const shop = await prisma.user.findUnique({ where: { id: shopId }, select: { details: true } });
  if (!shop) return;
  const meta = { ...parseMeta(shop.details), ...patch };
  await prisma.user.update({ where: { id: shopId }, data: { details: JSON.stringify(meta) } });
}

/**
 * Create the invoice for a new term unless the shop already has an open one.
 * Used when a paid plan is chosen and when a payment is received (to bill the next month).
 */
export async function openInvoiceIfNone(args: {
  shopId: string;
  plan: string;
  amount: number;
  dueDate: Date;
  status?: PaymentStatus;
  paidAt?: Date | null;
  method?: string | null;
  reference?: string | null;
  notes?: string | null;
}) {
  if (!(args.amount > 0) || args.plan === "Free Trial") return null;
  const open = await prisma.payment.findFirst({ where: { shopId: args.shopId, status: { in: ["Pending", "Failed"] } } });
  if (open) return open;
  return prisma.payment.create({
    data: {
      invoiceNo: await nextInvoiceNo(),
      shopId: args.shopId,
      plan: args.plan,
      amount: args.amount,
      status: args.status ?? "Pending",
      dueDate: args.dueDate,
      paidAt: args.paidAt ?? null,
      method: args.method ?? null,
      reference: args.reference ?? null,
      notes: args.notes ?? null,
    },
  });
}

/**
 * Shops that were set up before the ledger existed get one invoice from their saved payment summary.
 * Only a payment that was explicitly recorded as received counts as collected; everything else is Pending.
 * Safe to run on every load: it only touches paid shops that have no invoice at all.
 */
export async function backfillInvoices() {
  const shops = await prisma.user.findMany({
    where: { role: "SHOP", subscriptionPackage: { notIn: ["Free Trial", "Platform Admin"] }, payments: { none: {} } },
  });
  for (const shop of shops) {
    const meta = parseMeta(shop.details);
    // A "Waived" summary only ever meant the free trial; a shop on a paid plan owes its fee
    const amount = Number(meta.planPrice) || (({ Starter: 5000, Professional: 10000, Custom: 0 } as Record<string, number>)[shop.subscriptionPackage] ?? 0);
    if (!(amount > 0)) continue;
    const received = meta.paymentStatus === "Received" || meta.paymentStatus === "Paid";
    const startDay = asDate(localDay(shop.subscriptionStart ?? shop.createdAt));
    await prisma.payment.create({
      data: {
        invoiceNo: await nextInvoiceNo(),
        shopId: shop.id,
        plan: shop.subscriptionPackage,
        amount: received ? Number(meta.amountPaid) || amount : amount,
        status: received ? "Received" : "Pending",
        dueDate: startDay ?? new Date(),
        paidAt: received ? asDate(meta.paymentDate) ?? startDay : null,
        method: received ? meta.paymentMethod ?? null : null,
        reference: received ? meta.paymentReference ?? null : null,
        notes: meta.notes ?? null,
      },
    });
  }
}

/**
 * When a paid plan is chosen for a showroom, make sure there is an invoice for it.
 * An open (Pending / Failed) invoice is updated to the new plan and fee instead of adding a second one.
 */
export async function syncInvoiceToPlan(shopId: string, plan: string, amount: number, dueDate: Date) {
  if (plan === "Free Trial" || plan === "Platform Admin" || !(amount > 0)) return;
  const open = await prisma.payment.findFirst({ where: { shopId, status: { in: ["Pending", "Failed"] } }, orderBy: { createdAt: "desc" } });
  if (open) {
    if (open.plan !== plan || open.amount !== amount) {
      await prisma.payment.update({ where: { id: open.id }, data: { plan, amount } });
    }
    return;
  }
  await prisma.payment.create({
    data: { invoiceNo: await nextInvoiceNo(), shopId, plan, amount, status: "Pending", dueDate },
  });
}

/** When this showroom's monthly fee is collected (start of month, end of month, or its plan start day). */
export async function billingDayOf(shopId: string): Promise<BillingDay> {
  const shop = await prisma.user.findUnique({ where: { id: shopId }, select: { details: true } });
  return asBillingDay(parseMeta(shop?.details ?? null).billingDay);
}

// ── Automatic suspension ──────────────────────────────────────────────────────────────────────

/** The last day a showroom may stay unpaid: the extra-time date if the admin gave one, else the due date. */
export const deadlineOf = (p: { dueDate: Date; graceUntil: Date | null }) => isoDay(p.graceUntil ?? p.dueDate);

/**
 * Suspend showrooms whose payment date has passed (and whose extra time, if any, has run out).
 * A free trial that has ended is treated the same way. Pass a shop id to check just that one.
 * There is no scheduler, so this runs whenever the admin dashboard loads and whenever a showroom signs in.
 */
export async function enforceOverdueSuspensions(shopId?: string): Promise<string[]> {
  const today = todayISO();
  const shops = await prisma.user.findMany({
    where: { role: "SHOP", subscriptionActive: true, ...(shopId ? { id: shopId } : {}) },
    include: { payments: { where: { status: { in: ["Pending", "Failed"] } } } },
  });
  const suspended: string[] = [];
  for (const shop of shops) {
    const unpaid = shop.payments.some((p) => deadlineOf(p) < today);
    const trialOver = shop.subscriptionPackage === "Free Trial" && !!shop.trialEndsAt && isoDay(shop.trialEndsAt) < today;
    if (!unpaid && !trialOver) continue;
    const meta = parseMeta(shop.details);
    await prisma.user.update({
      where: { id: shop.id },
      data: {
        subscriptionActive: false,
        details: JSON.stringify({ ...meta, suspendedForNonPayment: true, suspendedReason: unpaid ? "unpaid" : "trial-ended", suspendedOn: today }),
      },
    });
    suspended.push(shop.id);
  }
  return suspended;
}

/** Switch a showroom back on after money arrives or extra time is given, then re-check it. */
export async function reactivateShop(shopId: string) {
  const shop = await prisma.user.findUnique({ where: { id: shopId }, select: { details: true } });
  if (!shop) return;
  const meta = parseMeta(shop.details);
  await prisma.user.update({
    where: { id: shopId },
    data: { subscriptionActive: true, details: JSON.stringify({ ...meta, suspendedForNonPayment: false, suspendedReason: null }) },
  });
  // Anything still past its date keeps (or puts) the showroom back in suspension
  await enforceOverdueSuspensions(shopId);
}

// Pure (also used by the browser), so it lives with the other billing-date helpers
export { dueDateInMonth };

export const PLAN_FEES: Record<string, number> = { Starter: 5000, Professional: 10000 };

/**
 * A new month starts: every showroom on a paid plan owes that month's fee, so each one gets an invoice
 * (Pending) for the current month, and for any month since its last invoice that was never created.
 * Runs whenever the admin dashboard loads, so there is no scheduler to keep alive. Safe to repeat.
 */
export async function ensureMonthlyInvoices() {
  const today = todayISO();
  const thisKey = today.slice(0, 7);
  const shops = await prisma.user.findMany({
    where: { role: "SHOP", subscriptionPackage: { notIn: ["Free Trial", "Platform Admin"] } },
    include: { payments: { select: { dueDate: true } } },
  });

  for (const shop of shops) {
    const meta = parseMeta(shop.details);
    // A shop the admin switched off by hand is left alone; one suspended for non-payment still owes
    if (!shop.subscriptionActive && !meta.suspendedForNonPayment) continue;
    const fee = Number(meta.planPrice) || PLAN_FEES[shop.subscriptionPackage] || 0;
    if (!(fee > 0) || shop.payments.length === 0) continue;

    const have = new Set(shop.payments.map((p) => isoDay(p.dueDate).slice(0, 7)));
    const latest = [...have].sort().pop()!;
    const billingDay = asBillingDay(meta.billingDay);
    const planStartDay = shop.subscriptionStart ? shop.subscriptionStart.getUTCDate() : 1;

    // Walk forward from the month after the latest invoice up to this month (at most a year back)
    let [y, m] = latest.split("-").map(Number);
    for (let i = 0; i < 12; i++) {
      m += 1;
      if (m > 12) { m = 1; y += 1; }
      const key = `${y}-${pad(m)}`;
      if (key > thisKey) break;
      if (have.has(key)) continue;
      await prisma.payment.create({
        data: {
          invoiceNo: await nextInvoiceNo(),
          shopId: shop.id,
          plan: shop.subscriptionPackage,
          amount: fee,
          status: "Pending",
          dueDate: asDate(dueDateInMonth(y, m, billingDay, planStartDay))!,
        },
      });
    }
  }
}

/** True if the showroom has an unpaid invoice whose payment date (or extra-time date) has already passed. */
export async function hasOverdueInvoices(shopId: string): Promise<boolean> {
  const today = todayISO();
  const open = await prisma.payment.findMany({ where: { shopId, status: { in: ["Pending", "Failed"] } } });
  return open.some((p) => deadlineOf(p) < today);
}
