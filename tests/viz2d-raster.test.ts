import { describe, expect, it } from "vitest";
import {
  buildLabelMap,
  closeMask,
  dilate,
  downsampleMask,
  growRegion,
  maskBounds,
  maskToShapes,
  removeSpecks,
  resolveExclusive,
  traceContours,
} from "@/lib/viz2d/raster";
import { boxFilter, computeLightingMap, estimateRoomTint, guidedFilter, linearLuminance, shadeFactor, weightedMedian } from "@/lib/viz2d/lighting";
import { shapeArea } from "@/lib/viz2d/geometry";

function rect(w: number, h: number, x0: number, y0: number, x1: number, y1: number, value = 255) {
  const m = new Uint8Array(w * h);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) m[y * w + x] = value;
  return m;
}

describe("resolveExclusive", () => {
  it("keeps coverage exactly where surfaces only touch, so seams stay seamless", () => {
    const a = new Uint8Array([255, 128, 0]);
    const b = new Uint8Array([0, 127, 255]);
    const [ra, rb] = resolveExclusive([a, b], [0, 0]);
    expect(Array.from(ra)).toEqual([255, 128, 0]);
    expect(Array.from(rb)).toEqual([0, 127, 255]);
  });

  it("gives an overlapping pixel to the higher priority surface", () => {
    const wall = new Uint8Array([255, 255]);
    const splash = new Uint8Array([0, 255]);
    const [rw, rs] = resolveExclusive([wall, splash], [1, 5]);
    expect(Array.from(rw)).toEqual([255, 0]);
    expect(Array.from(rs)).toEqual([0, 255]);
  });

  it("removes foreground occluders from every surface", () => {
    const floor = new Uint8Array([255, 255, 255]);
    const sofa = new Uint8Array([0, 255, 128]);
    const [r] = resolveExclusive([floor], [0], sofa);
    expect(r[0]).toBe(255);
    expect(r[1]).toBe(0);
    expect(r[2]).toBe(127);
  });

  it("never lets total coverage exceed one pixel", () => {
    const m = [new Uint8Array([200]), new Uint8Array([200]), new Uint8Array([200])];
    const out = resolveExclusive(m, [1, 2, 3]);
    expect(out.reduce((s, x) => s + x[0], 0)).toBeLessThanOrEqual(256);
  });
});

describe("buildLabelMap", () => {
  it("labels each pixel with the surface that owns it and leaves foreground unlabelled", () => {
    const floor = rect(4, 1, 0, 0, 2, 1);
    const wall = rect(4, 1, 2, 0, 3, 1);
    const labels = buildLabelMap([floor, wall], [0, 0]);
    expect(Array.from(labels)).toEqual([1, 1, 2, 0]);
  });

  it("prefers the higher priority where two masks are equally strong", () => {
    const a = rect(1, 1, 0, 0, 1, 1);
    const b = rect(1, 1, 0, 0, 1, 1);
    expect(buildLabelMap([a, b], [1, 9])[0]).toBe(2);
    expect(buildLabelMap([a, b], [9, 1])[0]).toBe(1);
  });
});

describe("contours", () => {
  it("traces a square", () => {
    const rings = traceContours(rect(10, 10, 2, 3, 7, 8), 10, 10);
    expect(rings).toHaveLength(1);
    expect(rings[0].length).toBe(20); // every crack step of a 5×5 square
  });

  it("separates an outline from the hole inside it", () => {
    const m = rect(20, 20, 2, 2, 18, 18);
    const hole = rect(20, 20, 8, 8, 12, 12);
    for (let i = 0; i < m.length; i++) if (hole[i]) m[i] = 0;
    const shapes = maskToShapes(m, 20, 20, 0.5, 4);
    expect(shapes).toHaveLength(1);
    expect(shapes[0].holes).toHaveLength(1);
    expect(shapeArea(shapes[0])).toBeCloseTo((16 * 16 - 4 * 4) / 400, 4);
  });

  it("keeps two separate regions apart, and diagonal-only contact does not merge them", () => {
    const m = new Uint8Array(6 * 6);
    m[1 * 6 + 1] = 1;
    m[2 * 6 + 2] = 1; // touches the first only at a corner
    const shapes = maskToShapes(m, 6, 6, 0.1, 0);
    expect(shapes).toHaveLength(2);
  });

  it("drops specks below the minimum area", () => {
    const m = rect(30, 30, 5, 5, 25, 25);
    m[0] = 1;
    expect(maskToShapes(m, 30, 30, 0.5, 4)).toHaveLength(1);
  });
});

