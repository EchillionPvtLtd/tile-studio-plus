'use client';

import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { Vector2 } from 'three';
import { renderSceneFrame } from './SceneRenderer';

type Capture = () => string | null;

type CaptureBlob = (type: 'image/jpeg' | 'image/png', quality: number) => Promise<Blob | null>;

let capture: Capture | null = null;
let captureBlob: CaptureBlob | null = null;

/** Longest side, in pixels, that a downloaded picture of the view is drawn at (the screen itself may be smaller). */
const PICTURE_SIDE = 3200;
const MAX_PICTURE_RATIO = 2;

/** Returns the current 3D view as a JPEG data URL, or null when no scene is mounted. */
export function captureSceneImage(): string | null {
  return capture ? capture() : null;
}

/**
 * The current 3D view as a picture file, drawn at up to twice the screen's sharpness: the room is drawn once more, larger,
 * read back at once and put back to the size of the screen. Null when no scene is mounted.
 */
export function captureSceneBlob(type: 'image/jpeg' | 'image/png' = 'image/jpeg', quality = 0.95): Promise<Blob | null> {
  return captureBlob ? captureBlob(type, quality) : Promise.resolve(null);
}

/**
 * Mount inside <Canvas>. Renders one frame on demand and reads it back straight away,
 * so the canvas does not need preserveDrawingBuffer (which would cost every frame).
 */
export function SceneSnapshotBridge() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);

  useEffect(() => {
    const fn: Capture = () => {
      try {
        // Same frame the canvas shows, including ambient occlusion
        if (!renderSceneFrame()) gl.render(scene, camera);
        return gl.domElement.toDataURL('image/jpeg', 0.9);
      } catch {
        return null;
      }
    };
    capture = fn;

    const blobFn: CaptureBlob = (type, quality) =>
      new Promise((resolve) => {
        const css = gl.getSize(new Vector2());
        const before = gl.getPixelRatio();
        const ratio = Math.max(before, Math.min(MAX_PICTURE_RATIO, PICTURE_SIDE / Math.max(css.x, css.y, 1)));
        const larger = ratio > before + 0.01;
        const draw = () => {
          if (!renderSceneFrame()) gl.render(scene, camera);
        };
        try {
          if (larger) {
            gl.setPixelRatio(ratio);
            gl.setSize(css.x, css.y, false);
          }
          draw();
          // toBlob takes the picture now, before the browser shows (and clears) the buffer
          gl.domElement.toBlob((b) => resolve(b), type, quality);
        } catch {
          resolve(null);
        } finally {
          if (larger) {
            gl.setPixelRatio(before);
            gl.setSize(css.x, css.y, false);
            draw();
          }
        }
      });
    captureBlob = blobFn;
    return () => {
      if (capture === fn) capture = null;
      if (captureBlob === blobFn) captureBlob = null;
    };
  }, [gl, scene, camera]);

  return null;
}
