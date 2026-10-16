/**
 * Separates a photo's lighting from the surface it falls on, so a new tile can be lit the way the old floor was.
 *
 * The photo shows (surface colour) × (light). We only want the light: soft gradients across the floor, the sun
 * patch from a window, the dark band under a sofa. Fine texture (old tile joints, grain) must NOT be carried over,
 * and neither may the old colour. An edge-preserving blur keeps broad light and sharp shadow edges while removing
 * texture; dividing by the surface's typical brightness removes the old colour and leaves a multiplier that is
 * 1.0 where the surface was "normally lit".
 */

const SRGB_TO_LINEAR = (() => {
  const lut = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const c = i / 255;
    lut[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }
  return lut;
})();

/** Linear-light luminance of an RGBA8 image, one float per pixel. */
export function linearLuminance(rgba: Uint8ClampedArray | Uint8Array, count: number): Float32Array {
  const out = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    out[i] = 0.2126 * SRGB_TO_LINEAR[rgba[i * 4]] + 0.7152 * SRGB_TO_LINEAR[rgba[i * 4 + 1]] + 0.0722 * SRGB_TO_LINEAR[rgba[i * 4 + 2]];
  }
  return out;
}

/** Mean over a (2r+1)² window, clamped at the borders, via running sums (O(pixels) whatever the radius). */
export function boxFilter(src: Float32Array, width: number, height: number, r: number): Float32Array {
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  const run = new Float64Array(Math.max(width, height) + 1);
  // Horizontal pass
  for (let y = 0; y < height; y++) {
    const row = y * width;
    run[0] = 0;
    for (let x = 0; x < width; x++) run[x + 1] = run[x] + src[row + x];
    for (let x = 0; x < width; x++) {
      const lo = Math.max(0, x - r);
      const hi = Math.min(width - 1, x + r);
      tmp[row + x] = (run[hi + 1] - run[lo]) / (hi - lo + 1);
    }
  }
  // Vertical pass
  for (let x = 0; x < width; x++) {
    run[0] = 0;
    for (let y = 0; y < height; y++) run[y + 1] = run[y] + tmp[y * width + x];
    for (let y = 0; y < height; y++) {
      const lo = Math.max(0, y - r);
      const hi = Math.min(height - 1, y + r);
      out[y * width + x] = (run[hi + 1] - run[lo]) / (hi - lo + 1);
    }
  }
  return out;
}

/**
 * Self-guided, mask-weighted guided filter (He et al.). Smooths where the image is flat or only slightly textured
 * (variance below `eps`) and leaves strong edges alone. Pixels with zero weight do not influence the result.
 * Returns NaN for pixels with no weighted neighbour inside the window.
 */
export function guidedFilter(image: Float32Array, weight: Float32Array, width: number, height: number, r: number, eps: number): Float32Array {
  const n = image.length;
  const wI = new Float32Array(n);
  const wII = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const w = weight[i];
    wI[i] = w * image[i];
    wII[i] = w * image[i] * image[i];
  }
  const bW = boxFilter(weight, width, height, r);
  const bI = boxFilter(wI, width, height, r);
  const bII = boxFilter(wII, width, height, r);
  const a = new Float32Array(n);
  const b = new Float32Array(n);
  const wa = new Float32Array(n);
  const wb = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    if (bW[i] < 1e-6) continue;
    const mean = bI[i] / bW[i];
    const variance = Math.max(0, bII[i] / bW[i] - mean * mean);
    const ai = variance / (variance + eps);
    a[i] = ai;
    b[i] = mean - ai * mean;
    wa[i] = weight[i] * ai;
    wb[i] = weight[i] * b[i];
  }
  const bA = boxFilter(wa, width, height, r);
  const bB = boxFilter(wb, width, height, r);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = bW[i] < 1e-6 ? NaN : (bA[i] / bW[i]) * image[i] + bB[i] / bW[i];
  return out;
}

