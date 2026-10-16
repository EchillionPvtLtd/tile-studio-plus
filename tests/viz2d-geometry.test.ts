import { describe, expect, it } from "vitest";
import {
  boundsOf,
  imageToPlanePoint,
  invMat3,
  isConvexQuad,
  mulMat3,
  planeMapping,
  pointInShape,
  ringArea,
  shapeArea,
  simplifyRing,
  solveHomography,
  transformPoint,
  type Mat3,
} from "@/lib/viz2d/geometry";
import type { Calibration, Pt } from "@/lib/viz2d/types";

const near = (a: number, b: number, eps = 1e-6) => expect(Math.abs(a - b)).toBeLessThan(eps);

describe("homography", () => {
  it("maps a square onto itself with the identity", () => {
    const sq: Pt[] = [[0, 0], [1, 0], [1, 1], [0, 1]];
    const H = solveHomography(sq, sq)!;
    const p = transformPoint(H, 0.3, 0.7)!;
    near(p[0], 0.3);
    near(p[1], 0.7);
  });

  it("reproduces the four given correspondences exactly", () => {
    const src: Pt[] = [[0, 0], [4000, 0], [4000, 3000], [0, 3000]];
    const dst: Pt[] = [[0.31, 0.52], [0.78, 0.5], [0.97, 0.94], [0.04, 0.96]];
    const H = solveHomography(src, dst)!;
    src.forEach((s, i) => {
      const p = transformPoint(H, s[0], s[1])!;
      near(p[0], dst[i][0], 1e-9);
      near(p[1], dst[i][1], 1e-9);
    });
  });

  it("round-trips through the inverse", () => {
    const src: Pt[] = [[0, 0], [5000, 0], [5000, 3500], [0, 3500]];
    const dst: Pt[] = [[0.2, 0.4], [0.85, 0.42], [1.2, 0.95], [-0.1, 0.9]];
    const H = solveHomography(src, dst)!;
    const Hi = invMat3(H)!;
    for (const [x, y] of [[100, 200], [2500, 1750], [4900, 3400]] as Pt[]) {
      const img = transformPoint(H, x, y)!;
      const back = transformPoint(Hi, img[0], img[1])!;
      near(back[0], x, 1e-6);
      near(back[1], y, 1e-6);
    }
  });

  it("stays accurate with millimetre-scale input and unit-scale output (conditioning)", () => {
    // Plane in mm up to 12 m, image in 0..1: a naive solve loses most of its precision here
    const src: Pt[] = [[0, 0], [12000, 0], [12000, 9000], [0, 9000]];
    const dst: Pt[] = [[0.46, 0.55], [0.62, 0.55], [0.99, 0.99], [0.01, 0.99]];
    const H = solveHomography(src, dst)!;
    const mid = transformPoint(H, 6000, 4500)!;
    // The centre of the quad maps to the intersection of the image diagonals
    near(mid[0], 0.5, 0.2);
    const check = transformPoint(H, 12000, 9000)!;
    near(check[0], 0.99, 1e-8);
    near(check[1], 0.99, 1e-8);
  });

  it("fits more than four noisy-free points in the least-squares sense", () => {
    const H0: Mat3 = [1.2, 0.1, 0.05, -0.05, 0.9, 0.02, 0.3, 0.1, 1];
    const pts: Pt[] = [[0, 0], [1, 0], [1, 1], [0, 1], [0.5, 0.5], [0.25, 0.8]];
    const dst = pts.map(([x, y]) => transformPoint(H0, x, y)!);
    const H = solveHomography(pts, dst)!;
    for (const p of pts) {
      const a = transformPoint(H0, p[0], p[1])!;
      const b = transformPoint(H, p[0], p[1])!;
      near(a[0], b[0], 1e-8);
      near(a[1], b[1], 1e-8);
    }
  });

  it("rejects degenerate input", () => {
    const line: Pt[] = [[0, 0], [1, 1], [2, 2], [3, 3]];
    expect(solveHomography(line, line)).toBeNull();
    expect(solveHomography([[0, 0], [1, 0], [1, 1]], [[0, 0], [1, 0], [1, 1]])).toBeNull();
  });

  it("multiplies and inverts matrices", () => {
    const a: Mat3 = [2, 0, 1, 0, 3, 2, 0, 0, 1];
    const prod = mulMat3(a, invMat3(a)!);
    prod.forEach((v, i) => near(v, i % 4 === 0 ? 1 : 0, 1e-12));
    expect(invMat3([1, 2, 3, 2, 4, 6, 1, 1, 1])).toBeNull();
  });
});

