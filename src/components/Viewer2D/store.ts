'use client';

import { create } from 'zustand';
import { wouldExceedTileLimit } from '@/lib/viz2d/design';
import { applyTile, clearSurfaces, copySettings, emptyDesign, patchSettings } from '@/lib/viz2d/designOps';
import { createHistory, pushHistory, redoHistory, undoHistory, type History } from '@/lib/viz2d/history';
import type { Design, SurfaceSettings, TileSnapshot } from '@/lib/viz2d/types';

export interface Notice {
  id: number;
  kind: 'info' | 'success' | 'error';
  text: string;
}

interface Viz2DState {
  roomId: string | null;
  /** One undo history per room, so switching rooms and coming back keeps the work. */
  histories: Record<string, History<Design>>;
  /** Surface group ids that are selected (what the controls edit). */
  selected: string[];
  hover: string | null;
  compare: boolean;
  comparePos: number;
  notice: Notice | null;

  setRoom: (roomId: string) => void;
  selectGroup: (id: string, mode?: 'replace' | 'toggle') => void;
  selectGroups: (ids: string[]) => void;
  clearSelection: () => void;
  setHover: (id: string | null) => void;

  /** Lays a tile on the selected (or given) surfaces. Returns false, with a notice, when it cannot. */
  applyTileTo: (tile: TileSnapshot, groupIds?: string[]) => boolean;
  patch: (patch: Partial<SurfaceSettings>, coalesceKey: string, groupIds?: string[]) => void;
  removeTile: (groupIds?: string[]) => void;
  copyTo: (source: string, targets: string[]) => void;
  resetDesign: () => void;
  /** Replaces the room's design (opening a saved design). It is one undoable step. */
  loadDesign: (design: Design) => void;
  /** Sets a design without recording history (restoring the autosave). */
  hydrate: (design: Design) => void;

  undo: () => void;
  redo: () => void;
  setCompare: (on: boolean) => void;
  setComparePos: (pos: number) => void;
  notify: (text: string, kind?: Notice['kind']) => void;
  dismissNotice: () => void;
}

let noticeId = 0;
const EMPTY = new Map<string, Design>();

/** The design of the current room (a stable empty one when nothing is tiled yet). */
export function currentDesign(s: Pick<Viz2DState, 'roomId' | 'histories'>): Design {
  const h = s.roomId ? s.histories[s.roomId] : undefined;
  if (h) return h.present;
  // Selectors must return the same object each time while nothing changed, so empty designs are cached per room
  const id = s.roomId ?? '';
  let e = EMPTY.get(id);
  if (!e) {
    e = emptyDesign(id);
    EMPTY.set(id, e);
  }
  return e;
}

export const useViz2D = create<Viz2DState>()((set, get) => {
  /** Applies `change` to the current room's design and records it in history. */
  const commit = (change: (d: Design) => Design, coalesceKey: string | null = null) => {
    const s = get();
    if (!s.roomId) return;
    const h = s.histories[s.roomId] ?? createHistory(currentDesign(s));
    const next = change(h.present);
    if (next === h.present) return;
    set({ histories: { ...s.histories, [s.roomId]: pushHistory(h, next, coalesceKey) } });
  };
  const targets = (given?: string[]) => given ?? get().selected;

  return {
    roomId: null,
    histories: {},
    selected: [],
    hover: null,
    compare: false,
    comparePos: 0.5,
    notice: null,

    setRoom: (roomId) => set({ roomId, selected: [], hover: null, compare: false, notice: null }),
    selectGroup: (id, mode = 'replace') =>
      set((s) => ({ selected: mode === 'toggle' ? (s.selected.includes(id) ? s.selected.filter((x) => x !== id) : [...s.selected, id]) : [id] })),
    selectGroups: (ids) => set({ selected: ids }),
    clearSelection: () => set({ selected: [] }),
    setHover: (hover) => set((s) => (s.hover === hover ? s : { hover })),

    applyTileTo: (tile, groupIds) => {
      const ids = targets(groupIds);
      if (!ids.length) {
        get().notify('Click a surface in the room first, then choose a tile.', 'info');
        return false;
      }
      if (wouldExceedTileLimit(currentDesign(get()), ids, tile)) {
        get().notify('A room can use up to 8 different tiles. Remove one before adding another.', 'error');
        return false;
      }
      commit((d) => applyTile(d, ids, tile));
      return true;
    },
    patch: (patch, coalesceKey, groupIds) => commit((d) => patchSettings(d, targets(groupIds), patch), coalesceKey),
    removeTile: (groupIds) => commit((d) => clearSurfaces(d, targets(groupIds))),
    copyTo: (source, ids) => commit((d) => copySettings(d, source, ids)),
    resetDesign: () => commit((d) => (Object.keys(d.surfaces).length ? { ...d, surfaces: {} } : d)),
    loadDesign: (design) => {
      const s = get();
      if (!s.roomId) return;
      commit(() => ({ ...design, roomId: s.roomId! }));
    },
    hydrate: (design) => {
      set((s) => ({ histories: { ...s.histories, [design.roomId]: createHistory(design) } }));
    },

    undo: () => {
      const s = get();
      const h = s.roomId ? s.histories[s.roomId] : undefined;
      if (h?.past.length) set({ histories: { ...s.histories, [s.roomId!]: undoHistory(h) } });
    },
    redo: () => {
      const s = get();
      const h = s.roomId ? s.histories[s.roomId] : undefined;
      if (h?.future.length) set({ histories: { ...s.histories, [s.roomId!]: redoHistory(h) } });
    },
    setCompare: (compare) => set({ compare, hover: null }),
    setComparePos: (comparePos) => set({ comparePos: Math.max(0.02, Math.min(0.98, comparePos)) }),
    notify: (text, kind = 'info') => set({ notice: { id: ++noticeId, kind, text } }),
    dismissNotice: () => set({ notice: null }),
  };
});

export const selectCanUndo = (s: Viz2DState) => !!(s.roomId && s.histories[s.roomId]?.past.length);
export const selectCanRedo = (s: Viz2DState) => !!(s.roomId && s.histories[s.roomId]?.future.length);
