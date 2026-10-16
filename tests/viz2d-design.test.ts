import { describe, expect, it } from "vitest";
import {
  buildGroups,
  defaultSettings,
  distinctTiles,
  facetMask,
  finishGloss,
  groupIdOf,
  sanitizeDesign,
  sanitizeSettings,
  snapshotTile,
  summarizeSurfaces,
  tileablePhrase,
  wouldExceedTileLimit,
} from "@/lib/viz2d/design";
import { axisHandedness, buildRenderStates, hexToLinear } from "@/lib/viz2d/renderState";
import { canRedo, canUndo, createHistory, pushHistory, redoHistory, undoHistory } from "@/lib/viz2d/history";
import type { Design, RoomScene, SurfaceDef, TileSnapshot } from "@/lib/viz2d/types";

const floor: SurfaceDef = {
  id: "floor",
  name: "Floor",
  kind: "floor",
  priority: 0,
  areaSqFt: 100,
  mask: { kind: "raster", src: "/x.webp" },
  // The plane's y axis runs down the photo, like the photo's own
  calibration: { image: [[0.3, 0.5], [0.7, 0.5], [0.95, 0.95], [0.05, 0.95]], planeMm: [[0, 0], [4000, 0], [4000, 3000], [0, 3000]] },
};
const wall: SurfaceDef = {
  id: "wall-n",
  name: "Back wall",
  kind: "wall",
  priority: 1,
  areaSqFt: 80,
  mask: { kind: "raster", src: "/y.webp" },
  // Measured up from the floor: y runs up the photo
  calibration: { image: [[0.2, 0.1], [0.8, 0.1], [0.8, 0.5], [0.2, 0.5]], planeMm: [[0, 2700], [4000, 2700], [4000, 0], [0, 0]] },
};
const shower1: SurfaceDef = { ...wall, id: "shower-a", group: "shower", name: "Shower walls", areaSqFt: 20 };
const shower2: SurfaceDef = { ...wall, id: "shower-b", group: "shower", name: "Shower walls", areaSqFt: 30 };
const room: RoomScene = {
  id: "r",
  name: "R",
  roomType: "living-room",
  source: "builtin",
  version: 1,
  image: { src: "/b.webp", width: 100, height: 50 },
  surfaces: [floor, wall, shower1, shower2],
};

const tile = (sku: string, over: Partial<TileSnapshot> = {}): TileSnapshot => ({
  id: sku,
  sku,
  name: sku,
  textureUrl: `/t/${sku}.jpg`,
  widthMm: 600,
  heightMm: 600,
  finish: "Matt",
  pricePerSqFt: 100,
  ...over,
});

describe("surface groups", () => {
  it("merges facets that share a group and sums their area", () => {
    const groups = buildGroups(room);
    expect(groups.map((g) => g.id)).toEqual(["floor", "wall-n", "shower"]);
    const shower = groups[2];
    expect(shower.facets).toEqual([2, 3]);
    expect(shower.areaSqFt).toBe(50);
    expect(groupIdOf(shower1)).toBe("shower");
  });

  it("builds the bit mask of a group's facets for the shader", () => {
    expect(facetMask(room, ["shower"])).toBe(0b1100);
    expect(facetMask(room, ["floor", "wall-n"])).toBe(0b0011);
    expect(facetMask(room, [])).toBe(0);
  });
});

