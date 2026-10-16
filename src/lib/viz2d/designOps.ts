import { defaultSettings, sanitizeSettings } from './design';
import type { Design, SurfaceSettings, TileSnapshot } from './types';

/**
 * The editing operations on a design. All of them return a new design (the old one is untouched, which is what makes
 * undo and redo trivial) and return the same object when nothing changed.
 */

/**
 * Lays `tile` on the given surfaces. A surface that already has a tile keeps how it was laid (pattern, rotation, grout,
 * lighting) and takes the new tile's own size, so trying one tile after another compares like with like.
 */
export function applyTile(design: Design, groupIds: string[], tile: TileSnapshot, initial: Partial<SurfaceSettings> = {}): Design {
  if (!groupIds.length) return design;
  const surfaces = { ...design.surfaces };
  for (const id of groupIds) {
    const current = surfaces[id];
    surfaces[id] = current
      ? { ...current, tile, tileWidthMm: tile.widthMm, tileHeightMm: tile.heightMm }
      : defaultSettings(tile, initial);
  }
  return { ...design, surfaces };
}

/** Changes settings on the tiled surfaces among `groupIds` (values are clamped to their valid range). */
export function patchSettings(design: Design, groupIds: string[], patch: Partial<SurfaceSettings>): Design {
  let changed = false;
  const surfaces = { ...design.surfaces };
  for (const id of groupIds) {
    const current = surfaces[id];
    if (!current) continue;
    const next = sanitizeSettings({ ...current, ...patch });
    if (!next) continue;
    if (JSON.stringify(next) !== JSON.stringify(current)) {
      surfaces[id] = next;
      changed = true;
    }
  }
  return changed ? { ...design, surfaces } : design;
}

/** Takes the tile off the given surfaces. */
export function clearSurfaces(design: Design, groupIds: string[]): Design {
  if (!groupIds.some((id) => design.surfaces[id])) return design;
  const surfaces = { ...design.surfaces };
  for (const id of groupIds) delete surfaces[id];
  return { ...design, surfaces };
}

/** Gives `targets` the same tile and laying as `source` ("use this on every wall"). */
export function copySettings(design: Design, source: string, targets: string[]): Design {
  const from = design.surfaces[source];
  if (!from) return design;
  const surfaces = { ...design.surfaces };
  let changed = false;
  for (const id of targets) {
    if (id === source) continue;
    if (JSON.stringify(surfaces[id]) !== JSON.stringify(from)) {
      surfaces[id] = { ...from };
      changed = true;
    }
  }
  return changed ? { ...design, surfaces } : design;
}

export const emptyDesign = (roomId: string): Design => ({ roomId, surfaces: {} });
