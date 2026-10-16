import { describe, expect, it } from "vitest";
import {
  addHole,
  addShape,
  bestQuad,
  calibrationSize,
  deleteVertex,
  guessCalibration,
  insertVertex,
  moveVertex,
  nearestEdge,
  nearestVertex,
  orderQuad,
  planeRect,
  ringProblem,
  ringSelfIntersects,
  translateShapes,
  withCalibrationSize,
} from "@/lib/viz2d/editing";
import { isConvexQuad, planeMapping, transformPoint } from "@/lib/viz2d/geometry";
import { validateRoomData } from "@/lib/viz2d/roomSchema";
import type { PolygonShape, Pt } from "@/lib/viz2d/types";

const square = (x: number, y: number, s: number): Pt[] => [[x, y], [x + s, y], [x + s, y + s], [x, y + s]];
const shapes: PolygonShape[] = [{ outer: square(0.2, 0.2, 0.4) }];

describe("hit testing", () => {
  it("finds the vertex under the pointer, and nothing when far away", () => {
    expect(nearestVertex(shapes, [0.61, 0.59], 0.03)).toMatchObject({ shape: 0, ring: -1, index: 2 });
    expect(nearestVertex(shapes, [0.4, 0.4], 0.03)).toBeNull();
  });

  it("finds the nearest edge and the point on it", () => {
    const e = nearestEdge(shapes, [0.4, 0.21], 0.05)!;
    expect(e).toMatchObject({ shape: 0, ring: -1, index: 0 });
    expect(e.point[0]).toBeCloseTo(0.4, 6);
    expect(e.point[1]).toBeCloseTo(0.2, 6);
    expect(nearestEdge(shapes, [0.4, 0.4], 0.05)).toBeNull();
  });

  it("looks in holes too", () => {
    const withHole: PolygonShape[] = [{ outer: square(0.1, 0.1, 0.8), holes: [square(0.4, 0.4, 0.2)] }];
    expect(nearestVertex(withHole, [0.4, 0.4], 0.02)).toMatchObject({ ring: 0, index: 0 });
  });
});

describe("editing outlines", () => {
  it("moves a vertex without touching the original", () => {
    const moved = moveVertex(shapes, { shape: 0, ring: -1, index: 1 }, [0.7, 0.15]);
    expect(moved[0].outer[1]).toEqual([0.7, 0.15]);
    expect(shapes[0].outer[1][0]).toBeCloseTo(0.6, 9);
    expect(shapes[0].outer[1][1]).toBeCloseTo(0.2, 9);
  });

  it("inserts a point on an edge", () => {
    const next = insertVertex(shapes, { shape: 0, ring: -1, index: 0 }, [0.4, 0.2]);
    expect(next[0].outer).toHaveLength(5);
    expect(next[0].outer[1]).toEqual([0.4, 0.2]);
  });

  it("deletes a point, and the whole outline when too few remain", () => {
    expect(deleteVertex(shapes, { shape: 0, ring: -1, index: 0 })[0].outer).toHaveLength(3);
    const tri: PolygonShape[] = [{ outer: [[0, 0], [1, 0], [0, 1]] }, { outer: square(0.5, 0.5, 0.1) }];
    expect(deleteVertex(tri, { shape: 0, ring: -1, index: 0 })).toHaveLength(1);
    const holey: PolygonShape[] = [{ outer: square(0, 0, 1), holes: [[[0.2, 0.2], [0.4, 0.2], [0.3, 0.4]]] }];
    expect(deleteVertex(holey, { shape: 0, ring: 0, index: 1 })[0].holes).toHaveLength(0);
  });

  it("adds an outline and cuts a hole into the one that contains it", () => {
    expect(addShape(shapes, square(0.7, 0.7, 0.1))).toHaveLength(2);
    const cut = addHole(shapes, square(0.3, 0.3, 0.1))!;
    expect(cut[0].holes).toHaveLength(1);
    expect(addHole(shapes, square(0.8, 0.8, 0.1))).toBeNull(); // outside every outline
  });

  it("slides outlines", () => {
    const [x, y] = translateShapes(shapes, 0.1, -0.05)[0].outer[0];
    expect(x).toBeCloseTo(0.3, 9);
    expect(y).toBeCloseTo(0.15, 9);
  });

  it("recognises an outline that crosses itself", () => {
    expect(ringSelfIntersects([[0, 0], [1, 1], [1, 0], [0, 1]])).toBe(true);
    expect(ringSelfIntersects(square(0, 0, 1))).toBe(false);
    expect(ringProblem(square(0, 0, 1))).toBeNull();
    expect(ringProblem([[0, 0], [1, 1], [1, 0], [0, 1]])).toMatch(/crosses itself/);
    expect(ringProblem([[0, 0], [0.001, 0], [0, 0.001]])).toMatch(/too small/);
    expect(ringProblem([[0, 0], [1, 1]])).toMatch(/three points/);
  });
});

