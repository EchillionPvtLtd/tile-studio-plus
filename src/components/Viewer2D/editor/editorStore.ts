'use client';

import { create } from 'zustand';
import {
  addHole,
  addShape,
  calibrationSize,
  deleteVertex,
  guessCalibration,
  insertVertex,
  moveVertex,
  planeRect,
  ringProblem,
  withCalibrationSize,
  type VertexRef,
} from '@/lib/viz2d/editing';
import { createHistory, pushHistory, redoHistory, undoHistory, type History } from '@/lib/viz2d/history';
import { MAX_TILED_SURFACES, type Calibration, type PolygonShape, type Pt, type RoomKind, type SurfaceDef, type SurfaceKind } from '@/lib/viz2d/types';

/** What the pointer does on the photo while editing. */
export type EditorTool = 'points' | 'draw' | 'cutout' | 'wand' | 'object' | 'perspective';

/** A room being added or changed. Its surfaces are always hand-drawn outlines. */
export interface EditorDraft {
  /** The saved room being edited, or null for a new one. */
  roomId: string | null;
  /** The id the stage knows this room by while editing. */
  sceneId: string;
  name: string;
  roomType: RoomKind;
  image: {
    src: string;
    width: number;
    height: number;
    /** A photo chosen on this device that has not been uploaded yet. */
    file?: Blob;
    /** Where the photo is stored once uploaded. */
    uploadedUrl?: string;
  };
  surfaces: SurfaceDef[];
  /** Foreground objects in front of every surface. */
  occluders: PolygonShape[];
}

interface EditorState {
  history: History<EditorDraft> | null;
  activeId: string | null;
  tool: EditorTool;
  /** The outline being drawn, point by point. */
  drawing: Pt[];
  /** Where the pointer is on the photo, for the rubber band while drawing. */
  pointer: Pt | null;
  vertex: VertexRef | null;
  /** Surfaces whose perspective the person has set by hand: the guess no longer overwrites it. */
  calibrated: string[];
  grid: boolean;
  wand: { tolerance: number; edge: number };
  saving: boolean;
  message: string | null;

  open: (draft: EditorDraft) => void;
  close: () => void;
  /** Changes the draft; edits with the same key that follow one another become one undo step. */
  update: (change: (d: EditorDraft) => EditorDraft, coalesceKey?: string | null) => void;
  undo: () => void;
  redo: () => void;

  setActive: (id: string | null) => void;
  setTool: (tool: EditorTool) => void;
  setPointer: (p: Pt | null) => void;
  setVertex: (v: VertexRef | null) => void;
  setGrid: (on: boolean) => void;
  setWand: (w: Partial<EditorState['wand']>) => void;
  setSaving: (on: boolean) => void;
  setMessage: (m: string | null) => void;

  rename: (name: string) => void;
  setRoomMeta: (meta: { name?: string; roomType?: RoomKind }) => void;
  addSurface: (kind: SurfaceKind) => void;
  removeSurface: (id: string) => void;
  renameSurface: (id: string, name: string) => void;
  setKind: (id: string, kind: SurfaceKind) => void;
  moveSurface: (id: string, direction: -1 | 1) => void;

  /** Drawing a new outline. */
  addDrawingPoint: (p: Pt) => void;
  cancelDrawing: () => void;
  /** Closes the outline being drawn and adds it to the active surface (or, for objects, to the room). */
  finishDrawing: () => string | null;

  addShapes: (shapes: PolygonShape[]) => void;
  moveVertexTo: (ref: VertexRef, to: Pt) => void;
  insertVertexAt: (edge: { shape: number; ring: number; index: number }, p: Pt) => VertexRef;
  deleteVertexAt: (ref: VertexRef) => void;
  clearOutline: (id: string) => void;
  removeOccluder: (index: number) => void;

  setCalibrationPoint: (index: number, p: Pt) => void;
  setCalibrationSize: (widthMm: number, heightMm: number) => void;
  guessPerspective: (id?: string) => void;
}

/** A first, placeholder perspective until the outline gives something better. */
const placeholderCalibration = (kind: SurfaceKind): Calibration => ({
  image: [[0.3, 0.3], [0.7, 0.3], [0.7, 0.7], [0.3, 0.7]],
  planeMm: planeRect(kind, kind === 'wall' ? 4000 : 3000, kind === 'wall' ? 2700 : 3000),
});

const DEFAULT_NAMES: Record<SurfaceKind, string> = { floor: 'Floor', wall: 'Wall', backsplash: 'Backsplash', countertop: 'Countertop', other: 'Surface' };

function uniqueId(existing: SurfaceDef[], base: string) {
  const taken = new Set(existing.map((s) => s.id));
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
}

