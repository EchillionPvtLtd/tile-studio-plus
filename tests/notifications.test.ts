import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, any>;

const db = vi.hoisted(() => ({
  session: null as { userId: string; email: string; role: "ADMIN" | "SHOP" } | null,
  users: [] as Row[],
  payments: [] as Row[],
  notes: [] as Row[],
  seq: 0,
}));

vi.mock("@/lib/auth", () => ({ getSession: vi.fn(async () => db.session) }));

vi.mock("@/lib/prisma", () => {
  const withShop = (n: Row | undefined) => (n ? { ...n, shop: db.users.find((u) => u.id === n.shopId) } : null);
  const matches = (row: Row, where: Row) =>
    Object.entries(where).every(([k, v]) => {
      if (v && typeof v === "object" && "in" in v) return (v.in as unknown[]).includes(row[k]);
      return row[k] === v;
    });

  const prisma = {
    user: {
      findUnique: vi.fn(async ({ where }: { where: Row }) => db.users.find((u) => matches(u, where)) ?? null),
      findFirst: vi.fn(async ({ where }: { where: Row }) => db.users.find((u) => matches(u, where)) ?? null),
      findMany: vi.fn(async ({ where }: { where: Row }) => db.users.filter((u) => matches(u, where))),
    },
    payment: {
      findMany: vi.fn(async ({ where }: { where: { shopId: string; dueDate: { gte: Date; lt: Date } } }) =>
        db.payments.filter((p) => p.shopId === where.shopId && p.dueDate >= where.dueDate.gte && p.dueDate < where.dueDate.lt),
      ),
    },
    notification: {
      findUnique: vi.fn(async ({ where }: { where: Row }) => withShop(db.notes.find((n) => matches(n, where)))),
      findFirst: vi.fn(async ({ where }: { where: Row }) => withShop(db.notes.find((n) => matches(n, where)))),
      findMany: vi.fn(async ({ where }: { where: Row }) => db.notes.filter((n) => matches(n, where)).map(withShop)),
      create: vi.fn(async ({ data }: { data: Row }) => {
        if (data.dedupeKey && db.notes.some((n) => n.dedupeKey === data.dedupeKey)) throw Object.assign(new Error("unique"), { code: "P2002" });
        const row = {
          id: `n${++db.seq}`,
          senderId: null, paymentId: null, parentId: null, dedupeKey: null, amount: null, dueDate: null,
          deliveredAt: null, readAt: null, resendCount: 0, sentAt: new Date(), createdAt: new Date(),
          ...data,
        };
        db.notes.push(row);
        return withShop(row);
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Row }) => {
        const row = db.notes.find((n) => n.id === where.id)!;
        const { resendCount, ...rest } = data;
        Object.assign(row, rest);
        if (resendCount?.increment) row.resendCount += resendCount.increment;
        return withShop(row);
      }),
      updateMany: vi.fn(async ({ where, data }: { where: Row; data: Row }) => {
        const hit = db.notes.filter((n) => matches(n, where));
        hit.forEach((n) => Object.assign(n, data));
        return { count: hit.length };
      }),
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(prisma)),
  };
  return { prisma };
});

import { acknowledgeDelivered, markNotificationRead, sendPaymentReminder } from "@/actions/notifications";
import { loadFeed } from "@/lib/notifications";
import { defaultReminderMessage, formatDay, isMonthKey, monthLabelOf, readReceiptMessage, reminderStatusOf } from "@/lib/notificationTypes";

const ADMIN = { id: "admin1", email: "admin@x.lk", role: "ADMIN", shopName: null, logoUrl: null };
const CHOICE = { id: "shop1", email: "choice@x.lk", role: "SHOP", shopName: "Choice Ceramic", logoUrl: null, subscriptionPackage: "Professional", subscriptionStart: null, details: null };
const OTHER = { id: "shop2", email: "other@x.lk", role: "SHOP", shopName: "Other Tiles", logoUrl: null, subscriptionPackage: "Starter", subscriptionStart: null, details: null };

const asAdmin = () => { db.session = { userId: ADMIN.id, email: ADMIN.email, role: "ADMIN" }; };
const asShop = (s = CHOICE) => { db.session = { userId: s.id, email: s.email, role: "SHOP" }; };

beforeEach(() => {
  db.session = null;
  db.seq = 0;
  db.users = [{ ...ADMIN }, { ...CHOICE }, { ...OTHER }];
  db.notes = [];
  db.payments = [
    { id: "p1", shopId: CHOICE.id, status: "Pending", amount: 10000, dueDate: new Date("2026-10-01T00:00:00Z"), graceUntil: null },
  ];
});

