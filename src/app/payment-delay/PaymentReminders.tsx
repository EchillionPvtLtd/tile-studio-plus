"use client";

import { useNotificationFeed } from "@/components/notifications/useNotificationFeed";
import { NotificationToasts, PaymentReminderCard } from "@/components/notifications/NotificationParts";
import type { NotificationFeed } from "@/lib/notificationTypes";

/**
 * A suspended showroom cannot open its dashboard, but its owner still has to be able to read (and acknowledge)
 * the payment reminders the administrator sent, so they are shown here as well.
 */
export function PaymentReminders({ initial }: { initial: NotificationFeed }) {
  const feed = useNotificationFeed(initial);
  const reminders = feed.notifications.filter((n) => n.type === "PAYMENT_REMINDER");

  return (
    <>
      <NotificationToasts toasts={feed.toasts} onDismiss={feed.dismissToast} onMarkRead={feed.markRead} />
      {reminders.length > 0 && (
        <section className="w-full max-w-xl space-y-3" aria-label="Payment reminders">
          <h2 className="text-center text-xs font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            Payment reminders{feed.unreadCount > 0 ? ` (${feed.unreadCount} new)` : ""}
          </h2>
          {reminders.map((n) => (
            <PaymentReminderCard key={n.id} n={n} onMarkRead={feed.markRead} />
          ))}
        </section>
      )}
    </>
  );
}
