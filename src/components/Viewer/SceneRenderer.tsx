'use client';

import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OcclusionRenderer, type AoQuality } from './occlusionRenderer';

export { renderSceneFrame, type AoQuality } from './occlusionRenderer';

/**
 * Takes over the render loop (R3F stops drawing on its own once a frame callback has a positive
 * priority) so every frame gets soft ambient occlusion, floor reflections and any other pre-render
 * work. `sceneVersion` changes whenever the room, lighting or a model changes, which makes the
 * cached occlusion recompute.
 */
export function SceneRenderer({ quality, sceneVersion }: { quality: AoQuality; sceneVersion: number }) {
  const renderer = useMemo(() => new OcclusionRenderer(), []);
  const width = useThree((s) => s.size.width);
  const height = useThree((s) => s.size.height);

  useEffect(() => () => renderer.dispose(), [renderer]);
  useEffect(() => {
    renderer.invalidate();
  }, [renderer, quality, sceneVersion, width, height]);

  useFrame(({ gl, scene, camera, size }) => {
    renderer.render({ gl, scene, camera, width: size.width, height: size.height, quality });
  }, 1);

  return null;
}
