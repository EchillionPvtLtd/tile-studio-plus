import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  session: null as null | { userId: string; email: string; role: "ADMIN" | "SHOP" },
  shops: new Map<string, { id: string; role: string; subscriptionPackage: string; details: string | null }>(),
}));

vi.mock("@/lib/auth", () => ({ getSession: async () => state.session }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findFirst: async ({ where }: { where: { id: string; role: string } }) => {
        const u = state.shops.get(where.id);
        return u && u.role === where.role ? u : null;
      },
    },
  },
}));

import { checkVisualizer, requireVisualizer, shopAccess } from "@/lib/visualizerGuard";
import {
  RESTRICTED_MESSAGE,
  accessStates,
  effectiveAccess,
  isSpecialGrant,
  keepStoredAccess,
  planAccessRecord,
  planEntitlements,
  samePlan,
  summarize,
  withAccessChange,
  withPlanDefaults,
} from "@/lib/visualizerAccess";

const rec = (plan: string, viz2d: boolean, viz3d: boolean) => JSON.stringify({ visualizerAccess: { viz2d, viz3d, plan } });

describe("what each plan includes", () => {
  it("Starter: 2D only. Professional and Custom Plan: both. A trial: both", () => {
    expect(planEntitlements("Starter")).toEqual({ viz2d: true, viz3d: false });
    expect(planEntitlements("Professional")).toEqual({ viz2d: true, viz3d: true });
    expect(planEntitlements("Custom")).toEqual({ viz2d: true, viz3d: true });
    expect(planEntitlements("Free Trial")).toEqual({ viz2d: true, viz3d: true });
  });

  it("a showroom saved as \"Enterprise\" before the rename is read as the Custom Plan, switches included", () => {
    expect(planEntitlements("Enterprise")).toEqual({ viz2d: true, viz3d: true });
    expect(effectiveAccess("Enterprise", rec("Enterprise", false, false))).toEqual({ viz2d: false, viz3d: false });
    expect(effectiveAccess("Custom", rec("Enterprise", true, false))).toEqual({ viz2d: true, viz3d: false });
  });

  it("treats the old spelling Pro as Professional, and never gives 3D to a plan it does not know", () => {
    expect(planEntitlements("Pro")).toEqual({ viz2d: true, viz3d: true });
    expect(samePlan("Pro", "Professional")).toBe(true);
    expect(planEntitlements("Gold Deluxe")).toEqual({ viz2d: true, viz3d: false });
    expect(planEntitlements(null)).toEqual(planEntitlements("Free Trial"));
  });

  it("gives a showroom that just received a plan that plan's defaults, stamped with the plan", () => {
    expect(planAccessRecord("Starter")).toEqual({ viz2d: true, viz3d: false, plan: "Starter" });
    expect(planAccessRecord("Professional")).toEqual({ viz2d: true, viz3d: true, plan: "Professional" });
    expect(JSON.parse(withPlanDefaults(JSON.stringify({ phone: "077" }), "Starter"))).toEqual({ phone: "077", visualizerAccess: { viz2d: true, viz3d: false, plan: "Starter" } });
  });
});

