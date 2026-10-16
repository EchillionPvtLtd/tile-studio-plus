import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = {
  id: string;
  email: string;
  role: "ADMIN" | "SHOP";
  password: string;
  shopName: string | null;
  subscriptionPackage: string;
  subscriptionStart: Date | null;
  details: string | null;
  [key: string]: unknown;
};

const state = vi.hoisted(() => ({
  session: null as null | { userId: string; email: string; role: "ADMIN" | "SHOP" },
  users: new Map<string, Record<string, unknown>>(),
  nextId: 1,
  writes: [] as { id: string; data: Record<string, unknown> }[],
}));

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("bcrypt", () => ({ default: { hash: async (p: string) => `hashed:${p}`, compare: async () => true } }));
vi.mock("@/lib/auth", () => ({ getSession: async () => state.session }));
vi.mock("@/lib/shopSession", () => ({
  getShopSession: async () => {
    if (!state.session || state.session.role !== "SHOP") throw new Error("Unauthorized");
    return state.session;
  },
}));
// The packages saved in the admin dashboard (a fixed copy, so the tests never read the real data file)
vi.mock("@/lib/subscriptionPlansServer", () => {
  const plan = (id: string, name: string, price: number, tileQuota: number, sortOrder: number) => ({
    id, name, price, currency: "LKR", billingCycle: "monthly", tileQuota, quotaLabel: `${tileQuota} Tiles`, features: ["x"], active: true, sortOrder,
  });
  return {
    getSubscriptionPlans: async () => [
      plan("starter", "Starter", 5000, 50, 1),
      plan("pro-studio", "Pro Studio", 10000, 100, 2),
      plan("plan-abc", "Custom Plan", 15000, 150, 3),
      plan("plan-xyz", "custom plan 2", 20000, 200, 4),
    ],
  };
});
vi.mock("@/lib/uploads", () => ({ removeUnreferencedUploads: async () => 0, uploadUrlsIn: () => [] }));
vi.mock("@/lib/payments", () => ({
  nextInvoiceNo: async () => "INV-1",
  openInvoiceIfNone: async () => {},
  syncInvoiceToPlan: async () => {},
  asDate: (v?: string | null) => (v ? new Date(v) : null),
  todayISO: () => "2026-10-15",
  hasOverdueInvoices: async () => false,
  syncShopMeta: async () => {},
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: async ({ where }: { where: { id?: string; email?: string } }) => {
        if (where.id) return state.users.get(where.id) ?? null;
        return [...state.users.values()].find((u) => u.email === where.email) ?? null;
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const id = `new-${state.nextId++}`;
        const row = { id, ...data };
        state.users.set(id, row);
        return row;
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        state.writes.push({ id: where.id, data });
        const row = { ...state.users.get(where.id)!, ...data };
        state.users.set(where.id, row);
        return { ...row, _count: { tiles: 0, savedDesigns: 0 } };
      },
    },
    payment: { create: async () => ({}) },
  },
}));

import { createUser, setVisualizerAccess, updateShopDetailsByAdmin, updateSubscription } from "@/actions/admin";
import { updateShopProfileSettings } from "@/actions/shop";
import { effectiveAccess } from "@/lib/visualizerAccess";

const shop = (id: string, plan: string, details: Record<string, unknown> | null = null): Row => ({
  id,
  email: `${id}@shop.test`,
  role: "SHOP",
  password: "x",
  shopName: id.toUpperCase(),
  subscriptionPackage: plan,
  subscriptionStart: new Date("2026-10-01"),
  details: details ? JSON.stringify(details) : null,
});
const detailsOf = (id: string) => JSON.parse((state.users.get(id)!.details as string) ?? "{}");
const record = (plan: string, viz2d: boolean, viz3d: boolean) => ({ visualizerAccess: { viz2d, viz3d, plan } });

beforeEach(() => {
  state.session = { userId: "boss", email: "a@x.co", role: "ADMIN" };
  state.writes = [];
  state.nextId = 1;
  state.users = new Map<string, Record<string, unknown>>([
    ["boss", { id: "boss", email: "a@x.co", role: "ADMIN", subscriptionPackage: "Platform Admin", details: null }],
    ["starter", shop("starter", "Starter", { phone: "077" })],
    ["pro", shop("pro", "Professional", { phone: "011", planPrice: 10000 })],
    ["other", shop("other", "Professional")],
  ]);
});

