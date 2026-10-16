import { boundsOf, pointInRing, ringArea, simplifyRing } from './geometry';
import type { PolygonShape, Pt } from './types';

/**
 * Pixel-level helpers for masks. Everything here works on plain typed arrays, so it runs the same in the
 * browser, in a worker and in the tests. One mask is `Uint8Array(width * height)`: 0 = not the surface,
 * 255 = fully the surface, in between = the soft anti-aliased edge.
 */

/**
 * Turns independent per-surface coverage into masks that never claim the same pixel twice.
 *
 * Where surfaces only touch (a floor meeting a wall) coverage already adds up to at most 1 and is kept exactly,
 * so the seam between them stays seamless. Where they genuinely overlap, the surface with the higher priority
 * wins, so a click and the render agree on what is in front.
 *
 * `occluder` (furniture, plants) is removed from every surface first.
 */
export function resolveExclusive(coverage: Uint8Array[], priorities: number[], occluder?: Uint8Array | null): Uint8Array[] {
  const n = coverage.length;
  const size = n ? coverage[0].length : 0;
  const out = coverage.map(() => new Uint8Array(size));
  // Highest priority first (stable for equal priorities, so the later surface in the list is "in front")
  const order = coverage.map((_, i) => i).sort((a, b) => priorities[b] - priorities[a] || b - a);
  const c = new Float32Array(n);
  for (let px = 0; px < size; px++) {
    const keep = occluder ? 1 - occluder[px] / 255 : 1;
    let sum = 0;
    for (let i = 0; i < n; i++) {
      c[i] = (coverage[i][px] / 255) * keep;
      sum += c[i];
    }
    if (sum <= 0) continue;
    if (sum <= 1.0001) {
      for (let i = 0; i < n; i++) out[i][px] = Math.round(c[i] * 255);
      continue;
    }
    // Overlap: walk from the front, each surface takes what the ones in front left uncovered
    let remaining = 1;
    let taken = 0;
    const eff = new Float32Array(n);
    for (const i of order) {
      eff[i] = c[i] * remaining;
      remaining *= 1 - c[i];
      taken += eff[i];
    }
    if (taken <= 0) continue;
    // Together they cover the union of the surfaces, which here is the full pixel
    const scale = 1 / taken;
    for (let i = 0; i < n; i++) out[i][px] = Math.round(Math.min(1, eff[i] * scale) * 255);
  }
  return out;
}

/** For each pixel, the index (+1) of the surface that most owns it, or 0 where no surface reaches `threshold`. */
export function buildLabelMap(masks: Uint8Array[], priorities: number[], threshold = 110): Uint8Array {
  const size = masks.length ? masks[0].length : 0;
  const labels = new Uint8Array(size);
  for (let px = 0; px < size; px++) {
    let best = 0;
    let bestA = threshold - 1;
    let bestP = -Infinity;
    for (let i = 0; i < masks.length; i++) {
      const a = masks[i][px];
      if (a > bestA || (a === bestA && a >= threshold && priorities[i] > bestP)) {
        best = i + 1;
        bestA = a;
        bestP = priorities[i];
      }
    }
    labels[px] = best;
  }
  return labels;
}

/** Averages `factor × factor` blocks: a cheap, alias-free downscale for working copies of images and masks. */
export function downsampleMask(mask: Uint8Array, width: number, height: number, factor: number): { data: Uint8Array; width: number; height: number } {
  if (factor <= 1) return { data: mask, width, height };
  const w = Math.max(1, Math.floor(width / factor));
  const h = Math.max(1, Math.floor(height / factor));
  const data = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      let count = 0;
      for (let dy = 0; dy < factor; dy++) {
        const row = (y * factor + dy) * width;
        for (let dx = 0; dx < factor; dx++) {
          sum += mask[row + x * factor + dx];
          count++;
        }
      }
      data[y * w + x] = Math.round(sum / count);
    }
  }
  return { data, width: w, height: h };
}

// ── Contours ────────────────────────────────────────────────────────────────

const key = (x: number, y: number, w: number) => y * (w + 1) + x;

/**
 * Outlines of every region of a binary mask, as closed rings of pixel-corner coordinates.
 * Walks the cracks between inside and outside pixels, so a region and its holes come out as separate rings:
 * outer rings are clockwise on screen (y down), holes counter-clockwise. Pixels that only touch diagonally
 * are treated as separate regions.
 */