/** k-th smallest element (0-based) by quickselect; reorders `a`. */
function quickselect(a: Float32Array, k: number): number {
  let lo = 0;
  let hi = a.length - 1;
  while (lo < hi) {
    const pivot = a[(lo + hi) >> 1];
    let i = lo;
    let j = hi;
    while (i <= j) {
      while (a[i] < pivot) i++;
      while (a[j] > pivot) j--;
      if (i <= j) {
        const t = a[i];
        a[i] = a[j];
        a[j] = t;
        i++;
        j--;
      }
    }
    if (k <= j) hi = j;
    else if (k >= i) lo = i;
    else break;
  }
  return a[k];
}

/**
 * The p-quantile (0..1; 0.5 is the median) of the values where weight is high, exact. Non-positive values are ignored.
 * Returns 1 when there are none.
 */
export function weightedPercentile(values: Float32Array, weight: Float32Array, p = 0.5, minWeight = 0.9): number {
  let count = 0;
  for (let i = 0; i < values.length; i++) if (weight[i] >= minWeight && values[i] > 0) count++;
  if (count === 0) return 1;
  const picked = new Float32Array(count);
  let n = 0;
  for (let i = 0; i < values.length; i++) if (weight[i] >= minWeight && values[i] > 0) picked[n++] = values[i];
  return quickselect(picked, Math.min(count - 1, Math.floor(count * Math.min(1, Math.max(0, p)))));
}

/** Exact median of the values where weight is high. */
export const weightedMedian = (values: Float32Array, weight: Float32Array, minWeight = 0.9) => weightedPercentile(values, weight, 0.5, minWeight);

/** See LightingInput.reference. */
export const REFERENCE_PERCENTILE = 0.7;

export interface LightingInput {
  /** The photo at working resolution, RGBA8. */
  rgba: Uint8ClampedArray | Uint8Array;
  width: number;
  height: number;
  /** One 0..255 mask per surface at the same resolution. */
  masks: Uint8Array[];
  /** Filter radius in pixels. */
  radius?: number;
  /** Edge preservation in log-brightness: steps whose variance exceeds this are kept (a 2:1 shadow edge is ~0.1). */
  eps?: number;
  /** How many times the filter is applied; more removes more texture. */
  passes?: number;
  /**
   * Which brightness counts as "1.0": this share of a surface's pixels is darker. Below the middle the brightest parts of a
   * surface would clip on a pale tile; 0.7 keeps most of the surface at or below 1 and sun patches only a little above.
   */
  reference?: number;
}

/**
 * The light on every surface, as a multiplier: 1.0 where the surface was typically lit, below 1 in shade, above 1 in
 * the sun. Pixels that are not on any surface are 1.0. Each surface is normalised on its own, so a dark brown floor and
 * a white wall both come out centred on 1.
 *
 * Works in log-brightness: old tile joints or wood grain change brightness by a roughly constant *fraction* on any
 * surface, while a shadow is a much bigger fraction, so one threshold separates them whatever the surface colour.
 */