describe("only the main administrator can change visualizer access", () => {
  it("refuses a showroom, even for itself, and a visitor, and writes nothing", async () => {
    state.session = { userId: "pro", email: "pro@shop.test", role: "SHOP" };
    expect(await setVisualizerAccess("pro", "viz3d", false)).toMatchObject({ success: false, message: "Only the main administrator can change visualizer access." });
    expect(await setVisualizerAccess("other", "viz3d", false)).toMatchObject({ success: false });
    state.session = null;
    expect(await setVisualizerAccess("pro", "viz3d", false)).toMatchObject({ success: false });
    expect(state.writes).toEqual([]);
  });

  it("changes one switch of one showroom and nobody else's", async () => {
    const res = await setVisualizerAccess("pro", "viz3d", false);
    expect(res).toMatchObject({ success: true, access: { viz2d: true, viz3d: false } });
    expect(res.message).toBe("3D Visualizer disabled for PRO.");
    expect(detailsOf("pro")).toEqual({ phone: "011", planPrice: 10000, ...record("Professional", true, false) });
    expect(state.writes.map((w) => w.id)).toEqual(["pro"]);
    // everything else is exactly as it was
    expect(effectiveAccess("Professional", state.users.get("other")!.details as string | null)).toEqual({ viz2d: true, viz3d: true });
    expect(state.users.get("other")!.details).toBeNull();
    expect(detailsOf("starter")).toEqual({ phone: "077" });
  });

  it("controls 2D and 3D independently and can switch back on", async () => {
    await setVisualizerAccess("pro", "viz2d", false);
    await setVisualizerAccess("pro", "viz3d", false);
    expect(effectiveAccess("Professional", state.users.get("pro")!.details as string)).toEqual({ viz2d: false, viz3d: false });
    const back = await setVisualizerAccess("pro", "viz2d", true);
    expect(back).toMatchObject({ success: true, access: { viz2d: true, viz3d: false } });
    expect(back.states).toEqual({ viz2d: "enabled", viz3d: "disabled" });
  });

  it("can turn 3D on for a Starter showroom as a special case, and off again, without touching anything else", async () => {
    const res = await setVisualizerAccess("starter", "viz3d", true);
    expect(res).toMatchObject({ success: true, access: { viz2d: true, viz3d: true }, states: { viz2d: "enabled", viz3d: "enabled" } });
    expect(effectiveAccess("Starter", state.users.get("starter")!.details as string)).toEqual({ viz2d: true, viz3d: true });
    expect(detailsOf("starter").phone).toBe("077");
    expect(effectiveAccess("Professional", state.users.get("pro")!.details as string)).toEqual({ viz2d: true, viz3d: true }); // others unchanged
    await setVisualizerAccess("starter", "viz3d", false);
    expect(effectiveAccess("Starter", state.users.get("starter")!.details as string)).toEqual({ viz2d: true, viz3d: false });
    // 2D can be switched off and on too
    expect((await setVisualizerAccess("starter", "viz2d", false)).success).toBe(true);
    expect(effectiveAccess("Starter", state.users.get("starter")!.details as string)).toEqual({ viz2d: false, viz3d: false });
  });

  it("refuses unknown showrooms, accounts that are not showrooms, and malformed requests", async () => {
    expect(await setVisualizerAccess("nobody", "viz2d", true)).toMatchObject({ success: false, message: "Showroom not found." });
    expect(await setVisualizerAccess("boss", "viz2d", true)).toMatchObject({ success: false, message: "Showroom not found." });
    expect(await setVisualizerAccess("pro", "viz9d" as never, true)).toMatchObject({ success: false, message: "That request is not valid." });
    expect(await setVisualizerAccess("pro", "viz2d", "yes" as never)).toMatchObject({ success: false, message: "That request is not valid." });
    expect(state.writes).toEqual([]);
  });
});

