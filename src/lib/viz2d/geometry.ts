import type { Calibration, Pt, PolygonShape } from './types';

/** 3×3 matrix, row-major: [m00, m01, m02, m10, m11, m12, m20, m21, m22]. */
export type Mat3 = number[];

export const IDENTITY: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

export function mulMat3(a: Mat3, b: Mat3): Mat3 {
  const out = new Array<number>(9).fill(0);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      out[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
    }
  }
  return out;
}

export function invMat3(m: Mat3): Mat3 | null {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-14) return null;
  const k = 1 / det;
  return [A * k, -(b * i - c * h) * k, (b * f - c * e) * k, B * k, (a * i - c * g) * k, -(a * f - c * d) * k, C * k, -(a * h - b * g) * k, (a * e - b * d) * k];
}

/** Applies a homography to a point. Returns null for a point at (or behind) the horizon. */
export function transformPoint(m: Mat3, x: number, y: number): Pt | null {
  const w = m[6] * x + m[7] * y + m[8];
  if (!Number.isFinite(w) || Math.abs(w) < 1e-12) return null;
  return [(m[0] * x + m[1] * y + m[2]) / w, (m[3] * x + m[4] * y + m[5]) / w];
}

/** The w of the projective transform, whose sign tells whether the point is in front of the camera. */
export function projectiveW(m: Mat3, x: number, y: number): number {
  return m[6] * x + m[7] * y + m[8];
}

/** Hartley normalisation: centroid at the origin, mean distance √2. Keeps the 8×8 solve well conditioned. */
function normalisation(pts: Pt[]): Mat3 {
  let cx = 0;
  let cy = 0;
  for (const [x, y] of pts) {
    cx += x;
    cy += y;
  }
  cx /= pts.length;
  cy /= pts.length;
  let mean = 0;
  for (const [x, y] of pts) mean += Math.hypot(x - cx, y - cy);
  mean /= pts.length;
  const s = mean > 1e-12 ? Math.SQRT2 / mean : 1;
  return [s, 0, -s * cx, 0, s, -s * cy, 0, 0, 1];
}

/** Gauss-Jordan elimination with partial pivoting for an n×n system. Returns null when singular. */
function solveLinear(a: number[][], b: number[]): number[] | null {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r;
    if (Math.abs(m[pivot][col]) < 1e-11) return null;
    [m[col], m[pivot]] = [m[pivot], m[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = m[r][col] / m[col][col];
      if (f === 0) continue;
      for (let c = col; c <= n; c++) m[r][c] -= f * m[col][c];
    }
  }
  return m.map((row, i) => row[n] / row[i]);
}

/**
 * Homography H with H·src = dst (projective), from four or more point pairs (exactly four give an exact fit).
 * Returns null for a degenerate set (three points in a line, repeated points).
 */