describe("morphology", () => {
  it("dilates, closes a small gap and removes specks", () => {
    const m = rect(20, 20, 4, 4, 9, 16);
    for (const [x, y] of [[10, 8], [11, 8]]) m[y * 20 + x] = 0; // not part of the mask anyway
    const b = rect(20, 20, 10, 4, 15, 16);
    const two = m.map((v, i) => (v || b[i] ? 1 : 0)) as Uint8Array;
    const closed = closeMask(two, 20, 20, 1);
    expect(closed[8 * 20 + 9]).toBe(1); // the one-pixel gap between them is filled
    const grown = dilate(rect(9, 9, 4, 4, 5, 5), 9, 9, 2);
    expect(grown.filter((v) => v).length).toBe(25);
    const speckled = rect(20, 20, 2, 2, 18, 18);
    speckled[0] = 1;
    expect(removeSpecks(speckled, 20, 20, 5)[0]).toBe(0);
  });

  it("finds the bounds of a mask and downsamples it", () => {
    expect(maskBounds(rect(10, 10, 2, 3, 5, 6), 10, 10)).toEqual({ x0: 2, y0: 3, x1: 4, y1: 5 });
    expect(maskBounds(new Uint8Array(9), 3, 3)).toBeNull();
    const half = downsampleMask(rect(4, 4, 0, 0, 2, 4), 4, 4, 2);
    expect(Array.from(half.data)).toEqual([255, 0, 255, 0]);
  });
});

describe("growRegion (smart select)", () => {
  // Left half cream, right half dark, with a 4-pixel soft gradient across the cream part
  const W = 40;
  const H = 20;
  const img = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const v = x < 20 ? 220 - x : 60;
      img[i] = v;
      img[i + 1] = v - 10;
      img[i + 2] = v - 30;
      img[i + 3] = 255;
    }
  }

  it("fills the region under the seed and stops at the strong edge", () => {
    const m = growRegion(img, W, H, 5, 10, { tolerance: 40, edgeStop: 30 });
    expect(m[10 * W + 5]).toBe(1);
    expect(m[10 * W + 18]).toBe(1);
    expect(m[10 * W + 25]).toBe(0);
    const count = m.reduce((s, v) => s + v, 0);
    expect(count).toBeGreaterThan(19 * H * 0.9);
    expect(count).toBeLessThan(22 * H);
  });

  it("follows a gentle lighting gradient", () => {
    const m = growRegion(img, W, H, 1, 10, { tolerance: 30, edgeStop: 60 });
    // The region follows the 18-level lighting gradient, stopping one pixel short of the hard edge at x = 20
    expect(m[10 * W + 18]).toBe(1);
    expect(m[10 * W + 20]).toBe(0);
  });
});

describe("lighting extraction", () => {
  it("leaves a uniform surface at exactly 1", () => {
    const w = 32;
    const h = 24;
    const rgba = new Uint8ClampedArray(w * h * 4).fill(180);
    const mask = rect(w, h, 2, 2, 30, 22);
    const map = computeLightingMap({ rgba, width: w, height: h, masks: [mask] });
    expect(map[10 * w + 10]).toBeCloseTo(1, 3);
    expect(map[0]).toBe(1); // outside every surface
  });

  it("removes fine texture but keeps a hard shadow edge", () => {
    const w = 80;
    const h = 40;
    const rgba = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const shade = x < 40 ? 200 : 100; // a shadow covering the right half
        const checker = (x + y) % 2 ? 6 : -6; // old tile texture
        const v = shade + checker;
        const i = (y * w + x) * 4;
        rgba[i] = rgba[i + 1] = rgba[i + 2] = v;
        rgba[i + 3] = 255;
      }
    }
    const mask = rect(w, h, 0, 0, w, h);
    const map = computeLightingMap({ rgba, width: w, height: h, masks: [mask], radius: 3, eps: 0.004 });
    // Texture is gone: neighbouring pixels in the lit area agree
    expect(Math.abs(map[20 * w + 10] - map[20 * w + 11]) / map[20 * w + 10]).toBeLessThan(0.04);
    // The shadow survives: the dark side is much darker than the lit side
    const lit = map[20 * w + 10];
    const shadow = map[20 * w + 70];
    expect(shadow / lit).toBeLessThan(0.3);
    expect(shadow / lit).toBeGreaterThan(0.15);
  });

  it("normalises every surface separately", () => {
    const w = 40;
    const h = 20;
    const rgba = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const v = x < 20 ? 230 : 60;
      rgba[i] = rgba[i + 1] = rgba[i + 2] = v;
      rgba[i + 3] = 255;
    }
    const left = rect(w, h, 0, 0, 20, h);
    const right = rect(w, h, 20, 0, 40, h);
    const map = computeLightingMap({ rgba, width: w, height: h, masks: [left, right] });
    expect(map[10 * w + 8]).toBeCloseTo(1, 2);
    expect(map[10 * w + 30]).toBeCloseTo(1, 2);
  });

  it("box filters and guided filters a constant image to itself", () => {
    const a = new Float32Array(25).fill(0.5);
    expect(boxFilter(a, 5, 5, 2).every((v) => Math.abs(v - 0.5) < 1e-6)).toBe(true);
    const out = guidedFilter(a, new Float32Array(25).fill(1), 5, 5, 2, 0.01);
    expect(out.every((v) => Math.abs(v - 0.5) < 1e-5)).toBe(true);
  });

  it("does not let pixels outside the mask influence the result", () => {
    const img = new Float32Array(25);
    const wt = new Float32Array(25);
    for (let i = 0; i < 25; i++) {
      const inside = i % 5 < 3;
      img[i] = inside ? 0.4 : 9; // a very bright neighbour outside
      wt[i] = inside ? 1 : 0;
    }
    const out = guidedFilter(img, wt, 5, 5, 2, 0.01);
    expect(Math.abs(out[2 * 5 + 1] - 0.4)).toBeLessThan(1e-4);
  });

  it("converts sRGB to linear luminance and finds a weighted median", () => {
    const rgba = new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255]);
    const lum = linearLuminance(rgba, 2);
    expect(lum[0]).toBeCloseTo(1, 4);
    expect(lum[1]).toBe(0);
    const v = new Float32Array([0.1, 0.2, 0.3, 0.9, 0.5]);
    const w = new Float32Array([1, 1, 1, 0, 1]);
    const med = weightedMedian(v, w);
    expect(med).toBeGreaterThan(0.18);
    expect(med).toBeLessThan(0.35);
  });

  it("scales the photo's light by the preservation setting", () => {
    expect(shadeFactor(0.5, 1)).toBeCloseTo(0.5, 6);
    expect(shadeFactor(0.5, 0)).toBe(1);
    expect(shadeFactor(0.5, 0.5)).toBeCloseTo(Math.sqrt(0.5), 6);
    expect(shadeFactor(5, 1)).toBeCloseTo(1.8, 6); // highlights are capped
    expect(shadeFactor(0.01, 1)).toBeCloseTo(0.2, 6); // shadows are floored
  });
});

