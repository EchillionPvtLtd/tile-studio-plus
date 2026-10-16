import { centroidOf, distToSegment, isConvexQuad, pointInRing, ringArea } from './geometry';
import type { Calibration, PolygonShape, Pt, SurfaceKind } from './types';

/**
 * The editing operations of the surface editor, as pure functions on normalized outlines. Each returns new data and
 * leaves its input untouched, so the editor can undo any of them.
 */

/** Which point of which ring: `ring` is -1 for the outer outline, otherwise the index of a hole. */
export interface VertexRef {
  shape: number;
  ring: number;
  index: number;
}

export interface EdgeRef {
  shape: number;
  ring: number;
  /** The edge runs from vertex `index` to the next one. */
  index: number;
  point: Pt;
  dist: number;
}

const ringOf = (s: PolygonShape, ring: number): Pt[] => (ring < 0 ? s.outer : s.holes![ring]);

function withRing(shapes: PolygonShape[], shape: number, ring: number, next: Pt[]): PolygonShape[] {
  return shapes.map((s, i) => {
    if (i !== shape) return s;
    if (ring < 0) return { ...s, outer: next };
    return { ...s, holes: s.holes!.map((h, k) => (k === ring ? next : h)) };
  });
}

/**
 * The closest outline point within `maxDist` of `p`, if any. Distances are measured after multiplying each axis by
 * `scale`, so passing the stage's pixels-per-unit makes `maxDist` a distance in screen pixels.
 */
export function nearestVertex(shapes: PolygonShape[], p: Pt, maxDist: number, scale: [number, number] = [1, 1]): (VertexRef & { dist: number }) | null {
  let best: (VertexRef & { dist: number }) | null = null;
  shapes.forEach((s, si) => {
    for (const ring of [-1, ...(s.holes ?? []).map((_, k) => k)]) {
      ringOf(s, ring).forEach((v, index) => {
        const dist = Math.hypot((v[0] - p[0]) * scale[0], (v[1] - p[1]) * scale[1]);
        if (dist <= maxDist && (!best || dist < best.dist)) best = { shape: si, ring, index, dist };
      });
    }
  });
  return best;
}

/** The closest outline edge within `maxDist` of `p` (measured as for nearestVertex), with the nearest point on it. */
export function nearestEdge(shapes: PolygonShape[], p: Pt, maxDist: number, scale: [number, number] = [1, 1]): EdgeRef | null {
  let best: EdgeRef | null = null;
  const sc = (q: Pt): Pt => [q[0] * scale[0], q[1] * scale[1]];
  const sp = sc(p);
  shapes.forEach((s, si) => {
    for (const ring of [-1, ...(s.holes ?? []).map((_, k) => k)]) {
      const pts = ringOf(s, ring);
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % pts.length];
        const sa = sc(a);
        const sb = sc(b);
        const dist = distToSegment(sp[0], sp[1], sa, sb);
        if (dist > maxDist || (best && dist >= best.dist)) continue;
        const dx = sb[0] - sa[0];
        const dy = sb[1] - sa[1];
        const len2 = dx * dx + dy * dy;
        const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((sp[0] - sa[0]) * dx + (sp[1] - sa[1]) * dy) / len2));
        best = { shape: si, ring, index: i, point: [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])], dist };
      }
    }
  });
  return best;
}

export function moveVertex(shapes: PolygonShape[], ref: VertexRef, to: Pt): PolygonShape[] {
  const ring = ringOf(shapes[ref.shape], ref.ring);
  return withRing(shapes, ref.shape, ref.ring, ring.map((v, i) => (i === ref.index ? to : v)));
}

/** Adds a point in the middle of an edge, at `point`. */
export function insertVertex(shapes: PolygonShape[], edge: Pick<EdgeRef, 'shape' | 'ring' | 'index'>, point: Pt): PolygonShape[] {
  const ring = ringOf(shapes[edge.shape], edge.ring);
  const next = [...ring.slice(0, edge.index + 1), point, ...ring.slice(edge.index + 1)];
  return withRing(shapes, edge.shape, edge.ring, next);
}

/**
 * Removes a point. An outline needs at least three, so removing from a triangle removes the whole outline (or hole).
 */
export function deleteVertex(shapes: PolygonShape[], ref: VertexRef): PolygonShape[] {
  const ring = ringOf(shapes[ref.shape], ref.ring);
  if (ring.length > 3) return withRing(shapes, ref.shape, ref.ring, ring.filter((_, i) => i !== ref.index));
  if (ref.ring < 0) return shapes.filter((_, i) => i !== ref.shape);
  return shapes.map((s, i) => (i === ref.shape ? { ...s, holes: s.holes!.filter((_, k) => k !== ref.ring) } : s));
}

export const addShape = (shapes: PolygonShape[], outer: Pt[]): PolygonShape[] => [...shapes, { outer }];

/** Cuts a hole into the outline that contains it (the smallest one, when outlines are nested). */
export function addHole(shapes: PolygonShape[], hole: Pt[]): PolygonShape[] | null {
  const c = centroidOf(hole);
  let owner = -1;
  let ownerArea = Infinity;
  shapes.forEach((s, i) => {
    const a = ringArea(s.outer);
    if (a < ownerArea && pointInRing(s.outer, c[0], c[1])) {
      owner = i;
      ownerArea = a;
    }
  });
  if (owner < 0) return null;
  return shapes.map((s, i) => (i === owner ? { ...s, holes: [...(s.holes ?? []), hole] } : s));
}

