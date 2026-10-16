import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";

const state = vi.hoisted(() => ({
  session: null as null | { userId: string; email: string; role: "ADMIN" | "SHOP" },
  /** What getShopSession does: throws like the real one when nobody (or a suspended showroom) is signed in. */
  shopError: null as null | string,
  rows: new Map<string, { id: string; userId: string; name: string; roomType: string; imageUrl: string; width: number; height: number; data: string }>(),
  designs: [] as Record<string, unknown>[],
  /** The signed-in showroom as the guard reads it (plan and details); null: no such showroom. */
  shop: null as null | { subscriptionPackage: string; details: string | null },
  removed: [] as string[][],
  nextId: 1,
}));

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/auth", () => ({ getSession: async () => state.session }));
vi.mock("@/lib/shopSession", () => ({
  getShopSession: async () => {
    if (state.shopError) throw new Error(state.shopError);
    return state.session ?? Promise.reject(new Error("Unauthorized"));
  },
}));
vi.mock("@/lib/uploads", () => ({
  removeUnreferencedUploads: async (urls: string[]) => {
    state.removed.push([...urls]);
    return urls.length;
  },
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    roomScene: {
      findUnique: async ({ where }: { where: { id: string } }) => state.rows.get(where.id) ?? null,
      findFirst: async ({ where }: { where: { id: string; userId: string } }) => {
        const row = state.rows.get(where.id);
        return row && row.userId === where.userId ? row : null;
      },
      count: async ({ where }: { where: { userId: string } }) => [...state.rows.values()].filter((r) => r.userId === where.userId).length,
      create: async ({ data }: { data: Omit<(typeof state.rows extends Map<string, infer V> ? V : never), "id"> }) => {
        const id = uuid(state.nextId++);
        state.rows.set(id, { id, ...data });
        return { id };
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        state.rows.set(where.id, { ...state.rows.get(where.id)!, ...data } as never);
      },
      delete: async ({ where }: { where: { id: string } }) => {
        state.rows.delete(where.id);
      },
    },
    user: {
      findFirst: async () => state.shop,
    },
    savedDesign: {
      count: async () => state.designs.length,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        state.designs.push(data);
      },
    },
  },
}));

import { POST as uploadRoom } from "@/app/api/upload/room/route";
import { deleteRoom2D, saveRoom2D } from "@/actions/rooms2d";
import { saveDesign2D } from "@/actions/viz2d";
import { BUILTIN_ROOMS } from "@/data/rooms2d";
import { buildGroups } from "@/lib/viz2d/design";
import { applyTile } from "@/lib/viz2d/designOps";
import { emptyDesign } from "@/lib/viz2d/designOps";
import type { TileSnapshot } from "@/lib/viz2d/types";
import { RESTRICTED_MESSAGE } from "@/lib/visualizerAccess";

// Whichever room photo comes first: the tests do not depend on which photos the app ships with
const TEMPLATE = BUILTIN_ROOMS.find((r) => buildGroups(r).some((g) => g.kind === "floor") && buildGroups(r).some((g) => g.kind === "wall"))!;
const TEMPLATE_GROUPS = buildGroups(TEMPLATE);
const FLOOR = TEMPLATE_GROUPS.find((g) => g.kind === "floor")!.id;
const WALL = TEMPLATE_GROUPS.find((g) => g.kind === "wall")!.id;

let dir: string;
let uploadsDir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "tv-viz2d-"));
  uploadsDir = path.join(dir, "public", "uploads");
  vi.spyOn(process, "cwd").mockReturnValue(dir);
  state.session = { userId: "shop-1", email: "a@b.co", role: "SHOP" };
  state.shopError = null;
  state.shop = { subscriptionPackage: "Professional", details: null };
  state.rows.clear();
  state.designs.length = 0;
  state.removed.length = 0;
  state.nextId = 1;
});
afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(dir, { recursive: true, force: true });
});

const photo = (width: number, height: number) => sharp({ create: { width, height, channels: 3, background: "#8a7a6a" } }).jpeg().toBuffer();
const upload = (bytes: Buffer | string, name = "room.jpg", type = "image/jpeg") => {
  const fd = new FormData();
  fd.set("file", new File([new Uint8Array(Buffer.from(bytes))], name, { type }));
  return new Request("http://localhost/api/upload/room", { method: "POST", body: fd }) as never;
};

