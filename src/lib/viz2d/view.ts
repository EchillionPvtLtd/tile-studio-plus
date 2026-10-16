import { clamp } from './geometry';

/**
 * Zoom and pan of the photo inside its viewport. The canvas always fills the viewport; what changes is which part of
 * the photo it shows, as a window in photo coordinates (0..1), so the picture is re-rendered sharply at any zoom.
 */
export interface ViewState {
  /** 1 = the whole photo fits; larger zooms in. */
  zoom: number;
  /** The photo point at the centre of the viewport (0..1). */
  cx: number;
  cy: number;
}

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 8;
export const FIT_VIEW: ViewState = { zoom: 1, cx: 0.5, cy: 0.5 };

interface Sizes {
  vw: number;
  vh: number;
  imgW: number;
  imgH: number;
}

/** Viewport pixels per photo pixel when the whole photo just fits. */
export const fitScale = ({ vw, vh, imgW, imgH }: Sizes) => Math.min(vw / imgW, vh / imgH);

/** Size of the visible window as a fraction of the photo. A value above 1 means empty margin shows around the photo. */
export function windowSize(view: ViewState, s: Sizes): [number, number] {
  const scale = fitScale(s) * view.zoom;
  return [s.vw / (scale * s.imgW), s.vh / (scale * s.imgH)];
}

/** Keeps the photo from being dragged out of sight: it stays centred when it is smaller than the viewport. */
export function clampView(view: ViewState, s: Sizes): ViewState {
  const zoom = clamp(view.zoom, MIN_ZOOM, MAX_ZOOM);
  const [w, h] = windowSize({ ...view, zoom }, s);
  return {
    zoom,
    cx: w >= 1 ? 0.5 : clamp(view.cx, w / 2, 1 - w / 2),
    cy: h >= 1 ? 0.5 : clamp(view.cy, h / 2, 1 - h / 2),
  };
}

/** The visible window [x, y, width, height] in photo coordinates, for the shader. */
export function visibleWindow(view: ViewState, s: Sizes): [number, number, number, number] {
  const [w, h] = windowSize(view, s);
  return [view.cx - w / 2, view.cy - h / 2, w, h];
}

/** Where a point of the viewport (fractions 0..1 of its width and height) falls on the photo. */
export function viewportToPhoto(fx: number, fy: number, view: ViewState, s: Sizes): [number, number] {
  const [x0, y0, w, h] = visibleWindow(view, s);
  return [x0 + fx * w, y0 + fy * h];
}

/** Zooms by `factor` keeping the photo point under (fx, fy) of the viewport where it is. */
export function zoomAt(view: ViewState, factor: number, fx: number, fy: number, s: Sizes): ViewState {
  const [u, v] = viewportToPhoto(fx, fy, view, s);
  const zoom = clamp(view.zoom * factor, MIN_ZOOM, MAX_ZOOM);
  const [w, h] = windowSize({ ...view, zoom }, s);
  return clampView({ zoom, cx: u - fx * w + w / 2, cy: v - fy * h + h / 2 }, s);
}

/** Pans by a drag of (dx, dy) viewport pixels. */
export function panBy(view: ViewState, dx: number, dy: number, s: Sizes): ViewState {
  const scale = fitScale(s) * view.zoom;
  return clampView({ ...view, cx: view.cx - dx / (scale * s.imgW), cy: view.cy - dy / (scale * s.imgH) }, s);
}

/** The most a tile is softened to match a low-resolution photo: beyond this the pattern would just look smeared. */
export const MAX_SOFTNESS = 3.5;

/**
 * How many screen pixels one pixel of the photo covers (at least 1). A small photo shown large is soft, so the tile laid
 * on it is filtered over the same footprint; otherwise the tile would be razor sharp inside a blurry room and look pasted
 * on. `windowWidth` is the visible part of the photo's width (0..1), as in visibleWindow.
 */
export function photoSoftness(canvasWidth: number, windowWidth: number, photoWidth: number): number {
  const perPhotoPixel = canvasWidth / (windowWidth * photoWidth);
  return Number.isFinite(perPhotoPixel) ? clamp(perPhotoPixel, 1, MAX_SOFTNESS) : 1;
}
