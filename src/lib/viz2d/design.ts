import { GROUT_COLORS, TILE_LAYOUT_OPTIONS, type TileLayout } from '@/types/tile';
import {
  MAX_DISTINCT_TILES,
  TILE_SETTING_LIMITS,
  type Design,
  type RoomScene,
  type SurfaceDef,
  type SurfaceSettings,
  type TileSnapshot,
} from './types';
import { clamp } from './geometry';

/** A surface as the person sees it: one thing to click and tile, made of one or more facets of the photo. */
export interface SurfaceGroup {
  id: string;
  name: string;
  kind: SurfaceDef['kind'];
  /** Indices into room.surfaces. */
  facets: number[];
  areaSqFt: number;
  /** Highest priority among the facets, which decides what a click on overlapping surfaces selects. */
  priority: number;
}

/** Facets that share a `group` are one surface; everything else stands alone. Order follows the first facet. */
export function buildGroups(room: Pick<RoomScene, 'surfaces'>): SurfaceGroup[] {
  const groups = new Map<string, SurfaceGroup>();
  room.surfaces.forEach((s, i) => {
    const id = s.group ?? s.id;
    const g = groups.get(id);
    if (g) {
      g.facets.push(i);
      g.areaSqFt += s.areaSqFt ?? 0;
      g.priority = Math.max(g.priority, s.priority);
    } else {
      groups.set(id, { id, name: s.name, kind: s.kind, facets: [i], areaSqFt: s.areaSqFt ?? 0, priority: s.priority });
    }
  });
  return [...groups.values()].map((g) => ({ ...g, areaSqFt: Math.round(g.areaSqFt * 10) / 10 }));
}

export const groupIdOf = (s: Pick<SurfaceDef, 'id' | 'group'>) => s.group ?? s.id;

/** What can be tiled in a room, in a few words: "Floor · 2 walls", "Floor · Steps", "Nothing to tile". */
export function summarizeSurfaces(room: Pick<RoomScene, 'surfaces'>): string {
  const groups = buildGroups(room);
  const floors = groups.filter((g) => g.kind === 'floor').length;
  const walls = groups.filter((g) => g.kind === 'wall').length;
  const rest = groups.filter((g) => g.kind !== 'floor' && g.kind !== 'wall');
  const parts: string[] = [];
  if (floors) parts.push(floors === 1 ? 'Floor' : `${floors} floors`);
  if (walls) parts.push(walls === 1 ? '1 wall' : `${walls} walls`);
  if (rest.length) parts.push(rest.length <= 2 ? rest.map((g) => g.name).join(', ') : `${rest.length} more`);
  return parts.join(' · ') || 'Nothing to tile';
}

const lowerFirst = (name: string) => name.replace(/^[A-Z](?![A-Z])/, (c) => c.toLowerCase());

/**
 * What can be tiled in a room, as words that fit "Click ___ to start tiling": "the floor", "the floor or a wall",
 * "the floor, a wall or the backsplash". Empty when nothing in the photo can be tiled. A photo only offers the surfaces
 * that could be outlined accurately, so this differs from room to room.
 */
export function tileablePhrase(room: Pick<RoomScene, 'surfaces'>): string {
  const groups = buildGroups(room);
  const floors = groups.filter((g) => g.kind === 'floor');
  const walls = groups.filter((g) => g.kind === 'wall');
  const rest = groups.filter((g) => g.kind !== 'floor' && g.kind !== 'wall');
  const parts: string[] = [];
  if (floors.length) parts.push(floors.length === 1 ? 'the floor' : 'a floor');
  if (walls.length) parts.push(walls.length === 1 ? `the ${lowerFirst(walls[0].name)}` : 'a wall');
  if (rest.length) parts.push(rest.length === 1 ? `the ${lowerFirst(rest[0].name)}` : 'another marked surface');
  return parts.length > 2 ? `${parts.slice(0, -1).join(', ')} or ${parts[parts.length - 1]}` : parts.join(' or ');
}

/** Bit mask of the facets of the given groups, for the shader. */
export function facetMask(room: Pick<RoomScene, 'surfaces'>, groupIds: Iterable<string>): number {
  const ids = new Set(groupIds);
  let mask = 0;
  room.surfaces.forEach((s, i) => {
    if (ids.has(groupIdOf(s))) mask |= 1 << i;
  });
  return mask;
}

// ── Settings ────────────────────────────────────────────────────────────────

export const DEFAULT_GROUT_COLOR = GROUT_COLORS[1].hex; // light grey
export const DEFAULT_GROUT_MM = 3;
const LAYOUTS = new Set<string>(TILE_LAYOUT_OPTIONS.map((l) => l.key));

export function snapshotTile(t: {
  id?: string;
  sku: string;
  name: string;
  textureUrl: string;
  previewUrl?: string | null;
  widthMm: number;
  heightMm: number;
  finish?: string | null;
  pricePerSqFt?: number | null;
}): TileSnapshot {
  return {
    id: t.id ?? t.sku,
    sku: t.sku,
    name: t.name,
    textureUrl: t.textureUrl,
    previewUrl: t.previewUrl ?? undefined,
    widthMm: t.widthMm,
    heightMm: t.heightMm,
    finish: t.finish ?? 'Matt',
    pricePerSqFt: t.pricePerSqFt ?? 0,
  };
}

/** Settings for a surface that has just been given its first tile. */
export function defaultSettings(tile: TileSnapshot | null, over: Partial<SurfaceSettings> = {}): SurfaceSettings {
  return {
    tile,
    layout: 'straight',
    rotationDeg: 0,
    tileWidthMm: tile?.widthMm ?? 600,
    tileHeightMm: tile?.heightMm ?? 600,
    groutMm: DEFAULT_GROUT_MM,
    groutColor: DEFAULT_GROUT_COLOR,
    offsetX: 0,
    offsetY: 0,
    lighting: 1,
    variation: 0.3,
    ...over,
  };
}

