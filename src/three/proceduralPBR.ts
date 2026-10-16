'use client';

import * as THREE from 'three';

const textureCache = new Map<string, THREE.CanvasTexture>();
/** The drawn pattern, one per texture type. Repeat variants clone it and share the pixels. */
const baseCache = new Map<string, THREE.CanvasTexture>();

/** `tile_normal_12.5_8` -> `tile_normal`: the pattern does not depend on the repeat count. */
const baseKeyOf = (key: string) => key.replace(/_-?[\d.]+_-?[\d.]+$/, '');

/**
 * Cache and return a CanvasTexture created from a canvas drawing callback.
 * Pixels are generated once per pattern; each repeat variant is a cheap clone that shares the
 * same image, so changing a tile size no longer redraws and re-uploads a 512px texture.
 */
function getCachedCanvasTexture(key: string, width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const cached = textureCache.get(key);
  if (cached) return cached;

  if (typeof window === 'undefined') {
    // Return empty texture on SSR
    return new THREE.CanvasTexture(document.createElement('canvas'));
  }

  const baseKey = baseKeyOf(key);
  let base = baseCache.get(baseKey);
  if (!base) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    draw(ctx);

    base = new THREE.CanvasTexture(canvas);
    base.wrapS = THREE.RepeatWrapping;
    base.wrapT = THREE.RepeatWrapping;
    base.generateMipmaps = true;
    base.minFilter = THREE.LinearMipmapLinearFilter;
    base.magFilter = THREE.LinearFilter;
    base.anisotropy = 8;
    baseCache.set(baseKey, base);
  }

  const texture = baseKey === key ? base : base.clone();
  if (texture !== base) texture.needsUpdate = true;
  textureCache.set(key, texture);
  return texture;
}

/**
 * 1. Fabric Weave Micro Normal Map
 */
