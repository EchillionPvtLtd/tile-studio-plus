/**
 * Shadows and contact shadows are expensive to draw and the room is static between edits, so
 * they are only redrawn when something in the scene actually changes (a model finishes
 * loading, the room, lighting or surfaces change). Anything that changes the scene without
 * going through the room store calls markSceneDirty().
 */
type Listener = () => void;
const listeners = new Set<Listener>();

/** Counts committed scene changes, so cached passes (reflections) can tell when they are stale. */
let epoch = 0;
export const getSceneEpoch = () => epoch;
export const bumpSceneEpoch = () => {
  epoch += 1;
};

export function markSceneDirty() {
  listeners.forEach((fn) => fn());
}

export function onSceneDirty(fn: Listener) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
