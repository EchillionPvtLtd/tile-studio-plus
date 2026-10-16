import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  session: null as null | { userId: string },
  shopError: null as null | string,
  tiles: new Map<string, { id: string; userId: string | null; sku: string; textureUrl: string; previewUrl: string; [k: string]: unknown }>(),
  /** SKUs already used by this showroom's other tiles (the unique index). */
  taken: new Set<string>(),
  updates: [] as { id: string; data: Record<string, unknown> }[],
}));

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/shopSession", () => ({
  getShopSession: async () => {
    if (state.shopError) throw new Error(state.shopError);
    if (!state.session) throw new Error("Unauthorized");
    return state.session;
  },
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    tile: {
      findUnique: async ({ where }: { where: { id: string } }) => state.tiles.get(where.id) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        if (typeof data.sku === "string" && state.taken.has(data.sku)) throw Object.assign(new Error("unique"), { code: "P2002" });
        state.updates.push({ id: where.id, data });
        state.tiles.set(where.id, { ...state.tiles.get(where.id)!, ...data });
      },
    },
  },
}));

import { updateTile } from "@/actions/shop";

const valid = { sku: "TL-9", name: "Marble", widthMm: 600, heightMm: 900, textureUrl: "https://cdn.example/m.jpg", pricePerSqFt: 420, category: "floor" as const, finish: "Polished" };

beforeEach(() => {
  state.session = { userId: "shop-a" };
  state.shopError = null;
  state.taken = new Set();
  state.updates = [];
  state.tiles = new Map([
    ["t1", { id: "t1", userId: "shop-a", sku: "TL-1", name: "Old", textureUrl: "https://cdn.example/old.jpg", previewUrl: "https://cdn.example/old.jpg" }],
    ["t2", { id: "t2", userId: "shop-b", sku: "TL-2", name: "Theirs", textureUrl: "https://cdn.example/t.jpg", previewUrl: "https://cdn.example/t.jpg" }],
    ["built-in", { id: "built-in", userId: null, sku: "BI-1", name: "Built in", textureUrl: "/uploads/b.webp", previewUrl: "/uploads/b.webp" }],
  ]);
});

describe("editing a tile", () => {
  it("changes the details of the showroom's own tile", async () => {
    expect(await updateTile("t1", valid)).toEqual({ success: true, message: "Tile updated." });
    expect(state.tiles.get("t1")).toMatchObject({ sku: "TL-9", name: "Marble", widthMm: 600, heightMm: 900, pricePerSqFt: 420, category: "floor", finish: "Polished" });
  });

  it("points the list picture at a new texture, and leaves it alone when the texture is the same", async () => {
    await updateTile("t1", valid);
    expect(state.tiles.get("t1")!.previewUrl).toBe("https://cdn.example/m.jpg");
    await updateTile("t1", { ...valid, name: "Marble 2" });
    expect(state.updates[1].data).not.toHaveProperty("previewUrl");
  });

  it("never touches another showroom's tile, or a built-in one, and says nothing about it", async () => {
    for (const id of ["t2", "built-in", "nope"]) expect(await updateTile(id, valid)).toEqual({ success: false, message: "Tile not found." });
    expect(state.updates).toEqual([]);
  });

  it("needs a signed-in showroom, and refuses a suspended one", async () => {
    state.session = null;
    expect(await updateTile("t1", valid)).toMatchObject({ success: false, message: "Unauthorized" });
    state.session = { userId: "shop-a" };
    state.shopError = "This showroom is suspended. Please contact the administrator.";
    expect(await updateTile("t1", valid)).toMatchObject({ success: false, message: state.shopError });
    expect(state.updates).toEqual([]);
  });

  it("refuses bad details with a plain message, and writes nothing", async () => {
    const bad = (patch: object) => updateTile("t1", { ...valid, ...patch } as never);
    expect(await bad({ name: "   " })).toMatchObject({ success: false, message: "Enter a tile name." });
    expect(await bad({ sku: "" })).toMatchObject({ success: false, message: "Enter a SKU." });
    expect(await bad({ widthMm: 5 })).toMatchObject({ success: false, message: "The width must be at least 10 mm." });
    expect(await bad({ heightMm: 99999 })).toMatchObject({ success: false });
    expect(await bad({ widthMm: 600.5 })).toMatchObject({ success: false });
    expect(await bad({ pricePerSqFt: -1 })).toMatchObject({ success: false, message: "The price cannot be negative." });
    expect(await bad({ category: "ceiling" })).toMatchObject({ success: false });
    expect(await bad({ textureUrl: "javascript:alert(1)" })).toMatchObject({ success: false });
    expect(await bad({ textureUrl: "data:text/html,x" })).toMatchObject({ success: false });
    expect(state.updates).toEqual([]);
  });

  it("checks the texture link only when it changes, so a tile saved under older rules can still be edited", async () => {
    state.tiles.set("t1", { ...state.tiles.get("t1")!, textureUrl: "/dev-tiles/old.jpg", previewUrl: "/dev-tiles/old.jpg" });
    expect((await updateTile("t1", { ...valid, textureUrl: "/dev-tiles/old.jpg" })).success).toBe(true);
    // changing it to something unsafe is still refused
    expect(await updateTile("t1", { ...valid, textureUrl: "/etc/passwd" })).toMatchObject({ success: false });
    expect(await updateTile("t1", { ...valid, textureUrl: "  " })).toMatchObject({ success: false, message: "Enter the texture image link." });
  });

  it("trims text and keeps a finish the showroom saved earlier", async () => {
    expect((await updateTile("t1", { ...valid, name: "  Spaced  ", finish: "Rustic" })).success).toBe(true);
    expect(state.tiles.get("t1")).toMatchObject({ textureUrl: valid.textureUrl, name: "Spaced", finish: "Rustic" });
  });

  it("turns a Google Drive sharing link into an image address, and refuses uploads, http and non-image Google pages as a new picture", async () => {
    const drive = "https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/view?usp=sharing";
    expect((await updateTile("t1", { ...valid, textureUrl: drive })).success).toBe(true);
    expect(state.tiles.get("t1")).toMatchObject({
      textureUrl: "https://lh3.googleusercontent.com/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345=w2048",
      previewUrl: "https://lh3.googleusercontent.com/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345=w2048",
    });
    for (const textureUrl of ["/uploads/abc-1.webp", "http://cdn.example/a.jpg", "https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUv"]) {
      expect(await updateTile("t1", { ...valid, textureUrl })).toMatchObject({ success: false, errors: { textureUrl: [expect.any(String)] } });
    }
  });

  it("explains a SKU that another of the showroom's tiles already uses", async () => {
    state.taken.add("TL-9");
    expect(await updateTile("t1", valid)).toMatchObject({ success: false, message: "You already have a tile with that SKU. Choose a different SKU.", errors: { sku: ["SKU already in use"] } });
    expect(state.tiles.get("t1")!.sku).toBe("TL-1");
  });
});
