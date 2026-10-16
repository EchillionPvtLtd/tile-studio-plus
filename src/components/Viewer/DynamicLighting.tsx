'use client';

import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { Environment, Lightformer } from '@react-three/drei';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import { useRoomStore } from '@/stores/roomStore';
import type { RoomType } from '@/types/room';
import { useStyleTheme } from './Furniture/styleThemes';
import { useInteriorMaterials, setLampGlow } from './Furniture/interiorMaterials';
import { getRoomOpenings, type WallSide } from './roomLayout';
import { WindowSun, type SunBeam } from './WindowSun';
import { markSceneDirty } from '@/three/sceneDirty';

const FT2M = 0.3048;

/** The sky/ground hemisphere is only a soft bounce; the window, sun and practical lights carry the room. */
const HEMI_SCALE = 0.6;

// Window openings use RectAreaLights, which need their LTC lookup tables registered once.
let rectAreaReady = false;
if (typeof window !== 'undefined' && !rectAreaReady) {
  RectAreaLightUniformsLib.init();
  rectAreaReady = true;
}

/**
 * Room-specific lighting moods within one warm house-wide colour temperature:
 * relaxing in the bedroom, crisp and bright in the kitchen, warm around the
 * dining table, clean in the bathroom, open daylight on the terrace.
 */
const ROOM_PROFILES: Record<RoomType, { ambient: number; ambientColor: string; downlight: number; env: number }> = {
  'living-room': { ambient: 0.2, ambientColor: '#fff0e0', downlight: 1.0, env: 0.5 },
  bedroom: { ambient: 0.18, ambientColor: '#ffe9d2', downlight: 0.75, env: 0.42 },
  kitchen: { ambient: 0.28, ambientColor: '#fff6ec', downlight: 1.35, env: 0.6 },
  'dining-room': { ambient: 0.2, ambientColor: '#ffecd8', downlight: 0.9, env: 0.46 },
  bathroom: { ambient: 0.26, ambientColor: '#fff4e8', downlight: 1.15, env: 0.56 },
  outdoor: { ambient: 0.4, ambientColor: '#fff8ee', downlight: 0.5, env: 0.8 },
  staircase: { ambient: 0.22, ambientColor: '#fff0e0', downlight: 1.0, env: 0.5 },
};

/** Light entering through the window for each time of day: low and golden at the ends, high and clean at noon, a cool moon at night. */
const SUN_BEAMS: Record<'morning' | 'afternoon' | 'evening' | 'night', SunBeam> = {
  // Skew is negative so the patch drifts toward the viewer's side of the room, away from the feature wall
  morning: { elevationDeg: 21, skewDeg: -14, intensity: 3.4, color: '#ffe3bf' },
  afternoon: { elevationDeg: 42, skewDeg: -7, intensity: 4.2, color: '#fff7ea' },
  evening: { elevationDeg: 13, skewDeg: -16, intensity: 3.2, color: '#ffc58a' },
  night: { elevationDeg: 38, skewDeg: 8, intensity: 0.9, color: '#8fa6ff' },
};

/** Unit vector pointing from a wall into the room. */
const INWARD: Record<WallSide, [number, number]> = { west: [1, 0], east: [-1, 0], north: [0, 1], south: [0, -1] };

