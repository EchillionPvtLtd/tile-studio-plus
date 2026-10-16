import type { TileLayout } from '@/types/tile';

/**
 * Reference implementation of the tile laying patterns.
 *
 * The renderer evaluates the same maths per pixel in a fragment shader (src/components/Viewer2D/shaders.ts);
 * this TypeScript version is what the tests exercise, so a pattern bug shows up as a failing test rather than
 * as a wrong-looking floor. Keep the two in step.
 *
 * Coordinates are millimetres on the surface. A tile's "face" is the visible tile; the grout is the gap of
 * `grout` mm between neighbouring faces (half of it belongs to each tile's lattice cell).
 */

export interface PatternParams {
  kind: TileLayout;
  /** Tile size as laid, mm. For plank tiles the longer side is the length. */
  tileW: number;
  tileH: number;
  grout: number;
  /** Rotation of the whole pattern in radians (diagonal and herringbone add 45° on top of this). */
  rotation: number;
  /** Surface point where the tile grid starts, mm. */
  originX: number;
  originY: number;
}

export interface PatternSample {
  /** Position on the tile face, 0..1 across the tile's own width / height (outside 0..1 means grout). */
  u: number;
  v: number;
  /** Signed distance to the nearest tile face in mm: negative inside a tile, positive in the grout. */
  dist: number;
  /** Integer identity of the tile (for per-tile variation), and which orientation it has in a herringbone. */
  cellX: number;
  cellY: number;
  variant: 0 | 1;
}

/** Extra turn that the diagonal and herringbone layouts apply to the grid, radians. */
export function layoutRotation(kind: TileLayout): number {
  return kind === 'diagonal' || kind === 'herringbone' ? Math.PI / 4 : 0;
}

const mod = (a: number, n: number) => ((a % n) + n) % n;

/** Signed L∞ distance to an axis-aligned rectangle: negative inside. */
function rectDist(x: number, y: number, x0: number, y0: number, x1: number, y1: number): number {
  return Math.max(Math.max(x0 - x, x - x1), Math.max(y0 - y, y - y1));
}

/** Pattern-space coordinates of a surface point (what the pattern functions below take). */
export function toPatternSpace(p: PatternParams, x: number, y: number): [number, number] {
  const theta = p.rotation + layoutRotation(p.kind);
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const dx = x - p.originX;
  const dy = y - p.originY;
  return [c * dx + s * dy, -s * dx + c * dy];
}

/** Grid layouts: straight, brick (half offset), one-third offset. Also used, rotated 45°, for diagonal. */
function sampleGrid(kind: TileLayout, tw: number, th: number, g: number, qx: number, qy: number): PatternSample {
  const px = tw + g;
  const py = th + g;
  const row = Math.floor(qy / py);
  const shift = kind === 'brick' ? mod(row, 2) * 0.5 : kind === 'offset' ? mod(row, 3) / 3 : 0;
  const sx = qx - shift * px;
  const col = Math.floor(sx / px);
  const a = sx - col * px;
  const b = qy - row * py;
  const half = g / 2;
  const dist = rectDist(a, b, half, half, half + tw, half + th);
  return { u: (a - half) / tw, v: (b - half) / th, dist, cellX: col, cellY: row, variant: 0 };
}

export interface HerringboneFace {
  dist: number;
  /** Orientation: 0 = lying along x, 1 = standing along y. */
  variant: 0 | 1;
  /** Lattice translation indices of this tile. */
  ia: number;
  ib: number;
  /** Local position on the face along the tile's long and short side, 0..1. */
  along: number;
  across: number;
}

/**
 * The herringbone lattice, in units of the tile's lattice cell (face plus half the grout on each side):
 *   H tile occupies [0, Lp] × [0, Wp]; V tile occupies [Lp, Lp + Wp] × [Wp − Lp, Wp];
 *   the pattern repeats under t1 = (Lp + Wp, Wp − Lp) and t2 = (Wp, Wp)  (two tiles per cell, area 2·Lp·Wp).
 * It tiles the plane for any Lp ≥ Wp, so odd tile sizes are fine.
 */
export function herringboneFaces(g: number, longSide: number, shortSide: number, qx: number, qy: number): HerringboneFace[] {
  const Lp = longSide + g;
  const Wp = shortSide + g;
  const half = g / 2;
  const fa = (qx - qy) / (2 * Lp);
  const fb = ((Lp - Wp) * qx + (Lp + Wp) * qy) / (2 * Lp * Wp);
  const ia0 = Math.floor(fa);
  // In lattice coordinates a tile is long: the lying tile spans fb in [0, (k + 1/k) / 2] and the standing tile in
  // [-(k - 1) / (2k), (k + 1) / 2] (k = Lp / Wp), so the tiles that can contain this point start up to that far back.
  const k = Lp / Wp;
  const ibFrom = Math.floor(fb - (k + 1) / 2);
  const ibTo = Math.floor(fb) + 1;
  const faces: HerringboneFace[] = [];
  for (let ia = ia0 - 1; ia <= ia0 + 1; ia++) {
    for (let ib = ibFrom; ib <= ibTo; ib++) {
      const rx = qx - (ia * (Lp + Wp) + ib * Wp);
      const ry = qy - (ia * (Wp - Lp) + ib * Wp);
      faces.push({
        dist: rectDist(rx, ry, half, half, Lp - half, Wp - half),
        variant: 0,
        ia,
        ib,
        along: (rx - half) / longSide,
        across: (ry - half) / shortSide,
      });
      faces.push({
        dist: rectDist(rx, ry, Lp + half, Wp - Lp + half, Lp + Wp - half, Wp - half),
        variant: 1,
        ia,
        ib,
        along: (ry - (Wp - Lp) - half) / longSide,
        across: (rx - Lp - half) / shortSide,
      });
    }
  }
  return faces;
}

function sampleHerringbone(tw: number, th: number, g: number, qx: number, qy: number): PatternSample {
  const longIsWidth = tw >= th;
  const longSide = Math.max(tw, th);
  const shortSide = Math.min(tw, th);
  let best: HerringboneFace | null = null;
  for (const f of herringboneFaces(g, longSide, shortSide, qx, qy)) {
    if (!best || f.dist < best.dist) best = f;
  }
  const f = best!;
  // Map "along the long side" back onto the tile image's own width / height axes
  const u = longIsWidth ? f.along : f.across;
  const v = longIsWidth ? f.across : f.along;
  return { u, v, dist: f.dist, cellX: f.ia, cellY: f.ib, variant: f.variant };
}

/** Evaluates the pattern at pattern-space coordinates. */
export function samplePatternSpace(p: Pick<PatternParams, 'kind' | 'tileW' | 'tileH' | 'grout'>, qx: number, qy: number): PatternSample {
  return p.kind === 'herringbone' ? sampleHerringbone(p.tileW, p.tileH, p.grout, qx, qy) : sampleGrid(p.kind, p.tileW, p.tileH, p.grout, qx, qy);
}

/** Evaluates the pattern at a point on the surface (millimetres). */
export function samplePattern(p: PatternParams, x: number, y: number): PatternSample {
  const [qx, qy] = toPatternSpace(p, x, y);
  return samplePatternSpace(p, qx, qy);
}

/** Fraction of the surface covered by tile faces (the rest is grout). */
export function tileCoverage(kind: TileLayout, tw: number, th: number, g: number): number {
  if (kind === 'herringbone') {
    const L = Math.max(tw, th);
    const W = Math.min(tw, th);
    return (L * W) / ((L + g) * (W + g));
  }
  return (tw * th) / ((tw + g) * (th + g));
}
