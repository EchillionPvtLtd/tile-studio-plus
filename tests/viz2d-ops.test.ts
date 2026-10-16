import { describe, expect, it } from "vitest";
import { applyTile, clearSurfaces, copySettings, emptyDesign, patchSettings } from "@/lib/viz2d/designOps";
import { defaultSettings } from "@/lib/viz2d/design";
import { LayerAllocator } from "@/lib/viz2d/layers";
import { buildQuote2D, shapesAreaSqFt, surfaceAreaSqFt } from "@/lib/viz2d/quote2d";
import { planeMapping } from "@/lib/viz2d/geometry";
import type { Design, RoomScene, SurfaceDef, TileSnapshot } from "@/lib/viz2d/types";

const tile = (sku: string, over: Partial<TileSnapshot> = {}): TileSnapshot => ({
  id: sku,
  sku,
  name: `Tile ${sku}`,
  textureUrl: `/t/${sku}.jpg`,
  widthMm: 600,
  heightMm: 600,
  finish: "Matt",
  pricePerSqFt: 100,
  ...over,
});

describe("design operations", () => {
  it("lays a tile on several surfaces at once", () => {
    const d = applyTile(emptyDesign("r"), ["floor", "wall"], tile("a"));
    expect(Object.keys(d.surfaces)).toEqual(["floor", "wall"]);
    expect(d.surfaces.floor.tile?.sku).toBe("a");
  });

  it("keeps how a surface was laid when its tile is swapped, but takes the new tile's size", () => {
    let d = applyTile(emptyDesign("r"), ["floor"], tile("a"));
    d = patchSettings(d, ["floor"], { layout: "herringbone", groutMm: 6, rotationDeg: 30 });
    d = applyTile(d, ["floor"], tile("b", { widthMm: 300, heightMm: 900 }));
    expect(d.surfaces.floor.tile?.sku).toBe("b");
    expect([d.surfaces.floor.layout, d.surfaces.floor.groutMm, d.surfaces.floor.rotationDeg]).toEqual(["herringbone", 6, 30]);
    expect([d.surfaces.floor.tileWidthMm, d.surfaces.floor.tileHeightMm]).toEqual([300, 900]);
  });

  it("does not touch the previous design (undo depends on it)", () => {
    const before = applyTile(emptyDesign("r"), ["floor"], tile("a"));
    const frozen = JSON.stringify(before);
    patchSettings(before, ["floor"], { groutMm: 9 });
    applyTile(before, ["floor"], tile("b"));
    clearSurfaces(before, ["floor"]);
    expect(JSON.stringify(before)).toBe(frozen);
  });

  it("clamps patches and ignores surfaces without a tile", () => {
    const d = applyTile(emptyDesign("r"), ["floor"], tile("a"));
    expect(patchSettings(d, ["floor"], { groutMm: 500 }).surfaces.floor.groutMm).toBe(20);
    expect(patchSettings(d, ["wall"], { groutMm: 5 })).toBe(d);
  });

  it("returns the same object when nothing changes", () => {
    const d = applyTile(emptyDesign("r"), ["floor"], tile("a"));
    expect(patchSettings(d, ["floor"], { groutMm: 3 })).toBe(d);
    expect(clearSurfaces(d, ["wall"])).toBe(d);
    expect(applyTile(d, [], tile("b"))).toBe(d);
  });

  it("copies one surface's tile and laying to the others", () => {
    let d = applyTile(emptyDesign("r"), ["a"], tile("x"));
    d = patchSettings(d, ["a"], { layout: "brick", groutColor: "#112233" });
    d = copySettings(d, "a", ["b", "c", "a"]);
    expect(d.surfaces.b).toEqual(d.surfaces.a);
    expect(d.surfaces.c.layout).toBe("brick");
    expect(copySettings(d, "missing", ["b"])).toBe(d);
  });

  it("clears surfaces", () => {
    const d = applyTile(emptyDesign("r"), ["a", "b"], tile("x"));
    expect(Object.keys(clearSurfaces(d, ["a"]).surfaces)).toEqual(["b"]);
  });
});