export function traceContours(binary: Uint8Array, width: number, height: number): Pt[][] {
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height && binary[y * width + x] !== 0;
  // Directed crack edges with the region on the right-hand side (screen coordinates, y down)
  const next = new Map<number, number[]>();
  const addEdge = (x0: number, y0: number, x1: number, y1: number) => {
    const k = key(x0, y0, width);
    const list = next.get(k);
    const entry = key(x1, y1, width);
    if (list) list.push(entry);
    else next.set(k, [entry]);
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!inside(x, y)) continue;
      if (!inside(x, y - 1)) addEdge(x, y, x + 1, y); // top, heading right
      if (!inside(x + 1, y)) addEdge(x + 1, y, x + 1, y + 1); // right, heading down
      if (!inside(x, y + 1)) addEdge(x + 1, y + 1, x, y + 1); // bottom, heading left
      if (!inside(x - 1, y)) addEdge(x, y + 1, x, y); // left, heading up
    }
  }
  const rings: Pt[][] = [];
  const stride = width + 1;
  while (next.size) {
    const startKey = next.keys().next().value as number;
    const ring: Pt[] = [];
    let cur = startKey;
    let prevDir = -1;
    for (let guard = 0; guard < 4_000_000; guard++) {
      const list = next.get(cur);
      if (!list || list.length === 0) break;
      const cx = cur % stride;
      const cy = Math.floor(cur / stride);
      // At a pinch point two edges leave: take the one turning furthest right, which keeps diagonal pixels apart
      let pick = 0;
      if (list.length > 1) {
        let bestTurn = -Infinity;
        list.forEach((cand, idx) => {
          const dx = (cand % stride) - cx;
          const dy = Math.floor(cand / stride) - cy;
          const dir = dx === 1 ? 0 : dy === 1 ? 1 : dx === -1 ? 2 : 3; // right, down, left, up
          const turn = prevDir < 0 ? 0 : ((dir - prevDir + 4) % 4 === 1 ? 2 : (dir - prevDir + 4) % 4 === 0 ? 1 : (dir - prevDir + 4) % 4 === 3 ? 0 : -1);
          if (turn > bestTurn) {
            bestTurn = turn;
            pick = idx;
          }
        });
      }
      const to = list[pick];
      list.splice(pick, 1);
      if (list.length === 0) next.delete(cur);
      ring.push([cx, cy]);
      const dx = (to % stride) - cx;
      const dy = Math.floor(to / stride) - cy;
      prevDir = dx === 1 ? 0 : dy === 1 ? 1 : dx === -1 ? 2 : 3;
      cur = to;
      if (cur === startKey) break;
    }
    if (ring.length >= 4) rings.push(ring);
  }
  return rings;
}

/** Signed area in screen coordinates, positive when the ring runs clockwise on screen (y down). */
const screenArea = (ring: Pt[]) => {
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
};

/**
 * Editable polygon outlines for a mask: simplified, in normalized coordinates, with holes attached to the
 * outline that contains them. `tolerancePx` is how far (in pixels of this mask) the outline may stray.
 */
export function maskToShapes(binary: Uint8Array, width: number, height: number, tolerancePx = 1.2, minAreaPx = 24): PolygonShape[] {
  const rings = traceContours(binary, width, height);
  const outers: Pt[][] = [];
  const holes: Pt[][] = [];
  for (const ring of rings) {
    if (ringArea(ring) < minAreaPx) continue;
    const simple = simplifyRing(ring, tolerancePx);
    if (simple.length < 3) continue;
    (screenArea(ring) > 0 ? outers : holes).push(simple);
  }
  const norm = (ring: Pt[]): Pt[] => ring.map(([x, y]) => [x / width, y / height]);
  const shapes: PolygonShape[] = outers.map((o) => ({ outer: norm(o) }));
  for (const hole of holes) {
    const probe = hole[0];
    const px = probe[0] / width;
    const py = probe[1] / height;
    // The smallest outline that contains the hole owns it
    let owner: PolygonShape | null = null;
    let ownerArea = Infinity;
    for (const s of shapes) {
      const a = ringArea(s.outer);
      if (a < ownerArea && pointInRing(s.outer, px, py)) {
        owner = s;
        ownerArea = a;
      }
    }
    if (owner) (owner.holes ??= []).push(norm(hole));
  }
  return shapes;
}

// ── Morphology ──────────────────────────────────────────────────────────────

/** Square dilation by `r` pixels, separable. */
export function dilate(mask: Uint8Array, width: number, height: number, r: number): Uint8Array {
  if (r <= 0) return mask.slice();
  const tmp = new Uint8Array(mask.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let v = 0;
      for (let k = Math.max(0, x - r); k <= Math.min(width - 1, x + r) && !v; k++) v = mask[y * width + k];
      tmp[y * width + x] = v;
    }
  }
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let v = 0;
      for (let k = Math.max(0, y - r); k <= Math.min(height - 1, y + r) && !v; k++) v = tmp[k * width + x];
      out[y * width + x] = v;
    }
  }
  return out;
}

export function erode(mask: Uint8Array, width: number, height: number, r: number): Uint8Array {
  const inv = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i++) inv[i] = mask[i] ? 0 : 1;
  const grown = dilate(inv, width, height, r);
  const out = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i++) out[i] = grown[i] ? 0 : 1;
  // Pixels outside the frame count as "inside" so a region touching the border is not eaten from that side
  return out;
}

