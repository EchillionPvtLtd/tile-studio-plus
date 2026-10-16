import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  session: null as null | { userId: string; email: string; role: "ADMIN" | "SHOP" },
  shops: new Map<string, { id: string; role: string; subscriptionPackage: string; details: string | null }>(),
  asked: [] as unknown[],
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
    tile: {
      findMany: async (args: unknown) => {
        state.asked.push(args);
        return [{ id: "t1", name: "Tile" }];
      },
    },
  },
}));

import { GET as tiles } from "@/app/api/tiles/route";
import { RESTRICTED_MESSAGE } from "@/lib/visualizerAccess";

const get = (query: string) => tiles(new Request(`http://localhost/api/tiles${query}`) as never);
const off = (plan: string) => JSON.stringify({ visualizerAccess: { viz2d: false, viz3d: false, plan } });

beforeEach(() => {
  state.session = null;
  state.asked = [];
  state.shops = new Map([
    ["starter", { id: "starter", role: "SHOP", subscriptionPackage: "Starter", details: null }],
    ["pro", { id: "pro", role: "SHOP", subscriptionPackage: "Professional", details: null }],
    ["closed", { id: "closed", role: "SHOP", subscriptionPackage: "Custom", details: off("Custom") }],
  ]);
});

describe("GET /api/tiles", () => {
  it("gives a showroom's tiles to a visualizer the showroom has, and 403 to one it does not", async () => {
    expect((await get("?shopId=starter&viz=2d")).status).toBe(200);
    const refused = await get("?shopId=starter&viz=3d");
    expect(refused.status).toBe(403);
    expect(await refused.json()).toEqual({ error: RESTRICTED_MESSAGE });
    expect(state.asked).toHaveLength(1); // the refused request never reached the tile table
    expect((await get("?shopId=pro&viz=3d")).status).toBe(200);
  });

  it("refuses everything for a showroom with no visualizer, and answers 'any' while it has one", async () => {
    expect((await get("?shopId=closed")).status).toBe(403);
    expect((await get("?shopId=closed&viz=2d")).status).toBe(403);
    expect((await get("?shopId=starter")).status).toBe(200);
  });

  it("refuses a showroom that does not exist", async () => {
    expect((await get("?shopId=nobody&viz=2d")).status).toBe(403);
  });

  it("does not let a signed-in showroom read another showroom's tiles", async () => {
    state.session = { userId: "pro", email: "p@x.co", role: "SHOP" };
    expect((await get("?shopId=pro&viz=3d")).status).toBe(200);
    expect((await get("?viz=3d")).status).toBe(200);
    expect((await get("?shopId=starter&viz=2d")).status).toBe(403);
  });

  it("applies the signed-in showroom's own permissions when no address is given", async () => {
    state.session = { userId: "closed", email: "c@x.co", role: "SHOP" };
    expect((await get("?viz=2d")).status).toBe(403);
  });

  it("lets the main administrator read any showroom's catalogue, and keeps the public demo to the built-in tiles", async () => {
    state.session = { userId: "boss", email: "a@x.co", role: "ADMIN" };
    expect((await get("?shopId=closed&viz=3d")).status).toBe(200);
    state.session = null;
    state.asked = [];
    expect((await get("?viz=3d")).status).toBe(200);
    expect(JSON.stringify(state.asked[0])).toContain('"isBuiltIn":true');
  });
});
