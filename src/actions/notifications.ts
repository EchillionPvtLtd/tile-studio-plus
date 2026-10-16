"use server";

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { asBillingDay, dueDateInMonth } from "@/lib/subscriptionPlans";
import { PLAN_FEES, asDate, parseMeta } from "@/lib/payments";
import { serializeNotification, withShop } from "@/lib/notifications";
import {
  MESSAGE_MAX,
  defaultReminderMessage,
  formatDay,
  isMonthKey,
  monthLabelOf,
  readReceiptMessage,
  reminderStatusOf,
  type NotificationItem,
} from "@/lib/notificationTypes";
import { formatLKR } from "@/lib/utils";

/**
 * Payment reminders (admin -> showroom) and the read receipts that come back (showroom -> admin).
 * See the Notification model in prisma/schema.prisma for how the states work.
 */

async function requireAdmin() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") throw new Error("Unauthorized");
  return session;
}

async function requireSession() {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  return session;
}

const reminderKey = (shopId: string, month: string) => `reminder:${shopId}:${month}`;

export interface SendReminderResult {
  success: boolean;
  message: string;
  /** A reminder for this showroom and month already exists and the admin did not ask to resend it. */
  duplicate?: boolean;
  reminder?: NotificationItem;
}

/**
 * Send a showroom a reminder that its fee for one billing month ("2026-10") is waiting to be paid.
 * One reminder exists per showroom and month: asking again without `resend` is refused, so a double
 * click or a second admin cannot send it twice. `resend: true` is the admin deliberately sending it again;
 * the same reminder goes back to Sent and the showroom is alerted again.
 */
export async function sendPaymentReminder(
  shopId: string,
  month: string,
  opts: { message?: string; resend?: boolean } = {},
): Promise<SendReminderResult> {
  try {
    const session = await requireAdmin();
    if (!isMonthKey(month)) return { success: false, message: "Choose the month this reminder is for." };
    const [year, mon] = month.split("-").map(Number);

    const shop = await prisma.user.findUnique({ where: { id: shopId } });
    if (!shop || shop.role !== "SHOP") return { success: false, message: "Showroom not found." };
    if (shop.subscriptionPackage === "Free Trial") return { success: false, message: "A free trial has nothing to pay. Choose a paid plan first." };
    const shopName = shop.shopName || shop.email;
    const label = monthLabelOf(month);

    // What is owed for that month: its unpaid invoice, or (not billed yet) the plan fee on the showroom's billing day
    const monthStart = new Date(Date.UTC(year, mon - 1, 1));
    const monthEnd = new Date(Date.UTC(year, mon, 1));
    const inMonth = await prisma.payment.findMany({
      where: { shopId, dueDate: { gte: monthStart, lt: monthEnd } },
      orderBy: { dueDate: "asc" },
    });
    const open = inMonth.find((p) => p.status === "Pending" || p.status === "Failed");
    if (!open && inMonth.some((p) => p.status === "Received")) {
      return { success: false, message: `${shopName} has already paid for ${label}. There is nothing to remind.` };
    }
    let amount: number;
    let dueDate: Date;
    if (open) {
      amount = open.amount;
      dueDate = open.dueDate;
    } else {
      const meta = parseMeta(shop.details);
      amount = Number(meta.planPrice) || PLAN_FEES[shop.subscriptionPackage] || 0;
      if (!(amount > 0)) return { success: false, message: `No monthly fee is set for ${shopName}'s ${shop.subscriptionPackage} plan.` };
      const planStartDay = shop.subscriptionStart ? shop.subscriptionStart.getUTCDate() : 1;
      dueDate = asDate(dueDateInMonth(year, mon, asBillingDay(meta.billingDay), planStartDay)) ?? monthStart;
    }

    const text = (opts.message ?? "").trim().slice(0, MESSAGE_MAX)
      || defaultReminderMessage({ shopName, monthLabel: label, amountText: formatLKR(amount), dueText: formatDay(dueDate.toISOString()) });
    const dedupeKey = reminderKey(shopId, month);
    const existing = await prisma.notification.findUnique({ where: { dedupeKey }, include: withShop });

    const duplicate = (row: NonNullable<typeof existing>): SendReminderResult => {
      const item = serializeNotification(row);
      return {
        success: false,
        duplicate: true,
        reminder: item,
        message: `A reminder for ${label} was already sent to ${shopName} (${reminderStatusOf(item)}). Use Resend if you want to send it again.`,
      };
    };

    if (existing && !opts.resend) return duplicate(existing);

    const fields = {
      senderId: session.userId,
      paymentId: open?.id ?? null,
      amount,
      dueDate,
      title: `Payment reminder: ${label}`,
      message: text,
    };

    let row;
    if (existing) {
      // Deliberate resend: the same reminder goes back to Sent, so the showroom is alerted again
      row = await prisma.notification.update({
        where: { id: existing.id },
        data: { ...fields, sentAt: new Date(), deliveredAt: null, readAt: null, resendCount: { increment: 1 } },
        include: withShop,
      });
    } else {
      try {
        row = await prisma.notification.create({
          data: { type: "PAYMENT_REMINDER", recipientId: shop.id, shopId: shop.id, month, dedupeKey, ...fields },
          include: withShop,
        });
      } catch (e: any) {
        // Someone sent the same reminder a moment ago
        if (e?.code === "P2002") {
          const winner = await prisma.notification.findUnique({ where: { dedupeKey }, include: withShop });
          if (winner) return duplicate(winner);
        }
        throw e;
      }
    }

    return {
      success: true,
      reminder: serializeNotification(row),
      message: existing ? `Reminder for ${label} sent to ${shopName} again.` : `Reminder for ${label} sent to ${shopName}.`,
    };
  } catch (e: any) {
    return { success: false, message: "Could not send the reminder: " + (e?.message || "unknown error") };
  }
}