describe("what a room card says can be tiled", () => {
  const withSurfaces = (surfaces: SurfaceDef[]) => ({ surfaces });
  const step: SurfaceDef = { ...wall, id: "steps", name: "Steps", kind: "other" };
  const counter: SurfaceDef = { ...wall, id: "counter", name: "Counter top", kind: "countertop" };

  it("counts floors and walls, treating the facets of one surface as one", () => {
    expect(summarizeSurfaces(withSurfaces([floor]))).toBe("Floor");
    expect(summarizeSurfaces(withSurfaces([floor, wall]))).toBe("Floor · 1 wall");
    expect(summarizeSurfaces(withSurfaces([floor, wall, { ...wall, id: "wall-e" }]))).toBe("Floor · 2 walls");
    // the two shower facets are one surface: the wall count stays at 2 (wall-n and the shower)
    expect(summarizeSurfaces(room)).toBe("Floor · 2 walls");
  });

  it("names the other kinds of surface, up to two of them", () => {
    expect(summarizeSurfaces(withSurfaces([floor, step]))).toBe("Floor · Steps");
    expect(summarizeSurfaces(withSurfaces([floor, step, counter]))).toBe("Floor · Steps, Counter top");
    expect(summarizeSurfaces(withSurfaces([floor, step, counter, { ...step, id: "s2", name: "More steps" }]))).toBe("Floor · 3 more");
    expect(summarizeSurfaces(withSurfaces([wall, step]))).toBe("1 wall · Steps");
  });

  it("says so when nothing can be tiled", () => {
    expect(summarizeSurfaces(withSurfaces([]))).toBe("Nothing to tile");
  });

  it("words what can be tiled for a hint, from the surfaces the photo actually offers", () => {
    // A photo only offers the surfaces that could be outlined accurately, so the hint must not promise a wall that is not there
    expect(tileablePhrase(withSurfaces([floor]))).toBe("the floor");
    expect(tileablePhrase(withSurfaces([wall]))).toBe("the back wall");
    expect(tileablePhrase(withSurfaces([floor, wall]))).toBe("the floor or the back wall");
    expect(tileablePhrase(withSurfaces([floor, wall, { ...wall, id: "wall-e", name: "Right wall" }]))).toBe("the floor or a wall");
    expect(tileablePhrase(withSurfaces([floor, wall, step]))).toBe("the floor, the back wall or the steps");
    expect(tileablePhrase(withSurfaces([floor, step, counter]))).toBe("the floor or another marked surface");
    // Names keep their capitals where they are part of the name
    expect(tileablePhrase(withSurfaces([{ ...wall, name: "TV wall" }]))).toBe("the TV wall");
  });

  it("has no words for a photo with nothing to tile", () => {
    expect(tileablePhrase(withSurfaces([]))).toBe("");
  });
});

describe("settings", () => {
  it("starts from the tile's own size and sensible laying defaults", () => {
    const s = defaultSettings(tile("a", { widthMm: 300, heightMm: 600 }));
    expect([s.tileWidthMm, s.tileHeightMm, s.layout, s.groutMm]).toEqual([300, 600, "straight", 3]);
  });

  it("clamps out-of-range numbers and rejects bad colours and layouts", () => {
    const s = sanitizeSettings({ ...defaultSettings(tile("a")), groutMm: 900, rotationDeg: 4000, lighting: -2, groutColor: "red", layout: "zigzag", tileWidthMm: "abc" })!;
    expect(s.groutMm).toBe(20);
    expect(s.rotationDeg).toBe(180);
    expect(s.lighting).toBe(0);
    expect(s.groutColor).toBe("#C8C8C8");
    expect(s.layout).toBe("straight");
    expect(s.tileWidthMm).toBe(600);
  });

  it("refuses settings without a usable tile", () => {
    expect(sanitizeSettings(null)).toBeNull();
    expect(sanitizeSettings({ tile: { sku: "x" } })).toBeNull();
    expect(sanitizeSettings({ tile: { sku: "", textureUrl: "/a.jpg" } })).toBeNull();
  });

  it("drops surfaces that are not in the room and caps the number of different tiles", () => {
    const many: Record<string, unknown> = {};
    const big: RoomScene = { ...room, surfaces: Array.from({ length: 12 }, (_, i) => ({ ...floor, id: `s${i}` })) };
    big.surfaces.forEach((s, i) => (many[s.id] = defaultSettings(tile(`t${i}`))));
    many.ghost = defaultSettings(tile("g"));
    const d = sanitizeDesign({ surfaces: many }, big);
    expect(d.surfaces.ghost).toBeUndefined();
    expect(distinctTiles(d).length).toBe(8);
    expect(sanitizeDesign("junk", room)).toEqual({ roomId: "r", surfaces: {} });
  });

  it("knows when another tile would exceed the limit", () => {
    const design: Design = { roomId: "r", surfaces: {} };
    for (let i = 0; i < 8; i++) design.surfaces[`g${i}`] = defaultSettings(tile(`t${i}`));
    expect(wouldExceedTileLimit(design, [], tile("new"))).toBe(true);
    expect(wouldExceedTileLimit(design, [], tile("t3"))).toBe(false); // already used
    expect(wouldExceedTileLimit(design, ["g3"], tile("new"))).toBe(false); // replaces one
  });

  it("maps finishes to gloss", () => {
    expect(finishGloss("Polished")).toBeGreaterThan(finishGloss("Gloss"));
    expect(finishGloss("Gloss")).toBeGreaterThan(finishGloss("Satin"));
    expect(finishGloss("Matt")).toBe(0);
    expect(snapshotTile({ sku: "a", name: "A", textureUrl: "/a", widthMm: 1, heightMm: 2 }).finish).toBe("Matt");
  });
});

