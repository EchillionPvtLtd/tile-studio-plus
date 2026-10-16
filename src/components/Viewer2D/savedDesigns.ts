import { sanitizeDesign } from '@/lib/viz2d/design';
import type { Design, RoomScene } from '@/lib/viz2d/types';

/**
 * Designs kept in this browser: an autosave of the work in progress and a list of named saves. Everything here
 * tolerates storage being full, blocked or corrupted: the visualizer works the same without it.
 */

export interface SavedDesign2D {
  id: string;
  name: string;
  roomId: string;
  roomName: string;
  /**
   * The photo of the room when the design was saved. A design only fits that photo: the photos of the rooms can be replaced
   * while their ids stay (lv-01 is still lv-01), and tiles chosen for one picture must not appear on another.
   */
  roomImage?: string;
  savedAt: number;
  /** Small JPEG data URL of the finished picture. */
  thumbnail: string;
  design: Design;
}

const SAVED_KEY = 'tsp.viz2d.saved.v1';
const AUTOSAVE_KEY = 'tsp.viz2d.autosave.v1';
const MAX_SAVED = 24;

function read<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): boolean {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function listSavedDesigns(): SavedDesign2D[] {
  const list = read<SavedDesign2D[]>(SAVED_KEY);
  if (!Array.isArray(list)) return [];
  return list.filter((d) => d && typeof d.id === 'string' && typeof d.roomId === 'string' && d.design).sort((a, b) => b.savedAt - a.savedAt);
}

/** Adds a save. When storage is full the oldest saves are dropped until it fits. Returns false if it cannot be kept at all. */
export function addSavedDesign(entry: SavedDesign2D): boolean {
  let list = [entry, ...listSavedDesigns().filter((d) => d.id !== entry.id)].slice(0, MAX_SAVED);
  while (list.length > 0) {
    if (write(SAVED_KEY, list)) return true;
    list = list.slice(0, -1);
  }
  return false;
}

export function removeSavedDesign(id: string) {
  write(SAVED_KEY, listSavedDesigns().filter((d) => d.id !== id));
}

/** True when a saved design was made on the photo the room has now (a design saved without noting its photo cannot be told). */
export const savedDesignFits = (saved: Pick<SavedDesign2D, 'roomImage'>, room: Pick<RoomScene, 'image'>) => !!saved.roomImage && saved.roomImage === room.image.src;

/** The designs in progress, one per room, restored when the visualizer opens again. `photos` says which photo each room had. */
export function saveAutosave(designs: Record<string, Design>, roomId: string | null, photos: Record<string, string>) {
  const tiled: Record<string, Design> = {};
  const kept: Record<string, string> = {};
  for (const [id, d] of Object.entries(designs)) {
    if (!Object.keys(d.surfaces).length || !photos[id]) continue;
    tiled[id] = d;
    kept[id] = photos[id];
  }
  write(AUTOSAVE_KEY, { roomId, designs: tiled, photos: kept });
}

export function loadAutosave(rooms: (Pick<RoomScene, 'id' | 'surfaces'> & { image: Pick<RoomScene['image'], 'src'> })[]): { roomId: string | null; designs: Design[] } {
  const raw = read<{ roomId?: string | null; designs?: Record<string, unknown>; photos?: Record<string, unknown> }>(AUTOSAVE_KEY);
  if (!raw || typeof raw !== 'object') return { roomId: null, designs: [] };
  const designs: Design[] = [];
  for (const room of rooms) {
    const d = raw.designs?.[room.id];
    // A design belongs to the photo it was made on, not to the room's id: the photos can be replaced under the same ids
    if (!d || raw.photos?.[room.id] !== room.image.src) continue;
    const clean = sanitizeDesign(d, room);
    if (Object.keys(clean.surfaces).length) designs.push(clean);
  }
  return { roomId: typeof raw.roomId === 'string' ? raw.roomId : null, designs };
}

export function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error ?? new Error('Could not read the image'));
    r.readAsDataURL(blob);
  });

/** A file-name friendly version of a title. */
export const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'room';