describe("room photo upload", () => {
  it("is for signed-in showrooms only", async () => {
    state.session = null;
    expect((await uploadRoom(upload(await photo(800, 600)))).status).toBe(401);
    state.session = { userId: "a1", email: "admin@x.co", role: "ADMIN" };
    expect((await uploadRoom(upload(await photo(800, 600)))).status).toBe(401);
  });

  it("keeps a re-encoded WebP and a thumbnail under random names", async () => {
    const res = await uploadRoom(upload(await photo(1200, 800)));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.imageUrl).toMatch(/^\/uploads\/room-[0-9a-f-]{36}\.webp$/);
    expect(body.width).toBe(1200);
    expect(body.height).toBe(800);
    const name = path.basename(body.imageUrl);
    expect((await sharp(await fs.readFile(path.join(uploadsDir, name))).metadata()).format).toBe("webp");
    const thumb = await sharp(await fs.readFile(path.join(uploadsDir, name.replace(".webp", "-t.webp")))).metadata();
    expect(thumb.width).toBe(480);
  });

  it("shrinks a very large photo to 2048 px on its long side", async () => {
    const res = await uploadRoom(upload(await photo(4000, 2000)));
    const body = await res.json();
    expect([body.width, body.height]).toEqual([2048, 1024]);
  });

  it("refuses a photo that is too small to work on", async () => {
    const res = await uploadRoom(upload(await photo(300, 200)));
    expect(res.status).toBe(422);
    await expect(fs.readdir(uploadsDir)).resolves.toEqual([]);
  });

  it("refuses a non-image that claims to be a JPEG, and a file that is too big", async () => {
    expect((await uploadRoom(upload("<svg onload=alert(1)>", "x.jpg", "image/jpeg"))).status).toBe(415);
    expect((await uploadRoom(upload(Buffer.alloc(12 * 1024 * 1024 + 1)))).status).toBe(413);
    expect((await uploadRoom(new Request("http://localhost/api/upload/room", { method: "POST", body: new FormData() }) as never)).status).toBe(400);
  });
});

const surface = (over: Record<string, unknown> = {}) => ({
  id: "floor",
  name: "Floor",
  kind: "floor",
  priority: 0,
  mask: { kind: "polygons", shapes: [{ outer: [[0.1, 0.5], [0.9, 0.5], [0.95, 0.95], [0.05, 0.95]] }] },
  calibration: { image: [[0.3, 0.5], [0.7, 0.5], [0.95, 0.95], [0.05, 0.95]], planeMm: [[0, 0], [4000, 0], [4000, 3000], [0, 3000]] },
  ...over,
});
const roomInput = (over: Record<string, unknown> = {}) => ({
  name: "  My lounge ",
  roomType: "living-room",
  imageUrl: `/uploads/room-${uuid(99)}.webp`,
  width: 1600,
  height: 1000,
  data: { surfaces: [surface()] },
  ...over,
});

