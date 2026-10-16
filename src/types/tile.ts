export interface Tile {
  id: string;
  sku: string;
  name: string;
  brand?: string | null;
  category: string; // 'floor' | 'wall' | 'both'
  widthMm: number;
  heightMm: number;
  finish: string;
  color: string;      // hex
  colorName: string;
  material?: string | null;
  textureUrl: string;
  previewUrl: string;
  pricePerSqFt: number;
  isBuiltIn: boolean;
  createdAt: string;
}

export type TileLayout = 'straight' | 'brick' | 'offset' | 'herringbone' | 'diagonal';

export interface TileLayoutOption {
  key: TileLayout;
  label: string;
  icon: string;
  description: string;
}

export const TILE_LAYOUT_OPTIONS: TileLayoutOption[] = [
  { key: 'straight',   label: 'Straight',    icon: '▦',  description: 'Standard grid alignment' },
  { key: 'brick',      label: 'Brick',       icon: '▬',  description: 'Alternating half-offset rows' },
  { key: 'offset',     label: '1/3 Offset',  icon: '▨',  description: 'One-third offset per row' },
  { key: 'herringbone', label: 'Herringbone', icon: '◈', description: 'Classic V-pattern' },
  { key: 'diagonal',   label: 'Diagonal',    icon: '◇',  description: '45° rotated grid' },
];

export const GROUT_COLORS = [
  { name: 'White',      hex: '#F5F5F5' },
  { name: 'Light Grey', hex: '#C8C8C8' },
  { name: 'Grey',       hex: '#9E9E9E' },
  { name: 'Dark Grey',  hex: '#616161' },
  { name: 'Charcoal',   hex: '#3C3C3C' },
  { name: 'Black',      hex: '#1A1A1A' },
  { name: 'Beige',      hex: '#D9C9A8' },
  { name: 'Cream',      hex: '#EDE0C4' },
  { name: 'Brown',      hex: '#795548' },
];

export const GROUT_WIDTHS = [1, 2, 3, 5, 8];

export const FINISHES = ['Matt', 'Gloss', 'Polished', 'Satin'];
export const CATEGORIES = ['Both', 'Floor', 'Wall'];