describe("perspective", () => {
  it("orders four points clockwise from the top-left", () => {
    const q = orderQuad([[0.8, 0.9], [0.2, 0.9], [0.8, 0.5], [0.3, 0.5]]);
    expect(q[0]).toEqual([0.3, 0.5]);
    expect(q[1]).toEqual([0.8, 0.5]);
    expect(q[2]).toEqual([0.8, 0.9]);
    expect(q[3]).toEqual([0.2, 0.9]);
  });

  it("finds the corners of a floor-like outline", () => {
    const floor: PolygonShape[] = [{ outer: [[0.35, 0.55], [0.65, 0.55], [0.7, 0.57], [0.98, 0.98], [0.02, 0.98], [0.3, 0.57]] }];
    const q = bestQuad(floor)!;
    expect(isConvexQuad(q)).toBe(true);
    expect(q[0][1]).toBeLessThan(0.6); // the far edge
    expect(q[2][1]).toBeGreaterThan(0.9); // the near edge
  });

  it("makes a calibration that is a valid plane, whose real size can then be set", () => {
    const wall: PolygonShape[] = [{ outer: [[0.2, 0.1], [0.9, 0.15], [0.9, 0.6], [0.2, 0.7]] }];
    const guess = guessCalibration(wall, "wall")!;
    expect(planeMapping(guess)).not.toBeNull();
    const sized = withCalibrationSize(guess, "wall", 5000, 2400);
    expect(calibrationSize(sized)).toEqual({ width: 5000, height: 2400 });
    // A wall is measured up from the floor: the top edge is at the full height
    expect(sized.planeMm[0][1]).toBe(2400);
    expect(sized.planeMm[3]).toEqual([0, 0]);
    // The surface's own corners land on the photo corners
    const map = planeMapping(sized)!;
    const [x, y] = transformPoint(map.planeToImage, 5000, 2400)!;
    expect(x).toBeCloseTo(sized.image[1][0], 9);
    expect(y).toBeCloseTo(sized.image[1][1], 9);
  });

  it("measures floors away from the first corner", () => {
    expect(planeRect("floor", 4000, 3000)).toEqual([[0, 0], [4000, 0], [4000, 3000], [0, 3000]]);
  });

  it("gives no guess for an outline that is not a quadrilateral", () => {
    expect(guessCalibration([{ outer: [[0, 0], [1, 0], [0.5, 0.5]] }], "floor")).toBeNull();
  });
});

describe("what the server accepts", () => {
  const surface = (over: Record<string, unknown> = {}) => ({
    id: "floor",
    name: "Floor",
    kind: "floor",
    priority: 0,
    mask: { kind: "polygons", shapes: [{ outer: [[0.1, 0.5], [0.9, 0.5], [0.95, 0.95], [0.05, 0.95]] }] },
    calibration: { image: [[0.3, 0.5], [0.7, 0.5], [0.95, 0.95], [0.05, 0.95]], planeMm: [[0, 0], [4000, 0], [4000, 3000], [0, 3000]] },
    ...over,
  });

  it("accepts a well-formed room", () => {
    expect(validateRoomData({ surfaces: [surface()] }).ok).toBe(true);
  });

  it("rejects links to files instead of outlines, and out-of-range points", () => {
    expect(validateRoomData({ surfaces: [surface({ mask: { kind: "raster", src: "/etc/passwd" } })] }).ok).toBe(false);
    expect(validateRoomData({ surfaces: [surface({ mask: { kind: "polygons", shapes: [{ outer: [[0, 0], [99, 0], [0, 1]] }] } })] }).ok).toBe(false);
  });

  it("rejects a perspective that is not a real plane, with a message that says what to do", () => {
    const bow = validateRoomData({ surfaces: [surface({ calibration: { image: [[0.2, 0.5], [0.8, 0.9], [0.8, 0.5], [0.2, 0.9]], planeMm: [[0, 0], [4000, 0], [4000, 3000], [0, 3000]] } })] });
    expect(bow.ok).toBe(false);
    expect(bow.message).toMatch(/perspective corners/);
    const flat = validateRoomData({ surfaces: [surface({ calibration: { image: [[0.3, 0.5], [0.7, 0.5], [0.95, 0.95], [0.05, 0.95]], planeMm: [[0, 0], [0, 0], [0, 0], [0, 0]] } })] });
    expect(flat.ok).toBe(false);
  });

  it("rejects duplicate ids, too many surfaces, empty rooms and bad names", () => {
    expect(validateRoomData({ surfaces: [surface(), surface()] }).message).toMatch(/share the id/);
    expect(validateRoomData({ surfaces: Array.from({ length: 17 }, (_, i) => surface({ id: `s${i}` })) }).ok).toBe(false);
    expect(validateRoomData({ surfaces: [] }).ok).toBe(false);
    expect(validateRoomData({ surfaces: [surface({ name: " " })] }).ok).toBe(false);
    expect(validateRoomData({ surfaces: [surface({ id: "../x" })] }).ok).toBe(false);
  });
});