/** Closes small gaps and specks: dilate then erode. */
export function closeMask(mask: Uint8Array, width: number, height: number, r: number): Uint8Array {
  return erode(dilate(mask, width, height, r), width, height, r);
}

/** Drops regions smaller than `minPixels`, and fills holes smaller than that too. */
export function removeSpecks(mask: Uint8Array, width: number, height: number, minPixels: number): Uint8Array {
  const out = mask.slice();
  const seen = new Uint8Array(mask.length);
  const stack: number[] = [];
  for (const target of [1, 0] as const) {
    seen.fill(0);
    for (let start = 0; start < out.length; start++) {
      if (seen[start] || (out[start] ? 1 : 0) !== target) continue;
      const region: number[] = [];
      stack.push(start);
      seen[start] = 1;
      let touchesBorder = false;
      while (stack.length) {
        const p = stack.pop()!;
        region.push(p);
        const x = p % width;
        const y = (p - x) / width;
        if (x === 0 || y === 0 || x === width - 1 || y === height - 1) touchesBorder = true;
        for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const q = ny * width + nx;
          if (!seen[q] && (out[q] ? 1 : 0) === target) {
            seen[q] = 1;
            stack.push(q);
          }
        }
      }
      // Background touching the frame is the outside, not a hole
      if (region.length < minPixels && !(target === 0 && touchesBorder)) for (const p of region) out[p] = target ? 0 : 1;
    }
  }
  return out;
}

// ── Smart select ────────────────────────────────────────────────────────────

export interface GrowOptions {
  /** How different from the region's average colour a pixel may be (0..255 per channel, Euclidean in RGB). */
  tolerance: number;
  /** Strong edges (0..255, Sobel on luminance) stop the region, which keeps it inside a wall's boundary. */
  edgeStop: number;
  maxPixels?: number;
}

/**
 * Magic-wand region growing for photos: floods outward from a seed pixel over similar colour, but never across a strong
 * edge, and keeps updating the region's average colour so soft lighting gradients on a wall do not break it.
 * Returns a 0/1 mask. This is an assistant for drawing outlines, not a replacement for checking them.
 */
export function growRegion(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number, seedX: number, seedY: number, opts: GrowOptions): Uint8Array {
  const n = width * height;
  const lum = new Float32Array(n);
  for (let i = 0; i < n; i++) lum[i] = 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2];
  const edge = new Float32Array(n);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const gx = lum[i - width + 1] + 2 * lum[i + 1] + lum[i + width + 1] - lum[i - width - 1] - 2 * lum[i - 1] - lum[i + width - 1];
      const gy = lum[i + width - 1] + 2 * lum[i + width] + lum[i + width + 1] - lum[i - width - 1] - 2 * lum[i - width] - lum[i - width + 1];
      edge[i] = Math.hypot(gx, gy) / 4;
    }
  }
  const out = new Uint8Array(n);
  const sx = Math.max(0, Math.min(width - 1, Math.round(seedX)));
  const sy = Math.max(0, Math.min(height - 1, Math.round(seedY)));
  const seed = sy * width + sx;
  // Seed colour: average of a small neighbourhood so one noisy pixel does not decide the whole selection
  let mr = 0;
  let mg = 0;
  let mb = 0;
  let cnt = 0;
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const x = sx + dx;
      const y = sy + dy;
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      const i = (y * width + x) * 4;
      mr += rgba[i];
      mg += rgba[i + 1];
      mb += rgba[i + 2];
      cnt++;
    }
  }
  mr /= cnt;
  mg /= cnt;
  mb /= cnt;
  const stack = [seed];
  out[seed] = 1;
  let count = 1;
  const maxPixels = opts.maxPixels ?? n;
  const tol2 = opts.tolerance * opts.tolerance;
  while (stack.length && count < maxPixels) {
    const p = stack.pop()!;
    const x = p % width;
    const y = (p - x) / width;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const q = ny * width + nx;
      if (out[q]) continue;
      if (edge[q] > opts.edgeStop) continue;
      const i = q * 4;
      const dr = rgba[i] - mr;
      const dg = rgba[i + 1] - mg;
      const db = rgba[i + 2] - mb;
      if (dr * dr + dg * dg + db * db > tol2) continue;
      out[q] = 1;
      count++;
      // Drift the reference colour slowly so a gentle shading gradient is followed
      const a = 1 / (count + 20);
      mr += (rgba[i] - mr) * a;
      mg += (rgba[i + 1] - mg) * a;
      mb += (rgba[i + 2] - mb) * a;
      stack.push(q);
    }
  }
  return out;
}

/** Bounding box (in pixels) of the non-zero part of a mask, or null when it is empty. */
export function maskBounds(mask: Uint8Array, width: number, height: number, threshold = 1): { x0: number; y0: number; x1: number; y1: number } | null {
  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (mask[y * width + x] >= threshold) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}

export { boundsOf };
