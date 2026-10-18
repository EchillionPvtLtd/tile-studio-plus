"use client";

import { useEffect, useState } from "react";
import { Bell, BellRing, Check, CheckCheck, Clock, Sparkles, X } from "lucide-react";
import { StatusBadge, type StatusTone } from "@/components/dashboard";
import { ShopAvatar } from "@/components/ShopAvatar";
import { formatLKR } from "@/lib/utils";
import {
  REMINDER_STATUS_HINT,
  formatDay,
  formatLocalDate,
  formatLocalTime,
  formatMoment,
  monthLabelOf,
  reminderStatusOf,
  timeAgo,
  type NotificationItem,
  type ReminderStatus,
} from "@/lib/notificationTypes";
import type { ToastItem } from "./useNotificationFeed";

const STATUS_TONE: Record<ReminderStatus, StatusTone> = { Sent: "neutral", Unread: "warning", Read: "success" };

/** Sent / Unread / Read, the same pill everywhere a reminder's state is shown. */
export function ReminderStatusBadge({ status, className }: { status: ReminderStatus; className?: string }) {
  return (
    <span title={REMINDER_STATUS_HINT[status]} className="inline-flex">
      <StatusBadge tone={STATUS_TONE[status]} dot className={className}>{status}</StatusBadge>
    </span>
  );
}