export function translateShapes(shapes: PolygonShape[], dx: number, dy: number): PolygonShape[] {
  const mv = (r: Pt[]): Pt[] => r.map(([x, y]) => [x + dx, y + dy]);
  return shapes.map((s) => ({ outer: mv(s.outer), holes: s.holes?.map(mv) }));
}

/** True when an outline crosses itself, which makes it ambiguous which side is inside. */
export function ringSelfIntersects(ring: Pt[]): boolean {
  const n = ring.length;
  const ccw = (a: Pt, b: Pt, c: Pt) => (c[1] - a[1]) * (b[0] - a[0]) > (b[1] - a[1]) * (c[0] - a[0]);
  const crosses = (a: Pt, b: Pt, c: Pt, d: Pt) => ccw(a, c, d) !== ccw(b, c, d) && ccw(a, b, c) !== ccw(a, b, d);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      // Neighbouring edges share a point
      if (j === i + 1 || (i === 0 && j === n - 1)) continue;
      if (crosses(ring[i], ring[(i + 1) % n], ring[j], ring[(j + 1) % n])) return true;
    }
  }
  return false;
}

/** A usable outline: at least three points, some area, and no crossing edges. */
export function ringProblem(ring: Pt[]): string | null {
  if (ring.length < 3) return 'An outline needs at least three points.';
  // A figure-of-eight has no net area, so the crossing is the real problem to report
  if (ringSelfIntersects(ring)) return 'The outline crosses itself. Move its points so the lines do not cross.';
  if (ringArea(ring) < 1e-5) return 'That outline is too small to be a surface.';
  return null;
}

// ── Perspective ─────────────────────────────────────────────────────────────

function convexHull(points: Pt[]): Pt[] {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return pts;
  const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Pt[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Pt[] = [];
  for (const p of [...pts].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/** Orders four points clockwise on screen starting from the top-left one: top-left, top-right, bottom-right, bottom-left. */
export function orderQuad(q: Pt[]): [Pt, Pt, Pt, Pt] {
  const c = centroidOf(q);
  const sorted = [...q].sort((a, b) => Math.atan2(a[1] - c[1], a[0] - c[0]) - Math.atan2(b[1] - c[1], b[0] - c[0])); // clockwise on screen (y down)
  let start = 0;
  sorted.forEach((p, i) => {
    if (p[0] + p[1] < sorted[start][0] + sorted[start][1]) start = i;
  });
  return [0, 1, 2, 3].map((k) => sorted[(start + k) % 4]) as [Pt, Pt, Pt, Pt];
}

/** The largest convex quadrilateral among the outline's extreme points. */
export function bestQuad(shapes: PolygonShape[]): [Pt, Pt, Pt, Pt] | null {
  const points = shapes.flatMap((s) => s.outer);
  if (points.length < 4) return null;
  let hull = convexHull(points);
  if (hull.length > 32) hull = hull.filter((_, i) => i % Math.ceil(hull.length / 32) === 0);
  if (hull.length < 4) return null;
  let best: { area: number; quad: Pt[] } | null = null;
  const n = hull.length;
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) for (let c = b + 1; c < n; c++) for (let d = c + 1; d < n; d++) {
    const area = ringArea([hull[a], hull[b], hull[c], hull[d]]);
    if (!best || area > best.area) best = { area, quad: [hull[a], hull[b], hull[c], hull[d]] };
  }
  return best && best.area > 1e-4 ? orderQuad(best.quad) : null;
}

/**
 * The surface's own coordinates for the four corners, as a rectangle `widthMm` × `heightMm`. Floors and other flat
 * surfaces are measured away from the first corner (y down, like the photo); walls are measured up from the floor.
 */
export function planeRect(kind: SurfaceKind, widthMm: number, heightMm: number): [Pt, Pt, Pt, Pt] {
  const w = widthMm;
  const h = heightMm;
  return kind === 'wall' || kind === 'backsplash'
    ? [[0, h], [w, h], [w, 0], [0, 0]]
    : [[0, 0], [w, 0], [w, h], [0, h]];
}

/** A first guess at a surface's perspective from its outline: the outline's corners, taken to be a rectangle of a typical size. */
export function guessCalibration(shapes: PolygonShape[], kind: SurfaceKind): Calibration | null {
  const quad = bestQuad(shapes);
  if (!quad || !isConvexQuad(quad)) return null;
  const [w, h] = kind === 'wall' ? [4000, 2700] : kind === 'backsplash' ? [3000, 600] : kind === 'countertop' ? [2400, 600] : [4000, 3000];
  return { image: quad, planeMm: planeRect(kind, w, h) };
}

/** The measured rectangle's size (mm), read back from a calibration. */
export function calibrationSize(c: Calibration): { width: number; height: number } {
  const [a, b, , d] = c.planeMm;
  return { width: Math.round(Math.hypot(b[0] - a[0], b[1] - a[1])), height: Math.round(Math.hypot(d[0] - a[0], d[1] - a[1])) };
}

/** The same four photo corners, now said to be a rectangle of the given size. */
export function withCalibrationSize(c: Calibration, kind: SurfaceKind, widthMm: number, heightMm: number): Calibration {
  return { image: c.image, planeMm: planeRect(kind, widthMm, heightMm) };
}