describe("render state", () => {
  const design: Design = {
    roomId: "r",
    surfaces: {
      floor: defaultSettings(tile("a"), { layout: "herringbone", rotationDeg: 10, offsetX: 50, offsetY: 20 }),
      "wall-n": defaultSettings(tile("b"), { rotationDeg: 10, offsetY: 20 }),
    },
  };
  const states = buildRenderStates(room, design, (t) => (t.sku === "a" ? 0 : 1));

  it("leaves untiled surfaces alone", () => {
    expect(states[2].tileLayer).toBe(-1);
    expect(states[3].tileLayer).toBe(-1);
  });

  it("recognises which way a surface's y axis runs", () => {
    expect(axisHandedness(floor)).toBe(1);
    expect(axisHandedness(wall)).toBe(-1);
  });

  it("turns positive rotation clockwise on screen whatever the axes, and adds the layout's own 45°", () => {
    const deg = (rad: number) => (rad * 180) / Math.PI;
    expect(deg(states[0].theta)).toBeCloseTo(10 + 45, 6); // y-down floor, herringbone
    expect(deg(states[1].theta)).toBeCloseTo(-10, 6); // y-up wall, straight
  });

  it("shifts the pattern the same way on screen on both kinds of surface", () => {
    expect(states[0].originY).toBe(20);
    expect(states[1].originY).toBe(-20);
    expect(states[0].originX).toBe(50);
  });

  it("passes the tile layer, size and layout through", () => {
    expect([states[0].tileLayer, states[1].tileLayer]).toEqual([0, 1]);
    expect(states[0].kind).toBe(3);
    expect(states[1].tileW).toBe(600);
  });

  it("skips a surface whose calibration cannot be solved", () => {
    const bad: RoomScene = {
      ...room,
      surfaces: [{ ...floor, calibration: { image: [[0.5, 0.5], [0.5, 0.5], [0.5, 0.5], [0.5, 0.5]], planeMm: [[0, 0], [1, 0], [1, 1], [0, 1]] } }],
    };
    expect(buildRenderStates(bad, design, () => 0)[0].tileLayer).toBe(-1);
  });

  it("converts grout colours to linear light", () => {
    expect(hexToLinear("#ffffff")).toEqual([1, 1, 1]);
    expect(hexToLinear("#000000")).toEqual([0, 0, 0]);
    expect(hexToLinear("#808080")[0]).toBeCloseTo(0.2158, 3);
  });
});

describe("history", () => {
  it("undoes and redoes", () => {
    let h = createHistory(0);
    h = pushHistory(h, 1, null, 0);
    h = pushHistory(h, 2, null, 1000);
    expect(h.present).toBe(2);
    h = undoHistory(h);
    expect(h.present).toBe(1);
    expect(canRedo(h)).toBe(true);
    h = redoHistory(h);
    expect(h.present).toBe(2);
    expect(canRedo(h)).toBe(false);
    h = undoHistory(undoHistory(h));
    expect(canUndo(h)).toBe(false);
    expect(h.present).toBe(0);
  });

  it("drops the redo stack when something new happens", () => {
    let h = createHistory("a");
    h = pushHistory(h, "b");
    h = undoHistory(h);
    h = pushHistory(h, "c");
    expect(canRedo(h)).toBe(false);
  });

  it("makes a burst of changes with the same key one undo step", () => {
    let h = createHistory(0);
    h = pushHistory(h, 1, "grout", 0);
    h = pushHistory(h, 2, "grout", 100);
    h = pushHistory(h, 3, "grout", 200);
    expect(h.past).toEqual([0]);
    h = pushHistory(h, 4, "grout", 5000); // a pause starts a new step
    expect(h.past).toEqual([0, 3]);
    h = pushHistory(h, 5, "rotation", 5100); // a different control too
    expect(h.past).toEqual([0, 3, 4]);
  });

  it("ignores a push that changes nothing", () => {
    const h = createHistory({ a: 1 });
    expect(pushHistory(h, h.present)).toBe(h);
  });
});
