import { describe, expect, it } from "vitest";
import { FIT_VIEW, MAX_SOFTNESS, MAX_ZOOM, clampView, panBy, photoSoftness, viewportToPhoto, visibleWindow, windowSize, zoomAt } from "@/lib/viz2d/view";

// A 1920×1200 photo in a 1000×800 viewport: it fits by width, leaving margin above and below
const S = { vw: 1000, vh: 800, imgW: 1920, imgH: 1200 };

describe("view", () => {
  it("fits the whole photo at zoom 1 and shows margin on the short side", () => {
    const [w, h] = windowSize(FIT_VIEW, S);
    expect(w).toBeCloseTo(1, 6);
    expect(h).toBeGreaterThan(1);
    const win = visibleWindow(FIT_VIEW, S);
    expect(win[0]).toBeCloseTo(0, 6);
    expect(win[1]).toBeLessThan(0);
  });

  it("maps viewport points to photo points", () => {
    const [u, v] = viewportToPhoto(0.5, 0.5, FIT_VIEW, S);
    expect(u).toBeCloseTo(0.5, 6);
    expect(v).toBeCloseTo(0.5, 6);
    expect(viewportToPhoto(0, 0.5, FIT_VIEW, S)[0]).toBeCloseTo(0, 6);
    expect(viewportToPhoto(1, 0.5, FIT_VIEW, S)[0]).toBeCloseTo(1, 6);
  });

  it("zooms about the point under the pointer, which stays put", () => {
    const fx = 0.7;
    const fy = 0.45;
    const before = viewportToPhoto(fx, fy, FIT_VIEW, S);
    const zoomed = zoomAt(FIT_VIEW, 3, fx, fy, S);
    expect(zoomed.zoom).toBeCloseTo(3, 6);
    const after = viewportToPhoto(fx, fy, zoomed, S);
    expect(after[0]).toBeCloseTo(before[0], 6);
    expect(after[1]).toBeCloseTo(before[1], 6);
  });

  it("limits zoom and clamps the window to the photo", () => {
    expect(zoomAt(FIT_VIEW, 100, 0.5, 0.5, S).zoom).toBe(MAX_ZOOM);
    expect(zoomAt(FIT_VIEW, 0.01, 0.5, 0.5, S).zoom).toBe(1);
    const z = clampView({ zoom: 4, cx: -3, cy: 9 }, S);
    const [x0, y0, w, h] = visibleWindow(z, S);
    expect(x0).toBeGreaterThanOrEqual(-1e-9);
    expect(y0 + h).toBeLessThanOrEqual(1 + 1e-9);
    expect(x0 + w).toBeLessThanOrEqual(1 + 1e-9);
  });

  it("pans by the drag distance and not past the edge", () => {
    const zoomed = { zoom: 4, cx: 0.5, cy: 0.5 };
    const moved = panBy(zoomed, 100, 0, S);
    expect(moved.cx).toBeLessThan(0.5); // dragging right reveals the left
    const scale = (1000 / 1920) * 4;
    expect(0.5 - moved.cx).toBeCloseTo(100 / (scale * 1920), 6);
    expect(panBy(zoomed, 1e6, 1e6, S).cx).toBeGreaterThan(0);
    // At zoom 1 along the short side the photo stays centred
    expect(panBy(FIT_VIEW, 0, 50, S).cy).toBeCloseTo(0.5, 6);
  });
});

describe("photoSoftness", () => {
  it("is 1 when the photo is shown at its own size or smaller", () => {
    expect(photoSoftness(1000, 1, 1920)).toBe(1);
    expect(photoSoftness(1920, 1, 1920)).toBe(1);
  });

  it("grows as a small photo is shown larger, in proportion to the screen pixels each photo pixel covers", () => {
    expect(photoSoftness(1400, 1, 700)).toBeCloseTo(2, 6);
    // zoomed in: the window is a quarter of the photo, so every photo pixel covers four times as many screen pixels
    expect(photoSoftness(1000, 0.25, 1000)).toBeCloseTo(3.5, 6);
  });

  it("never softens beyond the limit, and survives nonsense", () => {
    expect(photoSoftness(4000, 0.1, 480)).toBe(MAX_SOFTNESS);
    expect(photoSoftness(1000, 0, 700)).toBe(1);
    expect(photoSoftness(Number.NaN, 1, 700)).toBe(1);
  });
});
