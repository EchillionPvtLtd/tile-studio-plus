import { WASTAGE, tileAreaSqFt, type Quote, type QuoteLine } from '@/lib/quotation';
import type { Tile } from '@/types/tile';
import type { SurfaceKey } from '@/types/room';
import { buildGroups } from './design';
import { MM2_PER_SQFT, planeMapping, shapeArea, transformPoint, type PlaneMapping } from './geometry';
import type { Design, PolygonShape, RoomScene, SurfaceDef, TileSnapshot } from './types';

/** A catalogue-shaped tile built from a saved snapshot, as the quotation PDF expects. `size` is the size it is laid at. */
function asTile(t: TileSnapshot, widthMm: number, heightMm: number): Tile {
  return {
    id: t.id,
    sku: t.sku,
    name: t.name,
    category: 'both',
    widthMm,
    heightMm,
    finish: t.finish,
    color: '#cccccc',
    colorName: 'Tile',
    textureUrl: t.textureUrl,
    previewUrl: t.previewUrl ?? t.textureUrl,
    pricePerSqFt: t.pricePerSqFt,
    isBuiltIn: false,
    createdAt: '',
  };
}

/**
 * The real area of a hand-drawn surface, from its outline and its perspective: each outline point is carried to
 * millimetres on the surface and the area is measured there. Outline points above the surface's horizon are ignored.
 */
export function shapesAreaSqFt(shapes: PolygonShape[], map: PlaneMapping): number {
  const toPlane = (ring: [number, number][]) =>
    ring.map(([x, y]) => (Math.sign(map.imageToPlane[6] * x + map.imageToPlane[7] * y + map.imageToPlane[8]) === map.frontSign ? transformPoint(map.imageToPlane, x, y) : null));
  let mm2 = 0;
  for (const s of shapes) {
    const outer = toPlane(s.outer);
    if (outer.some((p) => !p)) continue;
    const holes = (s.holes ?? []).map(toPlane).filter((h) => h.every((p) => p));
    mm2 += shapeArea({ outer: outer as [number, number][], holes: holes as [number, number][][] });
  }
  return Math.round((mm2 / MM2_PER_SQFT) * 10) / 10;
}

/** The surface's tiled area in sq.ft: the stored value, else measured from its outline, else 0. */
export function surfaceAreaSqFt(surface: SurfaceDef): number {
  if (typeof surface.areaSqFt === 'number' && surface.areaSqFt > 0) return surface.areaSqFt;
  if (surface.mask.kind === 'polygons') {
    const map = planeMapping(surface.calibration);
    if (map) return shapesAreaSqFt(surface.mask.shapes, map);
  }
  return 0;
}

/** A quotation for a 2D design: one line per tiled surface, priced and counted like the 3D visualizer's. */
export function buildQuote2D(room: Pick<RoomScene, 'surfaces'>, design: Design): Quote {
  const lines: QuoteLine[] = [];
  for (const group of buildGroups(room)) {
    const settings = design.surfaces[group.id];
    if (!settings?.tile) continue;
    const areaSqFt = Math.round(group.facets.reduce((sum, i) => sum + surfaceAreaSqFt(room.surfaces[i]), 0) * 10) / 10;
    const tile = asTile(settings.tile, settings.tileWidthMm, settings.tileHeightMm);
    const per = tileAreaSqFt(tile);
    const tiles = Math.ceil((areaSqFt / per) * (1 + WASTAGE));
    const purchaseSqFt = Math.round(tiles * per * 10) / 10;
    lines.push({
      surface: group.id as SurfaceKey,
      label: group.name,
      tile,
      areaSqFt,
      tiles,
      purchaseSqFt,
      amount: Math.round(purchaseSqFt * (tile.pricePerSqFt || 0)),
    });
  }
  return { lines, total: lines.reduce((s, l) => s + l.amount, 0) };
}
