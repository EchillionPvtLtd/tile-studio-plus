"use server";

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { addMonthsISO, asBillingDay, firstBillingDate, nextBillingDate, termOf } from "@/lib/subscriptionPlans";
import {
  PAYMENT_STATUSES as STATUSES,
  asDate,
  billingDayOf,
  dueDateInMonth,
  enforceOverdueSuspensions,
  isoDay,
  nextInvoiceNo,
  openInvoiceIfNone,
  parseMeta,
  reactivateShop,
  syncShopMeta,
  todayISO,
  type PaymentStatus,
} from "@/lib/payments";

/**
 * The payments ledger. Every subscription fee is an invoice with a status the admin controls:
 *   Pending   billed, money not collected yet
 *   Received  money collected (paidAt is set) - only these count as "Collected" in the charts
 *   Failed    an attempt that did not go through; still owed
 *   Refunded  money was paid and then given back
 */

async function requireAdmin() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") throw new Error("Unauthorized");
}

export async function createInvoice(input: {
  shopId: string;
  amount: number;
  dueDate: string;
  plan?: string;
  status?: PaymentStatus;
  paidAt?: string;
  method?: string;
  reference?: string;
  notes?: string;
}) {
  try {
    await requireAdmin();
    const shop = await prisma.user.findUnique({ where: { id: input.shopId } });
    if (!shop || shop.role !== "SHOP") return { success: false, message: "Showroom not found." };
    if (!(input.amount > 0)) return { success: false, message: "Enter an amount greater than zero." };
    const due = asDate(input.dueDate);
    if (!due) return { success: false, message: "Choose a due date." };

    const status: PaymentStatus = STATUSES.includes(input.status as PaymentStatus) ? (input.status as PaymentStatus) : "Pending";
    const payment = await prisma.payment.create({
      data: {
        invoiceNo: await nextInvoiceNo(),
        shopId: shop.id,
        plan: input.plan || shop.subscriptionPackage,
        amount: input.amount,
        status,
        dueDate: due,
        paidAt: status === "Received" ? asDate(input.paidAt) ?? asDate(todayISO()) : null,
        method: input.method?.trim() || null,
        reference: input.reference?.trim() || null,
        notes: input.notes?.trim() || null,
      },
    });
    if (status === "Received") await applyReceived(payment.id);
    await enforceOverdueSuspensions(shop.id);
    revalidatePath("/admin");
    return { success: true, message: `Invoice ${payment.invoiceNo} created as ${status}.` };
  } catch (e: any) {
    return { success: false, message: "Could not create the invoice: " + (e?.message || "unknown error") };
  }
}

/** After money is collected: extend the showroom's term, bill the next month and switch it back on. */
async function applyReceived(paymentId: string) {
  const payment = await prisma.payment.findUnique({ where: { id: paymentId }, include: { shop: true } });
  if (!payment) return;
  const shop = payment.shop;
  const now = new Date();
  const today = todayISO();
  const term = termOf(payment.plan);

  // An invoice pays for the term that starts on its due date and runs until the next one falls due.
  // The first invoice covers the term the plan already has; a renewal extends it. Paying very late
  // starts a fresh term from the day the money arrived.
  const billingDay = await billingDayOf(shop.id);
  let newEnd = shop.subscriptionEnd;
  if (term.kind === "months") {
    const coveredUntil = asDate(nextBillingDate(isoDay(payment.dueDate), billingDay)) ?? now;
    if (isoDay(coveredUntil) <= today) {
      newEnd = asDate(nextBillingDate(firstBillingDate(today, billingDay), billingDay));
    } else {
      newEnd = shop.subscriptionEnd && shop.subscriptionEnd > coveredUntil ? shop.subscriptionEnd : coveredUntil;
    }
  } else if (!newEnd || isoDay(newEnd) < today) {
    // Custom Plan: the admin owns the dates; only reopen a lapsed term by a month
    newEnd = asDate(addMonthsISO(today, 1));
  }

  await prisma.user.update({
    where: { id: shop.id },
    data: { subscriptionStart: shop.subscriptionStart ?? now, subscriptionEnd: newEnd },
  });
  await syncShopMeta(shop.id, {
    paymentStatus: "Received",
    amountPaid: payment.amount,
    balance: 0,
    paymentDate: payment.paidAt ? isoDay(payment.paidAt) : today,
    paymentMethod: payment.method ?? "Bank Transfer",
    paymentReference: payment.reference,
  });

  // Monthly plans: the next month's fee is billed straight away (it falls due when this term ends)
  if (term.kind === "months" && newEnd) {
    await openInvoiceIfNone({ shopId: shop.id, plan: payment.plan, amount: payment.amount, dueDate: asDate(isoDay(newEnd)) ?? newEnd });
  }

  // Money in: switch the showroom back on (unless an older invoice is still past its date)
  await reactivateShop(shop.id);
}

/**
 * Record money collected from a showroom for one billing month ("2026-10") on the date it was received.
 * If that month already has an unpaid invoice it is marked Received; if the month has not been billed yet
 * (collecting early) an invoice is created for it as Received.
 */
