import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  userId: "shop-a" as string | null,
  /** What getShopSession does when nobody, or a suspended showroom, is signed in. */
  error: null as null | string,
  users: new Map<string, { id: string; details: string | null }>(),
  writes: [] as { id: string; details: string }[],
}));

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("bcrypt", () => ({ default: {} }));
vi.mock("@/lib/shopSession", () => ({
  getShopSession: async () => {
    if (state.error) throw new Error(state.error);
    if (!state.userId) throw new Error("Unauthorized");
    return { userId: state.userId, email: "x@y.z", role: "SHOP" as const };
  },
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: async ({ where }: { where: { id: string } }) => state.users.get(where.id) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: { details: string } }) => {
        state.writes.push({ id: where.id, details: data.details });
        state.users.set(where.id, { ...state.users.get(where.id)!, details: data.details });
      },
    },
  },
}));

import { setVisualizerDownloads } from "@/actions/shop";
import { buildShopProfile } from "@/lib/shopProfile";
import { parseDetails, readDownloads, withDownloads } from "@/lib/visualizerDownloads";

describe("readDownloads", () => {
  it("is off for a showroom that never set it", () => {
    expect(readDownloads(null)).toEqual({ viz2d: false, viz3d: false });
    expect(readDownloads("")).toEqual({ viz2d: false, viz3d: false });
    expect(readDownloads(JSON.stringify({ phone: "0771234567" }))).toEqual({ viz2d: false, viz3d: false });
  });

  it("reads each switch on its own", () => {
    const raw = JSON.stringify({ visualizerDownloads: { viz2d: true, viz3d: false } });
    expect(readDownloads(raw)).toEqual({ viz2d: true, viz3d: false });
    expect(readDownloads(JSON.stringify({ visualizerDownloads: { viz3d: true } }))).toEqual({ viz2d: false, viz3d: true });
  });

  it("counts anything that is not exactly true as off", () => {
    for (const bad of ['"yes"', "1", "null", "[]", '"true"']) {
      expect(readDownloads(`{"visualizerDownloads":{"viz2d":${bad},"viz3d":${bad}}}`)).toEqual({ viz2d: false, viz3d: false });
    }
    expect(readDownloads('{"visualizerDownloads":"on"}')).toEqual({ viz2d: false, viz3d: false });
    expect(readDownloads("{not json")).toEqual({ viz2d: false, viz3d: false });
  });
});

describe("withDownloads", () => {
  it("changes only the given switch and keeps everything else in the details", () => {
    const raw = JSON.stringify({ phone: "077", planPrice: 4500, visualizerDownloads: { viz2d: true, viz3d: false } });
    const { details, downloads } = withDownloads(raw, { viz3d: true });
    expect(downloads).toEqual({ viz2d: true, viz3d: true });
    expect(JSON.parse(details)).toEqual({ phone: "077", planPrice: 4500, visualizerDownloads: { viz2d: true, viz3d: true } });
  });

  it("can switch one off again", () => {
    const on = withDownloads(null, { viz2d: true, viz3d: true }).details;
    expect(withDownloads(on, { viz2d: false }).downloads).toEqual({ viz2d: false, viz3d: true });
  });

  it("keeps a plain-text description instead of losing it", () => {
    const { details } = withDownloads("Premium Italian porcelain.", { viz2d: true });
    expect(JSON.parse(details)).toEqual({ description: "Premium Italian porcelain.", visualizerDownloads: { viz2d: true, viz3d: false } });
    expect(parseDetails("42")).toEqual({ description: "42" });
    expect(parseDetails("[1,2]")).toEqual({ description: "[1,2]" });
  });
});

describe("buildShopProfile", () => {
  it("carries the switches to the visualizers, off by default", () => {
    expect(buildShopProfile({ shopName: "A" }).downloads).toEqual({ viz2d: false, viz3d: false });
    // what the showroom can open: its plan's defaults unless the administrator switched something
    expect(buildShopProfile({ shopName: "A", subscriptionPackage: "Starter" }).access).toEqual({ viz2d: true, viz3d: false });
    expect(buildShopProfile({ shopName: "A", subscriptionPackage: "Professional" }).access).toEqual({ viz2d: true, viz3d: true });
    const granted = JSON.stringify({ visualizerAccess: { viz2d: true, viz3d: true, plan: "Starter" } });
    expect(buildShopProfile({ shopName: "A", subscriptionPackage: "Starter", details: granted }).access).toEqual({ viz2d: true, viz3d: true });
    const details = JSON.stringify({ visualizerDownloads: { viz2d: true, viz3d: true } });
    expect(buildShopProfile({ shopName: "A", details }).downloads).toEqual({ viz2d: true, viz3d: true });
  });
});

describe("setVisualizerDownloads", () => {
  beforeEach(() => {
    state.userId = "shop-a";
    state.error = null;
    state.writes = [];
    state.users = new Map([
      ["shop-a", { id: "shop-a", details: JSON.stringify({ phone: "077", planPrice: 4500 }) }],
      ["shop-b", { id: "shop-b", details: JSON.stringify({ visualizerDownloads: { viz2d: true, viz3d: true } }) }],
    ]);
  });

  it("switches one visualizer on for the signed-in showroom and keeps its other details", async () => {
    const res = await setVisualizerDownloads({ viz2d: true });
    expect(res.success).toBe(true);
    expect(res.downloads).toEqual({ viz2d: true, viz3d: false });
    expect(res.message).toMatch(/2D/);
    expect(JSON.parse(state.users.get("shop-a")!.details!)).toEqual({ phone: "077", planPrice: 4500, visualizerDownloads: { viz2d: true, viz3d: false } });
  });

  it("controls 2D and 3D independently", async () => {
    await setVisualizerDownloads({ viz2d: true });
    await setVisualizerDownloads({ viz3d: true });
    expect(readDownloads(state.users.get("shop-a")!.details)).toEqual({ viz2d: true, viz3d: true });
    const off = await setVisualizerDownloads({ viz2d: false });
    expect(off.downloads).toEqual({ viz2d: false, viz3d: true });
    expect(off.message).toMatch(/2D.*hidden/);
  });

  it("never touches another showroom", async () => {
    await setVisualizerDownloads({ viz2d: true, viz3d: true });
    await setVisualizerDownloads({ viz2d: false });
    expect(state.writes.every((w) => w.id === "shop-a")).toBe(true);
    expect(readDownloads(state.users.get("shop-b")!.details)).toEqual({ viz2d: true, viz3d: true });
  });

  it("refuses when nobody is signed in or the showroom is suspended, and writes nothing", async () => {
    state.userId = null;
    expect(await setVisualizerDownloads({ viz2d: true })).toMatchObject({ success: false, message: "Unauthorized" });
    state.userId = "shop-a";
    state.error = "This showroom is suspended. Please contact the administrator.";
    expect(await setVisualizerDownloads({ viz2d: true })).toMatchObject({ success: false, message: state.error });
    expect(state.writes).toEqual([]);
  });

  it("ignores values that are not true or false", async () => {
    const res = await setVisualizerDownloads({ viz2d: "yes" as unknown as boolean, viz3d: 1 as unknown as boolean });
    expect(res).toMatchObject({ success: false, message: "Nothing to change." });
    expect(state.writes).toEqual([]);
  });

  it("fails cleanly when the showroom account is gone", async () => {
    state.users.delete("shop-a");
    expect(await setVisualizerDownloads({ viz2d: true })).toMatchObject({ success: false });
  });
});