export function solveHomography(src: Pt[], dst: Pt[]): Mat3 | null {
  if (src.length < 4 || src.length !== dst.length) return null;
  const Ts = normalisation(src);
  const Td = normalisation(dst);
  const n = src.length;
  const s = src.map(([x, y]) => transformPoint(Ts, x, y)!);
  const d = dst.map(([x, y]) => transformPoint(Td, x, y)!);

  // Normal equations (AᵀA) h = Aᵀb for the 8 unknowns, which also covers the over-determined case.
  const AtA = Array.from({ length: 8 }, () => new Array<number>(8).fill(0));
  const Atb = new Array<number>(8).fill(0);
  const accumulate = (row: number[], rhs: number) => {
    for (let i = 0; i < 8; i++) {
      Atb[i] += row[i] * rhs;
      for (let j = 0; j < 8; j++) AtA[i][j] += row[i] * row[j];
    }
  };
  for (let k = 0; k < n; k++) {
    const [x, y] = s[k];
    const [u, v] = d[k];
    accumulate([x, y, 1, 0, 0, 0, -u * x, -u * y], u);
    accumulate([0, 0, 0, x, y, 1, -v * x, -v * y], v);
  }
  const h = solveLinear(AtA, Atb);
  if (!h) return null;
  const Hn: Mat3 = [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
  const TdInv = invMat3(Td);
  if (!TdInv) return null;
  const H = mulMat3(mulMat3(TdInv, Hn), Ts);
  // Fix the scale so the last element is 1 (when it is not ~0)
  const k = Math.abs(H[8]) > 1e-12 ? 1 / H[8] : 1;
  const out = H.map((v) => v * k);
  return out.every(Number.isFinite) ? out : null;
}

export interface PlaneMapping {
  /** Millimetres on the surface → normalized photo coordinates. */
  planeToImage: Mat3;
  /** Normalized photo coordinates → millimetres on the surface. */
  imageToPlane: Mat3;
  /** Sign of the perspective divide for photo points that really see the surface (the other sign is "behind the camera"). */
  frontSign: 1 | -1;
}

/** The perspective mapping of a calibrated surface, or null when the four points do not describe a plane. */
export function planeMapping(c: Calibration): PlaneMapping | null {
  const planeToImage = solveHomography(c.planeMm as Pt[], c.image as Pt[]);
  if (!planeToImage) return null;
  const imageToPlane = invMat3(planeToImage);
  if (!imageToPlane) return null;
  // All four calibration points must be on the same side of the horizon, otherwise the mapping folds over
  const signs = c.planeMm.map(([x, y]) => Math.sign(projectiveW(planeToImage, x, y)));
  if (!signs.every((sg) => sg === signs[0] && sg !== 0)) return null;
  const frontSign = Math.sign(projectiveW(imageToPlane, c.image[0][0], c.image[0][1]));
  if (frontSign === 0) return null;
  return { planeToImage, imageToPlane, frontSign: frontSign > 0 ? 1 : -1 };
}

/** Converts a point in the photo to millimetres on the surface; null when the photo point is above that surface's horizon. */
export function imageToPlanePoint(map: PlaneMapping, p: Pt): Pt | null {
  const w = projectiveW(map.imageToPlane, p[0], p[1]);
  if (Math.sign(w) !== map.frontSign) return null;
  return transformPoint(map.imageToPlane, p[0], p[1]);
}

// ── Polygons ────────────────────────────────────────────────────────────────

/** Signed area of a ring (shoelace). Positive for counter-clockwise rings in a y-up system, negative in y-down. */
export function signedArea(ring: Pt[]): number {
  let a = 0;
  for (let i = 0, n = ring.length; i < n; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % n];
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}

export const ringArea = (ring: Pt[]) => Math.abs(signedArea(ring));

/** Even-odd point-in-ring test. */
export function pointInRing(ring: Pt[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Point inside the outer ring and outside every hole. */
export function pointInShape(shape: PolygonShape, x: number, y: number): boolean {
  if (!pointInRing(shape.outer, x, y)) return false;
  return !(shape.holes ?? []).some((h) => pointInRing(h, x, y));
}

export function shapeArea(shape: PolygonShape): number {
  return ringArea(shape.outer) - (shape.holes ?? []).reduce((s, h) => s + ringArea(h), 0);
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function boundsOf(points: Pt[]): Bounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

export function centroidOf(points: Pt[]): Pt {
  let x = 0;
  let y = 0;
  for (const p of points) {
    x += p[0];
    y += p[1];
  }
  return [x / (points.length || 1), y / (points.length || 1)];
}

/** Distance from a point to a segment. */
export function distToSegment(px: number, py: number, a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / len2));
  return Math.hypot(px - (a[0] + t * dx), py - (a[1] + t * dy));
}

/** Ramer-Douglas-Peucker simplification of an open polyline. */
function rdp(points: Pt[], tolerance: number): Pt[] {
  if (points.length < 3) return points.slice();
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop()!;
    let maxD = 0;
    let idx = -1;
    for (let i = s + 1; i < e; i++) {
      const d = distToSegment(points[i][0], points[i][1], points[s], points[e]);
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (idx >= 0 && maxD > tolerance) {
      keep[idx] = 1;
      stack.push([s, idx], [idx, e]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

/** Simplifies a closed ring: splits it at its two farthest-apart vertices, so the result never collapses. */
export function simplifyRing(ring: Pt[], tolerance: number): Pt[] {
  if (ring.length <= 4) return ring.slice();
  let a = 0;
  let b = 0;
  let best = -1;
  // Anchor on the vertex farthest from vertex 0, then on the one farthest from that
  for (let i = 1; i < ring.length; i++) {
    const d = Math.hypot(ring[i][0] - ring[0][0], ring[i][1] - ring[0][1]);
    if (d > best) {
      best = d;
      b = i;
    }
  }
  best = -1;
  for (let i = 0; i < ring.length; i++) {
    const d = Math.hypot(ring[i][0] - ring[b][0], ring[i][1] - ring[b][1]);
    if (d > best) {
      best = d;
      a = i;
    }
  }
  const [s, e] = a < b ? [a, b] : [b, a];
  const first = ring.slice(s, e + 1);
  const second = [...ring.slice(e), ...ring.slice(0, s + 1)];
  const merged = [...rdp(first, tolerance).slice(0, -1), ...rdp(second, tolerance).slice(0, -1)];
  return merged.length >= 3 ? merged : ring.slice();
}

/** Counts how far an edge of a quad is from being straight, for sanity checks of user-drawn calibration quads. */
export function isConvexQuad(q: Pt[]): boolean {
  if (q.length !== 4) return false;
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i];
    const b = q[(i + 1) % 4];
    const c = q[(i + 2) % 4];
    const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (Math.abs(cross) < 1e-9) return false;
    const s = Math.sign(cross);
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const clamp01 = (v: number) => clamp(v, 0, 1);

/** Square millimetres → square feet. */
export const MM2_PER_SQFT = 92903.04;