export function getFabricNormalMap(repeatX = 12, repeatY = 12): THREE.CanvasTexture {
  const key = `fabric_normal_${repeatX}_${repeatY}`;
  const tex = getCachedCanvasTexture(key, 256, 256, (ctx) => {
    const imgData = ctx.createImageData(256, 256);
    const data = imgData.data;

    for (let y = 0; y < 256; y++) {
      for (let x = 0; x < 256; x++) {
        const i = (y * 256 + x) * 4;

        // Create criss-cross thread pattern
        const patternX = Math.sin((x / 256) * Math.PI * 64);
        const patternY = Math.sin((y / 256) * Math.PI * 64);
        const weave = ((x % 8 < 4) !== (y % 8 < 4)) ? patternX : patternY;

        // Convert height gradient to normal map RGB (128 = 0 vector)
        const dx = weave * 40;
        const dy = weave * 40;

        data[i]     = Math.min(255, Math.max(0, 128 + dx)); // R (X normal)
        data[i + 1] = Math.min(255, Math.max(0, 128 + dy)); // G (Y normal)
        data[i + 2] = 255;                                 // B (Z normal)
        data[i + 3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);
  });

  tex.repeat.set(repeatX, repeatY);
  return tex;
}

/**
 * 2. Fabric Soft Roughness & Color Noise Map
 */
export function getFabricRoughnessMap(repeatX = 8, repeatY = 8): THREE.CanvasTexture {
  const key = `fabric_roughness_${repeatX}_${repeatY}`;
  const tex = getCachedCanvasTexture(key, 256, 256, (ctx) => {
    const imgData = ctx.createImageData(256, 256);
    const data = imgData.data;

    for (let i = 0; i < data.length; i += 4) {
      const noise = Math.floor(200 + Math.random() * 55);
      data[i]     = noise;
      data[i + 1] = noise;
      data[i + 2] = noise;
      data[i + 3] = 255;
    }
    ctx.putImageData(imgData, 0, 0);
  });

  tex.repeat.set(repeatX, repeatY);
  return tex;
}

/**
 * 3. Wood Grain Normal & Roughness Map
 */
export function getWoodNormalMap(repeatX = 2, repeatY = 4): THREE.CanvasTexture {
  const key = `wood_normal_${repeatX}_${repeatY}`;
  const tex = getCachedCanvasTexture(key, 512, 512, (ctx) => {
    const imgData = ctx.createImageData(512, 512);
    const data = imgData.data;

    for (let y = 0; y < 512; y++) {
      for (let x = 0; x < 512; x++) {
        const i = (y * 512 + x) * 4;

        // Wood ring sine waves + subtle noise jitter
        const jitter = Math.sin(y * 0.05) * 8;
        const ring = Math.sin((x + jitter) * 0.15);
        const pore = Math.sin(y * 0.8) * 0.3;

        const val = (ring + pore) * 25;

        data[i]     = Math.min(255, Math.max(0, 128 + val));
        data[i + 1] = Math.min(255, Math.max(0, 128 + val * 0.5));
        data[i + 2] = 240;
        data[i + 3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);
  });

  tex.repeat.set(repeatX, repeatY);
  return tex;
}

export function getWoodRoughnessMap(repeatX = 2, repeatY = 4): THREE.CanvasTexture {
  const key = `wood_roughness_${repeatX}_${repeatY}`;
  const tex = getCachedCanvasTexture(key, 256, 256, (ctx) => {
    const imgData = ctx.createImageData(256, 256);
    const data = imgData.data;

    for (let y = 0; y < 256; y++) {
      for (let x = 0; x < 256; x++) {
        const i = (y * 256 + x) * 4;
        const streak = Math.abs(Math.sin(x * 0.1) * 60);
        const noise = Math.random() * 20;
        const v = Math.min(255, Math.max(0, 80 + streak + noise));

        data[i]     = v;
        data[i + 1] = v;
        data[i + 2] = v;
        data[i + 3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);
  });

  tex.repeat.set(repeatX, repeatY);
  return tex;
}

/**
 * 4. Tile Grout & Surface Micro Normal Map
 */
export function getTileNormalMap(repeatX = 4, repeatY = 4): THREE.CanvasTexture {
  const key = `tile_normal_${repeatX}_${repeatY}`;
  const tex = getCachedCanvasTexture(key, 512, 512, (ctx) => {
    ctx.fillStyle = 'rgb(128, 128, 255)';
    ctx.fillRect(0, 0, 512, 512);

    const margin = 8;
    ctx.fillStyle = 'rgb(180, 100, 220)';
    ctx.fillRect(0, 0, 512, margin);
    ctx.fillRect(0, 512 - margin, 512, margin);

    ctx.fillStyle = 'rgb(100, 180, 220)';
    ctx.fillRect(0, 0, margin, 512);
    ctx.fillRect(512 - margin, 0, margin, 512);

    const imgData = ctx.getImageData(0, 0, 512, 512);
    const data = imgData.data;
    for (let i = 0; i < data.length; i += 4) {
      const n = (Math.random() - 0.5) * 6;
      data[i]     = Math.min(255, Math.max(0, data[i] + n));
      data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + n));
    }
    ctx.putImageData(imgData, 0, 0);
  });

  tex.repeat.set(repeatX, repeatY);
  return tex;
}

/**
 * 5. Brushed Metal Directional Anisotropy Roughness Map
 */
export function getBrushedMetalRoughnessMap(repeatX = 1, repeatY = 8): THREE.CanvasTexture {
  const key = `brushed_metal_${repeatX}_${repeatY}`;
  const tex = getCachedCanvasTexture(key, 256, 256, (ctx) => {
    const imgData = ctx.createImageData(256, 256);
    const data = imgData.data;

    for (let y = 0; y < 256; y++) {
      const lineVal = Math.floor(40 + Math.sin(y * 0.8) * 30 + Math.random() * 30);
      for (let x = 0; x < 256; x++) {
        const i = (y * 256 + x) * 4;
        data[i]     = lineVal;
        data[i + 1] = lineVal;
        data[i + 2] = lineVal;
        data[i + 3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);
  });

  tex.repeat.set(repeatX, repeatY);
  return tex;
}

/**
 * 6. Leather Pebble Normal Map
 */
export function getLeatherNormalMap(repeatX = 6, repeatY = 6): THREE.CanvasTexture {
  const key = `leather_normal_${repeatX}_${repeatY}`;
  const tex = getCachedCanvasTexture(key, 256, 256, (ctx) => {
    const imgData = ctx.createImageData(256, 256);
    const data = imgData.data;

    for (let y = 0; y < 256; y++) {
      for (let x = 0; x < 256; x++) {
        const i = (y * 256 + x) * 4;
        const cellX = Math.sin((x / 16) * Math.PI * 2);
        const cellY = Math.sin((y / 16) * Math.PI * 2);
        const bump = (cellX + cellY) * 20;

        data[i]     = Math.min(255, Math.max(0, 128 + bump));
        data[i + 1] = Math.min(255, Math.max(0, 128 + bump));
        data[i + 2] = 240;
        data[i + 3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);
  });

  tex.repeat.set(repeatX, repeatY);
  return tex;
}

// ── Shared value-noise helpers for organic albedo maps ──────────────────────

function hash2(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

function valueNoise(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi);
  const b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1);
  const d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function fbm(x: number, y: number, octaves = 4): number {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  for (let o = 0; o < octaves; o++) {
    sum += valueNoise(x * freq, y * freq) * amp;
    freq *= 2;
    amp *= 0.5;
  }
  return sum;
}

/** How an albedo pattern is drawn: `shade(x, y)` gives a 0..1 grey for each pixel, `flat` is its average. */
interface AlbedoSpec {
  size: number;
  flat: number;
  shade: (x: number, y: number) => number;
}

/** Albedo maps are multiplied with a material's tint colour, so they are authored as near-white greyscale. */
const ALBEDO: Record<string, AlbedoSpec> = {
  // 7. Natural Wood Grain Albedo (straight-sawn walnut / oak figure, tinted by material colour)
  wood_grain: {
    size: 512,
    flat: 0.86,
    shade: (x, y) => {
      const warp = fbm(x * 0.004, y * 0.02, 3) * 38;
      const ring = Math.sin((x + warp) * 0.11 + Math.sin(y * 0.006) * 2.2);
      const figure = fbm(x * 0.05, y * 0.004, 3);
      const pores = valueNoise(x * 0.9, y * 0.06);
      return 0.86 + ring * 0.05 + (figure - 0.5) * 0.12 - (pores > 0.82 ? 0.06 : 0);
    },
  },
  // 8. Soft-Veined Marble / Quartz Albedo (warm white stone with diffuse grey veining)
  marble_v2: {
    size: 1024,
    flat: 0.97,
    shade: (x, y) => {
      const n = fbm(x * 0.0025, y * 0.0025, 5);
      const vein = Math.abs(Math.sin((x * 0.55 + y) * 0.0042 + n * 6.0));
      const fine = Math.abs(Math.sin((x - y * 0.35) * 0.009 + fbm(x * 0.006, y * 0.006, 5) * 8));
      const cloud = fbm(x * 0.004 + 40, y * 0.004, 4);
      return 0.97 - Math.pow(1 - vein, 70) * 0.16 - Math.pow(1 - fine, 120) * 0.07 - (cloud - 0.5) * 0.05;
    },
  },
  // 9. Travertine / Honed Limestone Albedo (horizontal banding with natural pores)
  travertine: {
    size: 512,
    flat: 0.9,
    shade: (x, y) => {
      const band = fbm(x * 0.002, y * 0.03, 4);
      const pore = valueNoise(x * 0.12, y * 0.5);
      return 0.9 + (band - 0.5) * 0.16 - (pore > 0.86 ? 0.12 : 0);
    },
  },
  // 10. Micro-Cement / Architectural Concrete Albedo
  concrete: {
    size: 512,
    flat: 0.88,
    shade: (x, y) => {
      const cloud = fbm(x * 0.008, y * 0.008, 5);
      const speck = hash2(x, y);
      return 0.88 + (cloud - 0.5) * 0.14 - (speck > 0.985 ? 0.08 : 0);
    },
  },
  // 12. Upholstery Nap / Mottle Albedo (seamless): soft two-scale cloudiness plus fine directional streaks
  fabric_mottle: {
    size: 512,
    flat: 0.95,
    shade: (x, y) => {
      const s = 512;
      const cloud = periodicNoise((x / s) * 3, (y / s) * 3, 3, 1) * 0.6 + periodicNoise((x / s) * 7, (y / s) * 7, 7, 2) * 0.4;
      const streak = periodicNoise((x / s) * 24, (y / s) * 96, 24, 3);
      const grain = hash2(x, y);
      return 0.95 + (cloud - 0.5) * 0.2 + (streak - 0.5) * 0.07 + (grain - 0.5) * 0.04;
    },
  },
  // 15. Painted Plaster Cloud (seamless): the barely-there cloudiness of hand-applied paint over plaster
  plaster_cloud: {
    size: 256,
    flat: 0.975,
    shade: (x, y) => {
      const s = 256;
      const cloud = periodicNoise((x / s) * 4, (y / s) * 4, 4, 11) * 0.65 + periodicNoise((x / s) * 11, (y / s) * 11, 11, 12) * 0.35;
      return 0.975 + (cloud - 0.5) * 0.05 + (hash2(x, y) - 0.5) * 0.012;
    },
  },
};

export const ALBEDO_NAMES = Object.keys(ALBEDO);
export const albedoSize = (name: string) => ALBEDO[name].size;

/**
 * Computes one albedo pattern pixel by pixel (one grey byte each). Slow — marble alone is several
 * seconds — so the app loads the pre-baked images from /textures/procedural instead; this is what
 * `npm run bake:textures` uses to make them, and the fallback if an image is missing.
 */
export function renderAlbedoBytes(name: string): Uint8Array {
  const { size, shade } = ALBEDO[name];
  const out = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      out[y * size + x] = Math.round(Math.min(1, Math.max(0, shade(x, y))) * 255);
    }
  }
  return out;
}

/** Marks a pattern's canvas as changed, for the base texture and every repeat variant cloned from it. */
function refreshPattern(baseKey: string) {
  const base = baseCache.get(baseKey);
  if (base) base.needsUpdate = true;
  textureCache.forEach((tex, key) => {
    if (baseKeyOf(key) === baseKey) tex.needsUpdate = true;
  });
}

function paintFromBytes(canvas: HTMLCanvasElement, bytes: Uint8Array) {
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(canvas.width, canvas.height);
  for (let i = 0; i < bytes.length; i++) {
    const v = bytes[i];
    img.data[i * 4] = v;
    img.data[i * 4 + 1] = v;
    img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

/**
 * Fills an albedo canvas with its detail without blocking the page: the baked image is fetched and
 * decoded off the main thread, then drawn over the flat placeholder the texture starts with.
 */
function loadAlbedoDetail(name: string) {
  const apply = (paint: (canvas: HTMLCanvasElement) => void) => {
    const canvas = baseCache.get(name)?.image as HTMLCanvasElement | undefined;
    if (!canvas) return;
    paint(canvas);
    refreshPattern(name);
  };
  fetch(`/textures/procedural/${name}.webp`)
    .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))))
    .then((blob) => createImageBitmap(blob, { colorSpaceConversion: 'none' }))
    .then((bitmap) =>
      apply((canvas) => {
        canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        bitmap.close();
      }),
    )
    .catch(() => {
      // No baked image: compute it, after the first frames have been drawn
      setTimeout(() => apply((canvas) => paintFromBytes(canvas, renderAlbedoBytes(name))), 600);
    });
}

function getCachedAlbedoMap(name: string, repeatX: number, repeatY: number) {
  const { size, flat } = ALBEDO[name];
  const tex = getCachedCanvasTexture(`${name}_${repeatX}_${repeatY}`, size, size, (ctx) => {
    const v = Math.round(flat * 255);
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.fillRect(0, 0, size, size);
    loadAlbedoDetail(name);
  });
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.repeat.set(repeatX, repeatY);
  return tex;
}

/**
 * 7. Natural Wood Grain Albedo (straight-sawn walnut / oak figure, tinted by material colour)
 */
export function getWoodGrainMap(repeatX = 1, repeatY = 1): THREE.CanvasTexture {
  return getCachedAlbedoMap('wood_grain', repeatX, repeatY);
}

/**
 * 8. Soft-Veined Marble / Quartz Albedo (warm white stone with diffuse grey veining)
 */
export function getMarbleMap(repeatX = 1, repeatY = 1): THREE.CanvasTexture {
  return getCachedAlbedoMap('marble_v2', repeatX, repeatY);
}

/**
 * 9. Travertine / Honed Limestone Albedo (horizontal banding with natural pores)
 */
export function getTravertineMap(repeatX = 1, repeatY = 1): THREE.CanvasTexture {
  return getCachedAlbedoMap('travertine', repeatX, repeatY);
}

/**
 * 10. Micro-Cement / Architectural Concrete Albedo
 */
export function getConcreteMap(repeatX = 1, repeatY = 1): THREE.CanvasTexture {
  return getCachedAlbedoMap('concrete', repeatX, repeatY);
}

/** Value noise that repeats every `period` cells, so a texture built from it tiles without seams. */
function periodicNoise(x: number, y: number, period: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const cell = (cx: number, cy: number) => hash2(((cx % period) + period) % period + seed * 17.3, ((cy % period) + period) % period + seed * 5.1);
  const a = cell(xi, yi);
  const b = cell(xi + 1, yi);
  const c = cell(xi, yi + 1);
  const d = cell(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/**
 * 12. Upholstery Nap / Mottle Albedo (seamless)
 * Soft two-scale cloudiness plus fine directional streaks, the way brushed suede and velvet catch the light
 * unevenly. Near-white greyscale, so it only modulates the upholstery tint.
 */
export function getFabricMottleMap(repeatX = 1, repeatY = 1): THREE.CanvasTexture {
  return getCachedAlbedoMap('fabric_mottle', repeatX, repeatY);
}

/**
 * 14. Lamp-shade glow: a vertical emissive gradient, brightest in the lower middle where the bulb sits,
 * so a lit linen drum reads as light behind cloth instead of a flat white cylinder.
 */
export function getLampGlowMap(): THREE.CanvasTexture {
  const tex = getCachedCanvasTexture('lamp_glow_1_1', 8, 128, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, '#8a8174');
    g.addColorStop(0.25, '#d6ccbd');
    g.addColorStop(0.58, '#ffffff');
    g.addColorStop(0.85, '#e8dfd0');
    g.addColorStop(1, '#b8ae9f');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 8, 128);
  });
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/**
 * 15. Painted Plaster Cloud (seamless)
 * The barely-there cloudiness of hand-applied paint over plaster. Near-white greyscale, so it only modulates the paint colour
 * and a flat wall never reads as a perfectly uniform digital fill.
 */
export function getPlasterCloudMap(repeatX = 1, repeatY = 1): THREE.CanvasTexture {
  return getCachedAlbedoMap('plaster_cloud', repeatX, repeatY);
}

/**
 * 16. Fluted Ceramic Normal Map: fine vertical ribs around a cylinder (U runs around the circumference).
 */
export function getFlutedNormalMap(flutes = 40): THREE.CanvasTexture {
  const key = `fluted${flutes}_normal_1_1`;
  const size = 256;
  const tex = getCachedCanvasTexture(key, size, 8, (ctx) => {
    const img = ctx.createImageData(size, 8);
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        // Slope of a sine rib: leans left on one flank, right on the other
        const slope = -Math.cos((x / size) * flutes * Math.PI * 2);
        img.data[i] = 128 + slope * 95;
        img.data[i + 1] = 128;
        img.data[i + 2] = 255;
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  });
  tex.repeat.set(1, 1);
  return tex;
}

/**
 * 13. Pile Rug Normal Map (dense, slightly combed tufts)
 */
export function getRugPileNormalMap(repeatX = 10, repeatY = 10): THREE.CanvasTexture {
  const key = `rug_pile_normal_${repeatX}_${repeatY}`;
  const size = 256;
  const height = (x: number, y: number) => periodicNoise((x / size) * 64, (y / size) * 64, 64, 4) * 0.7 + periodicNoise((x / size) * 16, (y / size) * 16, 16, 5) * 0.3;
  const tex = getCachedCanvasTexture(key, size, size, (ctx) => {
    const imgData = ctx.createImageData(size, size);
    const data = imgData.data;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        const dx = (height((x + 1) % size, y) - height((x - 1 + size) % size, y)) * 90;
        const dy = (height(x, (y + 1) % size) - height(x, (y - 1 + size) % size)) * 90;
        data[i] = Math.min(255, Math.max(0, 128 - dx));
        data[i + 1] = Math.min(255, Math.max(0, 128 - dy));
        data[i + 2] = 255;
        data[i + 3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);
  });
  tex.repeat.set(repeatX, repeatY);
  return tex;
}

/**
 * 11. Bouclé / Nubby Wool Normal Map (irregular looped yarn surface)
 */
export function getBoucleNormalMap(repeatX = 6, repeatY = 6): THREE.CanvasTexture {
  const key = `boucle_normal_${repeatX}_${repeatY}`;
  const size = 256;
  const height = (x: number, y: number) => fbm(x * 0.09, y * 0.09, 3) + valueNoise(x * 0.35, y * 0.35) * 0.35;
  const tex = getCachedCanvasTexture(key, size, size, (ctx) => {
    const imgData = ctx.createImageData(size, size);
    const data = imgData.data;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        const dx = (height(x + 1, y) - height(x - 1, y)) * 220;
        const dy = (height(x, y + 1) - height(x, y - 1)) * 220;
        data[i] = Math.min(255, Math.max(0, 128 - dx));
        data[i + 1] = Math.min(255, Math.max(0, 128 - dy));
        data[i + 2] = 255;
        data[i + 3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);
  });
  tex.repeat.set(repeatX, repeatY);
  return tex;
}