describe("a new showroom starts with its plan's access", () => {
  const form = (plan: string) => {
    const fd = new FormData();
    Object.entries({
      role: "SHOP", shopName: "Fresh Tiles", ownerName: "Owner", phone: "0771234567", addressLine1: "1 Main St", city: "Colombo", adminName: "Admin",
      adminEmail: `fresh-${plan.toLowerCase().replace(/\s/g, "")}@shop.test`, password: "secret12", plan, planPrice: "0", paymentStatus: "Waived",
    }).forEach(([k, v]) => fd.set(k, v));
    return fd;
  };
  const create = async (plan: string) => {
    const res = await createUser(null, form(plan));
    expect(res.success).toBe(true);
    const row = [...state.users.values()].find((u) => u.email === `fresh-${plan.toLowerCase().replace(/\s/g, "")}@shop.test`)!;
    return { row, access: effectiveAccess(row.subscriptionPackage as string, row.details as string), stored: JSON.parse(row.details as string).visualizerAccess };
  };

  it("Starter: 2D enabled, 3D disabled", async () => {
    const { access, stored } = await create("Starter");
    expect(stored).toEqual({ viz2d: true, viz3d: false, plan: "Starter" });
    expect(access).toEqual({ viz2d: true, viz3d: false });
  });

  it("Professional: both enabled", async () => {
    const { access, stored } = await create("Professional");
    expect(stored).toEqual({ viz2d: true, viz3d: true, plan: "Professional" });
    expect(access).toEqual({ viz2d: true, viz3d: true });
  });

  it("Custom Plan starts with both available, for the administrator to set to the agreement; a trial has both", async () => {
    expect((await create("Custom")).access).toEqual({ viz2d: true, viz3d: true });
    expect((await create("Free Trial")).access).toEqual({ viz2d: true, viz3d: true });
  });
});

describe("a plan change brings the new plan's access", () => {
  const change = (id: string, plan: string) => updateSubscription(id, plan, "2026-10-01", "2026-11-01", "", true);

  it("Starter to Professional gives 3D", async () => {
    expect((await change("starter", "Professional")).success).toBe(true);
    expect(detailsOf("starter")).toEqual({ phone: "077", ...record("Professional", true, true) });
    expect(effectiveAccess("Professional", state.users.get("starter")!.details as string)).toEqual({ viz2d: true, viz3d: true });
  });

  it("Professional to Starter takes 3D away, even if the administrator had switched it on", async () => {
    await setVisualizerAccess("pro", "viz3d", true);
    await change("pro", "Starter");
    expect(detailsOf("pro")).toEqual({ phone: "011", planPrice: 10000, ...record("Starter", true, false) });
    expect(effectiveAccess("Starter", state.users.get("pro")!.details as string)).toEqual({ viz2d: true, viz3d: false });
  });

  it("an upgrade starts from the new plan's defaults, not from what was switched off under the old plan", async () => {
    await setVisualizerAccess("pro", "viz2d", false);
    await change("pro", "Custom");
    expect(effectiveAccess("Custom", state.users.get("pro")!.details as string)).toEqual({ viz2d: true, viz3d: true });
  });

  it("an update that keeps the same plan (new dates) leaves the administrator's switches alone", async () => {
    await setVisualizerAccess("pro", "viz3d", false);
    const before = state.users.get("pro")!.details;
    await change("pro", "Professional");
    await change("pro", "Pro"); // the older spelling is the same plan
    expect(state.users.get("pro")!.details).toBe(before);
    expect(effectiveAccess("Professional", before as string)).toEqual({ viz2d: true, viz3d: false });
  });

  it("the showroom's details screen follows the same rule, and only for a different plan", async () => {
    await updateShopDetailsByAdmin({ shopId: "starter", subscriptionPackage: "Professional" });
    expect(detailsOf("starter").visualizerAccess).toEqual({ viz2d: true, viz3d: true, plan: "Professional" });

    await setVisualizerAccess("starter", "viz3d", false);
    await updateShopDetailsByAdmin({ shopId: "starter", city: "Kandy" });
    expect(detailsOf("starter").visualizerAccess).toEqual({ viz2d: true, viz3d: false, plan: "Professional" });
    await updateShopDetailsByAdmin({ shopId: "starter", subscriptionPackage: "Professional", city: "Galle" });
    expect(detailsOf("starter").visualizerAccess).toEqual({ viz2d: true, viz3d: false, plan: "Professional" });
  });

  it("only the administrator can change a plan", async () => {
    state.session = { userId: "pro", email: "pro@shop.test", role: "SHOP" };
    expect(await change("pro", "Custom")).toMatchObject({ success: false });
    expect((await updateShopDetailsByAdmin({ shopId: "pro", subscriptionPackage: "Custom" })).success).toBe(false);
    expect(state.writes).toEqual([]);
  });
});

