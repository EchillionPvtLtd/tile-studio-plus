"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { acknowledgeDelivered, markAllNotificationsRead, markNotificationRead } from "@/actions/notifications";
import type { NotificationFeed, NotificationItem } from "@/lib/notificationTypes";

export interface ToastItem {
  id: string;
  /** One notification, or (when several arrive together) a summary of how many. */
  notification?: NotificationItem;
  count?: number;
}

const POLL_MS = 8_000;
const MAX_INDIVIDUAL_TOASTS = 3;
const SAVE_FAILED = "Could not save that. Your session may have ended — sign in again and retry.";

/**
 * Keeps a dashboard's notifications live.
 *  - Shows a pop-up for every notification the app has not shown yet. That covers a reminder that arrives while
 *    the owner is online (found by polling) and one that was saved while they were offline (found on load).
 *  - Tells the server it was shown, which is what moves a reminder from Sent to Unread for the admin.
 *  - Marks notifications read straight away (the server saves it before the button settles).
 */
export function useNotificationFeed(initial: NotificationFeed) {
  const [notifications, setNotifications] = useState<NotificationItem[]>(initial.notifications);
  const [reminders, setReminders] = useState<NotificationItem[]>(initial.reminders ?? []);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [suspended, setSuspended] = useState(!!initial.suspended);
  const [supportPhone, setSupportPhone] = useState<string | null>(initial.supportPhone ?? null);
  // `${id}@${sentAt}`: a resend changes sentAt, so it pops up again; an ordinary refresh does not
  const popped = useRef(new Set<string>());
  const seq = useRef(0);

  const popUp = useCallback((list: NotificationItem[]) => {
    const fresh = list.filter((n) => !n.readAt && !n.deliveredAt && !popped.current.has(`${n.id}@${n.sentAt}`));
    if (fresh.length === 0) return;
    for (const n of fresh) popped.current.add(`${n.id}@${n.sentAt}`);

    const next: ToastItem[] =
      fresh.length > MAX_INDIVIDUAL_TOASTS
        ? [{ id: `t${++seq.current}`, count: fresh.length }]
        : fresh.map((n) => ({ id: `t${++seq.current}`, notification: n }));
    setToasts((prev) => [...prev, ...next]);

    const ids = new Set(fresh.map((n) => n.id));
    const now = new Date().toISOString();
    setNotifications((prev) => prev.map((n) => (ids.has(n.id) && !n.deliveredAt ? { ...n, deliveredAt: now } : n)));
    // Best effort. If the session has ended the request is redirected to the sign-in page and the call rejects
    // ("An unexpected response was received from the server"); the toast has already been shown, so just let it go.
    void acknowledgeDelivered([...ids]).catch(() => {});
  }, []);

  const ingest = useCallback(
    (feed: NotificationFeed) => {
      setNotifications(feed.notifications);
      if (feed.reminders) setReminders(feed.reminders);
      if (feed.suspended !== undefined) setSuspended(feed.suspended);
      if (feed.supportPhone !== undefined) setSupportPhone(feed.supportPhone);
      popUp(feed.notifications);
    },
    [popUp],
  );

  // Anything saved while the owner was away is shown as soon as the dashboard opens
  useEffect(() => {
    popUp(initial.notifications);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll while the tab is visible, and catch up the moment it comes back
  useEffect(() => {
    let stopped = false;
    let busy = false;
    const tick = async () => {
      if (stopped || busy || document.visibilityState === "hidden") return;
      busy = true;
      try {
        const res = await fetch("/api/notifications", { cache: "no-store" });
        if (res.status === 401) {
          stopped = true; // signed out in another tab
        } else if (res.ok) {
          const feed = (await res.json()) as NotificationFeed;
          if (!stopped && Array.isArray(feed.notifications)) ingest(feed);
        }
      } catch {
        // offline: try again on the next tick
      } finally {
        busy = false;
      }
    };
    const timer = setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("focus", tick);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
      window.removeEventListener("focus", tick);
    };
  }, [ingest]);

  const patch = useCallback((id: string, readAt: string | null) => {
    const apply = (list: NotificationItem[]) => list.map((n) => (n.id === id ? { ...n, readAt, deliveredAt: n.deliveredAt ?? (readAt ? readAt : null) } : n));
    setNotifications(apply);
    setReminders(apply);
  }, []);

  const markRead = useCallback(
    async (id: string) => {
      patch(id, new Date().toISOString());
      try {
        const res = await markNotificationRead(id);
        if (res.success && res.notification) {
          const saved = res.notification;
          setNotifications((prev) => prev.map((n) => (n.id === id ? saved : n)));
          setReminders((prev) => prev.map((n) => (n.id === id ? saved : n)));
        } else {
          patch(id, null); // it was not saved: put it back as unread
        }
        return res;
      } catch {
        // The request never reached the action (the session ended, or the connection dropped)
        patch(id, null);
        return { success: false, message: SAVE_FAILED };
      }
    },
    [patch],
  );

  const markAllRead = useCallback(async () => {
    try {
      const res = await markAllNotificationsRead();
      if (res.success && res.notifications) {
        const saved = new Map(res.notifications.map((n) => [n.id, n]));
        setNotifications((prev) => prev.map((n) => saved.get(n.id) ?? n));
        setReminders((prev) => prev.map((n) => saved.get(n.id) ?? n));
      }
      return res;
    } catch {
      return { success: false, message: SAVE_FAILED };
    }
  }, []);

  /** The admin just sent (or resent) a reminder: show its status without waiting for the next poll. */
  const mergeReminder = useCallback((item: NotificationItem) => {
    setReminders((prev) => [item, ...prev.filter((n) => n.id !== item.id)]);
  }, []);

  const dismissToast = useCallback((id: string) => setToasts((prev) => prev.filter((t) => t.id !== id)), []);

  const unreadCount = notifications.filter((n) => !n.readAt).length;

  return { notifications, reminders, unreadCount, suspended, supportPhone, toasts, dismissToast, markRead, markAllRead, mergeReminder };
}
