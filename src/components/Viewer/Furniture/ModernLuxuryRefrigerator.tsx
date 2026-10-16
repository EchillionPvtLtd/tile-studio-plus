'use client';

import React from 'react';
import { useInteriorMaterials } from './interiorMaterials';

interface ModernLuxuryRefrigeratorProps {
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: number;
  /** Total height of the tall cabinet housing (floor to top). */
  housingHeight?: number;
}

export const FRIDGE_HOUSING_WIDTH = 1.04;
export const FRIDGE_HOUSING_DEPTH = 0.7;

/**
 * Built-in French-door refrigerator in brushed stainless steel, set in a
 * warm-white tall cabinet with a bridge cupboard above. Front faces +Z,
 * origin at the centre of the housing footprint on the floor.
 */
export function ModernLuxuryRefrigerator({
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = 1,
  housingHeight = 2.4,
}: ModernLuxuryRefrigeratorProps) {
  const m = useInteriorMaterials();

  const housingW = FRIDGE_HOUSING_WIDTH;
  const housingD = FRIDGE_HOUSING_DEPTH;
  const fridgeW = housingW - 0.08;
  const fridgeH = 1.86;
  const front = housingD / 2;
  const doorTop = fridgeH;
  const drawerTop = 0.78;
  const bridgeH = housingHeight - fridgeH - 0.03;

  return (
    <group position={position} rotation={rotation} scale={scale}>
      {/* Tall cabinet gables and top */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (housingW / 2 - 0.02), housingHeight / 2, 0]} material={m.lacquerWarmWhite} castShadow receiveShadow>
          <boxGeometry args={[0.04, housingHeight, housingD]} />
        </mesh>
      ))}
      <mesh position={[0, housingHeight - 0.02, 0]} material={m.lacquerWarmWhite} castShadow receiveShadow>
        <boxGeometry args={[housingW, 0.04, housingD]} />
      </mesh>

      {/* Bridge cupboard with push-to-open doors */}
      <group position={[0, fridgeH + 0.015 + bridgeH / 2, front - 0.01]}>
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * (fridgeW / 4 + 0.002), 0, 0]} material={m.lacquerWarmWhite} castShadow>
            <boxGeometry args={[fridgeW / 2 - 0.006, bridgeH - 0.02, 0.02]} />
          </mesh>
        ))}
      </group>

      {/* Appliance carcass */}
      <mesh position={[0, fridgeH / 2, -0.02]} material={m.brushedSteel} receiveShadow>
        <boxGeometry args={[fridgeW, fridgeH, housingD - 0.06]} />
      </mesh>
      <mesh position={[0, 0.04, front - 0.03]} material={m.matteBlack}>
        <boxGeometry args={[fridgeW - 0.02, 0.08, 0.02]} />
      </mesh>

      {/* French doors */}
      {[-1, 1].map((s) => (
        <group key={s} position={[s * (fridgeW / 4 + 0.002), (drawerTop + doorTop) / 2 + 0.005, front - 0.005]}>
          <mesh material={m.brushedSteel} castShadow receiveShadow>
            <boxGeometry args={[fridgeW / 2 - 0.008, doorTop - drawerTop - 0.01, 0.045]} />
          </mesh>
          <mesh position={[-s * (fridgeW / 4 - 0.05), 0, 0.045]} material={m.brushedSteel} castShadow>
            <boxGeometry args={[0.018, 0.7, 0.022]} />
          </mesh>
          {[-0.33, 0.33].map((y) => (
            <mesh key={y} position={[-s * (fridgeW / 4 - 0.05), y, 0.03]} material={m.brushedSteel}>
              <boxGeometry args={[0.012, 0.02, 0.03]} />
            </mesh>
          ))}
        </group>
      ))}

      {/* Discreet black-glass dispenser panel on the left door */}
      <mesh position={[-fridgeW / 4 + 0.03, drawerTop + 0.55, front + 0.02]} material={m.blackGlass}>
        <boxGeometry args={[0.2, 0.3, 0.008]} />
      </mesh>

      {/* Freezer drawers */}
      {[
        { y: drawerTop - 0.19, h: 0.37 },
        { y: 0.245, h: 0.31 },
      ].map(({ y, h }) => (
        <group key={y} position={[0, y, front - 0.005]}>
          <mesh material={m.brushedSteel} castShadow receiveShadow>
            <boxGeometry args={[fridgeW - 0.008, h, 0.045]} />
          </mesh>
          <mesh position={[0, h / 2 - 0.07, 0.04]} material={m.brushedSteel}>
            <boxGeometry args={[fridgeW * 0.7, 0.018, 0.022]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