const shapesOf = (s: SurfaceDef): PolygonShape[] => (s.mask.kind === 'polygons' ? s.mask.shapes : []);
const withShapes = (s: SurfaceDef, shapes: PolygonShape[]): SurfaceDef => ({ ...s, mask: { kind: 'polygons', shapes } });

/** A surface of a kind that has no outline yet, with a name and an id not used by the others. */
function blankSurface(existing: SurfaceDef[], kind: SurfaceKind): SurfaceDef {
  const sameKind = existing.filter((s) => s.kind === kind).length;
  return {
    id: uniqueId(existing, kind === 'other' ? 'surface' : kind),
    name: sameKind ? `${DEFAULT_NAMES[kind]} ${sameKind + 1}` : DEFAULT_NAMES[kind],
    kind,
    priority: kind === 'floor' ? 0 : kind === 'wall' ? 1 : 2,
    mask: { kind: 'polygons', shapes: [] },
    calibration: placeholderCalibration(kind),
  };
}

export const useRoomEditor = create<EditorState>()((set, get) => {
  const draftOf = () => get().history?.present ?? null;

  const apply = (change: (d: EditorDraft) => EditorDraft, key: string | null = null) => {
    const h = get().history;
    if (!h) return;
    const next = change(h.present);
    if (next !== h.present) set({ history: pushHistory(h, next, key) });
  };

  /** Applies `change` to the active surface. */
  const onActive = (change: (s: SurfaceDef) => SurfaceDef, key: string | null = null) => {
    const id = get().activeId;
    if (!id) return;
    apply((d) => ({ ...d, surfaces: d.surfaces.map((s) => (s.id === id ? change(s) : s)) }), key);
  };

  /** Keeps a surface's perspective guess in step with its outline until the person has set it by hand. */
  const reguess = (s: SurfaceDef): SurfaceDef => {
    if (get().calibrated.includes(s.id)) return s;
    const c = guessCalibration(shapesOf(s), s.kind);
    return c ? { ...s, calibration: c } : s;
  };

  return {
    history: null,
    activeId: null,
    tool: 'draw',
    drawing: [],
    pointer: null,
    vertex: null,
    calibrated: [],
    grid: false,
    wand: { tolerance: 26, edge: 40 },
    saving: false,
    message: null,

    open: (draft) => {
      // A new room starts with its floor, ready to be outlined: nearly every room has one
      const start = draft.surfaces.length ? draft : { ...draft, surfaces: [blankSurface([], 'floor')] };
      set({
        history: createHistory(start),
        activeId: start.surfaces[0].id,
        // Marked surfaces already have a perspective the person may have set: do not overwrite it with a guess
        calibrated: draft.surfaces.map((s) => s.id),
        tool: draft.surfaces.length ? 'points' : 'draw',
        drawing: [],
        pointer: null,
        vertex: null,
        grid: false,
        saving: false,
        message: null,
      });
    },
    close: () => set({ history: null, activeId: null, drawing: [], pointer: null, vertex: null, calibrated: [], grid: false, saving: false, message: null }),
    update: apply,
    undo: () => set((s) => (s.history ? { history: undoHistory(s.history), drawing: [], vertex: null } : s)),
    redo: () => set((s) => (s.history ? { history: redoHistory(s.history), drawing: [], vertex: null } : s)),

    setActive: (activeId) => set({ activeId, drawing: [], vertex: null }),
    setTool: (tool) => set({ tool, drawing: [], vertex: null }),
    setPointer: (pointer) => set({ pointer }),
    setVertex: (vertex) => set({ vertex }),
    setGrid: (grid) => set({ grid }),
    setWand: (w) => set((s) => ({ wand: { ...s.wand, ...w } })),
    setSaving: (saving) => set({ saving }),
    setMessage: (message) => set({ message }),

    rename: (name) => apply((d) => ({ ...d, name }), 'room-name'),
    setRoomMeta: (meta) => apply((d) => ({ ...d, ...(meta.name !== undefined ? { name: meta.name } : {}), ...(meta.roomType ? { roomType: meta.roomType } : {}) }), 'room-meta'),

    addSurface: (kind) => {
      const d = draftOf();
      if (!d) return;
      if (d.surfaces.length >= MAX_TILED_SURFACES) {
        set({ message: `A room can have up to ${MAX_TILED_SURFACES} surface pieces.` });
        return;
      }
      const surface = blankSurface(d.surfaces, kind);
      apply((x) => ({ ...x, surfaces: [...x.surfaces, surface] }));
      set({ activeId: surface.id, tool: 'draw', drawing: [], vertex: null, message: null });
    },
    removeSurface: (id) => {
      apply((d) => ({ ...d, surfaces: d.surfaces.filter((s) => s.id !== id) }));
      set((st) => ({ activeId: st.activeId === id ? (draftOf()?.surfaces[0]?.id ?? null) : st.activeId, vertex: null, drawing: [] }));
    },
    renameSurface: (id, name) => apply((d) => ({ ...d, surfaces: d.surfaces.map((s) => (s.id === id ? { ...s, name } : s)) }), `name-${id}`),
    setKind: (id, kind) => {
      apply((d) => ({
        ...d,
        surfaces: d.surfaces.map((s) => {
          if (s.id !== id) return s;
          const next = { ...s, kind, priority: kind === 'floor' ? 0 : kind === 'wall' ? 1 : 2 };
          // A wall's surface is measured up from the floor and a floor's away from its first corner
          const size = calibrationSize(s.calibration);
          return { ...next, calibration: withCalibrationSize(s.calibration, kind, size.width, size.height) };
        }),
      }));
    },
    moveSurface: (id, direction) =>
      apply((d) => {
        const i = d.surfaces.findIndex((s) => s.id === id);
        const j = i + direction;
        if (i < 0 || j < 0 || j >= d.surfaces.length) return d;
        const surfaces = [...d.surfaces];
        // Swapping places also swaps who is in front when outlines overlap
        const [a, b] = [surfaces[i], surfaces[j]];
        surfaces[i] = { ...b, priority: a.priority };
        surfaces[j] = { ...a, priority: b.priority };
        return { ...d, surfaces };
      }),

    addDrawingPoint: (p) => set((s) => ({ drawing: [...s.drawing, p] })),
    cancelDrawing: () => set({ drawing: [] }),
    finishDrawing: () => {
      const { drawing, tool } = get();
      const problem = ringProblem(drawing);
      if (problem) {
        set({ message: problem });
        return problem;
      }
      if (tool === 'object') {
        apply((d) => ({ ...d, occluders: addShape(d.occluders, drawing) }));
      } else if (tool === 'cutout') {
        const id = get().activeId;
        const surface = draftOf()?.surfaces.find((s) => s.id === id);
        const cut = surface ? addHole(shapesOf(surface), drawing) : null;
        if (!cut) {
          set({ message: 'Draw a cut-out inside the outline of the active surface.' });
          return 'outside';
        }
        onActive((s) => withShapes(s, cut));
      } else {
        onActive((s) => reguess(withShapes(s, addShape(shapesOf(s), drawing))));
      }
      set({ drawing: [], message: null, tool: tool === 'draw' ? 'points' : tool });
      return null;
    },

    addShapes: (shapes) => {
      if (!shapes.length) return;
      onActive((s) => reguess(withShapes(s, [...shapesOf(s), ...shapes])));
    },
    moveVertexTo: (ref, to) => onActive((s) => reguess(withShapes(s, moveVertex(shapesOf(s), ref, to))), 'vertex-drag'),
    insertVertexAt: (edge, p) => {
      onActive((s) => withShapes(s, insertVertex(shapesOf(s), edge, p)));
      return { shape: edge.shape, ring: edge.ring, index: edge.index + 1 };
    },
    deleteVertexAt: (ref) => {
      onActive((s) => reguess(withShapes(s, deleteVertex(shapesOf(s), ref))));
      set({ vertex: null });
    },
    clearOutline: (id) => apply((d) => ({ ...d, surfaces: d.surfaces.map((s) => (s.id === id ? withShapes(s, []) : s)) })),
    removeOccluder: (index) => apply((d) => ({ ...d, occluders: d.occluders.filter((_, i) => i !== index) })),

    setCalibrationPoint: (index, p) => {
      const id = get().activeId;
      if (id && !get().calibrated.includes(id)) set((s) => ({ calibrated: [...s.calibrated, id] }));
      onActive((s) => {
        const image = s.calibration.image.map((q, i) => (i === index ? p : q)) as Calibration['image'];
        return { ...s, calibration: { ...s.calibration, image } };
      }, 'calibration-drag');
    },
    setCalibrationSize: (widthMm, heightMm) => {
      const id = get().activeId;
      if (id && !get().calibrated.includes(id)) set((s) => ({ calibrated: [...s.calibrated, id] }));
      onActive((s) => ({ ...s, calibration: withCalibrationSize(s.calibration, s.kind, widthMm, heightMm) }), 'calibration-size');
    },
    guessPerspective: (id) => {
      const target = id ?? get().activeId;
      if (!target) return;
      set((s) => ({ calibrated: s.calibrated.filter((x) => x !== target) }));
      apply((d) => ({ ...d, surfaces: d.surfaces.map((s) => (s.id === target ? reguess(s) : s)) }));
    },
  };
});

export const selectDraft = (s: EditorState) => s.history?.present ?? null;
export const selectActiveSurface = (s: EditorState) => s.history?.present.surfaces.find((x) => x.id === s.activeId) ?? null;
export const selectEditorCanUndo = (s: EditorState) => !!s.history?.past.length;
export const selectEditorCanRedo = (s: EditorState) => !!s.history?.future.length;