export function DynamicLighting() {
  const { roomType, lengthFt, widthFt, heightFt, timeOfDay, activeTemplate, doorWidthFt, doorHeightFt, windowWidthFt, windowHeightFt } = useRoomStore();

  const lengthM = lengthFt * FT2M;
  const widthM  = widthFt * FT2M;
  const heightM = heightFt * FT2M;
  const profile = ROOM_PROFILES[roomType] ?? ROOM_PROFILES['living-room'];
  // The design preset sets the colour temperature of the room's fill and accent lights
  const theme = useStyleTheme();

  // Resolve time of day lighting configuration
  const getTimeConfig = () => {
    const tplLight = activeTemplate?.lighting;

    switch (timeOfDay) {
      case 'morning':
        return {
          skyColor: '#fff6e8',
          groundColor: '#bfb2a2',
          hemiIntensity: Math.max(tplLight?.ambientIntensity ?? 0.6, 0.6) * HEMI_SCALE,
          sunPosition: [lengthM * 0.9, heightM * 1.2, -widthM * 1.1] as [number, number, number],
          sunIntensity: 1.7,
          sunColor: '#fff1dc',
          downlightIntensity: 0.5,
          accentLightColor: '#ffe4c4',
        };
      case 'afternoon':
        return {
          skyColor: '#f7f6f2',
          groundColor: '#b9ad9f',
          hemiIntensity: Math.max(tplLight?.ambientIntensity ?? 0.65, 0.65) * HEMI_SCALE,
          sunPosition: [lengthM * 0.3, heightM * 2.2, -widthM * 0.4] as [number, number, number],
          sunIntensity: 1.9,
          sunColor: '#fffaf2',
          downlightIntensity: 0.5,
          accentLightColor: '#fff1e0',
        };
      case 'evening':
        return {
          skyColor: '#fff0dc',
          groundColor: '#a99a88',
          hemiIntensity: Math.max(tplLight?.ambientIntensity ?? 0.55, 0.55) * HEMI_SCALE,
          sunPosition: [lengthM * 1.0, heightM * 0.8, -widthM * 0.8] as [number, number, number],
          sunIntensity: 1.5,
          sunColor: '#ffe2bf',
          downlightIntensity: 0.9,
          accentLightColor: '#ffd9ae',
        };
      case 'night':
        return {
          skyColor: '#3a3d47',
          groundColor: '#2a2622',
          hemiIntensity: 0.3,
          sunPosition: [0, -10, 0] as [number, number, number],
          sunIntensity: 0.0,
          sunColor: '#000000',
          downlightIntensity: 1.8,
          accentLightColor: '#ffd3a1',
        };
      default:
        return {
          skyColor: '#f7f6f2',
          groundColor: '#b9ad9f',
          hemiIntensity: 0.65 * HEMI_SCALE,
          sunPosition: [lengthM * 0.3, heightM * 2.2, -widthM * 0.4] as [number, number, number],
          sunIntensity: 1.9,
          sunColor: '#fffaf2',
          downlightIntensity: 0.5,
          accentLightColor: '#fff1e0',
        };
    }
  };

  const cfg = getTimeConfig();
  const isNight = timeOfDay === 'night';

  // Rooms with a window get their sun through it; rooms without one (and the open terrace) keep a plain overhead sun
  const windowOpening = useMemo(() => {
    if (roomType === 'outdoor') return null;
    return getRoomOpenings(roomType, lengthM, widthM, heightM, doorWidthFt * FT2M, doorHeightFt * FT2M, windowWidthFt * FT2M, windowHeightFt * FT2M).window;
  }, [roomType, lengthM, widthM, heightM, doorWidthFt, doorHeightFt, windowWidthFt, windowHeightFt]);
  const skyPosition = useMemo<[number, number, number]>(() => {
    const [nx, nz] = INWARD[windowOpening?.wall ?? 'west'];
    return [-nx * lengthM, heightM * 1.5, -nz * widthM];
  }, [windowOpening, lengthM, widthM, heightM]);

  // Recessed wall-washers along the feature wall: aimed at the wall base so each throws a soft scallop up the plaster
  const washTargets = useMemo(() => [new THREE.Object3D(), new THREE.Object3D()], []);
  const washX = lengthM * 0.3;

  // Lit shades read as barely glowing in daylight and warm lanterns after dark
  const interior = useInteriorMaterials();
  useEffect(() => {
    setLampGlow(interior, timeOfDay);
    markSceneDirty();
  }, [interior, timeOfDay]);

  return (
    <>
      {/* 0. Soft interior reflection environment (ceiling panel, window wall, warm lamp glow) so stone, brass and glass read realistically */}
      <Environment resolution={256} frames={1} environmentIntensity={profile.env * theme.envMul * (isNight ? 0.45 : 1)}>
        <color attach="background" args={['#9a9288']} />
        {/* Ceiling: a soft warm glow from the downlights and cove, dimmer than before so up-facing surfaces do not blow out */}
        <Lightformer form="rect" intensity={1.2} color="#fff4e6" position={[0, 4, 0]} rotation-x={Math.PI / 2} scale={[7, 7, 1]} />
        {/* Window wall: the strongest source, so light falls off across the room instead of arriving evenly */}
        <Lightformer form="rect" intensity={isNight ? 0.2 : 3.4} color="#eef2f4" position={[-6, 1.6, 0]} rotation-y={Math.PI / 2} scale={[5, 3.2, 1]} />
        <Lightformer form="rect" intensity={0.6} color="#ffdcb4" position={[6, 1.2, 1]} rotation-y={-Math.PI / 2} scale={[4, 2, 1]} />
        <Lightformer form="rect" intensity={0.55} color="#f4ece0" position={[0, 1.5, 6]} rotation-y={Math.PI} scale={[8, 3, 1]} />
        {/* Warm floor bounce so undersides and seat fronts never go dead */}
        <Lightformer form="rect" intensity={0.8} color="#e9d6bb" position={[0, -3, 0]} rotation-x={-Math.PI / 2} scale={[9, 9, 1]} />
      </Environment>

      {/* 1. Warm interior ambient */}
      <ambientLight color={theme.ambientColor} intensity={profile.ambient} />

      {/* 2. Natural Sky/Ground Atmospheric Hemisphere Light */}
      <hemisphereLight
        color={cfg.skyColor}
        groundColor={cfg.groundColor}
        intensity={cfg.hemiIntensity}
      />

      {/* 3. Sunlight: through the window panes when the room has one, otherwise a plain overhead sun with soft shadows */}
      {windowOpening ? (
        <>
          <WindowSun
            opening={windowOpening}
            halfL={lengthM / 2}
            halfW={widthM / 2}
            frosted={roomType === 'bathroom'}
            beam={{ ...SUN_BEAMS[timeOfDay], intensity: SUN_BEAMS[timeOfDay].intensity * (roomType === 'bathroom' ? 0.45 : 1) }}
          />
          {/* Open sky seen through the window: soft, from the window side, no shadows of its own */}
          {cfg.sunIntensity > 0 && <directionalLight position={skyPosition} intensity={cfg.sunIntensity * 0.3} color={cfg.sunColor} />}
        </>
      ) : (
        cfg.sunIntensity > 0 && (
          <directionalLight
            position={cfg.sunPosition}
            intensity={cfg.sunIntensity}
            color={cfg.sunColor}
            castShadow
            shadow-mapSize={[2048, 2048]}
            shadow-bias={-0.0002}
            shadow-normalBias={0.02}
            shadow-camera-near={0.1}
            shadow-camera-far={50}
            shadow-camera-left={-lengthM * 1.2}
            shadow-camera-right={lengthM * 1.2}
            shadow-camera-top={widthM * 1.2}
            shadow-camera-bottom={-widthM * 1.2}
          />
        )
      )}

      {/* 4. Front viewport fill so objects facing the camera stay legible */}
      <directionalLight
        position={[0, heightM * 1.5, widthM * 1.1]}
        intensity={0.4}
        color="#fff6ea"
      />

      {/* 5. Soft secondary fill from the opposite angle */}
      <directionalLight
        position={[-lengthM * 0.7, heightM * 1.0, -widthM * 0.5]}
        intensity={0.18}
        color="#fff6ea"
      />

      {/* 6. Recessed ceiling downlight wash (warm) */}
      <spotLight
        position={[0, heightM * 0.98, 0]}
        intensity={cfg.downlightIntensity * 2.2 * profile.downlight}
        angle={Math.PI / 3}
        penumbra={0.9}
        distance={Math.max(lengthM, widthM) * 2.8}
        decay={1.2}
        color={isNight ? cfg.accentLightColor : theme.accentLight}
      />

      {/* Feature-wall washers: the recessed downlights nearest the wall, scalloping the plaster */}
      {washTargets.map((t, i) => (
        <primitive key={i} object={t} position={[(i === 0 ? -1 : 1) * washX, 0.2, -widthM / 2]} />
      ))}
      {[-1, 1].map((s, i) => (
        <spotLight
          key={s}
          position={[s * washX, heightM - 0.04, -widthM / 2 + 0.42]}
          target={washTargets[i]}
          angle={0.5}
          penumbra={0.9}
          intensity={cfg.downlightIntensity * 3 * profile.downlight}
          distance={heightM * 1.3}
          decay={2}
          color="#ffe4c4"
        />
      ))}
    </>
  );
}
