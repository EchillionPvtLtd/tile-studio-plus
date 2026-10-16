import type { Mat3 } from '@/lib/viz2d/geometry';
import { photoSoftness } from '@/lib/viz2d/view';
import { FRAGMENT_SHADER, MAX_SURFACES, TILE_LAYERS, VERTEX_SHADER } from './shaders';

/** Texture layers are square; a tile image is scaled to fit (the shader maps each tile's face onto the whole layer). */
const TILE_TEXTURE_SIZE = 1024;

export type LayoutKind = 0 | 1 | 2 | 3 | 4; // straight, brick, offset, herringbone, diagonal

/** Everything the shader needs to draw one surface. */
export interface SurfaceRenderState {
  /** Photo (0..1) → millimetres on the surface, row-major. */
  imageToPlane: Mat3;
  /** Texture layer of the tile (−1: nothing to draw on this surface). */
  tileLayer: number;
  tileW: number;
  tileH: number;
  grout: number;
  kind: LayoutKind;
  /** Total turn of the pattern in radians. */
  theta: number;
  originX: number;
  originY: number;
  /** Linear-light grout colour. */
  groutRgb: [number, number, number];
  /** 0..1.5: how much of the photo's own light to keep. */
  lighting: number;
  /** 0..1 */
  variation: number;
  /** 0..1 */
  gloss: number;
  /** 0..1 */
  bevel: number;
  /** True when the surface's y axis points up (walls measured from the floor). */
  flipV: boolean;
}

export interface ProjectorScene {
  image: ImageBitmap | HTMLImageElement | HTMLCanvasElement;
  width: number;
  height: number;
  /** One 0..255 coverage mask per surface, all `width × height`. */
  masks: Uint8Array[];
  /** The photo's light on each surface at `lightWidth × lightHeight`, 1.0 = typically lit. */
  light: Float32Array;
  lightWidth: number;
  lightHeight: number;
  /** The colour cast of the room's light (multiplier, luminance 1); omitted for a neutral room. */
  tint?: [number, number, number];
}

export interface FrameOptions {
  /** Before/after divider, 0..1 across the photo, or null for none. */
  compare: number | null;
  debug?: 0 | 1 | 2;
  /** The part of the photo on screen: x, y, width, height as fractions of the photo. */
  view: [number, number, number, number];
}

type Uniforms = Record<string, WebGLUniformLocation | null>;

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, source);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error(`Shader compile failed: ${log}`);
  }
  return sh;
}

/**
 * Draws the photo with tiles laid on its surfaces, on the GPU.
 *
 * All of the heavy lifting (inverse perspective, pattern, grout, texture filtering, lighting) is one fragment shader,
 * so dragging a slider only changes a few uniforms and costs one cheap full-screen pass.
 */
export class TileProjector {
  readonly canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private u: Uniforms = {};

  private baseTex: WebGLTexture | null = null;
  private maskTex: WebGLTexture | null = null;
  private lightTex: WebGLTexture | null = null;
  private tileTex: WebGLTexture;
  private aniso: { ext: EXT_texture_filter_anisotropic; max: number } | null = null;

  private scene: ProjectorScene | null = null;
  private surfaces: SurfaceRenderState[] = [];
  private frame: FrameOptions = { compare: null, view: [0, 0, 1, 1] };
  private rafId = 0;
  private disposed = false;
  private onLost = (e: Event) => e.preventDefault();

  /** Throws when WebGL 2 is not available. */
  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: true, premultipliedAlpha: true, depth: false, stencil: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    if (!gl) throw new Error('WebGL 2 is not available in this browser.');
    this.gl = gl;
    const vs = compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    const program = gl.createProgram()!;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(`Shader link failed: ${gl.getProgramInfoLog(program)}`);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    this.program = program;
    this.vao = gl.createVertexArray()!;
    for (const name of [
      'uBase', 'uMasks', 'uTiles', 'uLight', 'uRes', 'uView', 'uCount', 'uHinv', 'uTile', 'uLay', 'uGrout', 'uMisc',
      'uCompare', 'uDebug', 'uSoft', 'uTint',
    ]) {
      this.u[name] = gl.getUniformLocation(program, name);
    }
    const ext = gl.getExtension('EXT_texture_filter_anisotropic');
    if (ext) this.aniso = { ext, max: Math.min(16, gl.getParameter(ext.MAX_TEXTURE_MAX_ANISOTROPY_EXT) as number) };

