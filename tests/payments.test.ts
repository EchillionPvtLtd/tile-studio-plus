import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Invoice = { dueDate: Date; graceUntil: Date | null; status: string };
type Shop = {
  id: string;
  role: string;
  subscriptionActive: boolean;
  subscriptionPackage: string;
  trialEndsAt: Date | null;
  details: string | null;
  payments: Invoice[];
};

const db = vi.hoisted(() => ({
  shops: [] as unknown[],
  invoices: [] as unknown[],
  updates: [] as { where: { id: string }; data: Record<string, unknown> }[],
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findMany: vi.fn(async ({ where }: { where: { id?: string } }) =>
        (db.shops as Shop[]).filter((s) => s.subscriptionActive && (!where.id || s.id === where.id))
      ),
      update: vi.fn(async (args: { where: { id: string }; data: Record<string, unknown> }) => {
        db.updates.push(args);
        return {};
      }),
    },
    payment: {
      findMany: vi.fn(async () => (db.invoices as Invoice[]).filter((i) => i.status === "Pending" || i.status === "Failed")),
    },
  },
}));

import {
  asDate,
  deadlineOf,
  dueDateInMonth,
  enforceOverdueSuspensions,
  hasOverdueInvoices,
  isoDay,
  parseMeta,
} from "@/lib/payments";
import { addMonthsISO, firstBillingDate, isCustomPlan, nextBillingDate, normalizePlan, planDates, planLabel } from "@/lib/subscriptionPlans";

const day = (iso: string) => asDate(iso)!;

describe("calendar dates", () => {
  it("stores a plain date as midnight UTC and reads it back unchanged", () => {
    expect(day("2026-03-01").toISOString()).toBe("2026-03-01T00:00:00.000Z");
    expect(isoDay(day("2026-03-01"))).toBe("2026-03-01");
  });

  it("returns null for empty or invalid input", () => {
    expect(asDate(null)).toBeNull();
    expect(asDate("")).toBeNull();
    expect(asDate("not a date")).toBeNull();
  });

  it("parseMeta survives bad JSON", () => {
    expect(parseMeta(null)).toEqual({});
    expect(parseMeta("{oops")).toEqual({});
    expect(parseMeta('{"a":1}')).toEqual({ a: 1 });
  });
});