describe("texture layers", () => {
  it("keeps a tile on its layer while it stays in use, and reuses freed layers", () => {
    const a = new LayerAllocator(3);
    let r = a.assign(["t1", "t2"]);
    expect(r.added).toEqual(["t1", "t2"]);
    const l1 = r.layers.get("t1");
    r = a.assign(["t1", "t2", "t3"]);
    expect(r.layers.get("t1")).toBe(l1);
    expect(r.added).toEqual(["t3"]);
    r = a.assign(["t1", "t3"]); // t2 left
    r = a.assign(["t1", "t3", "t4"]);
    expect(r.layers.get("t4")).toBeDefined();
    expect(new Set(r.layers.values()).size).toBe(3);
  });

  it("gives no layer beyond its capacity", () => {
    const a = new LayerAllocator(2);
    const r = a.assign(["a", "b", "c"]);
    expect(r.layers.has("c")).toBe(false);
    expect(a.get("c")).toBe(-1);
  });
});

describe("quotation", () => {
  const mk = (over: Partial<SurfaceDef>): SurfaceDef => ({
    id: "floor",
    name: "Floor",
    kind: "floor",
    priority: 0,
    mask: { kind: "raster", src: "/x" },
    calibration: { image: [[0.3, 0.5], [0.7, 0.5], [0.95, 0.95], [0.05, 0.95]], planeMm: [[0, 0], [4000, 0], [4000, 3000], [0, 3000]] },
    ...over,
  });

  it("counts tiles with wastage and prices the area bought", () => {
    const room: RoomScene = { id: "r", name: "R", roomType: "living-room", source: "builtin", version: 1, image: { src: "/b", width: 10, height: 10 }, surfaces: [mk({ areaSqFt: 120 })] };
    const design: Design = { roomId: "r", surfaces: { floor: defaultSettings(tile("a", { widthMm: 600, heightMm: 600, pricePerSqFt: 200 })) } };
    const q = buildQuote2D(room, design);
    expect(q.lines).toHaveLength(1);
    const per = (600 / 304.8) ** 2;
    expect(q.lines[0].tiles).toBe(Math.ceil((120 / per) * 1.1));
    expect(q.lines[0].amount).toBe(Math.round(q.lines[0].purchaseSqFt * 200));
    expect(q.total).toBe(q.lines[0].amount);
  });

  it("uses the size the tile was laid at", () => {
    const room: RoomScene = { id: "r", name: "R", roomType: "living-room", source: "builtin", version: 1, image: { src: "/b", width: 10, height: 10 }, surfaces: [mk({ areaSqFt: 100 })] };
    const small = { roomId: "r", surfaces: { floor: defaultSettings(tile("a"), { tileWidthMm: 300, tileHeightMm: 300 }) } };
    const big = { roomId: "r", surfaces: { floor: defaultSettings(tile("a"), { tileWidthMm: 600, tileHeightMm: 600 }) } };
    expect(buildQuote2D(room, small).lines[0].tiles).toBeGreaterThan(buildQuote2D(room, big).lines[0].tiles * 3);
  });

  it("adds up the facets of a grouped surface and skips surfaces without a tile", () => {
    const room: RoomScene = {
      id: "r", name: "R", roomType: "bathroom", source: "builtin", version: 1, image: { src: "/b", width: 10, height: 10 },
      surfaces: [mk({ id: "a", group: "shower", name: "Shower walls", areaSqFt: 40 }), mk({ id: "b", group: "shower", name: "Shower walls", areaSqFt: 35 }), mk({ id: "floor", areaSqFt: 90 })],
    };
    const q = buildQuote2D(room, { roomId: "r", surfaces: { shower: defaultSettings(tile("a")) } });
    expect(q.lines.map((l) => l.label)).toEqual(["Shower walls"]);
    expect(q.lines[0].areaSqFt).toBe(75);
  });

  it("measures a hand-drawn surface from its outline and perspective", () => {
    // A square 2 m × 2 m on a surface, seen as a quad in the photo: its measured area must be 4 m² = 43.06 sq.ft
    const calibration = { image: [[0.3, 0.4], [0.7, 0.4], [0.8, 0.8], [0.2, 0.8]] as SurfaceDef["calibration"]["image"], planeMm: [[0, 0], [2000, 0], [2000, 2000], [0, 2000]] as SurfaceDef["calibration"]["planeMm"] };
    const shapes = [{ outer: [...calibration.image] }];
    const map = planeMapping(calibration)!;
    expect(shapesAreaSqFt(shapes, map)).toBeCloseTo(43.1, 1);
    const s = mk({ calibration, mask: { kind: "polygons", shapes } });
    expect(surfaceAreaSqFt(s)).toBeCloseTo(43.1, 1);
    expect(surfaceAreaSqFt(mk({ areaSqFt: 12 }))).toBe(12);
    expect(surfaceAreaSqFt(mk({}))).toBe(0);
  });
});
