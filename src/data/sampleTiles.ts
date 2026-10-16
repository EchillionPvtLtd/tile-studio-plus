/**
 * Built-in tile definitions are intentionally empty.
 * Showrooms should use their own uploaded catalogue tiles.
 */
export interface SampleTile {
  sku: string;
  name: string;
  brand: string;
  category: 'both' | 'floor' | 'wall';
  widthMm: number;
  heightMm: number;
  finish: 'Matt' | 'Gloss' | 'Polished' | 'Satin';
  color: string;
  colorName: string;
  material: string;
  pricePerSqFt: number;
  isBuiltIn: boolean;
  textureUrl: string;
  previewUrl: string;
}

export const SAMPLE_TILES: SampleTile[] = [];
