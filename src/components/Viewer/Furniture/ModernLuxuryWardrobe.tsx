'use client';

import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useInteriorMaterials, PALETTE } from './interiorMaterials';

interface ModernLuxuryWardrobeProps {
  position?: [number, number, number];
  rotation?: [number, number, number];
  width?: number; // along local Z (e.g. 2.4m)
  height?: number; // along local Y (e.g. 2.55m)
  depth?: number; // along local X (e.g. 0.62m)
}

/**
 * Full-height fitted wardrobe: walnut carcass, flush greige lacquer doors with
 * slim brushed-brass pulls, and one lit glass display bay. Front faces +X.
 */
export function ModernLuxuryWardrobe({
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  width = 2.4,
  height = 2.55,
  depth = 0.62,
}: ModernLuxuryWardrobeProps) {
  const m = useInteriorMaterials();
  const smokedGlass = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#6b5a4a', roughness: 0.08, metalness: 0.2, transparent: true, opacity: 0.32, depthWrite: false }),
    [],
  );
  const garmentMats = useMemo(
    () => ['#e9e2d6', '#b9a993', '#5b534c', '#d6c7b0'].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.95 })),
    [],
  );
  useEffect(
    () => () => {
      smokedGlass.dispose();
      garmentMats.forEach((g) => g.dispose());
    },
    [smokedGlass, garmentMats],
  );

  const bays = 4;
  const bayW = width / bays;
  const plinthH = 0.08;
  const bodyH = height - plinthH - 0.04;
  const centerY = plinthH + bodyH / 2;
  const front = depth / 2 + 0.011;
  const glassBayZ = 0.5 * bayW;

  return (
    <group position={position} rotation={rotation}>
      {/* Recessed shadow-gap plinth */}
      <mesh position={[0.0, plinthH / 2, 0]} material={m.matteBlack} receiveShadow>
        <boxGeometry args={[depth - 0.06, plinthH, width - 0.04]} />
      </mesh>

      {/* Walnut carcass: back, top, bottom, gables, dividers */}
      <group position={[0, centerY, 0]}>
        <mesh position={[-depth / 2 + 0.01, 0, 0]} material={m.walnut} receiveShadow>
          <boxGeometry args={[0.02, bodyH, width]} />
        </mesh>
        <mesh position={[0, bodyH / 2 + 0.015, 0]} material={m.walnut} castShadow receiveShadow>
          <boxGeometry args={[depth + 0.01, 0.03, width + 0.02]} />
        </mesh>
        <mesh position={[0, -bodyH / 2 + 0.015, 0]} material={m.walnut} receiveShadow>
          <boxGeometry args={[depth, 0.03, width]} />
        </mesh>
        {[-1, 1].map((s) => (
          <mesh key={s} position={[0, 0, s * (width / 2 - 0.015)]} material={m.walnut} castShadow receiveShadow>
            <boxGeometry args={[depth + 0.01, bodyH, 0.03]} />
          </mesh>
        ))}
        {[-bayW, 0, bayW].map((z) => (
          <mesh key={z} position={[0, 0, z]} material={m.walnut} receiveShadow>
            <boxGeometry args={[depth - 0.04, bodyH, 0.02]} />
          </mesh>
        ))}
      </group>

      {/* Bays 1, 2 and 4: flush full-height greige lacquer doors */}
      {[-1.5, -0.5, 1.5].map((bay) => {
        const handleSide = bay < 0 ? 1 : -1;
        return (
          <group key={bay} position={[front, centerY, bay * bayW]}>
            <mesh material={m.lacquerGreige} castShadow receiveShadow>
              <boxGeometry args={[0.022, bodyH - 0.01, bayW - 0.006]} />
            </mesh>
            <mesh position={[0.016, -0.05, handleSide * bayW * 0.42]} material={m.brushedBrass} castShadow>
              <boxGeometry args={[0.012, 0.6, 0.014]} />
            </mesh>
          </group>
        );
      })}

      {/* Bay 3: lit display bay behind smoked glass */}
      <group position={[0, centerY, glassBayZ]}>
        {[0.62, 0.12].map((y) => (
          <mesh key={y} position={[0, y, 0]} material={m.walnut} receiveShadow>
            <boxGeometry args={[depth - 0.06, 0.022, bayW - 0.03]} />
          </mesh>
        ))}

        {/* Hanging rail with neutral garments */}
        <group position={[0, 0.5, 0]}>
          <mesh rotation={[Math.PI / 2, 0, 0]} material={m.brushedBrass}>
            <cylinderGeometry args={[0.01, 0.01, bayW - 0.04, 12]} />
          </mesh>
          {[-0.17, -0.06, 0.05, 0.16].map((z, i) => (
            <mesh key={z} position={[0, -0.27, z * (bayW / 0.6)]} material={garmentMats[i]} castShadow>
              <boxGeometry args={[0.36, 0.5, 0.035]} />
            </mesh>
          ))}
        </group>

        {/* Lower drawers fill the bay below the glass door */}
        {[0, 1].map((i) => {
          const zoneTop = bodyH * 0.5 - 0.005 - bodyH * 0.7;
          const drawerH = (zoneTop + bodyH / 2 - 0.01) / 2;
          const y = zoneTop - drawerH * (i + 0.5);
          return (
          <group key={i} position={[front - 0.01, y, 0]}>
            <mesh material={m.lacquerGreige} castShadow>
              <boxGeometry args={[0.022, drawerH - 0.006, bayW - 0.01]} />
            </mesh>
            <mesh position={[0.014, drawerH / 2 - 0.06, 0]} material={m.brushedBrass}>
              <boxGeometry args={[0.01, 0.012, 0.2]} />
            </mesh>
          </group>
          );
        })}

        {/* Warm LED strip behind the glass */}
        <mesh position={[depth / 2 - 0.05, 0.25, -bayW / 2 + 0.03]} material={m.ledWarm}>
          <boxGeometry args={[0.01, bodyH * 0.6, 0.01]} />
        </mesh>
        <pointLight position={[0.05, 0.4, 0]} color={PALETTE.lightWarm} intensity={0.5} distance={1.2} decay={2} />

        {/* Smoked glass door with slim black frame */}
        <group position={[front, bodyH * 0.5 - 0.005 - (bodyH * 0.7) / 2, 0]}>
          <mesh material={smokedGlass}>
            <boxGeometry args={[0.008, bodyH * 0.7, bayW - 0.012]} />
          </mesh>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[0, 0, s * (bayW / 2 - 0.01)]} material={m.matteBlack}>
              <boxGeometry args={[0.016, bodyH * 0.7, 0.016]} />
            </mesh>
          ))}
          {[-1, 1].map((s) => (
            <mesh key={`h${s}`} position={[0, s * bodyH * 0.35, 0]} material={m.matteBlack}>
              <boxGeometry args={[0.016, 0.016, bayW - 0.012]} />
            </mesh>
          ))}
        </group>
      </group>
    </group>
  );
}
