import type { TileLayout } from '@/types/tile';
import { finishGloss, groupIdOf } from './design';
import { planeMapping, transformPoint, type Mat3 } from './geometry';
import { layoutRotation } from './pattern';
import type { Design, RoomScene, SurfaceDef, TileSnapshot } from './types';

/** Mirrors SurfaceRenderState in the projector without depending on the browser-only module. */
export interface SurfaceShaderState {
  imageToPlane: Mat3;
  tileLayer: number;
  tileW: number;
  tileH: number;
  grout: number;
  kind: 0 | 1 | 2 | 3 | 4;
  theta: number;
  originX: number;
  originY: number;
  groutRgb: [number, number, number];
  lighting: number;
  variation: number;
  gloss: number;
  bevel: number;
  flipV: boolean;
}

const KIND: Record<TileLayout, 0 | 1 | 2 | 3 | 4> = { straight: 0, brick: 1, offset: 2, herringbone: 3, diagonal: 4 };

const srgbToLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

/** "#rrggbb" → linear-light rgb 0..1 (the shader blends in linear light). */
export function hexToLinear(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  const v = Number.isFinite(n) ? n : 0xc8c8c8;
  return [srgbToLinear(((v >> 16) & 255) / 255), srgbToLinear(((v >> 8) & 255) / 255), srgbToLinear((v & 255) / 255)];
}

/**
 * +1 when the surface's own axes read like a photo's (x right, y down), −1 when y points up (walls measured from the
 * floor). It decides which way "rotate clockwise" and "shift down" go on this particular surface.
 */
export function axisHandedness(surface: SurfaceDef): 1 | -1 | null {
  const map = planeMapping(surface.calibration);
  if (!map) return null;
  const [cx, cy] = [0, 1].map((k) => surface.calibration.planeMm.reduce((s, p) => s + p[k], 0) / 4);
  const d = 1;
  const at = (x: number, y: number) => transformPoint(map.planeToImage, x, y);
  const px = at(cx + d, cy);
  const mx = at(cx - d, cy);
  const py = at(cx, cy + d);
  const my = at(cx, cy - d);
  if (!px || !mx || !py || !my) return null;
  const det = (px[0] - mx[0]) * (py[1] - my[1]) - (py[0] - my[0]) * (px[1] - mx[1]);
  return det === 0 ? null : det > 0 ? 1 : -1;
}

/**
 * The shader inputs for every surface of a room, in the order of `room.surfaces`. Surfaces whose group has no tile, or
 * whose calibration cannot be solved, get `tileLayer: -1` and are left as photographed. Every surface keeps its own
 * perspective, so the editor's measuring grid can be drawn on a surface that has no tile yet.
 *
 * `layerOf` gives a tile's texture layer, or -1 while its image is not loaded yet.
 */
export function buildRenderStates(room: Pick<RoomScene, 'surfaces'>, design: Design, layerOf: (tile: TileSnapshot) => number): SurfaceShaderState[] {
  return room.surfaces.map((surface) => {
    const map = planeMapping(surface.calibration);
    const none: SurfaceShaderState = {
      imageToPlane: map?.imageToPlane ?? [1, 0, 0, 0, 1, 0, 0, 0, 1],
      tileLayer: -1,
      tileW: 600,
      tileH: 600,
      grout: 3,
      kind: 0,
      theta: 0,
      originX: 0,
      originY: 0,
      groutRgb: [0.5, 0.5, 0.5],
      lighting: 1,
      variation: 0,
      gloss: 0,
      bevel: 0,
      flipV: false,
    };
    const settings = design.surfaces[groupIdOf(surface)];
    if (!settings?.tile) return none;
    const hand = axisHandedness(surface);
    if (!map || !hand) return none;
    const layer = layerOf(settings.tile);
    return {
      imageToPlane: map.imageToPlane,
      tileLayer: layer,
      tileW: Math.max(1, settings.tileWidthMm),
      tileH: Math.max(1, settings.tileHeightMm),
      grout: Math.max(0, settings.groutMm),
      kind: KIND[settings.layout],
      // Positive rotation turns clockwise on screen whatever the surface's axes are; the layout adds its own 45°
      theta: hand * ((settings.rotationDeg * Math.PI) / 180) + layoutRotation(settings.layout),
      originX: settings.offsetX,
      originY: hand * settings.offsetY,
      groutRgb: hexToLinear(settings.groutColor),
      lighting: settings.lighting,
      variation: settings.variation,
      gloss: finishGloss(settings.tile.finish),
      bevel: 0.12,
      flipV: hand < 0,
    };
  });
}