/** The bell used in both dashboards' headers: the count of unread notifications sits on it. */
export function NotificationBell({ count, onClick, className = "" }: { count: number; onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`ds-btn ds-btn-outline relative w-9 px-0 cursor-pointer ${className}`}
      title={count > 0 ? `${count} notification${count === 1 ? "" : "s"}` : "Notifications"}
      aria-label={count > 0 ? `Notifications, ${count} unread` : "Notifications"}
    >
      {count > 0 ? <BellRing className="h-4 w-4 text-foreground" /> : <Bell className="h-4 w-4" />}
      {count > 0 && (
        <span className="absolute -right-1.5 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-black leading-none text-white ring-2 ring-background shadow-xs pointer-events-none">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </button>
  );
}

// ── Pop-ups ──────────────────────────────────────────────────────────────────

const TOAST_MS = 15_000;

function Toast({
  toast,
  onDismiss,
  onOpen,
  onMarkRead,
}: {
  toast: ToastItem;
  onDismiss: (id: string) => void;
  onOpen?: () => void;
  onMarkRead?: (id: string) => Promise<unknown>;
}) {
  const [paused, setPaused] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (paused) return;
    const t = setTimeout(() => onDismiss(toast.id), TOAST_MS);
    return () => clearTimeout(t);
  }, [paused, toast.id, onDismiss]);

  const n = toast.notification;
  const isReminder = n?.type === "PAYMENT_REMINDER";
  const isExpiring = n?.type === "SUBSCRIPTION_EXPIRING";
  const isPlanChanged = n?.type === "PLAN_CHANGED";
  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className="pointer-events-auto animate-slide-up rounded-2xl border border-border bg-card p-4 text-card-foreground shadow-elevated"
    >
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
          isExpiring
            ? "bg-amber-500/15 text-amber-500"
            : isPlanChanged
            ? "bg-emerald-500/15 text-emerald-500"
            : isReminder || !n
            ? "bg-warning-muted text-warning"
            : "bg-success-muted text-success"
        }`}>
          {isExpiring ? (
            <Clock className="h-4 w-4" />
          ) : isPlanChanged ? (
            <Sparkles className="h-4 w-4" />
          ) : n && !isReminder ? (
            <CheckCheck className="h-4 w-4" />
          ) : (
            <BellRing className="h-4 w-4" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          {n ? (
            <>
              <p className="text-xs font-bold text-foreground">
                {n.title || (isExpiring ? "Subscription Expiring" : isPlanChanged ? "Subscription Updated" : isReminder ? "Payment reminder" : "Notification")}
              </p>
              <p className="mt-0.5 text-2xs font-semibold text-muted-foreground">
                {n.shopName}
                {isReminder ? ` · ${monthLabelOf(n.month)}` : ""}
                {n.amount != null ? ` · ${formatLKR(n.amount)}` : ""}
                {n.dueDate ? ` · due ${formatDay(n.dueDate)}` : ""}
              </p>
              <p className="mt-1.5 line-clamp-3 text-xs leading-relaxed text-muted-foreground">{n.message}</p>
            </>
          ) : (
            <>
              <p className="text-xs font-bold text-foreground">{toast.count} new notifications</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Open your notifications to read them.</p>
            </>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {onOpen && (
              <button
                type="button"
                onClick={() => {
                  if (n && onMarkRead) void onMarkRead(n.id);
                  onOpen();
                  onDismiss(toast.id);
                }}
                className="ds-btn ds-btn-sm ds-btn-primary"
              >
                View
              </button>
            )}
          </div>
        </div>
        <button type="button" onClick={() => onDismiss(toast.id)} className="cursor-pointer rounded-full p-1 text-muted-foreground hover:text-foreground" aria-label="Dismiss">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

/** The pop-up stack. Sits above everything, top right, and lets clicks through everywhere else. */
export function NotificationToasts({
  toasts,
  onDismiss,
  onOpen,
  onMarkRead,
}: {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
  onOpen?: () => void;
  onMarkRead?: (id: string) => Promise<unknown>;
}) {
  if (toasts.length === 0) return null;
  return (
    <div className="pointer-events-none fixed inset-x-3 top-3 z-[70] flex flex-col gap-3 sm:inset-x-auto sm:right-5 sm:top-5 sm:w-[390px]" role="region" aria-live="polite" aria-label="New notifications">
      {toasts.map((t) => (
        <Toast key={t.id} toast={t} onDismiss={onDismiss} onOpen={onOpen} onMarkRead={onMarkRead} />
      ))}
    </div>
  );
}

// ── Cards ────────────────────────────────────────────────────────────────────

function Fact({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="min-w-0">
      <span className="block text-2xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className={`block truncate text-xs ${strong ? "font-mono font-bold text-warning" : "font-semibold text-foreground"}`}>{value}</span>
    </div>
  );
}

/** A payment reminder as the showroom owner sees it. */
export function PaymentReminderCard({ n, onMarkRead }: { n: NotificationItem; onMarkRead: (id: string) => Promise<unknown> }) {
  const status = reminderStatusOf(n);
  const unread = !n.readAt;

  useEffect(() => {
    if (unread && onMarkRead) {
      // Auto-mark as read as soon as the user opens/views the notification
      const t = setTimeout(() => {
        void onMarkRead(n.id);
      }, 700);
      return () => clearTimeout(t);
    }
  }, [unread, n.id, onMarkRead]);

  return (
    <article className="rounded-2xl border border-border bg-card p-5 shadow-xs" aria-label={`Payment reminder for ${monthLabelOf(n.month)}`}>
      <div className="flex items-start gap-3.5">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-success-muted text-success">
          <CheckCheck className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1 space-y-3.5">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-xs font-bold text-foreground">Payment reminder: {monthLabelOf(n.month)}</h4>
            <ReminderStatusBadge status={n.readAt ? status : "Read"} />
            <span className="text-2xs text-muted-foreground">{timeAgo(n.sentAt)}</span>
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border border-border bg-muted p-3.5 sm:grid-cols-4">
            <Fact label="Showroom" value={n.shopName} />
            <Fact label="Payment month" value={monthLabelOf(n.month)} />
            <Fact label="Amount" value={n.amount != null ? formatLKR(n.amount) : "-"} strong />
            <Fact label="Due date" value={formatDay(n.dueDate) || "-"} />
          </div>

          <div>
            <span className="ds-label">Message from the administrator</span>
            <p className="whitespace-pre-line text-xs leading-relaxed text-foreground/90">{n.message}</p>
          </div>

          <div className="flex items-center gap-1.5 text-2xs font-semibold text-success">
            <CheckCheck className="h-3.5 w-3.5" />
            <span>Read{n.readAt ? ` ${formatMoment(n.readAt)}` : ""}</span>
          </div>
        </div>
      </div>
    </article>
  );
}

/** A subscription lifecycle notice (expiring soon, upgraded, or downgraded). */
export function SubscriptionNoticeCard({ n, onMarkRead }: { n: NotificationItem; onMarkRead: (id: string) => Promise<unknown> }) {
  const unread = !n.readAt;
  const isExpiring = n.type === "SUBSCRIPTION_EXPIRING";

  useEffect(() => {
    if (unread && onMarkRead) {
      // Auto-mark as read as soon as the user opens/views the notification
      const t = setTimeout(() => {
        void onMarkRead(n.id);
      }, 700);
      return () => clearTimeout(t);
    }
  }, [unread, n.id, onMarkRead]);

  return (
    <article className="rounded-2xl border border-border bg-card p-5 shadow-xs" aria-label={n.title}>
      <div className="flex items-start gap-3.5">
        <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
          isExpiring ? "bg-amber-500/15 text-amber-500" : "bg-emerald-500/15 text-emerald-500"
        }`}>
          {isExpiring ? <Clock className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
        </div>
        <div className="min-w-0 flex-1 space-y-3.5">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-xs font-bold text-foreground">{n.title}</h4>
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-2xs font-bold uppercase tracking-wider ${
              isExpiring ? "bg-amber-500/10 text-amber-500 border border-amber-500/20" : "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
            }`}>
              {isExpiring ? "Deadline Alert" : "Plan Update"}
            </span>
            <span className="text-2xs text-muted-foreground">{timeAgo(n.sentAt)}</span>
          </div>

          <div>
            <p className="whitespace-pre-line text-xs leading-relaxed text-foreground/90">{n.message}</p>
          </div>

          {n.dueDate && (
            <div className="flex items-center justify-between rounded-xl border border-border bg-muted p-3 text-xs">
              <span className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">Deadline Date</span>
              <span className="font-semibold text-foreground font-mono">{formatDay(n.dueDate)}</span>
            </div>
          )}

          <div className="flex items-center gap-1.5 text-2xs font-semibold text-success">
            <CheckCheck className="h-3.5 w-3.5" />
            <span>Read{n.readAt ? ` ${formatMoment(n.readAt)}` : ""}</span>
          </div>
        </div>
      </div>
    </article>
  );
}

/** The receipt an admin gets when a showroom has read a reminder. */
export function ReadReceiptCard({ n, onMarkRead }: { n: NotificationItem; onMarkRead: (id: string) => Promise<unknown> }) {
  const unread = !n.readAt;
  return (
    <div className={`flex items-start justify-between gap-4 rounded-2xl border p-5 ${unread ? "border-success/40 bg-card" : "border-border bg-card"} shadow-xs`}>
      <div className="flex min-w-0 items-start gap-4">
        <ShopAvatar name={n.shopName} logoUrl={n.shopLogoUrl} className="h-10 w-10 shrink-0 rounded-2xl" />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-sm font-bold text-foreground">{n.message}</h4>
            {unread && <StatusBadge tone="success" dot>New</StatusBadge>}
          </div>
          <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs sm:grid-cols-4">
            {[
              ["Showroom", n.shopName],
              ["Payment month", monthLabelOf(n.month)],
              ["Date read", formatLocalDate(n.createdAt)],
              ["Time read", formatLocalTime(n.createdAt)],
            ].map(([label, value]) => (
              <div key={label} className="min-w-0">
                <dt className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</dt>
                <dd className="truncate font-semibold text-foreground">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
      {unread && (
        <button type="button" onClick={() => void onMarkRead(n.id)} className="ds-btn ds-btn-sm ds-btn-outline shrink-0">
          <Check className="h-3 w-3 stroke-[3]" />
          <span>Mark as read</span>
        </button>
      )}
    </div>
  );
}