describe("a showroom cannot give itself access by editing its own profile", () => {
  it("keeps the administrator's switches whatever its details say", async () => {
    await setVisualizerAccess("starter", "viz2d", false);
    state.session = { userId: "starter", email: "starter@shop.test", role: "SHOP" };
    const stored = state.users.get("starter")!.details as string;

    const forged = JSON.stringify({ phone: "0999", visualizerAccess: { viz2d: true, viz3d: true, plan: "Starter" } });
    const res = await updateShopProfileSettings({ details: forged });
    expect(res.success).toBe(true);
    // what it may change changed; its permissions did not
    expect(detailsOf("starter").phone).toBe("0999");
    expect(detailsOf("starter").visualizerAccess).toEqual(JSON.parse(stored).visualizerAccess);
    expect(effectiveAccess("Starter", state.users.get("starter")!.details as string)).toEqual({ viz2d: false, viz3d: false });

    // sending plain text cannot drop them either
    await updateShopProfileSettings({ details: "just a description" });
    expect(detailsOf("starter")).toEqual({ description: "just a description", visualizerAccess: JSON.parse(stored).visualizerAccess });
  });
});

describe("start date + duration decide the expiry date, and a saved package is applied as saved", () => {
  const update = (id: string, plan: string, start: string, months: number | null, price?: number) =>
    updateSubscription(id, plan, start, "1999-01-01", "", true, price, undefined, months);
  const endOf = (id: string) => (state.users.get(id)!.subscriptionEnd as Date).toISOString().slice(0, 10);

  it("17 October 2026 + 3 months is 17 January 2027, whatever end date the browser sent", async () => {
    expect((await update("starter", "Starter", "2026-10-17", 3)).success).toBe(true);
    expect(endOf("starter")).toBe("2027-01-17");
    expect(detailsOf("starter")).toMatchObject({ durationMonths: 3, duration: "3 Months" });
  });

  it("handles the end of the month: 31 Aug + 6 months is 28 Feb, 31 Jan + 1 month is 28 Feb", async () => {
    await update("starter", "Starter", "2026-08-31", 6);
    expect(endOf("starter")).toBe("2027-02-28");
    await update("starter", "Starter", "2026-01-31", 1);
    expect(endOf("starter")).toBe("2026-02-28");
    await update("starter", "Starter", "2027-12-31", 12);
    expect(endOf("starter")).toBe("2028-12-31");
  });

  it("keeps the dates as given when no valid duration is chosen", async () => {
    await update("starter", "Starter", "2026-10-17", null);
    expect(endOf("starter")).toBe("1999-01-01");
    await update("starter", "Starter", "2026-10-17", 13);
    expect(endOf("starter")).toBe("1999-01-01");
    expect(detailsOf("starter").durationMonths).toBeUndefined();
  });

  it("a Free Trial has no duration", async () => {
    await update("starter", "Free Trial", "2026-10-17", 3);
    expect(detailsOf("starter").durationMonths).toBeUndefined();
  });

  it("a package made in the dashboard can be given, and brings its price and tile allowance", async () => {
    const res = await update("starter", "custom plan 2", "2026-10-17", 2, 1);
    expect(res.success).toBe(true);
    expect(state.users.get("starter")!.subscriptionPackage).toBe("custom plan 2");
    expect(state.users.get("starter")!.tileQuota).toBe(200);
    expect(detailsOf("starter").planPrice).toBe(20000); // the saved price, not the 1 the browser sent
    expect(endOf("starter")).toBe("2026-12-17");
  });

  it("the original packages keep their stored names and take the saved Pro Studio allowance", async () => {
    await update("starter", "Professional", "2026-10-17", 1, 1);
    expect(state.users.get("starter")!.tileQuota).toBe(100);
    expect(detailsOf("starter").planPrice).toBe(10000);
  });

  it("the Custom Plan keeps the price agreed with the showroom", async () => {
    await update("starter", "Custom", "2026-10-17", 6, 77000);
    expect(detailsOf("starter").planPrice).toBe(77000);
    expect(state.users.get("starter")!.tileQuota).toBe(150);
  });

  it("the tile allowance is not touched when the package stays the same", async () => {
    state.users.get("pro")!.tileQuota = 321;
    await update("pro", "Professional", "2026-10-17", 3);
    expect(state.users.get("pro")!.tileQuota).toBe(321);
  });

  it("the showroom details screen calculates the expiry the same way", async () => {
    await updateShopDetailsByAdmin({ shopId: "pro", subscriptionPackage: "Professional", subscriptionStart: "2026-10-17", subscriptionEnd: "2030-01-01", durationMonths: 3 });
    expect(endOf("pro")).toBe("2027-01-17");
    expect(detailsOf("pro")).toMatchObject({ durationMonths: 3 });
  });
});