const num = (v: unknown, fallback: number, lo: number, hi: number) => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? clamp(n, lo, hi) : fallback;
};

const HEX = /^#[0-9a-fA-F]{6}$/;

function sanitizeTile(t: unknown): TileSnapshot | null {
  if (!t || typeof t !== 'object') return null;
  const o = t as Record<string, unknown>;
  const str = (v: unknown, max = 500) => (typeof v === 'string' ? v.slice(0, max) : '');
  const textureUrl = str(o.textureUrl, 2000);
  const sku = str(o.sku, 120);
  if (!textureUrl || !sku) return null;
  const [mmLo, mmHi] = TILE_SETTING_LIMITS.tileMm;
  return {
    id: str(o.id, 120) || sku,
    sku,
    name: str(o.name, 200) || sku,
    textureUrl,
    previewUrl: str(o.previewUrl, 2000) || undefined,
    widthMm: num(o.widthMm, 600, mmLo, mmHi),
    heightMm: num(o.heightMm, 600, mmLo, mmHi),
    finish: str(o.finish, 40) || 'Matt',
    pricePerSqFt: num(o.pricePerSqFt, 0, 0, 1e7),
  };
}

/** Coerces anything (a saved design from storage or the network) into valid settings. Never throws. */
export function sanitizeSettings(raw: unknown): SurfaceSettings | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const tile = sanitizeTile(o.tile);
  if (!tile) return null;
  const L = TILE_SETTING_LIMITS;
  return {
    tile,
    layout: (typeof o.layout === 'string' && LAYOUTS.has(o.layout) ? o.layout : 'straight') as TileLayout,
    rotationDeg: num(o.rotationDeg, 0, L.rotationDeg[0], L.rotationDeg[1]),
    tileWidthMm: num(o.tileWidthMm, tile.widthMm, L.tileMm[0], L.tileMm[1]),
    tileHeightMm: num(o.tileHeightMm, tile.heightMm, L.tileMm[0], L.tileMm[1]),
    groutMm: num(o.groutMm, DEFAULT_GROUT_MM, L.groutMm[0], L.groutMm[1]),
    groutColor: typeof o.groutColor === 'string' && HEX.test(o.groutColor) ? o.groutColor : DEFAULT_GROUT_COLOR,
    offsetX: num(o.offsetX, 0, L.offsetMm[0], L.offsetMm[1]),
    offsetY: num(o.offsetY, 0, L.offsetMm[0], L.offsetMm[1]),
    lighting: num(o.lighting, 1, L.lighting[0], L.lighting[1]),
    variation: num(o.variation, 0.3, L.variation[0], L.variation[1]),
  };
}

/**
 * A design that is safe to apply to `room`: only surfaces that exist in the room keep settings, settings are clamped,
 * and no more than MAX_DISTINCT_TILES different tiles survive. Anything unusable is dropped rather than rejected,
 * so an old or hand-edited save still opens.
 */
export function sanitizeDesign(raw: unknown, room: Pick<RoomScene, 'id' | 'surfaces'>): Design {
  const out: Design = { roomId: room.id, surfaces: {} };
  const source = raw && typeof raw === 'object' ? ((raw as Record<string, unknown>).surfaces as Record<string, unknown> | undefined) : undefined;
  if (!source || typeof source !== 'object') return out;
  const valid = new Set(room.surfaces.map(groupIdOf));
  const tiles = new Set<string>();
  for (const [id, value] of Object.entries(source)) {
    if (!valid.has(id)) continue;
    const settings = sanitizeSettings(value);
    if (!settings || !settings.tile) continue;
    if (!tiles.has(settings.tile.id) && tiles.size >= MAX_DISTINCT_TILES) continue;
    tiles.add(settings.tile.id);
    out.surfaces[id] = settings;
  }
  return out;
}

export const tileKey = (t: Pick<TileSnapshot, 'id' | 'textureUrl'>) => `${t.id}|${t.textureUrl}`;

/** The different tiles used by a design, in a stable order. */
export function distinctTiles(design: Design): TileSnapshot[] {
  const seen = new Map<string, TileSnapshot>();
  for (const s of Object.values(design.surfaces)) if (s.tile && !seen.has(tileKey(s.tile))) seen.set(tileKey(s.tile), s.tile);
  return [...seen.values()];
}

/** True when giving `tile` to one more surface would exceed the number of different tiles a room can hold. */
export function wouldExceedTileLimit(design: Design, replacing: string[], tile: TileSnapshot): boolean {
  const kept: Design = { roomId: design.roomId, surfaces: { ...design.surfaces } };
  for (const id of replacing) delete kept.surfaces[id];
  const tiles = distinctTiles(kept);
  return !tiles.some((t) => tileKey(t) === tileKey(tile)) && tiles.length >= MAX_DISTINCT_TILES;
}

export const isTiled = (design: Design) => Object.keys(design.surfaces).length > 0;

export function sameDesign(a: Design, b: Design): boolean {
  return a.roomId === b.roomId && JSON.stringify(a.surfaces) === JSON.stringify(b.surfaces);
}

export function finishGloss(finish: string | undefined): number {
  switch ((finish ?? '').toLowerCase()) {
    case 'polished':
      return 0.9;
    case 'gloss':
      return 0.6;
    case 'satin':
      return 0.25;
    default:
      return 0;
  }
}