    // Tile images: a fixed array of square layers, filled as tiles are chosen
    this.tileTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.tileTex);
    const levels = Math.floor(Math.log2(TILE_TEXTURE_SIZE)) + 1;
    gl.texStorage3D(gl.TEXTURE_2D_ARRAY, levels, gl.SRGB8_ALPHA8, TILE_TEXTURE_SIZE, TILE_TEXTURE_SIZE, TILE_LAYERS);
    this.setTileSampling(this.tileTex);
    canvas.addEventListener('webglcontextlost', this.onLost);
  }

  private setTileSampling(tex: WebGLTexture) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (this.aniso) gl.texParameterf(gl.TEXTURE_2D_ARRAY, this.aniso.ext.TEXTURE_MAX_ANISOTROPY_EXT, this.aniso.max);
  }

  // ── Scene ────────────────────────────────────────────────────────────────

  /** Loads a room: the photo, its surface masks and its light. Replaces whatever was loaded before. */
  setScene(scene: ProjectorScene) {
    const gl = this.gl;
    if (scene.masks.length > MAX_SURFACES) throw new Error(`A room can have at most ${MAX_SURFACES} surfaces`);
    this.freeSceneTextures();
    this.scene = scene;
    const { width, height } = scene;

    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);

    // The photo: sRGB, so the hardware hands the shader linear light and filters in linear light
    this.baseTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.baseTex);
    const baseLevels = Math.floor(Math.log2(Math.max(width, height))) + 1;
    gl.texStorage2D(gl.TEXTURE_2D, baseLevels, gl.SRGB8_ALPHA8, width, height);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, scene.image as TexImageSource);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // Masks: one layer per surface
    const layers = Math.max(1, scene.masks.length);
    this.maskTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.maskTex);
    const maskLevels = Math.floor(Math.log2(Math.max(width, height))) + 1;
    gl.texStorage3D(gl.TEXTURE_2D_ARRAY, maskLevels, gl.R8, width, height, layers);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    scene.masks.forEach((m, i) => gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, i, width, height, 1, gl.RED, gl.UNSIGNED_BYTE, m));
    gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // The photo's light, at a lower resolution
    this.lightTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.lightTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, scene.lightWidth, scene.lightHeight, 0, gl.RED, gl.FLOAT, scene.light);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    this.surfaces = [];
    this.requestRender();
  }

  private freeSceneTextures() {
    const gl = this.gl;
    for (const t of [this.baseTex, this.maskTex, this.lightTex]) if (t) gl.deleteTexture(t);
    this.baseTex = this.maskTex = this.lightTex = null;
  }

  /** Puts a tile image into a texture layer (scaled to the layer size, mipmapped). */
  setTileImage(layer: number, image: ImageBitmap | HTMLImageElement | HTMLCanvasElement) {
    if (layer < 0 || layer >= TILE_LAYERS) return;
    const gl = this.gl;
    // Scale to the layer size on a 2D canvas, which also gives a high quality downscale for big photos
    const c = document.createElement('canvas');
    c.width = c.height = TILE_TEXTURE_SIZE;
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image, 0, 0, TILE_TEXTURE_SIZE, TILE_TEXTURE_SIZE);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.tileTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, layer, TILE_TEXTURE_SIZE, TILE_TEXTURE_SIZE, 1, gl.RGBA, gl.UNSIGNED_BYTE, c);
    gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
    this.requestRender();
  }

  /** Updates what is drawn on each surface (in the order of the scene's masks). */
  setSurfaces(surfaces: SurfaceRenderState[]) {
    this.surfaces = surfaces;
    this.requestRender();
  }

  /** Sets where the before/after divider is and which part of the photo is shown. */
  setFrame(frame: Partial<FrameOptions>) {
    this.frame = { ...this.frame, ...frame };
    this.requestRender();
  }

  // ── Drawing ──────────────────────────────────────────────────────────────

  /** Size of the drawing buffer in device pixels. */
  resize(widthPx: number, heightPx: number) {
    const w = Math.max(1, Math.round(widthPx));
    const h = Math.max(1, Math.round(heightPx));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      this.requestRender();
    }
  }

  /** Draws at the next animation frame; many requests in one frame cost one draw. */
  requestRender() {
    if (this.rafId || this.disposed) return;
    this.rafId = requestAnimationFrame(() => {
      this.rafId = 0;
      this.draw();
    });
  }

  private draw() {
    const gl = this.gl;
    if (this.disposed || gl.isContextLost() || !this.scene || !this.baseTex) return;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.baseTex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.maskTex);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.tileTex);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this.lightTex);
    gl.uniform1i(this.u.uBase, 0);
    gl.uniform1i(this.u.uMasks, 1);
    gl.uniform1i(this.u.uTiles, 2);
    gl.uniform1i(this.u.uLight, 3);

    const n = Math.min(this.scene.masks.length, MAX_SURFACES);
    const hinv = new Float32Array(MAX_SURFACES * 9);
    const tile = new Float32Array(MAX_SURFACES * 4);
    const lay = new Float32Array(MAX_SURFACES * 4);
    const grout = new Float32Array(MAX_SURFACES * 4);
    const misc = new Float32Array(MAX_SURFACES * 4);
    tile.fill(-1);
    for (let i = 0; i < n; i++) {
      const s = this.surfaces[i];
      if (!s) continue;
      // GLSL matrices are column-major; ours are row-major
      const m = s.imageToPlane;
      hinv.set([m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]], i * 9);
      tile.set([s.tileW, s.tileH, s.grout, s.tileLayer], i * 4);
      lay.set([s.kind, s.theta, s.originX, s.originY], i * 4);
      grout.set([s.groutRgb[0], s.groutRgb[1], s.groutRgb[2], s.lighting], i * 4);
      misc.set([s.variation, s.gloss, s.bevel, s.flipV ? 1 : 0], i * 4);
    }
    gl.uniform2f(this.u.uRes, this.canvas.width, this.canvas.height);
    gl.uniform4f(this.u.uView, ...this.frame.view);
    gl.uniform1i(this.u.uCount, n);
    gl.uniformMatrix3fv(this.u.uHinv, false, hinv);
    gl.uniform4fv(this.u.uTile, tile);
    gl.uniform4fv(this.u.uLay, lay);
    gl.uniform4fv(this.u.uGrout, grout);
    gl.uniform4fv(this.u.uMisc, misc);
    const compare = this.frame.compare;
    gl.uniform1f(this.u.uCompare, compare ?? -1);
    gl.uniform1i(this.u.uDebug, this.frame.debug ?? 0);
    gl.uniform1f(this.u.uSoft, photoSoftness(this.canvas.width, this.frame.view[2], this.scene.width));
    gl.uniform3f(this.u.uTint, ...(this.scene.tint ?? [1, 1, 1]));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /** Renders the finished picture at the photo's own size (no divider) and encodes it. */
  async exportBlob(type: 'image/jpeg' | 'image/png' = 'image/jpeg', quality = 0.92, maxSide = 4096): Promise<Blob> {
    if (!this.scene) throw new Error('No room is loaded');
    const prev = { w: this.canvas.width, h: this.canvas.height, frame: this.frame };
    const k = Math.min(1, maxSide / Math.max(this.scene.width, this.scene.height));
    this.canvas.width = Math.round(this.scene.width * k);
    this.canvas.height = Math.round(this.scene.height * k);
    this.frame = { ...this.frame, compare: null, debug: 0, view: [0, 0, 1, 1] };
    try {
      this.draw();
      // toBlob captures the drawing buffer now, before the browser presents and clears it
      return await new Promise<Blob>((resolve, reject) => this.canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode the image'))), type, quality));
    } finally {
      this.frame = prev.frame;
      this.canvas.width = prev.w;
      this.canvas.height = prev.h;
      this.requestRender();
    }
  }

  /** Reads one pixel back (RGBA, 0..255) from the last drawing, for tests. */
  readPixel(x: number, y: number): [number, number, number, number] {
    const gl = this.gl;
    this.draw();
    const px = new Uint8Array(4);
    gl.readPixels(x, this.canvas.height - 1 - y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    return [px[0], px[1], px[2], px[3]];
  }

  /**
   * Frees the GPU resources this projector made. The WebGL context itself stays alive so the same canvas can get a new
   * projector straight away (React may unmount and remount a component immediately); call loseContext() when the canvas is
   * really finished with.
   */
  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.rafId);
    this.canvas.removeEventListener('webglcontextlost', this.onLost);
    const gl = this.gl;
    if (gl.isContextLost()) return;
    this.freeSceneTextures();
    gl.deleteTexture(this.tileTex);
    gl.deleteProgram(this.program);
    gl.deleteVertexArray(this.vao);
  }

  /** Releases the canvas's WebGL context entirely. The canvas cannot be used for WebGL again afterwards. */
  loseContext() {
    this.gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}
