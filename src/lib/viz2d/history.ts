/**
 * Undo/redo for any immutable value. A burst of changes with the same `coalesceKey` that arrive close together (a
 * slider being dragged) become one step, so undo goes back to before the drag, not one pixel at a time.
 */
export interface History<T> {
  past: T[];
  present: T;
  future: T[];
  /** What the last push was and when, for coalescing. */
  lastKey: string | null;
  lastAt: number;
}

export const HISTORY_LIMIT = 100;
export const COALESCE_MS = 700;

export const createHistory = <T,>(initial: T): History<T> => ({ past: [], present: initial, future: [], lastKey: null, lastAt: 0 });

export function pushHistory<T>(h: History<T>, next: T, coalesceKey: string | null = null, now = Date.now()): History<T> {
  if (Object.is(next, h.present)) return h;
  const coalesce = coalesceKey !== null && coalesceKey === h.lastKey && now - h.lastAt < COALESCE_MS && h.past.length > 0;
  const past = coalesce ? h.past : [...h.past, h.present].slice(-HISTORY_LIMIT);
  return { past, present: next, future: [], lastKey: coalesceKey, lastAt: now };
}

export function undoHistory<T>(h: History<T>): History<T> {
  if (!h.past.length) return h;
  const previous = h.past[h.past.length - 1];
  return { past: h.past.slice(0, -1), present: previous, future: [h.present, ...h.future], lastKey: null, lastAt: 0 };
}

export function redoHistory<T>(h: History<T>): History<T> {
  if (!h.future.length) return h;
  const [next, ...rest] = h.future;
  return { past: [...h.past, h.present], present: next, future: rest, lastKey: null, lastAt: 0 };
}

export const canUndo = <T,>(h: History<T>) => h.past.length > 0;
export const canRedo = <T,>(h: History<T>) => h.future.length > 0;