describe("what a showroom can use now", () => {
  it("a showroom with nothing stored (every existing one) gets exactly what its plan includes", () => {
    expect(effectiveAccess("Starter", null)).toEqual({ viz2d: true, viz3d: false });
    expect(effectiveAccess("Professional", JSON.stringify({ phone: "077" }))).toEqual({ viz2d: true, viz3d: true });
    expect(effectiveAccess("Custom", "free text, not JSON")).toEqual({ viz2d: true, viz3d: true });
  });

  it("follows the administrator's switches, each on its own, within the plan", () => {
    expect(effectiveAccess("Professional", rec("Professional", true, false))).toEqual({ viz2d: true, viz3d: false });
    expect(effectiveAccess("Professional", rec("Professional", false, true))).toEqual({ viz2d: false, viz3d: true });
    expect(effectiveAccess("Custom", rec("Custom", false, false))).toEqual({ viz2d: false, viz3d: false });
  });

  it("lets the administrator's switch give a feature the plan does not include (a special case), but only a switch stamped with this plan", () => {
    expect(effectiveAccess("Starter", rec("Starter", true, true))).toEqual({ viz2d: true, viz3d: true });
    expect(isSpecialGrant("Starter", rec("Starter", true, true), "viz3d")).toBe(true);
    expect(isSpecialGrant("Starter", rec("Starter", true, true), "viz2d")).toBe(false);
    expect(isSpecialGrant("Starter", null, "viz3d")).toBe(false);
    // an unstamped record (hand-written or forged) is ignored: plan defaults
    expect(effectiveAccess("Starter", JSON.stringify({ visualizerAccess: { viz2d: true, viz3d: true } }))).toEqual({ viz2d: true, viz3d: false });
  });

  it("ignores switches saved under another plan, so a plan change always means the new plan's defaults", () => {
    // downgraded from Professional (3D on) to Starter
    expect(effectiveAccess("Starter", rec("Professional", true, true))).toEqual({ viz2d: true, viz3d: false });
    // upgraded from Starter to Professional: the old Starter record (3D false) does not hold the new plan back
    expect(effectiveAccess("Professional", rec("Starter", true, false))).toEqual({ viz2d: true, viz3d: true });
    // Pro and Professional are the same plan, so the record still applies
    expect(effectiveAccess("Pro", rec("Professional", true, false))).toEqual({ viz2d: true, viz3d: false });
  });

  it("ignores values that are not true or false", () => {
    expect(effectiveAccess("Professional", JSON.stringify({ visualizerAccess: { viz2d: "no", viz3d: 0, plan: "Professional" } }))).toEqual({ viz2d: true, viz3d: true });
  });

  it("reports enabled or disabled for each visualizer, whatever the plan", () => {
    expect(accessStates("Starter", null)).toEqual({ viz2d: "enabled", viz3d: "disabled" });
    expect(accessStates("Professional", rec("Professional", true, false))).toEqual({ viz2d: "enabled", viz3d: "disabled" });
    expect(accessStates("Professional", null)).toEqual({ viz2d: "enabled", viz3d: "enabled" });
    expect(accessStates("Starter", rec("Starter", false, false))).toEqual({ viz2d: "disabled", viz3d: "disabled" });
  });

  it("summarises for the table and its filter", () => {
    expect(summarize({ viz2d: true, viz3d: true })).toBe("both");
    expect(summarize({ viz2d: true, viz3d: false })).toBe("2d-only");
    expect(summarize({ viz2d: false, viz3d: true })).toBe("3d-only");
    expect(summarize({ viz2d: false, viz3d: false })).toBe("none");
  });
});

describe("changing one switch", () => {
  it("changes only that switch and keeps the rest of the details", () => {
    const details = JSON.stringify({ phone: "077", planPrice: 10000 });
    const off3d = withAccessChange(details, "Professional", "viz3d", false);
    expect(off3d.ok && off3d.access).toEqual({ viz2d: true, viz3d: false });
    const next = off3d.ok ? off3d.details : "";
    expect(JSON.parse(next)).toEqual({ phone: "077", planPrice: 10000, visualizerAccess: { viz2d: true, viz3d: false, plan: "Professional" } });

    const off2d = withAccessChange(next, "Professional", "viz2d", false);
    expect(off2d.ok && off2d.access).toEqual({ viz2d: false, viz3d: false });
    const back = withAccessChange(off2d.ok ? off2d.details : "", "Professional", "viz3d", true);
    expect(back.ok && back.access).toEqual({ viz2d: false, viz3d: true });
  });

  it("lets the administrator turn on 3D for a Starter showroom, and off again", () => {
    const on = withAccessChange(null, "Starter", "viz3d", true);
    expect(on.ok && on.access).toEqual({ viz2d: true, viz3d: true });
    const off = on.ok ? withAccessChange(on.details, "Starter", "viz3d", false) : on;
    expect(off.ok && off.access).toEqual({ viz2d: true, viz3d: false });
  });

  it("refuses an unknown visualizer", () => {
    expect(withAccessChange(null, "Professional", "viz4d" as never, true)).toMatchObject({ ok: false });
  });
});

describe("a showroom editing its own details cannot edit its own permissions", () => {
  const stored = JSON.stringify({ phone: "077", visualizerAccess: { viz2d: true, viz3d: false, plan: "Professional" } });

  it("keeps what the administrator stored, whatever is sent", () => {
    const sent = JSON.stringify({ phone: "0112", description: "New", visualizerAccess: { viz2d: true, viz3d: true, plan: "Professional" } });
    expect(JSON.parse(keepStoredAccess(stored, sent))).toEqual({ phone: "0112", description: "New", visualizerAccess: { viz2d: true, viz3d: false, plan: "Professional" } });
  });

  it("puts the stored switches back when they were left out, and when plain text was sent", () => {
    expect(JSON.parse(keepStoredAccess(stored, JSON.stringify({ phone: "0112" }))).visualizerAccess).toEqual({ viz2d: true, viz3d: false, plan: "Professional" });
    expect(JSON.parse(keepStoredAccess(stored, "just a description"))).toEqual({ description: "just a description", visualizerAccess: { viz2d: true, viz3d: false, plan: "Professional" } });
  });

  it("does not let a showroom invent switches it never had", () => {
    const sent = JSON.stringify({ phone: "0112", visualizerAccess: { viz2d: true, viz3d: true, plan: "Starter" } });
    expect(JSON.parse(keepStoredAccess(JSON.stringify({ phone: "077" }), sent))).toEqual({ phone: "0112" });
    expect(keepStoredAccess(null, JSON.stringify({ visualizerAccess: { viz3d: true } }))).toBe("{}");
  });

  it("leaves ordinary edits exactly as sent", () => {
    expect(keepStoredAccess(JSON.stringify({ phone: "077" }), '  {"phone":"0112"} ')).toBe('{"phone":"0112"}');
    expect(keepStoredAccess(null, "plain text description")).toBe("plain text description");
  });
});

