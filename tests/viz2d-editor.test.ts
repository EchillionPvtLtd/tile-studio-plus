import { beforeEach, describe, expect, it } from "vitest";
import { useRoomEditor, type EditorDraft } from "@/components/Viewer2D/editor/editorStore";
import { dataFromDraft, draftFromRoom, sceneFromDraft } from "@/components/Viewer2D/editor/drafts";
import { roomCacheKey, surfaceAt, type LoadedRoom } from "@/components/Viewer2D/roomLoader";
import { weightedPercentile } from "@/lib/viz2d/lighting";
import { buildRenderStates } from "@/lib/viz2d/renderState";
import { defaultSettings } from "@/lib/viz2d/design";
import { isRoomImageUrl, sceneFromRow, thumbUrlOf, validateRoomData } from "@/lib/viz2d/roomSchema";
import { MAX_TILED_SURFACES, type Design, type RoomScene, type SurfaceDef, type TileSnapshot } from "@/lib/viz2d/types";

const ed = () => useRoomEditor.getState();

const blank = (over: Partial<EditorDraft> = {}): EditorDraft => ({
  roomId: null,
  sceneId: "draft-1",
  name: "Lounge",
  roomType: "living-room",
  image: { src: "blob:x", width: 1600, height: 1000 },
  surfaces: [],
  occluders: [],
  ...over,
});

/** A rectangle of the photo, clockwise, ready to be clicked in. */
const box = (x0: number, y0: number, x1: number, y1: number): [number, number][] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const outline = (points: [number, number][]) => {
  points.forEach((p) => ed().addDrawingPoint(p));
  return ed().finishDrawing();
};

beforeEach(() => ed().close());

