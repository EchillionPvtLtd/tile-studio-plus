import type * as THREE from 'three';

/** What a pre-render hook is given: the same renderer, scene and camera the frame is about to be drawn with. */
export interface PreRenderContext {
  gl: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.Camera;
}

type PreRender = (ctx: PreRenderContext) => void;

const hooks = new Set<PreRender>();

/** Registers work that must happen just before every frame is drawn (for example a reflection pass). Returns an unregister function. */
export function registerPreRender(fn: PreRender): () => void {
  hooks.add(fn);
  return () => {
    hooks.delete(fn);
  };
}

export function runPreRender(ctx: PreRenderContext) {
  hooks.forEach((fn) => fn(ctx));
}

/** Quality switches the renderer can flip when the GPU struggles. */
export const renderFlags = { reflections: true };
