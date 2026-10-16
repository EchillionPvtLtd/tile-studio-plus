import type { RoomType, SurfaceKey } from '@/types/room';
import type { Tile } from '@/types/tile';
import { getBathroomLayout, getRoomOpenings, type Opening, type WallSide } from '@/components/Viewer/roomLayout';

const FT2M = 0.3048;
const SQM_TO_SQFT = 10.7639;
/** Cutting / breakage allowance added to every tiled surface. */
export const WASTAGE = 0.1;

// Mirrors the kitchen backsplash run in ArchitecturalRoom (west wall → fridge column, 0.72 m tall).
const FRIDGE_HOUSING_WIDTH_M = 1.04;
const BACKSPLASH_HEIGHT_M = 0.72;

export interface QuoteRoomInput {
  roomType: RoomType;
  lengthFt: number;
  widthFt: number;
  heightFt: number;
  doorWidthFt: number;
  doorHeightFt: number;
  windowWidthFt: number;
  windowHeightFt: number;
  featureWallTreatment: string;
  getTileForSurface: (s: SurfaceKey) => Tile | null;
}

export interface QuoteLine {
  surface: SurfaceKey;
  label: string;
  tile: Tile;
  /** Net tiled area after door / window cut-outs. */
  areaSqFt: number;
  /** Tiles to buy, including wastage. */
  tiles: number;
  /** Area actually purchased (tiles × tile size). */
  purchaseSqFt: number;
  amount: number;
}

export interface Quote {
  lines: QuoteLine[];
  total: number;
}

const WALL_SIDE: Record<string, WallSide> = { 'wall-n': 'north', 'wall-s': 'south', 'wall-e': 'east', 'wall-w': 'west' };

export const QUOTE_SURFACE_LABELS: Partial<Record<SurfaceKey, string>> = {
  floor: 'Floor',
  'wall-n': 'North wall (feature)',
  'wall-s': 'South wall',
  'wall-e': 'East wall',
  'wall-w': 'West wall',
  backsplash: 'Kitchen backsplash',
  'shower-wall': 'Shower walls',
};

/** Tile face area in sq.ft. */
export function tileAreaSqFt(tile: Pick<Tile, 'widthMm' | 'heightMm'>): number {
  return Math.max(0.01, (tile.widthMm / 304.8) * (tile.heightMm / 304.8));
}

/** Surfaces that exist in this room type, in quote order. */
export function quoteSurfaces(roomType: RoomType): SurfaceKey[] {
  const walls: SurfaceKey[] = roomType === 'outdoor' ? ['wall-n', 'wall-e', 'wall-w'] : ['wall-n', 'wall-s', 'wall-e', 'wall-w'];
  return [
    'floor',
    ...walls,
    ...(roomType === 'kitchen' ? (['backsplash'] as SurfaceKey[]) : []),
    ...(roomType === 'bathroom' ? (['shower-wall'] as SurfaceKey[]) : []),
  ];
}

/** Net area of one surface in sq.ft, with door, window and slider openings removed. */
export function surfaceAreaSqFt(surface: SurfaceKey, r: QuoteRoomInput): number {
  const L = r.lengthFt * FT2M;
  const W = r.widthFt * FT2M;
  const H = r.heightFt * FT2M;
  let sqm = 0;

  if (surface === 'floor') {
    sqm = L * W;
  } else if (surface === 'backsplash') {
    sqm = Math.max(0, L - FRIDGE_HOUSING_WIDTH_M - 0.01) * BACKSPLASH_HEIGHT_M;
  } else if (surface === 'shower-wall') {
    const bath = getBathroomLayout(L, W);
    sqm = (bath.showerW + bath.showerD) * H;
  } else if (WALL_SIDE[surface]) {
    const side = WALL_SIDE[surface];
    const gross = (side === 'north' || side === 'south' ? L : W) * H;
    const o = getRoomOpenings(r.roomType, L, W, H, r.doorWidthFt * FT2M, r.doorHeightFt * FT2M, r.windowWidthFt * FT2M, r.windowHeightFt * FT2M);
    const holes = [o.door, o.window, o.slider, o.upperDoor]
      .filter((x): x is Opening => !!x && x.wall === side)
      .reduce((sum, x) => sum + x.width * x.height, 0);
    sqm = Math.max(0, gross - holes);
  }
  return Math.round(sqm * SQM_TO_SQFT * 10) / 10;
}

export function buildQuote(r: QuoteRoomInput): Quote {
  const lines: QuoteLine[] = [];
  for (const surface of quoteSurfaces(r.roomType)) {
    // A panelled feature wall hides its tile, so it isn't quoted as tiling.
    if (surface === 'wall-n' && r.featureWallTreatment !== 'none') continue;
    const tile = r.getTileForSurface(surface);
    if (!tile) continue;

    const areaSqFt = surfaceAreaSqFt(surface, r);
    const per = tileAreaSqFt(tile);
    const tiles = Math.ceil((areaSqFt / per) * (1 + WASTAGE));
    const purchaseSqFt = Math.round(tiles * per * 10) / 10;
    lines.push({
      surface,
      label: QUOTE_SURFACE_LABELS[surface] ?? surface,
      tile,
      areaSqFt,
      tiles,
      purchaseSqFt,
      amount: Math.round(purchaseSqFt * (tile.pricePerSqFt || 0)),
    });
  }
  return { lines, total: lines.reduce((s, l) => s + l.amount, 0) };
}
