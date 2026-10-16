import { describe, expect, it } from "vitest";
import {
  asDurationMonths,
  DURATION_MONTHS,
  durationLabel,
  expiryAfterMonths,
  findPackage,
  formatLongDate,
  monthsBetweenISO,
  packageChoices,
  packageName,
  storedPackageName,
} from "@/lib/subscriptionPlans";

const plan = (id: string, name: string, price = 1000, tileQuota = 50, sortOrder = 1, active = true) => ({ id, name, price, tileQuota, sortOrder, active });
const saved = [
  plan("starter", "Starter", 5000, 50, 1),
  plan("pro-studio", "Pro Studio", 10000, 100, 2),
  plan("plan-mvbao41w", "Custom Plan", 15000, 150, 3),
  plan("plan-mvbbqe36", "custom plan 2", 20000, 200, 4),
];

describe("duration: 1 to 12 months", () => {
  it("offers exactly 1 to 12", () => {
    expect([...DURATION_MONTHS]).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(durationLabel(1)).toBe("1 month");
    expect(durationLabel(3)).toBe("3 months");
  });

  it("accepts only whole numbers from 1 to 12", () => {
    expect(asDurationMonths("3")).toBe(3);
    expect(asDurationMonths(12)).toBe(12);
    for (const bad of [0, 13, 1.5, "", "x", null, undefined, -1]) expect(asDurationMonths(bad)).toBeNull();
  });
});