describe("plane calibration", () => {
  // A floor seen from standing height: far edge is short and high in the photo, near edge long and low
  const floor: Calibration = {
    image: [[0.36, 0.52], [0.66, 0.52], [1.1, 0.98], [-0.1, 0.98]],
    planeMm: [[0, 0], [4000, 0], [4000, 3000], [0, 3000]],
  };

  it("builds both directions of the mapping", () => {
    const m = planeMapping(floor)!;
    expect(m).not.toBeNull();
    const img = transformPoint(m.planeToImage, 2000, 1500)!;
    const back = imageToPlanePoint(m, img)!;
    near(back[0], 2000, 1e-6);
    near(back[1], 1500, 1e-6);
  });

  it("makes tiles smaller with distance (perspective foreshortening)", () => {
    const m = planeMapping(floor)!;
    const size = (y: number) => {
      const a = transformPoint(m.planeToImage, 1000, y)!;
      const b = transformPoint(m.planeToImage, 1600, y)!; // 600 mm along the surface
      return Math.hypot(b[0] - a[0], b[1] - a[1]);
    };
    expect(size(100)).toBeLessThan(size(1500));
    expect(size(1500)).toBeLessThan(size(2900));
  });

  it("returns null for photo points above the surface horizon", () => {
    const m = planeMapping(floor)!;
    // Far above the vanishing line of the floor the back-projection would land behind the camera
    expect(imageToPlanePoint(m, [0.5, 0.05])).toBeNull();
  });

  it("rejects a calibration whose points straddle the horizon", () => {
    const bad: Calibration = { image: [[0.4, 0.5], [0.6, 0.5], [0.9, 0.5], [0.1, 0.5]], planeMm: [[0, 0], [1000, 0], [1000, 1000], [0, 1000]] };
    expect(planeMapping(bad)).toBeNull();
  });
});

describe("polygons", () => {
  const square: Pt[] = [[0, 0], [1, 0], [1, 1], [0, 1]];
  const hole: Pt[] = [[0.25, 0.25], [0.75, 0.25], [0.75, 0.75], [0.25, 0.75]];

  it("computes areas and containment with holes", () => {
    near(ringArea(square), 1);
    near(shapeArea({ outer: square, holes: [hole] }), 0.75);
    expect(pointInShape({ outer: square, holes: [hole] }, 0.1, 0.1)).toBe(true);
    expect(pointInShape({ outer: square, holes: [hole] }, 0.5, 0.5)).toBe(false);
    expect(pointInShape({ outer: square }, 1.5, 0.5)).toBe(false);
  });

  it("gives bounds", () => {
    expect(boundsOf([[0.2, 0.9], [0.8, 0.1]])).toEqual({ minX: 0.2, minY: 0.1, maxX: 0.8, maxY: 0.9 });
  });

  it("detects convex and bow-tie quads", () => {
    expect(isConvexQuad(square)).toBe(true);
    expect(isConvexQuad([[0, 0], [1, 1], [1, 0], [0, 1]])).toBe(false);
  });

  it("simplifies a noisy ring without collapsing it", () => {
    const ring: Pt[] = [];
    for (let i = 0; i <= 100; i++) ring.push([i / 100, 0 + (i % 2) * 0.0004]);
    for (let i = 1; i <= 100; i++) ring.push([1, i / 100]);
    for (let i = 1; i <= 100; i++) ring.push([1 - i / 100, 1]);
    for (let i = 1; i < 100; i++) ring.push([0, 1 - i / 100]);
    const simple = simplifyRing(ring, 0.002);
    expect(simple.length).toBeLessThan(12);
    near(ringArea(simple), 1, 0.01);
  });
});
