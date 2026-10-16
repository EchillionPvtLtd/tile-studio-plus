/** Curated interior paints offered in the visualizer's Walls tab. */
export const PAINT_COLORS = [
  { name: 'Alabaster', hex: '#f8f6f1' },
  { name: 'Warm White', hex: '#f3efe8' },
  { name: 'Cashmere', hex: '#e5e0d8' },
  { name: 'Greige', hex: '#d6cfc7' },
  { name: 'Desert Sand', hex: '#d4b996' },
  { name: 'Dusty Rose', hex: '#b89b94' },
  { name: 'Sage', hex: '#8a9a86' },
  { name: 'Olive', hex: '#4a5340' },
  { name: 'Smoky Blue', hex: '#475569' },
  { name: 'Terracotta', hex: '#9a533a' },
  { name: 'Espresso', hex: '#2d231b' },
  { name: 'Charcoal', hex: '#27272a' },
] as const;

/** Feature-wall panel systems rendered by ArchitecturalRoom. */
export const PANEL_TREATMENTS = [
  { id: 'wood-slats', name: 'Wood slats', desc: 'Vertical acoustic slats on a dark felt backing' },
  { id: 'marble-slab', name: 'Stone slabs', desc: 'Book-matched slabs with a fine shadow joint' },
] as const;

export type PanelTreatment = (typeof PANEL_TREATMENTS)[number]['id'];

export const PANEL_TONES = [
  { name: 'Walnut', hex: '#6b4a33' },
  { name: 'Smoked Oak', hex: '#3d2514' },
  { name: 'Natural Oak', hex: '#a07850' },
  { name: 'Charcoal', hex: '#2a2a2c' },
  { name: 'Calacatta', hex: '#efebe4' },
  { name: 'Travertine', hex: '#d9cdbb' },
  { name: 'Nero', hex: '#18181b' },
  { name: 'Olive Stone', hex: '#6b6a55' },
] as const;

/** Human name for a hex colour from either palette, else the hex itself. */
export function colourName(hex: string): string {
  const h = hex.toLowerCase();
  const hit = [...PAINT_COLORS, ...PANEL_TONES].find((c) => c.hex.toLowerCase() === h);
  return hit ? hit.name : hex.toUpperCase();
}