describe("expiry date from start date + duration", () => {
  it("17 October 2026 + 3 months is 17 January 2027", () => {
    expect(expiryAfterMonths("2026-10-17", 3)).toBe("2027-01-17");
    expect(formatLongDate("2027-01-17")).toBe("17 January 2027");
  });

  it("gives the same day of the month when it exists, for every duration", () => {
    expect(DURATION_MONTHS.map((m) => expiryAfterMonths("2026-10-17", m))).toEqual([
      "2026-11-17", "2026-12-17", "2027-01-17", "2027-02-17", "2027-03-17", "2027-04-17",
      "2027-05-17", "2027-06-17", "2027-07-17", "2027-08-17", "2027-09-17", "2027-10-17",
    ]);
  });

  it("falls back to the last day of a shorter month", () => {
    expect(expiryAfterMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(expiryAfterMonths("2028-01-31", 1)).toBe("2028-02-29"); // leap year
    expect(expiryAfterMonths("2026-08-31", 6)).toBe("2027-02-28");
    expect(expiryAfterMonths("2026-11-30", 3)).toBe("2027-02-28");
    expect(expiryAfterMonths("2028-02-29", 12)).toBe("2029-02-28");
    expect(expiryAfterMonths("2026-03-31", 2)).toBe("2026-05-31");
  });

  it("crosses the year end", () => {
    expect(expiryAfterMonths("2026-12-31", 12)).toBe("2027-12-31");
    expect(expiryAfterMonths("2026-11-15", 2)).toBe("2027-01-15");
  });

  it("gives nothing for a missing start date or a bad duration", () => {
    expect(expiryAfterMonths("", 3)).toBe("");
    expect(expiryAfterMonths("not a date", 3)).toBe("");
    expect(expiryAfterMonths("2026-10-17", 0)).toBe("");
    expect(expiryAfterMonths("2026-10-17", 13)).toBe("");
  });

  it("works out the duration of dates already saved, only when it is a whole number of months", () => {
    expect(monthsBetweenISO("2026-10-17", "2027-01-17")).toBe(3);
    expect(monthsBetweenISO("2026-01-31", "2026-02-28")).toBe(1);
    expect(monthsBetweenISO("2026-10-17", "2026-11-20")).toBeNull();
    expect(monthsBetweenISO("2026-10-17", "2028-10-17")).toBeNull(); // beyond 12 months
    expect(monthsBetweenISO("", "2026-11-17")).toBeNull();
  });
});

describe("packages saved in the dashboard", () => {
  it("keeps the stored names the database already holds, and stores a new package under its own name", () => {
    expect(storedPackageName(saved[0])).toBe("Starter");
    expect(storedPackageName(saved[1])).toBe("Professional");
    expect(storedPackageName(saved[2])).toBe("Custom");
    expect(storedPackageName(saved[3])).toBe("custom plan 2");
    expect(storedPackageName(plan("plan-1", "  Gold  "))).toBe("Gold");
  });

  it("offers the Free Trial and every active package, in the saved order", () => {
    const list = packageChoices([...saved].reverse());
    expect(list.map((c) => c.value)).toEqual(["Free Trial", "Starter", "Professional", "Custom", "custom plan 2"]);
    expect(list.map((c) => c.label)).toEqual(["Free Trial", "Starter", "Pro Studio", "Custom Plan", "custom plan 2"]);
    expect(list.find((c) => c.value === "custom plan 2")).toMatchObject({ price: 20000, tileQuota: 200, fixedPrice: true });
    expect(list.find((c) => c.value === "Custom")).toMatchObject({ fixedPrice: false });
  });

  it("leaves out packages that are switched off, unless a showroom is still on one", () => {
    const withOff = [...saved, plan("plan-off", "Retired", 1, 1, 5, false)];
    expect(packageChoices(withOff).map((c) => c.value)).not.toContain("Retired");
    expect(packageChoices(withOff, "Retired").map((c) => c.value)).toContain("Retired");
    expect(packageChoices(saved, "Enterprise").map((c) => c.value)).toEqual(["Free Trial", "Starter", "Professional", "Custom", "custom plan 2"]);
  });

  it("finds the package a showroom is on, however the name was stored", () => {
    expect(findPackage("Professional", saved)?.id).toBe("pro-studio");
    expect(findPackage("Enterprise", saved)?.id).toBe("plan-mvbao41w"); // the old name of the Custom Plan
    expect(findPackage("custom plan 2", saved)?.id).toBe("plan-mvbbqe36");
    expect(findPackage("Free Trial", saved)).toBeNull();
    expect(findPackage("Gone", saved)).toBeNull();
  });

  it("names a package as it is called in the dashboard now", () => {
    expect(packageName("Professional", saved)).toBe("Pro Studio");
    expect(packageName("Custom", saved)).toBe("Custom Plan");
    expect(packageName("Free Trial", saved)).toBe("Free Trial");
    expect(packageName("Gone", saved)).toBe("Gone");
  });
});

describe("a package's own duration (1 to 12 months)", () => {
  it("uses the chosen duration, else the billing cycle (yearly = 12, monthly = 1)", async () => {
    const { planDurationMonths } = await import("@/lib/subscriptionPlans");
    expect(planDurationMonths({ durationMonths: 3 })).toBe(3);
    expect(planDurationMonths({ billingCycle: "yearly" })).toBe(12);
    expect(planDurationMonths({ billingCycle: "monthly" })).toBe(1);
    expect(planDurationMonths({ durationMonths: 99, billingCycle: "yearly" })).toBe(12);
    expect(planDurationMonths(null)).toBe(1);
  });

  it("offers each package with its own duration as the default", () => {
    const list = packageChoices([{ ...plan("p", "Quarterly", 9000, 90, 1), durationMonths: 3 }, { ...plan("y", "Yearly", 1, 1, 2), billingCycle: "yearly" }]);
    expect(list.map((c) => [c.value, c.durationMonths])).toEqual([["Free Trial", 1], ["Quarterly", 3], ["Yearly", 12]]);
  });
});

describe("a package's own duration (Plans builder)", () => {
  it("uses the chosen 1-12 months, else the billing cycle (yearly = 12)", async () => {
    const { planDurationMonths } = await import("@/lib/subscriptionPlans");
    expect(planDurationMonths({ durationMonths: 3 })).toBe(3);
    expect(planDurationMonths({ billingCycle: "yearly" })).toBe(12);
    expect(planDurationMonths({ billingCycle: "monthly" })).toBe(1);
    expect(planDurationMonths({ durationMonths: 99, billingCycle: "monthly" })).toBe(1);
    expect(planDurationMonths(null)).toBe(1);
  });

  it("is the default term when a package is chosen", () => {
    const list = packageChoices([{ ...plan("p3", "Quarterly", 1, 50, 1), durationMonths: 3 }, { ...plan("p12", "Yearly", 1, 50, 2), billingCycle: "yearly" }]);
    expect(list.map((c) => c.durationMonths)).toEqual([1, 3, 12]);
  });
});