describe("billing dates", () => {
  it("dueDateInMonth follows the billing day and clamps to short months", () => {
    expect(dueDateInMonth(2026, 2, "start", 31)).toBe("2026-02-01");
    expect(dueDateInMonth(2026, 2, "end", 31)).toBe("2026-02-28");
    expect(dueDateInMonth(2028, 2, "end", 31)).toBe("2028-02-29");
    expect(dueDateInMonth(2026, 2, "plan", 31)).toBe("2026-02-28");
    expect(dueDateInMonth(2026, 4, "plan", 15)).toBe("2026-04-15");
  });

  it("adds months without spilling into the next one", () => {
    expect(addMonthsISO("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonthsISO("2026-12-15", 1)).toBe("2027-01-15");
  });

  it("first and next invoice dates", () => {
    expect(firstBillingDate("2026-03-10", "start")).toBe("2026-03-10");
    expect(firstBillingDate("2026-03-10", "end")).toBe("2026-03-31");
    expect(nextBillingDate("2026-03-31", "end")).toBe("2026-04-30");
    expect(nextBillingDate("2026-03-01", "start")).toBe("2026-04-01");
    expect(nextBillingDate("2026-01-31", "plan")).toBe("2026-02-28");
  });

  it("plan terms: 14-day trial, monthly paid plans, custom plan", () => {
    expect(planDates("Free Trial", "2026-03-01")).toEqual({ end: "", trialEnd: "2026-03-15" });
    expect(planDates("Starter", "2026-03-01", "plan")).toEqual({ end: "2026-04-01", trialEnd: "" });
    expect(planDates("Custom", "2026-03-01")).toBeNull();
    expect(planDates("Enterprise", "2026-03-01")).toBeNull(); // the old name of the Custom Plan
  });

  it("the Enterprise plan is now the Custom Plan: old records read as Custom, and the label is \"Custom Plan\"", () => {
    expect(normalizePlan("Enterprise")).toBe("Custom");
    expect(normalizePlan(" enterprise ")).toBe("Custom");
    expect(normalizePlan("Starter")).toBe("Starter");
    expect(isCustomPlan("Enterprise")).toBe(true);
    expect(isCustomPlan("Custom")).toBe(true);
    expect(isCustomPlan("Professional")).toBe(false);
    expect(planLabel("Enterprise")).toBe("Custom Plan");
    expect(planLabel("Custom")).toBe("Custom Plan");
    expect(planLabel("Professional")).toBe("Professional");
    expect(planLabel(null)).toBe("");
  });
});

describe("overdue invoices", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 15, 12, 0, 0)); // 15 June 2026, local noon
    db.shops = [];
    db.invoices = [];
    db.updates = [];
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const shop = (over: Partial<Shop> = {}): Shop => ({
    id: "s1",
    role: "SHOP",
    subscriptionActive: true,
    subscriptionPackage: "Starter",
    trialEndsAt: null,
    details: null,
    payments: [],
    ...over,
  });

  it("the deadline is the extra-time date when the admin gave one", () => {
    expect(deadlineOf({ dueDate: day("2026-06-01"), graceUntil: null })).toBe("2026-06-01");
    expect(deadlineOf({ dueDate: day("2026-06-01"), graceUntil: day("2026-06-20") })).toBe("2026-06-20");
  });

  it("hasOverdueInvoices: past due is overdue, due today and extra time are not", async () => {
    db.invoices = [{ dueDate: day("2026-06-14"), graceUntil: null, status: "Pending" }];
    expect(await hasOverdueInvoices("s1")).toBe(true);
    db.invoices = [{ dueDate: day("2026-06-15"), graceUntil: null, status: "Pending" }];
    expect(await hasOverdueInvoices("s1")).toBe(false);
    db.invoices = [{ dueDate: day("2026-06-01"), graceUntil: day("2026-06-20"), status: "Pending" }];
    expect(await hasOverdueInvoices("s1")).toBe(false);
    db.invoices = [{ dueDate: day("2026-06-01"), graceUntil: null, status: "Received" }];
    expect(await hasOverdueInvoices("s1")).toBe(false);
  });

  it("suspends a showroom with an unpaid invoice past its date and records why", async () => {
    db.shops = [shop({ payments: [{ dueDate: day("2026-06-01"), graceUntil: null, status: "Pending" }] })];
    expect(await enforceOverdueSuspensions()).toEqual(["s1"]);
    const data = db.updates[0].data;
    expect(data.subscriptionActive).toBe(false);
    expect(JSON.parse(data.details as string)).toMatchObject({ suspendedForNonPayment: true, suspendedReason: "unpaid", suspendedOn: "2026-06-15" });
  });

  it("leaves showrooms alone while the date, or the extra time, has not passed", async () => {
    db.shops = [
      shop({ id: "due-today", payments: [{ dueDate: day("2026-06-15"), graceUntil: null, status: "Pending" }] }),
      shop({ id: "extra-time", payments: [{ dueDate: day("2026-06-01"), graceUntil: day("2026-06-30"), status: "Pending" }] }),
      shop({ id: "paid-up" }),
    ];
    expect(await enforceOverdueSuspensions()).toEqual([]);
    expect(db.updates).toHaveLength(0);
  });

  it("suspends a free trial that has ended", async () => {
    db.shops = [shop({ subscriptionPackage: "Free Trial", trialEndsAt: day("2026-06-10") })];
    expect(await enforceOverdueSuspensions()).toEqual(["s1"]);
    expect(JSON.parse(db.updates[0].data.details as string).suspendedReason).toBe("trial-ended");
  });

  it("can check a single showroom", async () => {
    const late = [{ dueDate: day("2026-06-01"), graceUntil: null, status: "Pending" }];
    db.shops = [shop({ id: "a", payments: late }), shop({ id: "b", payments: late })];
    expect(await enforceOverdueSuspensions("b")).toEqual(["b"]);
  });
});
