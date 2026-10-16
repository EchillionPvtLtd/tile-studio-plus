import { prisma } from "@/lib/prisma";
import type { SessionPayload } from "@/lib/auth";
import type { NotificationFeed, NotificationItem, NotificationKind } from "@/lib/notificationTypes";

/** Server-only notification helpers (no "use server": these are not callable from the browser). */

const shopSelect = { shopName: true, email: true, logoUrl: true } as const;
export const withShop = { shop: { select: shopSelect } } as const;

type Row = {
  id: string;
  type: string;
  shopId: string;
  month: string;
  amount: number | null;
  dueDate: Date | null;
  title: string;
  message: string;
  sentAt: Date;
  deliveredAt: Date | null;
  readAt: Date | null;
  createdAt: Date;
  resendCount: number;
  parentId: string | null;
  shop: { shopName: string | null; email: string; logoUrl: string | null };
};

export function serializeNotification(n: Row): NotificationItem {
  return {
    id: n.id,
    type: n.type as NotificationKind,
    shopId: n.shopId,
    shopName: n.shop.shopName || n.shop.email,
    shopLogoUrl: n.shop.logoUrl,
    month: n.month,
    amount: n.amount,
    dueDate: n.dueDate ? n.dueDate.toISOString() : null,
    title: n.title,
    message: n.message,
    sentAt: n.sentAt.toISOString(),
    deliveredAt: n.deliveredAt ? n.deliveredAt.toISOString() : null,
    readAt: n.readAt ? n.readAt.toISOString() : null,
    createdAt: n.createdAt.toISOString(),
    resendCount: n.resendCount,
    parentId: n.parentId,
  };
}

/**
 * Everything the signed-in account should see.
 *   showroom  the payment reminders addressed to it, newest first
 *   admin     the read receipts addressed to it, plus every reminder that has been sent (for the payments screen)
 */
export async function loadFeed(session: Pick<SessionPayload, "userId" | "role">): Promise<NotificationFeed> {
  const mine = await prisma.notification.findMany({
    where: { recipientId: session.userId },
    orderBy: [{ sentAt: "desc" }, { createdAt: "desc" }],
    take: 100,
    include: withShop,
  });
  const notifications = mine.map(serializeNotification);
  if (session.role !== "ADMIN") {
    // Riding along on the poll: lets an open dashboard lock itself the moment the admin suspends the showroom
    const account = await prisma.user.findUnique({ where: { id: session.userId }, select: { subscriptionActive: true } });
    return { notifications, suspended: account ? !account.subscriptionActive : true, supportPhone: process.env.SUPPORT_PHONE?.trim() || null };
  }

  const all = await prisma.notification.findMany({
    where: { type: "PAYMENT_REMINDER" },
    orderBy: { sentAt: "desc" },
    take: 300,
    include: withShop,
  });
  return { notifications, reminders: all.map(serializeNotification) };
}
