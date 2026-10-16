import type { TileLayout } from '@/types/tile';
import type { RoomKind } from './roomKinds';

/**
 * Data model of the 2D visualizer.
 *
 * Everything that describes a room photo is stored in NORMALIZED image coordinates (x / width, y / height,
 * origin at the top-left), so a room looks the same at any display size, on any screen, and in any export size.
 */

/** A point in normalized image coordinates. */
export type Pt = [number, number];

/** A region of a photo: an outer ring and optional holes (cut-outs for furniture, windows, doors). */
export interface PolygonShape {
  outer: Pt[];
  holes?: Pt[][];
}

export type SurfaceKind = 'floor' | 'wall' | 'backsplash' | 'countertop' | 'other';

export const SURFACE_KINDS: { id: SurfaceKind; label: string }[] = [
  { id: 'floor', label: 'Floor' },
  { id: 'wall', label: 'Wall' },
  { id: 'backsplash', label: 'Backsplash' },
  { id: 'countertop', label: 'Countertop' },
  { id: 'other', label: 'Other surface' },
];

/**
 * How a flat surface in the photo maps to a real-world plane. Four points on the photo and where those same
 * four points are on the surface itself (millimetres) fully determine the perspective, so the tile grid
 * recedes and shrinks exactly the way the real floor or wall does.
 *
 * Point order is arbitrary but identical in both lists. The four points need not be the visible corners
 * of the surface and may lie outside the photo; they only have to be in front of the camera.
 */
export interface Calibration {
  image: [Pt, Pt, Pt, Pt];
  planeMm: [Pt, Pt, Pt, Pt];
}

export type SurfaceMask =
  /** A pre-computed alpha image (white = surface), used by the rooms that ship with the app. */
  | { kind: 'raster'; src: string }
  /** Hand-drawn outlines, used for rooms the showroom adds. */
  | { kind: 'polygons'; shapes: PolygonShape[] };

export interface SurfaceDef {
  id: string;
  /**
   * Facets of one physical surface (for example the two planes of an L-shaped wall, or the segments of a
   * curved one) share a group: they are selected, tiled and quoted together, but each keeps its own perspective.
   */
  group?: string;
  name: string;
  kind: SurfaceKind;
  /** Wins where surfaces overlap, both when drawing and when clicking. Higher is in front. */
  priority: number;
  mask: SurfaceMask;
  calibration: Calibration;
  /** Net tiled area (sq.ft) for quotations. Estimated from the calibration when missing. */
  areaSqFt?: number;
  /** Recommended tile layout and size for this surface. */
  defaults?: Partial<SurfaceSettings>;
  /** For the rooms rendered from the 3D scene: which wall of the 3D room this is. */
  wallSide?: 'north' | 'south' | 'east' | 'west';
}

export interface RoomScene {
  id: string;
  name: string;
  roomType: RoomKind;
  source: 'builtin' | 'custom';
  image: {
    src: string;
    width: number;
    height: number;
    thumb?: string;
  };
  surfaces: SurfaceDef[];
  /**
   * Names of the surfaces of this photo that were looked at and left out because they could not be identified accurately
   * (a wall hidden by furniture, one that merges into its neighbour). They stay as photographed and cannot be selected;
   * this only lets the panel say so. Absent when nothing was left out.
   */
  leftOut?: string[];
  /** Foreground objects (furniture, plants, people) that are in front of every surface. */
  occluders?: PolygonShape[];
  /** Real room size, when known (rooms rendered from the 3D scene). */
  dims?: { lengthFt: number; widthFt: number; heightFt: number };
  version: number;
}

/** The part of a catalogue tile that the visualizer needs. Saved with a design so it still opens if the catalogue changes. */
export interface TileSnapshot {
  id: string;
  sku: string;
  name: string;
  textureUrl: string;
  previewUrl?: string;
  widthMm: number;
  heightMm: number;
  finish: string;
  pricePerSqFt: number;
}

export interface SurfaceSettings {
  tile: TileSnapshot | null;
  layout: TileLayout;
  /** Extra rotation of the whole pattern on the surface, degrees. */
  rotationDeg: number;
  /** Size of one tile as laid (mm). Starts at the catalogue size. */
  tileWidthMm: number;
  tileHeightMm: number;
  groutMm: number;
  groutColor: string;
  /** Slides the pattern across the surface (mm), to choose where tiles start. */
  offsetX: number;
  offsetY: number;
  /** How much of the photo's own light and shadow is kept on the new tile: 0 = flat, 1 = as photographed. */
  lighting: number;
  /** Natural tile-to-tile shade variation, 0..1. */
  variation: number;
}

/** What a showroom customer has chosen: settings for every tiled surface, keyed by surface group id. */
export interface Design {
  roomId: string;
  surfaces: Record<string, SurfaceSettings>;
}

export const MAX_TILED_SURFACES = 16;
/** Different tiles in one design (they share one texture array on the GPU). */
export const MAX_DISTINCT_TILES = 8;

export const TILE_SETTING_LIMITS = {
  tileMm: [20, 3000],
  groutMm: [0, 20],
  rotationDeg: [-180, 180],
  offsetMm: [-3000, 3000],
  lighting: [0, 1.5],
  variation: [0, 1],
} as const;

export type { TileLayout, RoomKind };
