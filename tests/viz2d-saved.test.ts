import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadAutosave, saveAutosave, savedDesignFits } from "@/components/Viewer2D/savedDesigns";
import { defaultSettings } from "@/lib/viz2d/design";
import type { Design, RoomScene, SurfaceDef, TileSnapshot } from "@/lib/viz2d/types";

/**
 * A design is kept in the browser and reopened by room id. The photos of the rooms can be replaced (the ids of the new photos
 * are the same as those of the old ones: lv-01, dr-02...), so a design must only be applied to the photo it was made on:
 * otherwise tiles chosen for one picture would appear on a different one.
 */

const surface = (id: string, kind: SurfaceDef["kind"] = "floor"): SurfaceDef => ({
  id,
  name: id,
  kind,
  priority: kind === "floor" ? 0 : 1,
  mask: { kind: "raster", src: `/m/${id}.webp` },
  calibration: { image: [[0.3, 0.5], [0.7, 0.5], [0.95, 0.95], [0.05, 0.95]], planeMm: [[0, 0], [4000, 0], [4000, 3000], [0, 3000]] },
});
const room = (id: string, photo: string, surfaces = [surface("floor"), surface("wall-back", "wall")]): RoomScene => ({
  id,
  name: id,
  roomType: "living-room",
  source: "builtin",
  version: 1,
  image: { src: photo, width: 100, height: 50 },
  surfaces,
});
const tile: TileSnapshot = { id: "t1", sku: "T1", name: "Tile", textureUrl: "/t/t1.jpg", widthMm: 600, heightMm: 600, finish: "Matt", pricePerSqFt: 100 };
const designOf = (roomId: string, ids: string[]): Design => ({ roomId, surfaces: Object.fromEntries(ids.map((id) => [id, defaultSettings(tile)])) });

/** The browser's storage, as far as the code under test uses it. */
class MemoryStorage {
  data = new Map<string, string>();
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
}
let storage: MemoryStorage;
beforeEach(() => {
  storage = new MemoryStorage();
  (globalThis as unknown as { window: unknown }).window = { localStorage: storage };
});
afterEach(() => {
  delete (globalThis as unknown as { window?: unknown }).window;
});

describe("the work in progress that is kept between visits", () => {
  it("comes back on the photo it was made on", () => {
    const a = room("lv-01", "/rooms2d/Rooms/Living_Room/LV_01.png");
    saveAutosave({ "lv-01": designOf("lv-01", ["floor", "wall-back"]) }, "lv-01", { "lv-01": a.image.src });
    const restored = loadAutosave([a]);
    expect(restored.roomId).toBe("lv-01");
    expect(restored.designs.map((d) => d.roomId)).toEqual(["lv-01"]);
    expect(Object.keys(restored.designs[0].surfaces).sort()).toEqual(["floor", "wall-back"]);
  });

  it("is not applied to a different photo that has the same id", () => {
    const before = room("lv-01", "/rooms2d/Rooms/Living_Room/LV-01.jpg");
    saveAutosave({ "lv-01": designOf("lv-01", ["floor", "wall-back"]) }, "lv-01", { "lv-01": before.image.src });
    // the photos were replaced: the room has the same id and the same kind of surfaces, but it is another picture
    const after = room("lv-01", "/rooms2d/Rooms/Living_Room/LV_01.png");
    expect(loadAutosave([after]).designs).toEqual([]);
  });

  it("is ignored when it was kept by an older version that did not note the photo", () => {
    const a = room("lv-01", "/rooms2d/Rooms/Living_Room/LV_01.png");
    storage.setItem("tsp.viz2d.autosave.v1", JSON.stringify({ roomId: "lv-01", designs: { "lv-01": designOf("lv-01", ["floor"]) } }));
    expect(loadAutosave([a]).designs).toEqual([]);
    storage.setItem("tsp.viz2d.autosave.v2", JSON.stringify({ roomId: "lv-01", designs: { "lv-01": designOf("lv-01", ["floor"]) } }));
    expect(loadAutosave([a]).designs).toEqual([]);
  });

  it("keeps each room's own design, and drops a surface that the room no longer offers", () => {
    const a = room("lv-01", "/p/a.png");
    const b = room("br-02", "/p/b.png", [surface("floor")]);
    saveAutosave(
      { "lv-01": designOf("lv-01", ["floor"]), "br-02": designOf("br-02", ["floor", "wall-back"]) },
      "br-02",
      { "lv-01": a.image.src, "br-02": b.image.src },
    );
    const restored = loadAutosave([a, b]);
    expect(restored.roomId).toBe("br-02");
    const byRoom = Object.fromEntries(restored.designs.map((d) => [d.roomId, Object.keys(d.surfaces)]));
    expect(byRoom).toEqual({ "lv-01": ["floor"], "br-02": ["floor"] });
  });

  it("does not keep a room that has nothing tiled, and survives storage that is full or broken", () => {
    const a = room("lv-01", "/p/a.png");
    saveAutosave({ "lv-01": designOf("lv-01", []) }, "lv-01", { "lv-01": a.image.src });
    expect(loadAutosave([a]).designs).toEqual([]);
    // whatever the key is, a record that cannot be read is no record
    const [key] = [...storage.data.keys()];
    expect(key).toBeTruthy();
    storage.setItem(key, "{not json");
    expect(loadAutosave([a])).toEqual({ roomId: null, designs: [] });
    storage.setItem = () => {
      throw new Error("quota");
    };
    expect(() => saveAutosave({ "lv-01": designOf("lv-01", ["floor"]) }, "lv-01", { "lv-01": a.image.src })).not.toThrow();
  });
});

describe("a design saved by name", () => {
  it("fits the photo it was made on, and nothing else", () => {
    const a = room("lv-01", "/rooms2d/Rooms/Living_Room/LV_01.png");
    expect(savedDesignFits({ roomImage: a.image.src }, a)).toBe(true);
    expect(savedDesignFits({ roomImage: "/rooms2d/Rooms/Living_Room/LV-01.jpg" }, a)).toBe(false);
    // saved before the photo was noted: it cannot be told which picture it belongs to
    expect(savedDesignFits({}, a)).toBe(false);
  });
});