describe("the room editor", () => {
  it("starts a new room with its floor ready to outline, without making that an undo step", () => {
    ed().open(blank());
    const d = ed().history!.present;
    expect(d.surfaces.map((s) => [s.id, s.kind, s.name])).toEqual([["floor", "floor", "Floor"]]);
    expect(ed().activeId).toBe("floor");
    expect(ed().tool).toBe("draw");
    expect(ed().history!.past).toHaveLength(0);
  });

  it("opens a saved room on its points, with its own perspective kept", () => {
    const room = {
      ...sceneFromDraft(blank()),
      id: "room-1",
      name: "Saved",
      surfaces: [{ id: "wall", name: "Wall", kind: "wall", priority: 1, mask: { kind: "polygons", shapes: [{ outer: box(0.1, 0.1, 0.6, 0.6) }] }, calibration: { image: box(0.1, 0.1, 0.6, 0.6), planeMm: [[0, 2700], [4000, 2700], [4000, 0], [0, 0]] } }],
    } as RoomScene;
    ed().open(draftFromRoom(room));
    expect(ed().tool).toBe("points");
    expect(ed().calibrated).toEqual(["wall"]);
    // A saved room is edited under its own scene id, so tiles already laid in it stay out of the way
    expect(ed().history!.present.sceneId).toBe("edit-room-1");
    // Moving a point must not replace the perspective the showroom set by a guess
    const before = ed().history!.present.surfaces[0].calibration;
    ed().moveVertexTo({ shape: 0, ring: -1, index: 0 }, [0.05, 0.05]);
    expect(ed().history!.present.surfaces[0].calibration).toEqual(before);
  });

  it("names and numbers surfaces, and gives each a free id", () => {
    ed().open(blank());
    ed().addSurface("wall");
    ed().addSurface("wall");
    ed().addSurface("floor");
    expect(ed().history!.present.surfaces.map((s) => [s.id, s.name])).toEqual([["floor", "Floor"], ["wall", "Wall"], ["wall-2", "Wall 2"], ["floor-2", "Floor 2"]]);
    expect(ed().activeId).toBe("floor-2");
    expect(ed().tool).toBe("draw");
  });

  it("stops at the number of surfaces a room may have", () => {
    ed().open(blank());
    for (let i = 0; i < MAX_TILED_SURFACES + 3; i++) ed().addSurface("wall");
    expect(ed().history!.present.surfaces).toHaveLength(MAX_TILED_SURFACES);
    expect(ed().message).toMatch(/up to 16/);
  });

  it("outlines a surface and guesses its perspective from the outline", () => {
    ed().open(blank());
    expect(outline(box(0.1, 0.5, 0.9, 0.95))).toBeNull();
    const floor = ed().history!.present.surfaces[0];
    expect(floor.mask).toEqual({ kind: "polygons", shapes: [{ outer: box(0.1, 0.5, 0.9, 0.95) }] });
    expect(floor.calibration.image.flat().some((v) => v === 0.3)).toBe(false); // no longer the placeholder
    expect(ed().tool).toBe("points"); // ready to adjust the points
    expect(ed().drawing).toEqual([]);
  });

  it("does not accept an outline that crosses itself or encloses nothing", () => {
    ed().open(blank());
    expect(outline([[0.1, 0.1], [0.9, 0.9], [0.9, 0.1], [0.1, 0.9]])).toMatch(/cross/i);
    expect(ed().history!.present.surfaces[0].mask).toEqual({ kind: "polygons", shapes: [] });
    ed().cancelDrawing();
    expect(outline([[0.1, 0.1], [0.2, 0.2]])).not.toBeNull();
  });

  it("cuts a window out of a surface and adds objects that stand in front", () => {
    ed().open(blank());
    outline(box(0.1, 0.1, 0.9, 0.9));
    ed().setTool("cutout");
    expect(outline(box(0.4, 0.4, 0.6, 0.6))).toBeNull();
    const shape = (ed().history!.present.surfaces[0].mask as { shapes: { holes?: unknown[] }[] }).shapes[0];
    expect(shape.holes).toHaveLength(1);
    // A cut-out outside the surface is refused
    ed().setTool("cutout");
    expect(outline(box(0.95, 0.95, 0.99, 0.99))).toBe("outside");
    ed().setTool("object");
    outline(box(0.2, 0.2, 0.3, 0.3));
    expect(ed().history!.present.occluders).toHaveLength(1);
    ed().removeOccluder(0);
    expect(ed().history!.present.occluders).toHaveLength(0);
  });

  it("undoes and redoes every change, a drag being one step", () => {
    ed().open(blank());
    outline(box(0.1, 0.1, 0.9, 0.9));
    const outlined = ed().history!.present;
    for (const x of [0.12, 0.14, 0.16]) ed().moveVertexTo({ shape: 0, ring: -1, index: 0 }, [x, 0.1]);
    expect(ed().history!.past).toHaveLength(2);
    ed().undo();
    expect(ed().history!.present).toBe(outlined);
    ed().redo();
    expect((ed().history!.present.surfaces[0].mask as { shapes: { outer: number[][] }[] }).shapes[0].outer[0]).toEqual([0.16, 0.1]);
    ed().undo();
    ed().undo();
    expect(ed().history!.present.surfaces[0].mask).toEqual({ kind: "polygons", shapes: [] });
  });

  it("adds a point on an edge and deletes points, an outline needing three", () => {
    ed().open(blank());
    outline(box(0.1, 0.1, 0.9, 0.9));
    const ref = ed().insertVertexAt({ shape: 0, ring: -1, index: 0 }, [0.5, 0.1]);
    expect(ref).toEqual({ shape: 0, ring: -1, index: 1 });
    const ring = () => (ed().history!.present.surfaces[0].mask as { shapes: { outer: number[][] }[] }).shapes[0].outer;
    expect(ring()).toHaveLength(5);
    ed().deleteVertexAt(ref);
    expect(ring()).toHaveLength(4);
    ed().deleteVertexAt({ shape: 0, ring: -1, index: 0 });
    expect(ring()).toHaveLength(3);
    // An outline needs three points: taking one from a triangle takes the whole outline away
    ed().deleteVertexAt({ shape: 0, ring: -1, index: 0 });
    expect(ed().history!.present.surfaces[0].mask).toEqual({ kind: "polygons", shapes: [] });
  });

  it("puts a surface in front of or behind another by swapping places", () => {
    ed().open(blank());
    ed().addSurface("wall");
    const order = () => ed().history!.present.surfaces.map((s) => [s.id, s.priority]);
    expect(order()).toEqual([["floor", 0], ["wall", 1]]);
    ed().moveSurface("wall", -1);
    expect(order()).toEqual([["wall", 0], ["floor", 1]]);
    ed().moveSurface("wall", -1); // already at the back
    expect(order()).toEqual([["wall", 0], ["floor", 1]]);
  });

  it("changes a surface's kind and keeps its measured size", () => {
    ed().open(blank());
    outline(box(0.1, 0.5, 0.9, 0.95));
    ed().setCalibrationSize(5000, 3500);
    ed().setKind("floor", "wall");
    const wall = ed().history!.present.surfaces[0];
    expect(wall.kind).toBe("wall");
    expect(wall.priority).toBe(1);
    // Walls are measured up from the floor, so the plane's y axis now runs up
    expect(wall.calibration.planeMm[0][1]).toBeGreaterThan(wall.calibration.planeMm[3][1]);
    expect(Math.abs(wall.calibration.planeMm[1][0] - wall.calibration.planeMm[0][0])).toBe(5000);
  });

  it("keeps a perspective set by hand when the outline changes, and guesses again on request", () => {
    ed().open(blank());
    outline(box(0.1, 0.5, 0.9, 0.95));
    ed().setCalibrationPoint(0, [0.2, 0.55]);
    const set = ed().history!.present.surfaces[0].calibration;
    ed().moveVertexTo({ shape: 0, ring: -1, index: 2 }, [0.85, 0.9]);
    expect(ed().history!.present.surfaces[0].calibration).toEqual(set);
    ed().guessPerspective();
    expect(ed().history!.present.surfaces[0].calibration).not.toEqual(set);
  });

  it("stores only surfaces that have an outline, and shows the same to the stage", () => {
    ed().open(blank());
    ed().addSurface("wall"); // never outlined
    ed().setActive("floor");
    ed().setTool("draw");
    outline(box(0.1, 0.5, 0.9, 0.95));
    const draft = ed().history!.present;
    expect(dataFromDraft(draft).surfaces.map((s) => s.id)).toEqual(["floor"]);
    expect(sceneFromDraft(draft).surfaces.map((s) => s.id)).toEqual(["floor"]);
    expect(validateRoomData(dataFromDraft(draft)).ok).toBe(true);
    // Nothing outlined: the server would refuse it, and so does the form
    ed().open(blank());
    expect(validateRoomData(dataFromDraft(ed().history!.present)).ok).toBe(false);
  });
});