/**
 * Mark one notification the signed-in account owns as read, and save it straight away.
 * When a showroom reads a payment reminder, a read receipt is created for the admin (once per read).
 */
async function markOneRead(id: string, userId: string): Promise<NotificationItem | null> {
  return prisma.$transaction(async (tx) => {
    const current = await tx.notification.findFirst({ where: { id, recipientId: userId }, include: withShop });
    if (!current) return null;
    if (current.readAt) return serializeNotification(current);

    const now = new Date();
    // Only the call that actually flips unread -> read creates the receipt, so a double click cannot make two
    const flipped = await tx.notification.updateMany({
      where: { id, recipientId: userId, readAt: null },
      data: { readAt: now, deliveredAt: current.deliveredAt ?? now },
    });

    if (flipped.count === 1 && current.type === "PAYMENT_REMINDER") {
      // The admin who sent it hears about it; if that admin is gone, every admin does
      const sender = current.senderId ? await tx.user.findFirst({ where: { id: current.senderId, role: "ADMIN" }, select: { id: true } }) : null;
      const admins = sender ? [sender] : await tx.user.findMany({ where: { role: "ADMIN" }, select: { id: true } });
      const shopName = current.shop.shopName || current.shop.email;
      for (const admin of admins) {
        await tx.notification.create({
          data: {
            type: "READ_RECEIPT",
            recipientId: admin.id,
            shopId: current.shopId,
            paymentId: current.paymentId,
            parentId: current.id,
            month: current.month,
            amount: current.amount,
            dueDate: current.dueDate,
            title: "Payment reminder read",
            message: readReceiptMessage(shopName, current.month),
            sentAt: now,
            createdAt: now,
          },
        });
      }
    }

    const fresh = await tx.notification.findFirst({ where: { id }, include: withShop });
    return fresh ? serializeNotification(fresh) : null;
  });
}

export async function markNotificationRead(id: string): Promise<{ success: boolean; message: string; notification?: NotificationItem }> {
  try {
    const session = await requireSession();
    if (typeof id !== "string" || !id) return { success: false, message: "Notification not found." };
    const notification = await markOneRead(id, session.userId);
    if (!notification) return { success: false, message: "Notification not found." };
    return { success: true, message: "Marked as read.", notification };
  } catch (e: any) {
    return { success: false, message: "Could not mark it as read: " + (e?.message || "unknown error") };
  }
}

/** Mark everything unread that is addressed to the signed-in account as read. */
export async function markAllNotificationsRead(): Promise<{ success: boolean; message: string; notifications?: NotificationItem[] }> {
  try {
    const session = await requireSession();
    const unread = await prisma.notification.findMany({ where: { recipientId: session.userId, readAt: null }, select: { id: true } });
    const done: NotificationItem[] = [];
    for (const { id } of unread) {
      const n = await markOneRead(id, session.userId);
      if (n) done.push(n);
    }
    return { success: true, message: done.length ? `${done.length} marked as read.` : "Nothing to mark.", notifications: done };
  } catch (e: any) {
    return { success: false, message: "Could not mark them as read: " + (e?.message || "unknown error") };
  }
}

/**
 * The app has shown these notifications to the signed-in account (pop-up and bell), which moves a reminder
 * from Sent to Unread on the admin's side. Only the owner's own notifications are touched.
 */
export async function acknowledgeDelivered(ids: string[]): Promise<{ success: boolean }> {
  try {
    const session = await requireSession();
    const clean = (Array.isArray(ids) ? ids : []).filter((id) => typeof id === "string").slice(0, 100);
    if (clean.length === 0) return { success: true };
    await prisma.notification.updateMany({
      where: { id: { in: clean }, recipientId: session.userId, deliveredAt: null },
      data: { deliveredAt: new Date() },
    });
    return { success: true };
  } catch {
    return { success: false };
  }
}
