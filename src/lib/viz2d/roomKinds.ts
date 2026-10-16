import { ROOM_CONFIGS, type RoomType } from '@/types/room';

/**
 * The kinds of room the 2D visualizer sorts its photographs into: the 3D visualizer's rooms, plus offices. An office only
 * exists as a photograph (there is no 3D office), so the 3D scenes' own RoomType is left as it is.
 */
export type RoomKind = RoomType | 'office';

export interface RoomKindInfo {
  type: RoomKind;
  label: string;
  /** For the filter buttons, where the full label would not fit. */
  shortLabel: string;
}

const SHORT_LABELS: Partial<Record<RoomKind, string>> = {
  'living-room': 'Living',
  'dining-room': 'Dining',
  outdoor: 'Balcony',
  staircase: 'Stairs',
};

export const ROOM_KINDS: RoomKindInfo[] = [
  ...ROOM_CONFIGS.map((c) => ({ type: c.type as RoomKind, label: c.label, shortLabel: SHORT_LABELS[c.type] ?? c.label })),
  { type: 'office', label: 'Office', shortLabel: 'Office' },
];

export const ROOM_KIND_IDS = ROOM_KINDS.map((k) => k.type) as [RoomKind, ...RoomKind[]];

/** The name of a room kind as people read it, or undefined for a value that is not a room kind. */
export const roomKindLabel = (type: string): string | undefined => ROOM_KINDS.find((k) => k.type === type)?.label;
