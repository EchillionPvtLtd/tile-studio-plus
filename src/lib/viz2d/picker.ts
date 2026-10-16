import type { SurfaceGroup } from './design';
import type { Design } from './types';

/**
 * The labels floating over a photo: one for the floor, one for "Wall" (all the walls together, with how many have a tile),
 * and one for each other marked surface. Clicking one selects what it stands for; the selected surfaces then show a tick each.
 */
export interface PickerPill {
  /** 'wall', or the kind and group id of a surface that stands alone. */
  key: string;
  label: string;
  /** The surface groups a click on this label selects. */
  groupIds: string[];
  /** How many of those surfaces have a tile, out of `total`. */
  done: number;
  total: number;
  /** True when there is more than one surface, so "done/total" is worth showing. */
  counted: boolean;
  /** Where the label sits on the photo (0..1): on the biggest of its surfaces. */
  anchor: [number, number];
}

export function buildPills(groups: SurfaceGroup[], anchors: Record<string, [number, number]>, design: Pick<Design, 'surfaces'>): PickerPill[] {
  const placed = groups.filter((g) => anchors[g.id]);
  const tiled = (ids: string[]) => ids.filter((id) => !!design.surfaces[id]?.tile).length;
  const pills: PickerPill[] = [];

  for (const g of placed) {
    if (g.kind === 'wall') continue;
    pills.push({ key: `${g.kind}:${g.id}`, label: g.name, groupIds: [g.id], done: tiled([g.id]), total: 1, counted: false, anchor: anchors[g.id] });
  }

  const walls = placed.filter((g) => g.kind === 'wall');
  if (walls.length) {
    const biggest = walls.reduce((a, b) => (b.areaSqFt > a.areaSqFt ? b : a));
    const ids = walls.map((g) => g.id);
    pills.push({ key: 'wall', label: walls.length === 1 ? walls[0].name : 'Wall', groupIds: ids, done: tiled(ids), total: ids.length, counted: ids.length > 1, anchor: anchors[biggest.id] });
  }
  return pills;
}

/**
 * The labels whose surfaces are being edited. While any surface is selected, only the labels it belongs to stay (each as a tick
 * per surface); when the last tick was just turned off, `stickyKey` keeps that label open so its surfaces can be ticked again.
 */
export function activePills(pills: PickerPill[], selected: string[], stickyKey: string | null): PickerPill[] {
  const chosen = new Set(selected);
  const active = pills.filter((p) => p.groupIds.some((id) => chosen.has(id)));
  if (active.length || !stickyKey) return active;
  const sticky = pills.find((p) => p.key === stickyKey);
  return sticky ? [sticky] : [];
}