describe("sendPaymentReminder", () => {
  it("saves a reminder for the showroom with the month's invoice details", async () => {
    asAdmin();
    const res = await sendPaymentReminder(CHOICE.id, "2026-10", { message: "Please pay." });
    expect(res.success).toBe(true);
    expect(db.notes).toHaveLength(1);
    expect(db.notes[0]).toMatchObject({
      type: "PAYMENT_REMINDER",
      recipientId: CHOICE.id,
      senderId: ADMIN.id,
      month: "2026-10",
      amount: 10000,
      paymentId: "p1",
      message: "Please pay.",
      dedupeKey: "reminder:shop1:2026-10",
    });
    expect(db.notes[0].dueDate.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    // Not shown to the owner yet
    expect(reminderStatusOf(res.reminder!)).toBe("Sent");
  });

  it("uses the suggested wording when the admin writes nothing", async () => {
    asAdmin();
    await sendPaymentReminder(CHOICE.id, "2026-10", { message: "   " });
    expect(db.notes[0].message).toContain("Choice Ceramic");
    expect(db.notes[0].message).toContain("October 2026");
    expect(db.notes[0].message).toContain("LKR 10,000");
  });

  it("refuses a second reminder for the same showroom and month unless it is a deliberate resend", async () => {
    asAdmin();
    await sendPaymentReminder(CHOICE.id, "2026-10", { message: "first" });
    const again = await sendPaymentReminder(CHOICE.id, "2026-10", { message: "second" });
    expect(again.success).toBe(false);
    expect(again.duplicate).toBe(true);
    expect(db.notes).toHaveLength(1);
    expect(db.notes[0].message).toBe("first");
  });

  it("a resend reuses the reminder and puts it back to Sent", async () => {
    asAdmin();
    const first = await sendPaymentReminder(CHOICE.id, "2026-10", { message: "first" });
    // The owner saw it and read it
    Object.assign(db.notes[0], { deliveredAt: new Date(), readAt: new Date() });
    expect(reminderStatusOf(db.notes[0] as never)).toBe("Read");

    const resent = await sendPaymentReminder(CHOICE.id, "2026-10", { message: "second", resend: true });
    expect(resent.success).toBe(true);
    expect(db.notes).toHaveLength(1);
    expect(db.notes[0]).toMatchObject({ id: first.reminder!.id, message: "second", resendCount: 1, deliveredAt: null, readAt: null });
    expect(reminderStatusOf(resent.reminder!)).toBe("Sent");
  });

  it("allows a different month for the same showroom, and the same month for another showroom", async () => {
    asAdmin();
    db.payments.push({ id: "p2", shopId: CHOICE.id, status: "Pending", amount: 10000, dueDate: new Date("2026-11-01T00:00:00Z"), graceUntil: null });
    expect((await sendPaymentReminder(CHOICE.id, "2026-10")).success).toBe(true);
    expect((await sendPaymentReminder(CHOICE.id, "2026-11")).success).toBe(true);
    expect((await sendPaymentReminder(OTHER.id, "2026-10")).success).toBe(true);
    expect(db.notes).toHaveLength(3);
  });

  it("falls back to the plan fee for a month that has not been billed yet", async () => {
    asAdmin();
    const res = await sendPaymentReminder(OTHER.id, "2026-10");
    expect(res.success).toBe(true);
    expect(db.notes[0]).toMatchObject({ amount: 5000, paymentId: null });
    expect(db.notes[0].dueDate.toISOString()).toBe("2026-10-01T00:00:00.000Z");
  });

  it("refuses a month that is already paid, a free trial, a bad month and a non-admin", async () => {
    asAdmin();
    db.payments[0].status = "Received";
    expect((await sendPaymentReminder(CHOICE.id, "2026-10")).success).toBe(false);

    db.users.find((u) => u.id === OTHER.id)!.subscriptionPackage = "Free Trial";
    expect((await sendPaymentReminder(OTHER.id, "2026-10")).success).toBe(false);
    expect((await sendPaymentReminder(CHOICE.id, "October")).success).toBe(false);
    expect((await sendPaymentReminder("nobody", "2026-10")).success).toBe(false);

    asShop();
    const res = await sendPaymentReminder(OTHER.id, "2026-11");
    expect(res.success).toBe(false);
    expect(db.notes).toHaveLength(0);
  });
});

describe("marking a reminder as read", () => {
  async function sendOne() {
    asAdmin();
    const res = await sendPaymentReminder(CHOICE.id, "2026-10", { message: "Please pay." });
    return res.reminder!.id;
  }

  it("saves the read time and sends the admin a receipt naming the showroom and month", async () => {
    const id = await sendOne();
    asShop();
    const res = await markNotificationRead(id);
    expect(res.success).toBe(true);
    expect(res.notification!.readAt).toBeTruthy();
    expect(reminderStatusOf(res.notification!)).toBe("Read");

    const receipts = db.notes.filter((n) => n.type === "READ_RECEIPT");
    expect(receipts).toHaveLength(1);
    expect(receipts[0]).toMatchObject({
      recipientId: ADMIN.id,
      shopId: CHOICE.id,
      parentId: id,
      month: "2026-10",
      message: "Choice Ceramic has read the payment reminder for October 2026.",
      readAt: null,
    });
    expect(receipts[0].createdAt).toBeInstanceOf(Date);
  });

  it("does not create a second receipt when it is marked read twice", async () => {
    const id = await sendOne();
    asShop();
    await markNotificationRead(id);
    await markNotificationRead(id);
    expect(db.notes.filter((n) => n.type === "READ_RECEIPT")).toHaveLength(1);
  });

  it("a resent reminder that is read again makes a new receipt", async () => {
    const id = await sendOne();
    asShop();
    await markNotificationRead(id);
    asAdmin();
    await sendPaymentReminder(CHOICE.id, "2026-10", { message: "again", resend: true });
    asShop();
    await markNotificationRead(id);
    expect(db.notes.filter((n) => n.type === "READ_RECEIPT")).toHaveLength(2);
  });

  it("only the recipient can mark a notification as read", async () => {
    const id = await sendOne();
    asShop(OTHER);
    const res = await markNotificationRead(id);
    expect(res.success).toBe(false);
    expect(db.notes.find((n) => n.id === id)!.readAt).toBeNull();
    expect(db.notes.filter((n) => n.type === "READ_RECEIPT")).toHaveLength(0);
  });

  it("the admin marking a receipt read does not create another receipt", async () => {
    const id = await sendOne();
    asShop();
    await markNotificationRead(id);
    const receipt = db.notes.find((n) => n.type === "READ_RECEIPT")!;
    asAdmin();
    const res = await markNotificationRead(receipt.id);
    expect(res.success).toBe(true);
    expect(receipt.readAt).toBeInstanceOf(Date);
    expect(db.notes).toHaveLength(2);
  });
});

describe("acknowledgeDelivered", () => {
  it("moves a reminder from Sent to Unread, for its own recipient only", async () => {
    asAdmin();
    const sent = await sendPaymentReminder(CHOICE.id, "2026-10");
    const id = sent.reminder!.id;

    asShop(OTHER);
    await acknowledgeDelivered([id]);
    expect(reminderStatusOf(db.notes[0] as never)).toBe("Sent");

    asShop();
    await acknowledgeDelivered([id]);
    expect(reminderStatusOf(db.notes[0] as never)).toBe("Unread");
  });
});

describe("live suspension", () => {
  it("tells an open showroom dashboard the moment the admin suspends it, and when it is switched back on", async () => {
    const shop = db.users.find((u) => u.id === CHOICE.id)!;
    shop.subscriptionActive = true;
    expect((await loadFeed({ userId: CHOICE.id, role: "SHOP" })).suspended).toBe(false);

    shop.subscriptionActive = false;
    expect((await loadFeed({ userId: CHOICE.id, role: "SHOP" })).suspended).toBe(true);

    shop.subscriptionActive = true;
    expect((await loadFeed({ userId: CHOICE.id, role: "SHOP" })).suspended).toBe(false);
  });

  it("does not add the flag to the admin's feed", async () => {
    expect((await loadFeed({ userId: ADMIN.id, role: "ADMIN" })).suspended).toBeUndefined();
  });
});

describe("notification helpers", () => {
  it("derives Sent / Unread / Read", () => {
    expect(reminderStatusOf({ deliveredAt: null, readAt: null })).toBe("Sent");
    expect(reminderStatusOf({ deliveredAt: "2026-10-09T10:00:00Z", readAt: null })).toBe("Unread");
    expect(reminderStatusOf({ deliveredAt: "2026-10-09T10:00:00Z", readAt: "2026-10-09T11:00:00Z" })).toBe("Read");
  });

  it("validates and labels month keys", () => {
    expect(isMonthKey("2026-10")).toBe(true);
    expect(isMonthKey("2026-13")).toBe(false);
    expect(isMonthKey("Oct 2026")).toBe(false);
    expect(monthLabelOf("2026-10")).toBe("October 2026");
    expect(formatDay("2026-10-12T00:00:00.000Z")).toBe("Oct 12, 2026");
  });

  it("words the messages", () => {
    expect(readReceiptMessage("Choice Ceramic", "2026-10")).toBe("Choice Ceramic has read the payment reminder for October 2026.");
    expect(defaultReminderMessage({ shopName: "A", monthLabel: "October 2026", amountText: "LKR 10,000", dueText: "Oct 1, 2026" })).toContain("due on Oct 1, 2026");
  });
});
