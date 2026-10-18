import { prisma } from "@/lib/prisma";
import type { SessionPayload } from "@/lib/auth";
import type { NotificationFeed, NotificationItem, NotificationKind } from "@/lib/notificationTypes";
import { formatDay } from "@/lib/notificationTypes";
import { getSubscriptionPlans } from "@/lib/subscriptionPlansServer";
import { DEFAULT_SUBSCRIPTION_PLANS, type SubscriptionPlanItem } from "@/lib/subscriptionPlanTypes";
import { findPackage, isCustomPlan, normalizePlan, packageName } from "@/lib/subscriptionPlans";

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
 * Automatically check for subscriptions expiring in 2 days and create notifications if not already sent.
 */
export async function checkExpiringSubscriptions(targetShopId?: string): Promise<void> {
  try {
    const now = new Date();
    const startOfTodayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

    const shops = await prisma.user.findMany({
      where: {
        role: "SHOP",
        subscriptionActive: true,
        ...(targetShopId ? { id: targetShopId } : {}),
        OR: [
          { subscriptionEnd: { not: null } },
          { trialEndsAt: { not: null } },
        ],
      },
      select: {
        id: true,
        shopName: true,
        email: true,
        subscriptionPackage: true,
        subscriptionEnd: true,
        trialEndsAt: true,
      },
    });

    for (const shop of shops) {
      const deadline = shop.subscriptionEnd || shop.trialEndsAt;
      if (!deadline) continue;

      const deadlineDate = new Date(deadline);
      const deadlineDateUTC = Date.UTC(deadlineDate.getUTCFullYear(), deadlineDate.getUTCMonth(), deadlineDate.getUTCDate());
      const diffDays = Math.round((deadlineDateUTC - startOfTodayUTC) / (1000 * 60 * 60 * 24));

      // Trigger if deadline is within 2 days (1 or 2 days remaining)
      if (diffDays > 0 && diffDays <= 2) {
        const dateKey = deadlineDate.toISOString().slice(0, 10);
        const dedupeKey = `sub-expiring:${shop.id}:${dateKey}`;

        const existing = await prisma.notification.findUnique({
          where: { dedupeKey },
        });

        if (!existing) {
          const daysText = diffDays === 1 ? "tomorrow (in 1 day)" : "in 2 days";
          const deadlineText = formatDay(deadlineDate.toISOString());
          const planName = shop.subscriptionPackage || "Showroom";

          await prisma.notification.create({
            data: {
              type: "SUBSCRIPTION_EXPIRING",
              recipientId: shop.id,
              shopId: shop.id,
              dedupeKey,
              month: dateKey.slice(0, 7),
              dueDate: deadlineDate,
              title: `Subscription Expiring ${diffDays === 1 ? "Tomorrow" : "in 2 Days"}`,
              message: `Your ${planName} subscription will reach its end date ${daysText} on ${deadlineText}. Please renew or contact administration to maintain uninterrupted access to your showroom and visualizer.`,
              sentAt: now,
            },
          });
        }
      }
    }
  } catch (err) {
    console.error("Error checking expiring subscriptions:", err);
  }
}

/**
 * Notify a showroom when its subscription plan has been changed (upgraded or downgraded).
 */
export async function notifyPlanChanged(
  shopId: string,
  oldPlan: string,
  newPlan: string,
  adminId?: string | null,
): Promise<void> {
  try {
    if (!oldPlan || !newPlan) return;
    const cleanOld = normalizePlan(oldPlan).trim();
    const cleanNew = normalizePlan(newPlan).trim();
    if (cleanOld.toLowerCase() === cleanNew.toLowerCase()) return;

    const plans: SubscriptionPlanItem[] = await getSubscriptionPlans().catch(() => DEFAULT_SUBSCRIPTION_PLANS);
    const oldMatched = findPackage<SubscriptionPlanItem>(cleanOld, plans);
    const newMatched = findPackage<SubscriptionPlanItem>(cleanNew, plans);

    const oldPrice = oldMatched?.price ?? 0;
    const newPrice = newMatched?.price ?? 0;

    const isOldCustom = isCustomPlan(cleanOld);
    const isNewCustom = isCustomPlan(cleanNew);
    const isOldTrial = cleanOld.toLowerCase() === "free trial";
    const isNewTrial = cleanNew.toLowerCase() === "free trial";

    let isUpgrade = false;
    if (isNewCustom) {
      isUpgrade = true; // Custom Plan is the premier tier
    } else if (isOldCustom) {
      isUpgrade = false; // Moving down from Custom Plan
    } else if (isOldTrial && !isNewTrial) {
      isUpgrade = true;
    } else if (isNewTrial && !isOldTrial) {
      isUpgrade = false;
    } else {
      const oldQuota = oldMatched?.tileQuota ?? 50;
      const newQuota = newMatched?.tileQuota ?? 50;
      isUpgrade = newPrice > oldPrice || (newPrice === oldPrice && newQuota >= oldQuota);
    }

    const action = isUpgrade ? "upgraded" : "downgraded";
    const newPlanName = packageName(cleanNew, plans) || cleanNew;
    const title = `Subscription ${isUpgrade ? "Upgraded" : "Downgraded"}: ${newPlanName}`;
    const quotaText = newMatched?.tileQuota ? ` You now have ${newMatched.tileQuota} tile storage slots.` : "";
    const message = `Your showroom subscription plan has been ${action} to the ${newPlanName}.${quotaText} Your catalog limits and visualizer capabilities have been updated.`;

    const now = new Date();
    await prisma.notification.create({
      data: {
        type: "PLAN_CHANGED",
        recipientId: shopId,
        shopId,
        senderId: adminId || null,
        month: now.toISOString().slice(0, 7),
        title,
        message,
        sentAt: now,
      },
    });
  } catch (err) {
    console.error("Error creating plan change notification:", err);
  }
}

/**
 * Everything the signed-in account should see.
 *   showroom  the payment reminders and lifecycle notifications addressed to it, newest first
 *   admin     the read receipts addressed to it, plus every reminder that has been sent (for the payments screen)
 */
export async function loadFeed(session: Pick<SessionPayload, "userId" | "role">): Promise<NotificationFeed> {
  // Check for upcoming subscription deadlines (2 days before)
  if (session.role === "ADMIN") {
    await checkExpiringSubscriptions();
  } else {
    await checkExpiringSubscriptions(session.userId);
  }

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