describe("what a saved room looks like to the stage", () => {
  const row = (over: Record<string, unknown> = {}) => ({
    id: "r1",
    name: "Lounge",
    roomType: "living-room",
    imageUrl: "/uploads/room-00000000-0000-4000-8000-000000000001.webp",
    width: 1600,
    height: 1000,
    data: JSON.stringify({ surfaces: [{ id: "floor", name: "Floor", kind: "floor", priority: 0, mask: { kind: "polygons", shapes: [{ outer: box(0.1, 0.5, 0.9, 0.95) }] }, calibration: { image: box(0.3, 0.5, 0.95, 0.95), planeMm: [[0, 0], [4000, 0], [4000, 3000], [0, 3000]] } }] }),
    ...over,
  });

  it("turns a stored row into a scene with its thumbnail", () => {
    const scene = sceneFromRow(row())!;
    expect(scene.source).toBe("custom");
    expect(scene.image.thumb).toBe("/uploads/room-00000000-0000-4000-8000-000000000001-t.webp");
    expect(scene.surfaces).toHaveLength(1);
  });

  it("leaves out a row that is damaged or no longer valid, instead of breaking the page", () => {
    expect(sceneFromRow(row({ data: "{not json" }))).toBeNull();
    expect(sceneFromRow(row({ data: JSON.stringify({ surfaces: [] }) }))).toBeNull();
    expect(sceneFromRow(row({ data: JSON.stringify({ surfaces: [{ id: "x", name: "X", kind: "floor", priority: 0, mask: { kind: "raster", src: "/etc/passwd" }, calibration: {} }] }) }))).toBeNull();
  });

  it("only trusts photos this app wrote, and finds their thumbnails", () => {
    expect(isRoomImageUrl("/uploads/room-00000000-0000-4000-8000-000000000001.webp")).toBe(true);
    for (const bad of ["/uploads/logo-1.webp", "https://x.test/a.webp", "/uploads/../room-00000000-0000-4000-8000-000000000001.webp", "/uploads/room-1.webp"]) expect(isRoomImageUrl(bad)).toBe(false);
    expect(thumbUrlOf("/uploads/room-abc.webp")).toBe("/uploads/room-abc-t.webp");
  });

  it("is cached again only when its photo, outlines or perspective change", () => {
    const a = sceneFromRow(row())!;
    expect(roomCacheKey(a)).toBe(roomCacheKey(sceneFromRow(row())!));
    const moved = JSON.parse(row().data);
    moved.surfaces[0].mask.shapes[0].outer[0] = [0.11, 0.5];
    expect(roomCacheKey(a)).not.toBe(roomCacheKey(sceneFromRow(row({ data: JSON.stringify(moved) }))!));
    // The name alone changes nothing the loader computes
    expect(roomCacheKey(a)).toBe(roomCacheKey({ ...a, name: "Renamed" }));
  });
});