export async function recordPaymentForMonth(
  shopId: string,
  month: string,
  input: { amount?: number; paidAt?: string; method?: string; reference?: string; notes?: string },
) {
  try {
    await requireAdmin();
    const match = /^(\d{4})-(\d{2})$/.exec(month);
    if (!match) return { success: false, message: "Choose the month this payment is for." };
    const year = Number(match[1]);
    const mon = Number(match[2]);

    const shop = await prisma.user.findUnique({ where: { id: shopId } });
    if (!shop || shop.role !== "SHOP") return { success: false, message: "Showroom not found." };
    if (shop.subscriptionPackage === "Free Trial") return { success: false, message: "A free trial has nothing to collect. Choose a paid plan first." };

    const paidAt = asDate(input.paidAt) ?? asDate(todayISO());
    const monthStart = new Date(Date.UTC(year, mon - 1, 1));
    const monthEnd = new Date(Date.UTC(year, mon, 1));
    const inMonth = await prisma.payment.findMany({
      where: { shopId, dueDate: { gte: monthStart, lt: monthEnd } },
      orderBy: { dueDate: "asc" },
    });
    const open = inMonth.find((p) => p.status === "Pending" || p.status === "Failed");
    if (!open && inMonth.some((p) => p.status === "Received")) {
      return { success: false, message: "That month has already been collected." };
    }

    const method = input.method?.trim() || "Bank Transfer";
    let paymentId: string;
    let amount: number;
    if (open) {
      amount = input.amount && input.amount > 0 ? input.amount : open.amount;
      await prisma.payment.update({
        where: { id: open.id },
        data: {
          status: "Received",
          amount,
          paidAt,
          graceUntil: null,
          method,
          reference: input.reference?.trim() || open.reference || null,
          notes: input.notes?.trim() || open.notes || null,
        },
      });
      paymentId = open.id;
    } else {
      const meta = parseMeta(shop.details);
      amount = input.amount && input.amount > 0 ? input.amount : Number(meta.planPrice) || 0;
      if (!(amount > 0)) return { success: false, message: "Enter the amount received." };
      const billingDay = asBillingDay(meta.billingDay);
      const planStartDay = shop.subscriptionStart ? shop.subscriptionStart.getUTCDate() : 1;
      const created = await prisma.payment.create({
        data: {
          invoiceNo: await nextInvoiceNo(),
          shopId,
          plan: shop.subscriptionPackage,
          amount,
          status: "Received",
          dueDate: asDate(dueDateInMonth(year, mon, billingDay, planStartDay)) ?? monthStart,
          paidAt,
          method,
          reference: input.reference?.trim() || null,
          notes: input.notes?.trim() || null,
        },
      });
      paymentId = created.id;
    }

    await applyReceived(paymentId);
    revalidatePath("/admin");
    const label = monthStart.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
    return { success: true, message: `LKR ${amount.toLocaleString()} recorded for ${label} from ${shop.shopName || shop.email}.` };
  } catch (e: any) {
    return { success: false, message: "Could not record the payment: " + (e?.message || "unknown error") };
  }
}

/**
 * Give a showroom extra time. It will not be suspended before `until` (a calendar date, YYYY-MM-DD),
 * and if it was suspended for non-payment it is switched back on. A free trial gets its end date moved instead.
 */
export async function giveExtraTime(shopId: string, until: string) {
  try {
    await requireAdmin();
    const untilDate = asDate(until);
    if (!untilDate || isoDay(untilDate) < todayISO()) return { success: false, message: "Choose a date from today onwards." };

    const shop = await prisma.user.findUnique({ where: { id: shopId } });
    if (!shop || shop.role !== "SHOP") return { success: false, message: "Showroom not found." };

    if (shop.subscriptionPackage === "Free Trial") {
      await prisma.user.update({ where: { id: shopId }, data: { trialEndsAt: untilDate } });
    } else {
      await prisma.payment.updateMany({ where: { shopId, status: { in: ["Pending", "Failed"] } }, data: { graceUntil: untilDate } });
    }
    await reactivateShop(shopId);
    revalidatePath("/admin");
    const label = untilDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
    return { success: true, message: `${shop.shopName || shop.email} has until ${label} before it is suspended.` };
  } catch (e: any) {
    return { success: false, message: "Could not give extra time: " + (e?.message || "unknown error") };
  }
}

/** Change an invoice's status to Pending, Failed or Refunded (Received goes through recordPaymentForMonth). */
export async function setPaymentStatus(paymentId: string, status: PaymentStatus, note?: string) {
  try {
    await requireAdmin();
    if (!STATUSES.includes(status)) return { success: false, message: "Unknown status." };
    if (status === "Received") return { success: false, message: "Use Record payment to mark money as received." };
    const existing = await prisma.payment.findUnique({ where: { id: paymentId } });
    if (!existing) return { success: false, message: "Invoice not found." };

    await prisma.payment.update({
      where: { id: paymentId },
      data: {
        status,
        // Not collected (or no longer collected): it must not count towards the Collected totals
        paidAt: status === "Refunded" ? existing.paidAt : null,
        notes: note?.trim() || existing.notes,
      },
    });
    await syncShopMeta(existing.shopId, { paymentStatus: status });
    await enforceOverdueSuspensions(existing.shopId);
    revalidatePath("/admin");
    return { success: true, message: `${existing.invoiceNo} marked as ${status}.` };
  } catch (e: any) {
    return { success: false, message: "Could not update the status: " + (e?.message || "unknown error") };
  }
}

export async function deleteInvoice(paymentId: string) {
  try {
    await requireAdmin();
    const existing = await prisma.payment.findUnique({ where: { id: paymentId } });
    if (!existing) return { success: false, message: "Invoice not found." };
    await prisma.payment.delete({ where: { id: paymentId } });
    revalidatePath("/admin");
    return { success: true, message: `${existing.invoiceNo} deleted.` };
  } catch (e: any) {
    return { success: false, message: "Could not delete the invoice: " + (e?.message || "unknown error") };
  }
}