describe("the server's decision", () => {
  beforeEach(() => {
    state.session = null;
    state.shops = new Map([
      ["starter", { id: "starter", role: "SHOP", subscriptionPackage: "Starter", details: null }],
      ["pro", { id: "pro", role: "SHOP", subscriptionPackage: "Professional", details: null }],
      ["pro-no3d", { id: "pro-no3d", role: "SHOP", subscriptionPackage: "Professional", details: rec("Professional", true, false) }],
      ["off", { id: "off", role: "SHOP", subscriptionPackage: "Custom", details: rec("Custom", false, false) }],
      ["boss", { id: "boss", role: "ADMIN", subscriptionPackage: "Platform Admin", details: null }],
    ]);
  });

  it("gives a visitor the visualizer of a showroom that has it, and 403 for one that does not", async () => {
    expect(await checkVisualizer("viz2d", "starter")).toMatchObject({ ok: true, shopId: "starter", viewer: "visitor" });
    expect(await checkVisualizer("viz3d", "starter")).toEqual({ ok: false, reason: "restricted" });
    expect(await checkVisualizer("viz3d", "pro")).toMatchObject({ ok: true });
    expect(await checkVisualizer("viz3d", "pro-no3d")).toEqual({ ok: false, reason: "restricted" });
    expect(await checkVisualizer("viz2d", "pro-no3d")).toMatchObject({ ok: true });
    expect(await checkVisualizer("viz2d", "off")).toEqual({ ok: false, reason: "restricted" });
    expect(await checkVisualizer("viz3d", "off")).toEqual({ ok: false, reason: "restricted" });
  });

  it("answers 'any' for the shared tile catalogue: one visualizer is enough", async () => {
    expect(await checkVisualizer("any", "starter")).toMatchObject({ ok: true });
    expect(await checkVisualizer("any", "pro-no3d")).toMatchObject({ ok: true });
    expect(await checkVisualizer("any", "off")).toEqual({ ok: false, reason: "restricted" });
  });

  it("refuses a showroom that does not exist, and an account that is not a showroom", async () => {
    expect(await checkVisualizer("viz2d", "nobody")).toEqual({ ok: false, reason: "unknown-shop" });
    expect(await checkVisualizer("viz2d", "boss")).toEqual({ ok: false, reason: "unknown-shop" });
  });

  it("lets a signed-in showroom use its own, and refuses another showroom's", async () => {
    state.session = { userId: "pro", email: "p@x.co", role: "SHOP" };
    expect(await checkVisualizer("viz3d", "pro")).toMatchObject({ ok: true, viewer: "owner" });
    expect(await checkVisualizer("viz3d", null)).toMatchObject({ ok: true, shopId: "pro", viewer: "owner" });
    expect(await checkVisualizer("viz2d", "starter")).toEqual({ ok: false, reason: "other-shop" });
    state.session = { userId: "starter", email: "s@x.co", role: "SHOP" };
    // its own restricted visualizer is refused too, even with no address given
    expect(await checkVisualizer("viz3d", null)).toEqual({ ok: false, reason: "restricted" });
    expect(await checkVisualizer("viz3d", "pro")).toEqual({ ok: false, reason: "other-shop" });
  });

  it("lets the main administrator look at any showroom, and anyone use the public demo that holds no showroom's data", async () => {
    state.session = { userId: "boss", email: "a@x.co", role: "ADMIN" };
    expect(await checkVisualizer("viz3d", "starter")).toMatchObject({ ok: true, viewer: "admin" });
    state.session = null;
    expect(await checkVisualizer("viz3d", null)).toMatchObject({ ok: true, shopId: null });
  });

  it("reads what a showroom has, for the actions", async () => {
    expect(await shopAccess("pro-no3d")).toEqual({ viz2d: true, viz3d: false });
    expect(await shopAccess("nobody")).toBeNull();
    await expect(requireVisualizer("starter", "viz2d")).resolves.toBeUndefined();
    await expect(requireVisualizer("starter", "viz3d")).rejects.toThrow(RESTRICTED_MESSAGE);
    await expect(requireVisualizer("nobody", "viz2d")).rejects.toThrow(RESTRICTED_MESSAGE);
  });
});
