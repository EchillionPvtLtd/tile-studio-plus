'use client';

import { useLayoutEffect } from 'react';
import type * as THREE from 'three';
import type { Quality } from '@/three/quality';
import { useThree } from '@react-three/fiber';
import { useRoomStore } from '@/stores/roomStore';
import { onSceneDirty } from '@/three/sceneDirty';
import { compileSafely } from '@/three/compileSafely';

/**
 * The room carries a dozen or more lights, which makes every material's shader large and slow to
 * compile (about a second each on integrated GPUs). Left to the first frame that draws an object,
 * each one freezes the page in turn, and anything out of view only compiles when you orbit to it.
 *
 * This compiles every material in the scene up front instead — all programs are started together and
 * finish in parallel without blocking the page — and again whenever a model, the lighting or the
 * room changes (those alter which shader variants exist). Mount it inside the room's Suspense so it
 * runs as soon as the room appears, before its first frame. `onReady` fires once the first compile is
 * done, so the canvas can hold its first frame until then instead of freezing the page on it.
 */
export function ShaderWarmup({ onReady, quality = 'high' }: { onReady?: () => void; quality?: Quality }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);

  useLayoutEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let alive = true;
    // Every visible light adds to every material's shader, so on low quality the small decorative
    // point lights (lamps, cabinet strips) are switched off and the big shadow maps are shrunk
    // before anything compiles.
    const trimLights = () => {
      if (quality !== 'low') return;
      scene.traverse((o) => {
        if ((o as THREE.PointLight).isPointLight) o.visible = false;
        const light = o as THREE.DirectionalLight;
        if (light.isDirectionalLight && light.shadow.mapSize.x > 1024) {
          light.shadow.mapSize.set(1024, 1024);
          light.shadow.map?.dispose();
          light.shadow.map = null;
        }
      });
    };
    const warm = () => {
      if (!alive) return;
      trimLights();
      compileSafely(gl, scene, camera).catch(() => {});
    };
    trimLights();
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(warm, 150);
    };

    // First compile: tell the canvas when it may start drawing (also after a timeout, in case a driver never reports ready)
    const giveUp = setTimeout(() => onReady?.(), 45000);
    compileSafely(gl, scene, camera)
      .catch(() => {})
      .then(() => {
        clearTimeout(giveUp);
        onReady?.();
      });
    const offModels = onSceneDirty(schedule);
    const offStore = useRoomStore.subscribe(schedule);
    return () => {
      alive = false;
      clearTimeout(giveUp);
      clearTimeout(timer);
      offModels();
      offStore();
    };
    // onReady is a one-shot signal; a changed callback must not restart the compile
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, scene, camera, quality]);

  return null;
}