describe("saving a room", () => {
  it("creates the room for the signed-in showroom, whatever the browser claims", async () => {
    const res = await saveRoom2D({ ...roomInput(), userId: "someone-else" } as never);
    expect(res.success).toBe(true);
    const row = state.rows.get(res.id!)!;
    expect(row.userId).toBe("shop-1");
    expect(row.name).toBe("My lounge");
    expect(JSON.parse(row.data).surfaces[0].id).toBe("floor");
  });

  it("needs a signed-in, active showroom", async () => {
    state.session = null;
    expect(await saveRoom2D(roomInput())).toEqual({ success: false, message: "Unauthorized" });
    state.session = { userId: "shop-1", email: "a@b.co", role: "SHOP" };
    state.shopError = "This showroom is suspended. Please contact the administrator.";
    expect((await saveRoom2D(roomInput())).message).toMatch(/suspended/);
    expect(state.rows.size).toBe(0);
  });

  it("refuses a photo that was not uploaded through the app, and surfaces that are not valid", async () => {
    expect((await saveRoom2D(roomInput({ imageUrl: "https://evil.example/x.png" }))).message).toMatch(/Upload the room photo first/);
    expect((await saveRoom2D(roomInput({ imageUrl: "/uploads/../../.env" }))).success).toBe(false);
    expect((await saveRoom2D(roomInput({ data: { surfaces: [] } }))).success).toBe(false);
    expect((await saveRoom2D(roomInput({ data: { surfaces: [surface({ mask: { kind: "raster", src: "/etc/passwd" } })] } }))).success).toBe(false);
    expect((await saveRoom2D(roomInput({ name: "   " }))).success).toBe(false);
    expect((await saveRoom2D(roomInput({ roomType: "dungeon" }))).success).toBe(false);
    expect(state.rows.size).toBe(0);
  });

  it("keeps a room of every kind the visualizer sorts photos into, offices included", async () => {
    for (const roomType of ["living-room", "bedroom", "kitchen", "bathroom", "dining-room", "outdoor", "office"]) {
      const res = await saveRoom2D(roomInput({ roomType }));
      expect(res.success, roomType).toBe(true);
      expect(state.rows.get(res.id!)!.roomType).toBe(roomType);
    }
  });

  it("refuses outlines too detailed to store", async () => {
    const ring = Array.from({ length: 600 }, (_, i) => [0.5 + 0.4 * Math.cos(i / 95), 0.5 + 0.4 * Math.sin(i / 95)]);
    const heavy = Array.from({ length: 40 }, () => ({ outer: ring }));
    const res = await saveRoom2D(roomInput({ data: { surfaces: Array.from({ length: 16 }, (_, i) => surface({ id: `s${i}`, mask: { kind: "polygons", shapes: heavy } })) } }));
    expect(res.message).toMatch(/too detailed/);
  });

  it("limits how many rooms a showroom keeps", async () => {
    for (let i = 0; i < 40; i++) expect((await saveRoom2D(roomInput())).success).toBe(true);
    const res = await saveRoom2D(roomInput());
    expect(res.success).toBe(false);
    expect(res.message).toMatch(/up to 40/);
  });

  it("changes only the showroom's own rooms, and removes a photo it replaced", async () => {
    const mine = (await saveRoom2D(roomInput())).id!;
    state.rows.set("theirs", { id: "theirs", userId: "shop-2", name: "Theirs", roomType: "kitchen", imageUrl: "/uploads/room-x.webp", width: 1000, height: 700, data: "{}" });

    expect((await saveRoom2D({ ...roomInput(), id: "00000000-0000-4000-8000-0000000000aa" })).message).toBe("Room not found.");
    state.rows.set(uuid(500), { ...state.rows.get("theirs")!, id: uuid(500) });
    expect((await saveRoom2D({ ...roomInput(), id: uuid(500) })).message).toBe("Room not found.");
    expect(state.rows.get(uuid(500))!.name).toBe("Theirs");

    const newPhoto = `/uploads/room-${uuid(77)}.webp`;
    expect((await saveRoom2D({ ...roomInput({ name: "Renamed", imageUrl: newPhoto }), id: mine })).success).toBe(true);
    expect(state.rows.get(mine)!.name).toBe("Renamed");
    expect(state.removed.at(-1)).toEqual([`/uploads/room-${uuid(99)}.webp`, `/uploads/room-${uuid(99)}-t.webp`]);
  });
});

describe("deleting a room", () => {
  it("removes the showroom's own room and its photo, and nobody else's", async () => {
    const mine = (await saveRoom2D(roomInput())).id!;
    state.rows.set(uuid(500), { id: uuid(500), userId: "shop-2", name: "Theirs", roomType: "kitchen", imageUrl: "/uploads/room-x.webp", width: 1000, height: 700, data: "{}" });

    expect((await deleteRoom2D(uuid(500))).message).toBe("Room not found.");
    expect((await deleteRoom2D("not-an-id")).message).toBe("Room not found.");
    expect(state.rows.has(uuid(500))).toBe(true);

    expect((await deleteRoom2D(mine)).success).toBe(true);
    expect(state.rows.has(mine)).toBe(false);
    expect(state.removed.at(-1)).toEqual([`/uploads/room-${uuid(99)}.webp`, `/uploads/room-${uuid(99)}-t.webp`]);
  });

  it("needs a signed-in showroom", async () => {
    state.session = null;
    expect((await deleteRoom2D(uuid(1))).message).toBe("Unauthorized");
  });
});

const tile = (over: Partial<TileSnapshot> = {}): TileSnapshot => ({
  id: "t1",
  sku: "T-1",
  name: "Oak",
  textureUrl: "/uploads/oak.webp",
  widthMm: 200,
  heightMm: 1200,
  finish: "Matt",
  pricePerSqFt: 410,
  ...over,
});