describe("clicking a room photo", () => {
  // A 4 × 2 map of a photo of any size: the left half is surface 0, the right half surface 1, one cell is empty
  const loaded = {
    labels: Uint8Array.from([1, 1, 2, 2, 1, 0, 2, 2]),
    lightWidth: 4,
    lightHeight: 2,
  } as unknown as LoadedRoom;

  it("finds the surface under a point of the photo at any resolution", () => {
    expect(surfaceAt(loaded, 0.1, 0.1)).toBe(0);
    expect(surfaceAt(loaded, 0.9, 0.9)).toBe(1);
    expect(surfaceAt(loaded, 0.3, 0.9)).toBe(-1); // nothing there: no tile may go on it
    expect(surfaceAt(loaded, 0.5, 0.2)).toBe(1);
  });

  it("never selects anything outside the photo", () => {
    for (const [x, y] of [[-0.01, 0.5], [0.5, -0.01], [1, 0.5], [0.5, 1], [1.5, 1.5], [Number.NaN, 0.5]]) expect(surfaceAt(loaded, x, y)).toBe(-1);
  });
});

describe("the light of a surface", () => {
  it("picks exact quantiles of the lit pixels and ignores the rest", () => {
    const v = Float32Array.from([0.5, 1, 2, 3, 4, 0, -1, 99]);
    const w = Float32Array.from([1, 1, 1, 1, 1, 1, 1, 0]); // 0 and -1 are not light, 99 is outside the surface
    expect(weightedPercentile(v, w, 0)).toBe(0.5);
    expect(weightedPercentile(v, w, 0.5)).toBe(2);
    expect(weightedPercentile(v, w, 1)).toBe(4);
    expect(weightedPercentile(new Float32Array(3), new Float32Array(3), 0.7)).toBe(1); // nothing: neutral
  });
});

describe("what the shader is given for a room being edited", () => {
  const tile: TileSnapshot = { id: "t", sku: "t", name: "t", textureUrl: "/t.jpg", widthMm: 600, heightMm: 600, finish: "Matt", pricePerSqFt: 1 };
  const floor: SurfaceDef = {
    id: "floor",
    name: "Floor",
    kind: "floor",
    priority: 0,
    mask: { kind: "polygons", shapes: [{ outer: box(0, 0.5, 1, 1) }] },
    calibration: { image: [[0.3, 0.5], [0.7, 0.5], [0.95, 0.95], [0.05, 0.95]], planeMm: [[0, 0], [4000, 0], [4000, 3000], [0, 3000]] },
  };
  const wall: SurfaceDef = {
    ...floor,
    id: "wall",
    name: "Wall",
    kind: "wall",
    calibration: { image: [[0.2, 0.1], [0.8, 0.1], [0.8, 0.5], [0.2, 0.5]], planeMm: [[0, 2700], [4000, 2700], [4000, 0], [0, 0]] },
  };
  const room = { surfaces: [floor, wall] };

  it("keeps every surface's own perspective, so the measuring grid shows before any tile is laid", () => {
    const none = buildRenderStates(room, { roomId: "r", surfaces: {} }, () => 0);
    expect(none.map((s) => s.tileLayer)).toEqual([-1, -1]);
    expect(none[0].imageToPlane).not.toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1]);
    expect(none[1].imageToPlane).not.toEqual(none[0].imageToPlane);
  });

  it("flips tile pictures only on surfaces measured upwards from the floor", () => {
    const design: Design = { roomId: "r", surfaces: { floor: defaultSettings(tile), wall: defaultSettings(tile) } };
    const [f, w] = buildRenderStates(room, design, () => 0);
    expect(f.flipV).toBe(false);
    expect(w.flipV).toBe(true);
  });
});
