'use client';

import React, { Suspense, useEffect, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useThree } from '@react-three/fiber';
import { ContactShadows, PerformanceMonitor } from '@react-three/drei';
import { ArchitecturalRoom } from './ArchitecturalRoom';
import { DynamicLighting } from './DynamicLighting';
import { CameraEngine } from './CameraEngine';
import { SceneSnapshotBridge } from './sceneSnapshot';
import { ShaderWarmup } from './ShaderWarmup';

import { useRoomStore } from '@/stores/roomStore';
import { onSceneDirty, bumpSceneEpoch } from '@/three/sceneDirty';
import { detectQuality, type Quality } from '@/three/quality';

const FT2M = 0.3048;

/** Store fields that change what the shadows should look like. Camera and UI state do not. */
const shadowKey = (s: ReturnType<typeof useRoomStore.getState>) =>
  [
    s.roomType, s.lengthFt, s.widthFt, s.heightFt,
    s.doorWidthFt, s.doorHeightFt, s.doorPositionRatio,
    s.windowWidthFt, s.windowHeightFt, s.windowPositionRatio,
    s.activeTemplateId, s.timeOfDay, s.wallTreatment, s.featureWallTreatment, s.featureWallBacklight,
  ].join('|');

/**
 * Shadows are drawn once and reused while the camera moves. They are redrawn (after a short
 * debounce, so a burst of changes costs one redraw) when the room, lighting or a 3D model changes.
 * Returns a counter that changes on every redraw, used to refresh the contact shadows too.
 */
function useStaticShadows() {
  const gl = useThree((s) => s.gl);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    gl.shadowMap.autoUpdate = false;
    gl.shadowMap.needsUpdate = true; // first frame already has shadows
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        gl.shadowMap.needsUpdate = true;
        bumpSceneEpoch();
        setVersion((v) => v + 1);
      }, 120);
    };
    refresh();
    const offModels = onSceneDirty(refresh);
    const offStore = useRoomStore.subscribe(shadowKey, refresh);
    return () => {
      clearTimeout(timer);
      offModels();
      offStore();
      gl.shadowMap.autoUpdate = true;
    };
  }, [gl]);

  return version;
}

function SceneContents({ onReady, quality }: { onReady: () => void; quality: Quality }) {
  const { lengthFt, widthFt } = useRoomStore();
  const lengthM = lengthFt * FT2M;
  const widthM = widthFt * FT2M;
  const shadowVersion = useStaticShadows();

  return (
    <Suspense fallback={null}>
      {/* Time of Day & Dynamic Studio Lighting */}
      <DynamicLighting />

      {/* Thick Architectural Room Geometry & Furniture */}
      <ArchitecturalRoom />

      {/* Soft floor contact shadows: rendered for a couple of frames after each change, then frozen */}
      <ContactShadows
        key={shadowVersion}
        position={[0, 0.002, 0]}
        opacity={0.5}
        scale={Math.max(lengthM, widthM) * 1.6}
        blur={2.0}
        far={2}
        resolution={quality === 'low' ? 256 : 512}
        frames={2}
      />

      {/* Compiles every shader in parallel up front, so nothing freezes the page the first time it comes into view */}
      <ShaderWarmup onReady={onReady} quality={quality} />

      {/* Camera Engine & Presets */}
      <CameraEngine />
    </Suspense>
  );
}

export function SceneCanvas() {
  const widthFt = useRoomStore((s) => s.widthFt);
  const widthM = widthFt * FT2M;
  // Touch devices and weak machines get lighter settings (no antialiasing, 1x pixels, smaller shadows, fewer lights)
  const [quality] = useState<Quality>(detectQuality);
  const low = quality === 'low';
  const maxDpr = low ? 1 : 1.5;
  const minDpr = low ? 0.75 : 1;
  // Starts at the quality's sharpest and steps down on slow GPUs (PerformanceMonitor) so orbiting stays smooth.
  const [dpr, setDpr] = useState(maxDpr);
  // Nothing is drawn until every shader has compiled, so the page stays responsive instead of freezing on the first frame
  const [ready, setReady] = useState(false);

  return (
    <>
    <Canvas
      frameloop={ready ? 'always' : 'never'}
      shadows={low ? 'basic' : 'soft'}
      dpr={dpr}
      gl={{
        antialias: !low,
        powerPreference: 'high-performance',
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.05,
        shadowMapType: low ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap,
      }}
      camera={{
        position: [0, 1.4, widthM * 0.35],
        fov: 45,
        near: 0.1,
        far: 1000,
      }}
      style={{ background: 'transparent' }}
    >
      <PerformanceMonitor
        onDecline={() => setDpr((d) => Math.max(minDpr, d - 0.25))}
        onIncline={() => setDpr((d) => Math.min(maxDpr, d + 0.25))}
      />
      <SceneContents onReady={() => setReady(true)} quality={quality} />

      {/* Lets the quotation PDF grab the current view */}
      <SceneSnapshotBridge />
    </Canvas>
    {!ready && (
      <div className="pointer-events-none absolute inset-0 z-[5] flex flex-col items-center justify-center gap-3 bg-muted text-muted-foreground">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-foreground border-t-transparent" />
        <p className="text-xs font-medium">Preparing 3D room…</p>
      </div>
    )}
    </>
  );
}