describe("recording a 2D design", () => {
  const design = (roomId: string, tiles: Record<string, TileSnapshot>) => {
    let d = emptyDesign(roomId);
    for (const [group, t] of Object.entries(tiles)) d = applyTile(d, [group], t);
    return d;
  };

  it("summarises a built-in room's design into the dashboard's columns", async () => {
    const res = await saveDesign2D({ roomId: TEMPLATE.id, name: "Oak floor", design: design(TEMPLATE.id, { [FLOOR]: tile(), [WALL]: tile({ id: "t2", name: "Marble" }) }) });
    expect(res.success).toBe(true);
    const saved = state.designs[0];
    expect(saved).toMatchObject({ userId: "shop-1", sceneId: TEMPLATE.id, floorTileId: "t1", layout: "straight" });
    expect(JSON.parse(saved.data as string).name).toBe("Oak floor");
  });

  it("needs at least one tiled surface, and drops tiles whose picture is not one of ours", async () => {
    expect((await saveDesign2D({ roomId: TEMPLATE.id, design: emptyDesign(TEMPLATE.id) })).message).toMatch(/Tile at least one surface/);
    const sneaky = design(TEMPLATE.id, { [FLOOR]: tile({ textureUrl: "javascript:alert(1)" }) });
    expect((await saveDesign2D({ roomId: TEMPLATE.id, design: sneaky })).success).toBe(false);
    expect(state.designs).toHaveLength(0);
  });

  it("finds a showroom's own room only for that showroom", async () => {
    const id = (await saveRoom2D(roomInput())).id!;
    expect((await saveDesign2D({ roomId: id, design: design(id, { floor: tile() }) })).success).toBe(true);
    state.session = { userId: "shop-2", email: "c@d.co", role: "SHOP" };
    expect((await saveDesign2D({ roomId: id, design: design(id, { floor: tile() }) })).message).toBe("That room is not available.");
    expect((await saveDesign2D({ roomId: "no-such-room", design: {} })).message).toBe("That room is not available.");
  });

  it("refuses a preview that is not a small JPEG", async () => {
    const d = design(TEMPLATE.id, { [FLOOR]: tile() });
    expect((await saveDesign2D({ roomId: TEMPLATE.id, design: d, thumbnail: "data:text/html;base64,PHNjcmlwdD4=" })).success).toBe(false);
    expect((await saveDesign2D({ roomId: TEMPLATE.id, design: d, thumbnail: "data:image/jpeg;base64,/9j/4AAQ" })).success).toBe(true);
  });
});

describe("a showroom without the 2D visualizer", () => {
  const off2d = { subscriptionPackage: "Starter", details: JSON.stringify({ visualizerAccess: { viz2d: false, viz3d: false, plan: "Starter" } }) };

  it("cannot upload a room photo: 403, and nothing is written", async () => {
    state.shop = off2d;
    const res = await uploadRoom(upload(await photo(800, 600)));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe(RESTRICTED_MESSAGE);
    await expect(fs.readdir(uploadsDir)).rejects.toThrow();
  });

  it("cannot save, change or delete rooms, or record a design", async () => {
    state.shop = off2d;
    expect(await saveRoom2D({} as never)).toEqual({ success: false, message: RESTRICTED_MESSAGE });
    expect(await deleteRoom2D("00000000-0000-4000-8000-000000000001")).toEqual({ success: false, message: RESTRICTED_MESSAGE });
    expect(await saveDesign2D({} as never)).toEqual({ success: false, message: RESTRICTED_MESSAGE });
    expect(state.rows.size).toBe(0);
    expect(state.designs).toEqual([]);
  });

  it("is also refused when the showroom's account cannot be found", async () => {
    state.shop = null;
    expect(await saveRoom2D({} as never)).toMatchObject({ success: false, message: RESTRICTED_MESSAGE });
    expect((await uploadRoom(upload(await photo(800, 600)))).status).toBe(403);
  });

  it("is not held back by the 3D visualizer being off: a Starter showroom keeps 2D", async () => {
    state.shop = { subscriptionPackage: "Starter", details: null };
    expect((await uploadRoom(upload(await photo(800, 600)))).status).toBe(200);
  });
});