export function computeLightingMap(input: LightingInput): Float32Array {
  const { rgba, width, height, masks } = input;
  const n = width * height;
  const radius = input.radius ?? Math.max(2, Math.round(Math.max(width, height) * 0.006));
  const eps = input.eps ?? 0.03;
  const passes = input.passes ?? 2;
  const lum = linearLuminance(rgba, n);
  const logLum = new Float32Array(n);
  for (let i = 0; i < n; i++) logLum[i] = Math.log(lum[i] + 0.004);
  const out = new Float32Array(n).fill(1);
  const owner = new Uint8Array(n); // strongest mask value that wrote each pixel

  for (const mask of masks) {
    // Work on the surface's own bounding box only, so many small surfaces cost no more than one big one
    let x0 = width;
    let y0 = height;
    let x1 = -1;
    let y1 = -1;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (mask[y * width + x] > 8) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
    }
    if (x1 < 0) continue;
    const pad = radius * 2 + 2;
    x0 = Math.max(0, x0 - pad);
    y0 = Math.max(0, y0 - pad);
    x1 = Math.min(width - 1, x1 + pad);
    y1 = Math.min(height - 1, y1 + pad);
    const w = x1 - x0 + 1;
    const h = y1 - y0 + 1;
    let img: Float32Array = new Float32Array(w * h);
    const wt = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const src = (y + y0) * width + (x + x0);
        img[y * w + x] = logLum[src];
        wt[y * w + x] = mask[src] > 127 ? 1 : 0; // only solidly-inside pixels vote, so furniture edges do not leak in
      }
    }
    for (let pass = 0; pass < passes; pass++) {
      const filtered = guidedFilter(img, wt, w, h, radius, eps);
      // Pixels with no solid neighbour keep their previous value
      for (let i = 0; i < filtered.length; i++) if (!Number.isFinite(filtered[i])) filtered[i] = img[i];
      img = filtered;
    }
    const linear = new Float32Array(w * h);
    for (let i = 0; i < linear.length; i++) linear[i] = Math.exp(img[i]);
    const ref = weightedPercentile(linear, wt, input.reference ?? REFERENCE_PERCENTILE, 0.5);
    if (!(ref > 0)) continue;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const dst = (y + y0) * width + (x + x0);
        const m = mask[dst];
        if (m <= 8 || m < owner[dst]) continue;
        out[dst] = linear[y * w + x] / ref;
        owner[dst] = m;
      }
    }
  }
  return out;
}

/** The brightness multiplier the renderer applies: the photo's light, scaled by the lighting-preservation setting. */
export function shadeFactor(light: number, strength: number): number {
  const s = Math.min(1.8, Math.max(0.2, light));
  return Math.pow(s, strength);
}

/** How strongly a room's colour cast is carried onto a new tile, and the most any channel is changed. */
const TINT_STRENGTH = 0.6;
const TINT_RANGE: [number, number] = [0.8, 1.25];

/**
 * The colour of the light in a photo, as the multiplier a neutral (grey or white) surface takes on there: above 1 in red
 * and below 1 in blue for the warm light of lamps, the reverse for a cool, bluish room, and exactly [1, 1, 1] when the
 * photo is colour-balanced. The brightness is left alone (the multiplier has luminance 1).
 *
 * It is the average colour of the ordinary, moderately bright, not strongly coloured parts of the picture, which is the
 * grey-world idea: walls, ceilings, white furniture and light floors show the light itself, while a green plant, a red
 * sofa or the dark and blown-out pixels say nothing about it and are left out. Only part of the cast is carried over
 * (TINT_STRENGTH) because what looks like a cast is sometimes just a beige floor or a cream wall.
 */
export function estimateRoomTint(rgba: Uint8ClampedArray | Uint8Array, count: number): [number, number, number] {
  let sr = 0;
  let sg = 0;
  let sb = 0;
  let sw = 0;
  let used = 0;
  for (let i = 0; i < count; i++) {
    const r = SRGB_TO_LINEAR[rgba[i * 4]];
    const g = SRGB_TO_LINEAR[rgba[i * 4 + 1]];
    const b = SRGB_TO_LINEAR[rgba[i * 4 + 2]];
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    if (lum < 0.04 || lum > 0.85) continue; // too dark to have a colour, or blown out
    const hi = Math.max(r, g, b);
    if ((hi - Math.min(r, g, b)) / hi > 0.5) continue; // strongly coloured: an object, not the light
    sr += r * lum;
    sg += g * lum;
    sb += b * lum;
    sw += lum;
    used++;
  }
  if (sw === 0 || used < count * 0.02) return [1, 1, 1]; // too little neutral picture to judge
  const mr = sr / sw;
  const mg = sg / sw;
  const mb = sb / sw;
  const lum = 0.2126 * mr + 0.7152 * mg + 0.0722 * mb;
  const t = [mr / lum, mg / lum, mb / lum].map((v) => Math.min(TINT_RANGE[1], Math.max(TINT_RANGE[0], 1 + (v - 1) * TINT_STRENGTH)));
  const l2 = 0.2126 * t[0] + 0.7152 * t[1] + 0.0722 * t[2];
  return [t[0] / l2, t[1] / l2, t[2] / l2];
}