describe("the colour of a room's light", () => {
  const flat = (r: number, g: number, b: number, count = 400) => {
    const rgba = new Uint8ClampedArray(count * 4);
    for (let i = 0; i < count; i++) rgba.set([r, g, b, 255], i * 4);
    return rgba;
  };
  const lum = (t: number[]) => 0.2126 * t[0] + 0.7152 * t[1] + 0.0722 * t[2];

  it("is no change for a colour-balanced photo", () => {
    for (const grey of [90, 150, 200]) {
      const t = estimateRoomTint(flat(grey, grey, grey), 400);
      t.forEach((v) => expect(v).toBeCloseTo(1, 6));
    }
  });

  it("warms for warm lamps and cools for a bluish room, without changing brightness", () => {
    const warm = estimateRoomTint(flat(225, 205, 170), 400);
    expect(warm[0]).toBeGreaterThan(1);
    expect(warm[2]).toBeLessThan(1);
    expect(lum(warm)).toBeCloseTo(1, 6);
    const cool = estimateRoomTint(flat(170, 190, 215), 400);
    expect(cool[2]).toBeGreaterThan(1);
    expect(cool[0]).toBeLessThan(1);
    expect(lum(cool)).toBeCloseTo(1, 6);
  });

  it("carries over only part of the cast and never an extreme one", () => {
    const t = estimateRoomTint(flat(230, 210, 170), 400); // a very warm white
    for (const v of t) {
      expect(v).toBeGreaterThan(0.75);
      expect(v).toBeLessThan(1.3);
    }
    expect(t[0]).toBeGreaterThan(t[2]); // still warm
  });

  it("ignores strongly coloured objects, dark and blown-out pixels, and gives up when little is left to judge", () => {
    // Half warm walls, half a saturated green plant: the plant says nothing about the light
    const mixed = new Uint8ClampedArray(800 * 4);
    mixed.set(flat(225, 205, 170), 0);
    mixed.set(flat(20, 200, 30), 400 * 4);
    expect(estimateRoomTint(mixed, 800)).toEqual(estimateRoomTint(flat(225, 205, 170), 400));
    expect(estimateRoomTint(flat(250, 250, 250), 400)).toEqual([1, 1, 1]); // blown out
    expect(estimateRoomTint(flat(8, 6, 4), 400)).toEqual([1, 1, 1]); // black
    expect(estimateRoomTint(flat(20, 200, 30), 400)).toEqual([1, 1, 1]); // only colourful things
    expect(estimateRoomTint(new Uint8ClampedArray(0), 0)).toEqual([1, 1, 1]);
  });
});
