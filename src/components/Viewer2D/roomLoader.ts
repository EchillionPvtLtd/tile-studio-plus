import { computeLightingMap, estimateRoomTint } from '@/lib/viz2d/lighting';
import { buildLabelMap, downsampleMask, resolveExclusive } from '@/lib/viz2d/raster';
import type { PolygonShape, RoomScene } from '@/lib/viz2d/types';

/** Everything the renderer and the click handler need to know about a room, computed once and cached. */
export interface LoadedRoom {
  room: RoomScene;
  width: number;
  height: number;
  image: ImageBitmap;
  /** One coverage mask (0..255) per surface, at the photo's resolution, with overlaps already resolved. */
  masks: Uint8Array[];
  /** The photo's light on each surface, 1.0 = typically lit. */
  light: Float32Array;
  lightWidth: number;
  lightHeight: number;
  /** For clicks: index + 1 of the surface at each point, 0 where there is none. Same size as `light`. */
  labels: Uint8Array;
  /** The colour cast of the room's light as a multiplier (warm lamps: more red, less blue), luminance 1. */
  tint: [number, number, number];
}

/** Lighting and click maps are computed at about this size: plenty for soft light, and fast. */
const WORK_SIZE = 1024;
const CACHE_SIZE = 3;
/**
 * A photo larger than this on its long side is shrunk as it is decoded. It is already sharper than any screen shows it,
 * and the photo, the masks and the selection map are all held on the graphics card at the photo's size.
 */
export const MAX_PHOTO_SIDE = 2600;

const cache = new Map<string, Promise<LoadedRoom>>();

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

async function fetchBitmap(url: string, options: ImageBitmapOptions = {}): Promise<ImageBitmap> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load ${url} (${res.status})`);
  return createImageBitmap(await res.blob(), options);
}

/** The size to decode a photo at: its own, or shrunk (keeping its shape) when it is larger than MAX_PHOTO_SIDE. */
export function decodeSize(width: number, height: number): { width: number; height: number } {
  const k = Math.min(1, MAX_PHOTO_SIDE / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)) };
}

/** A room's photo is decoded once however many times its outlines change while it is edited. */
const photos = new Map<string, Promise<ImageBitmap>>();
function roomPhoto(url: string, width: number, height: number): Promise<ImageBitmap> {
  let hit = photos.get(url);
  if (!hit) {
    const target = decodeSize(width, height);
    // The scene says how big the photo is, which lets a large one be shrunk while it is decoded
    hit = fetchBitmap(url, target.width < width ? { resizeWidth: target.width, resizeHeight: target.height, resizeQuality: 'high' } : {});
    photos.set(url, hit);
    hit.catch(() => photos.delete(url));
    while (photos.size > 6) photos.delete(photos.keys().next().value as string);
  }
  return hit;
}

/** Grey value (red channel) of an image drawn at w × h. */
function grayOf(source: CanvasImageSource, w: number, h: number): Uint8Array {
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(source, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data;
  const out = new Uint8Array(w * h);
  for (let i = 0; i < out.length; i++) out[i] = data[i * 4];
  return out;
}

/** Coverage of hand-drawn outlines: white where the shapes are, anti-aliased by the browser. */
export function rasterizeShapes(shapes: PolygonShape[], w: number, h: number): Uint8Array {
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#fff';
  for (const s of shapes) {
    ctx.beginPath();
    for (const ring of [s.outer, ...(s.holes ?? [])]) {
      ring.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x * w, y * h) : ctx.lineTo(x * w, y * h)));
      ctx.closePath();
    }
    ctx.fill('evenodd');
  }
  const data = ctx.getImageData(0, 0, w, h).data;
  const out = new Uint8Array(w * h);
  for (let i = 0; i < out.length; i++) out[i] = data[i * 4];
  return out;
}

/** What makes two versions of a room different for caching: its photo, outlines, perspective and foreground. */
export function roomCacheKey(room: RoomScene): string {
  const sig = JSON.stringify([room.image.src, room.surfaces.map((s) => [s.id, s.group, s.priority, s.mask, s.calibration]), room.occluders]);
  let h = 5381;
  for (let i = 0; i < sig.length; i++) h = ((h << 5) + h + sig.charCodeAt(i)) | 0;
  return `${room.id}:${(h >>> 0).toString(36)}`;
}

async function build(room: RoomScene): Promise<LoadedRoom> {
  const image = await roomPhoto(room.image.src, room.image.width, room.image.height);
  const { width, height } = image;

  // Masks: pre-computed images for the built-in rooms, rasterised outlines for the rooms a showroom drew
  const coverage: Uint8Array[] = [];
  for (const s of room.surfaces) {
    if (s.mask.kind === 'raster') {
      // Whatever size the mask was made at, it is brought to the photo's size as it is decoded
      const bmp = await fetchBitmap(s.mask.src, { colorSpaceConversion: 'none', resizeWidth: width, resizeHeight: height, resizeQuality: 'medium' });
      coverage.push(grayOf(bmp, width, height));
      bmp.close();
    } else {
      coverage.push(rasterizeShapes(s.mask.shapes, width, height));
    }
    await nextFrame(); // keep the page responsive while a big room builds
  }
  const occluder = room.occluders?.length ? rasterizeShapes(room.occluders, width, height) : null;
  const masks = resolveExclusive(coverage, room.surfaces.map((s) => s.priority), occluder);

  // Lighting and click map at a working resolution
  const factor = Math.max(1, Math.ceil(Math.max(width, height) / WORK_SIZE));
  const small = masks.map((m) => downsampleMask(m, width, height, factor));
  const lw = small[0]?.width ?? Math.max(1, Math.floor(width / factor));
  const lh = small[0]?.height ?? Math.max(1, Math.floor(height / factor));
  const sc = makeCanvas(lw, lh);
  const sctx = sc.getContext('2d', { willReadFrequently: true })!;
  sctx.imageSmoothingQuality = 'high';
  sctx.drawImage(image, 0, 0, lw, lh);
  const rgba = sctx.getImageData(0, 0, lw, lh).data;
  await nextFrame();
  const light = computeLightingMap({ rgba, width: lw, height: lh, masks: small.map((s) => s.data) });
  const labels = buildLabelMap(small.map((s) => s.data), room.surfaces.map((s) => s.priority));

  const tint = estimateRoomTint(rgba, lw * lh);

  return { room, width, height, image, masks, light, lightWidth: lw, lightHeight: lh, labels, tint };
}

/** Loads (or returns the cached) pictures, masks, lighting and click map of a room. */
export function loadRoom(room: RoomScene): Promise<LoadedRoom> {
  const key = roomCacheKey(room);
  const hit = cache.get(key);
  if (hit) {
    // Most recently used goes last
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const promise = build(room);
  cache.set(key, promise);
  promise.catch(() => cache.delete(key)); // a failed load is tried again next time
  while (cache.size > CACHE_SIZE) {
    const oldest = cache.keys().next().value as string;
    cache.delete(oldest);
  }
  return promise;
}

/** The surface under a point of the photo (normalized coordinates), as an index into room.surfaces, or -1. */
export function surfaceAt(loaded: LoadedRoom, nx: number, ny: number): number {
  // Written so that a point that is not a number (NaN) also counts as outside
  if (!(nx >= 0 && ny >= 0 && nx < 1 && ny < 1)) return -1;
  const x = Math.floor(nx * loaded.lightWidth);
  const y = Math.floor(ny * loaded.lightHeight);
  return (loaded.labels[y * loaded.lightWidth + x] ?? 0) - 1;
}
