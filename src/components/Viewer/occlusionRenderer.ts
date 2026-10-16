import * as THREE from 'three';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { FX_LAYER } from './viewerLayers';
import { runPreRender } from './renderHooks';

/** 'high' renders ambient occlusion at full resolution, 'medium' at half, 'off' skips it. */
export type AoQuality = 'high' | 'medium' | 'off';

/**
 * The parts of GTAOPass this renderer drives directly. They are plain public methods in the
 * three.js example but missing from its type declarations.
 */
type GtaoDriver = GTAOPass & {
  normalRenderTarget: THREE.WebGLRenderTarget;
  overrideVisibility(): void;
  restoreVisibility(): void;
  renderOverride(r: THREE.WebGLRenderer, m: THREE.Material, t: THREE.WebGLRenderTarget, clearColor?: number, clearAlpha?: number): void;
  renderPass(r: THREE.WebGLRenderer, m: THREE.Material, t: THREE.WebGLRenderTarget | null, clearColor?: number, clearAlpha?: number): void;
};

export interface FrameContext {
  gl: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.Camera;
  /** Canvas size in CSS pixels. */
  width: number;
  height: number;
  quality: AoQuality;
}

/** Draws the current view exactly as the canvas shows it (used by the quotation snapshot). Returns false when no scene is mounted. */
export function renderSceneFrame(): boolean {
  const live = OcclusionRenderer.live;
  if (!live) return false;
  live.redraw();
  return true;
}

/**
 * Draws each frame and layers soft ambient occlusion over it — the contact darkening in corners,
 * under furniture and between cushions that real rooms have and flat real-time lighting lacks.
 *
 * The scene is drawn normally first, so every material, tone-map and emissive keeps its look.
 * Occlusion is then computed from a normal/depth pre-pass and multiplied over the finished frame.
 * It only depends on geometry and the camera, so it is recomputed when either changes and reused
 * while the view is still.
 */
export class OcclusionRenderer {
  /** The renderer currently drawing the canvas, so a snapshot can ask for the same frame. */
  static live: OcclusionRenderer | null = null;

  private pass: GtaoDriver | null = null;
  private last: FrameContext | null = null;
  private view = new THREE.Matrix4();
  private proj = new THREE.Matrix4();
  private w = 0;
  private h = 0;
  private valid = false;

  /** Forces the occlusion to be recomputed on the next frame (geometry or size changed). */
  invalidate() {
    this.valid = false;
  }

  dispose() {
    this.pass?.dispose();
    this.pass = null;
    this.valid = false;
    if (OcclusionRenderer.live === this) OcclusionRenderer.live = null;
  }

  /** Repeats the last frame, for snapshots taken outside the render loop. */
  redraw() {
    if (this.last) this.render(this.last);
  }

  private createPass(scene: THREE.Scene, camera: THREE.Camera, width: number, height: number): GtaoDriver {
    const p = new GTAOPass(scene, camera, width, height) as GtaoDriver;
    // Room-scale occlusion: tight enough to seat furniture and darken corners without haloing thin objects,
    // with enough samples that the banding of a coarse march never shows.
    p.updateGtaoMaterial({ radius: 0.4, distanceExponent: 1.2, thickness: 0.25, distanceFallOff: 1, scale: 1, samples: 32 });
    p.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 8, rings: 3, samples: 24 });
    p.blendIntensity = 0.8;
    return p;
  }

  render(ctx: FrameContext) {
    OcclusionRenderer.live = this;
    this.last = ctx;
    const { gl, scene, quality } = ctx;
    const camera = ctx.camera as THREE.PerspectiveCamera;

    // Glows live on the effects layer: drawn with the scene, but invisible to the occlusion pre-pass
    camera.layers.enable(FX_LAYER);
    camera.updateMatrixWorld();
    runPreRender({ gl, scene, camera });
    gl.render(scene, camera);
    if (quality === 'off') return;

    const scale = quality === 'high' ? 1 : 0.5;
    const dpr = gl.getPixelRatio();
    const w = Math.max(2, Math.floor(ctx.width * dpr * scale));
    const h = Math.max(2, Math.floor(ctx.height * dpr * scale));
    const pass = (this.pass ??= this.createPass(scene, camera, w, h));
    pass.scene = scene;
    pass.camera = camera;

    const moved = !this.view.equals(camera.matrixWorld) || !this.proj.equals(camera.projectionMatrix);
    if (!this.valid || moved || this.w !== w || this.h !== h) {
      if (this.w !== w || this.h !== h) {
        pass.setSize(w, h);
        this.w = w;
        this.h = h;
      }
      this.view.copy(camera.matrixWorld);
      this.proj.copy(camera.projectionMatrix);
      this.valid = true;

      const prevTarget = gl.getRenderTarget();
      camera.layers.disable(FX_LAYER);
      pass.overrideVisibility();
      pass.renderOverride(gl, pass.normalMaterial, pass.normalRenderTarget, 0x7777ff, 1.0);
      pass.restoreVisibility();
      camera.layers.enable(FX_LAYER);

      const g = pass.gtaoMaterial.uniforms;
      g.cameraNear.value = camera.near;
      g.cameraFar.value = camera.far;
      g.cameraProjectionMatrix.value.copy(camera.projectionMatrix);
      g.cameraProjectionMatrixInverse.value.copy(camera.projectionMatrixInverse);
      g.cameraWorldMatrix.value.copy(camera.matrixWorld);
      pass.renderPass(gl, pass.gtaoMaterial, pass.gtaoRenderTarget, 0xffffff, 1.0);

      pass.pdMaterial.uniforms.cameraProjectionMatrixInverse.value.copy(camera.projectionMatrixInverse);
      pass.renderPass(gl, pass.pdMaterial, pass.pdRenderTarget, 0xffffff, 1.0);
      gl.setRenderTarget(prevTarget);
    }

    // Multiply the occlusion over the frame that is already on screen
    pass.blendMaterial.uniforms.intensity.value = pass.blendIntensity;
    pass.blendMaterial.uniforms.tDiffuse.value = pass.pdRenderTarget.texture;
    pass.renderPass(gl, pass.blendMaterial, null);
  }
}
