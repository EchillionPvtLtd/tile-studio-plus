/**
 * Notification types and helpers shared by the server and the browser (no database access in here).
 *
 * A payment reminder moves through three states, which the admin can tell apart:
 *   Sent    saved for the showroom, whose app has not received it yet (the owner has not been online since)
 *   Unread  the owner's app received it (they saw the pop-up / bell) but they have not pressed Mark as read
 *   Read    the owner pressed Mark as read
 */
export type NotificationKind = "PAYMENT_REMINDER" | "READ_RECEIPT" | "SUBSCRIPTION_EXPIRING" | "PLAN_CHANGED";
export type ReminderStatus = "Sent" | "Unread" | "Read";

export interface NotificationItem {
  id: string;
  type: NotificationKind;
  shopId: string;
  shopName: string;
  shopLogoUrl: string | null;
  /** The billing month, "2026-10". */
  month: string;
  amount: number | null;
  /** The invoice's due date (a calendar day, ISO at midnight UTC). */
  dueDate: string | null;
  title: string;
  message: string;
  sentAt: string;
  deliveredAt: string | null;
  readAt: string | null;
  createdAt: string;
  resendCount: number;
  /** A read receipt points at the reminder it answers. */
  parentId: string | null;
}

/** What the browser polls for: what is addressed to the signed-in account, and (admin only) every reminder sent. */
export interface NotificationFeed {
  notifications: NotificationItem[];
  reminders?: NotificationItem[];
  /** Showroom accounts only: the administrator has suspended this showroom (it may be switched back on later). */
  suspended?: boolean;
  /** The number a suspended showroom is told to call. */
  supportPhone?: string | null;
}

export const reminderStatusOf = (n: Pick<NotificationItem, "deliveredAt" | "readAt">): ReminderStatus =>
  n.readAt ? "Read" : n.deliveredAt ? "Unread" : "Sent";

export const REMINDER_STATUS_HINT: Record<ReminderStatus, string> = {
  Sent: "Saved for the showroom. It has not opened the app since, so it has not seen the reminder yet.",
  Unread: "The showroom's app received the reminder, but the owner has not marked it as read.",
  Read: "The owner marked the reminder as read.",
};

export const MESSAGE_MAX = 1000;
const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;
export const isMonthKey = (v: unknown): v is string => typeof v === "string" && MONTH_RE.test(v);

/** "2026-10" becomes "October 2026". */
export function monthLabelOf(key: string): string {
  if (!isMonthKey(key)) return key;
  return new Date(`${key}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** A stored calendar day (midnight UTC) as "Oct 12, 2026". */
export function formatDay(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

/** A moment in time in the viewer's own timezone: "Oct 9, 2026, 3:42 PM". */
export function formatMoment(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** The date / the time of day of a moment, in the viewer's own timezone. */
export const formatLocalDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
export const formatLocalTime = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

/** "5 min ago" style, falling back to the date for anything older than a week. */
export function timeAgo(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (isNaN(t)) return "";
  const sec = Math.max(0, Math.round((now - t) / 1000));
  if (sec < 45) return "Just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const day = Math.round(hr / 24);
  if (day <= 7) return `${day} day${day === 1 ? "" : "s"} ago`;
  return formatMoment(iso);
}

/** The message sent when the admin does not write their own. */
export function defaultReminderMessage(args: { shopName: string; monthLabel: string; amountText: string; dueText: string }): string {
  const due = args.dueText ? ` It is due on ${args.dueText}.` : "";
  return `Hello ${args.shopName}, this is a friendly reminder that your subscription payment of ${args.amountText} for ${args.monthLabel} is waiting to be paid.${due} Please arrange the payment at your earliest convenience.`;
}

/** The text of the receipt the admin gets when a showroom marks a reminder as read. */
export const readReceiptMessage = (shopName: string, month: string) => `${shopName} has read the payment reminder for ${monthLabelOf(month)}.`;
