'use client';

import React, { useMemo } from 'react';
import * as THREE from 'three';
import { RealisticFurnitureAsset } from './RealisticFurnitureAsset';
import { FEATURE_WALL_DEPTH } from '../roomLayout';
import { FX_LAYER } from '../viewerLayers';
import { useInteriorMaterials, faceTowards } from './interiorMaterials';
import { useSetup, type LivingSetup } from './styleThemes';
import {
  FurnitureProps,
  FT2M,
  ASSET_PATHS,
  TrackArmSofa,
  TrackArmChair,
  LoungeChair,
  AreaRug,
  RoundRug,
  RoundCoffeeTable,
  Pouf,
  Chandelier,
  TableLamp,
  FloorLamp,
  CeramicVase,
  BookStack,
  PottedPlant,
  useCredenzaOverrides,
} from './DecorPieces';

let glareTexture: THREE.CanvasTexture | null = null;

/** Two faint diagonal bands, like window light caught on a dark screen. */
function getScreenGlare(): THREE.CanvasTexture | null {
  if (glareTexture) return glareTexture;
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 144;
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 256, 144);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.22, 'rgba(255,255,255,0.0)');
  g.addColorStop(0.3, 'rgba(255,255,255,0.16)');
  g.addColorStop(0.42, 'rgba(255,255,255,0.03)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.0)');
  g.addColorStop(0.58, 'rgba(255,255,255,0.07)');
  g.addColorStop(0.7, 'rgba(255,255,255,0)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 144);
  glareTexture = new THREE.CanvasTexture(c);
  glareTexture.colorSpace = THREE.SRGBColorSpace;
  return glareTexture;
}

/** Media credenza with a slim wall-mounted display. `decor` sets how much is styled on top. */
function MediaWall({ halfW, decor }: { halfW: number; decor: 'full' | 'sparse' }) {
  const m = useInteriorMaterials();
  const screenGlare = useMemo(() => getScreenGlare(), []);
  const credenza = useCredenzaOverrides();
  const credenzaZ = -halfW + FEATURE_WALL_DEPTH + 0.28;
  return (
    <>
      <group position={[0, 0, credenzaZ]}>
        <RealisticFurnitureAsset modelPath={ASSET_PATHS.credenza} overrides={credenza} />
        {decor === 'full' ? (
          <>
            <CeramicVase position={[-0.88, 0.68, 0]} height={0.34} radius={0.085} tone="cream" stems />
            <CeramicVase position={[-0.64, 0.68, 0.04]} height={0.18} radius={0.06} tone="charcoal" />
            <BookStack position={[0.82, 0.68, 0]} rotation={-0.1} />
          </>
        ) : (
          <CeramicVase position={[-0.8, 0.68, 0]} height={0.3} radius={0.08} tone="cream" />
        )}
      </group>
      <group position={[0, 1.44, -halfW + FEATURE_WALL_DEPTH + 0.02]}>
        {/* Panel with a slim recessed back so it floats off the wall and throws a fine shadow line */}
        <mesh position={[0, 0, -0.012]} material={m.matteBlack} castShadow>
          <boxGeometry args={[1.38, 0.76, 0.02]} />
        </mesh>
        <mesh material={m.matteBlack} castShadow>
          <boxGeometry args={[1.46, 0.84, 0.014]} />
        </mesh>
        <mesh position={[0, 0.004, 0.0075]} material={m.blackGlass}>
          <planeGeometry args={[1.43, 0.805]} />
        </mesh>
        {/* A soft diagonal reflection of the window light across the glass */}
        <mesh position={[0, 0.004, 0.0085]} layers={FX_LAYER}>
          <planeGeometry args={[1.43, 0.805]} />
          <meshBasicMaterial map={screenGlare} transparent opacity={0.55} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
        </mesh>
        {/* Standby light */}
        <mesh position={[0.62, -0.395, 0.0085]}>
          <circleGeometry args={[0.0035, 12]} />
          <meshBasicMaterial color="#9fd4ff" toneMapped={false} />
        </mesh>
      </group>
    </>
  );
}

/**
 * Living room — one conversation group oriented to the media wall. The window (west) and door (east)
 * walls are kept clear. The design preset picks the arrangement:
 *   lounge    taupe sofa, matching pair of armchairs, oak & stone table, lamps (modern luxury)
 *   minimal   sofa, a single armchair, almost nothing else
 *   scandi    sofa, two light lounge chairs, round oak table, round rug, plants
 *   lshape    L-shaped sectional of two sofas and one chair (contemporary)
 *   symmetric formal: sofa, two chairs facing each other, twin lamps, chandelier (classic)
 *   loft      leather sofa and chairs on a dark rug, floor lamps (industrial)
 */
export function LivingRoomFurniture({ lengthFt, widthFt, heightFt }: FurnitureProps) {
  const setup = useSetup<LivingSetup>('lounge');
  const halfL = (lengthFt * FT2M) / 2;
  const halfW = (widthFt * FT2M) / 2;
  const roomH = heightFt * FT2M;

  // Sofa sits ~0.9 m off the rear wall and ~2.9 m from the screen.
  const sofaZ = Math.min(halfW - 0.9 - 0.63, 1.0);
  const sofaFront = sofaZ - 0.4;
  const tableZ = sofaFront - 0.42 - 0.3;
  const chairX = Math.min(1.6, halfL - 0.75);
  const chairZ = tableZ - 0.1;
  const rugW = Math.min(3.4, halfL * 2 - 1.4);

  const cornerPlant = <PottedPlant position={[-halfL + 0.5, 0, -halfW + 0.5]} scale={1.35} planter="stone" planterHeight={0.46} rotation={0.8} />;

  switch (setup) {
    case 'minimal':
      return (
        <group>
          <AreaRug width={Math.min(2.8, rugW)} depth={2.0} position={[0, 0, sofaFront + 0.2 - 1.0]} />
          <TrackArmSofa position={[0, 0, sofaZ]} rotation={Math.PI} />
          <TrackArmChair position={[chairX, 0, chairZ]} rotation={faceTowards([chairX, chairZ], [0, tableZ + 0.25])} />
          <RealisticFurnitureAsset modelPath={ASSET_PATHS.coffeeTable} position={[0, 0, tableZ]} rotation={[0, Math.PI / 2, 0]} />
          <CeramicVase position={[-0.2, 0.39, tableZ]} height={0.2} radius={0.07} tone="charcoal" />
          <MediaWall halfW={halfW} decor="sparse" />
          {cornerPlant}
        </group>
      );

    case 'scandi': {
      const sx = Math.min(1.55, halfL - 0.8);
      return (
        <group>
          <RoundRug radius={Math.min(1.45, halfL - 0.9)} position={[0, 0, tableZ + 0.05]} />
          <TrackArmSofa position={[0, 0, sofaZ]} rotation={Math.PI} />
          {[-1, 1].map((s) => (
            <LoungeChair
              key={s}
              position={[s * sx, 0, chairZ - 0.1]}
              rotation={faceTowards([s * sx, chairZ - 0.1], [0, tableZ + 0.2])}
              tone="oatmeal"
              scale={1.1}
            />
          ))}
          <RoundCoffeeTable position={[0, 0, tableZ]} radius={0.5} height={0.38} top="oak" legs="black" />
          <CeramicVase position={[0.05, 0.38, tableZ]} height={0.2} radius={0.07} tone="cream" stems />
          <RealisticFurnitureAsset modelPath={ASSET_PATHS.sideTable} position={[-1.45, 0, sofaZ + 0.05]} />
          <TableLamp position={[-1.45, 0.55, sofaZ + 0.05]} height={0.5} intensity={1.3} />
          <Pouf position={[sx + 0.6, 0, tableZ + 0.55]} radius={0.27} height={0.38} />
          <MediaWall halfW={halfW} decor="sparse" />
          {cornerPlant}
          <PottedPlant position={[halfL - 0.5, 0, -halfW + 0.5]} scale={1.1} planter="stone" planterHeight={0.4} rotation={-0.5} />
        </group>
      );
    }

    case 'lshape': {
      // Second sofa runs north from the west end of the main one, facing east
      const legX = -1.17 - 0.48;
      const legZ = sofaZ - 0.48 - 1.17;
      const canL = halfL >= 2.9 && legZ - 1.17 > -halfW + 0.9;
      return (
        <group>
          <AreaRug width={Math.min(3.8, halfL * 2 - 1.2)} depth={2.7} position={[0.2, 0, sofaFront + 0.35 - 1.3]} />
          <TrackArmSofa position={[0, 0, sofaZ]} rotation={Math.PI} />
          {canL ? (
            <TrackArmSofa position={[legX, 0, legZ]} rotation={Math.PI / 2} />
          ) : (
            <TrackArmChair position={[-chairX, 0, chairZ]} rotation={faceTowards([-chairX, chairZ], [0, tableZ + 0.25])} />
          )}
          <TrackArmChair position={[chairX, 0, chairZ - 0.1]} rotation={faceTowards([chairX, chairZ], [0, tableZ + 0.25])} />
          <RealisticFurnitureAsset modelPath={ASSET_PATHS.coffeeTable} position={[0.25, 0, tableZ - 0.05]} rotation={[0, Math.PI / 2, 0]} />
          <BookStack position={[0.45, 0.39, tableZ - 0.05]} rotation={0.15} />
          <FloorLamp position={[1.5, 0, sofaZ + 0.15]} />
          <MediaWall halfW={halfW} decor="full" />
          {cornerPlant}
        </group>
      );
    }

    case 'symmetric': {
      const sx = Math.min(1.75, halfL - 0.8);
      return (
        <group>
          <AreaRug width={Math.min(3.8, halfL * 2 - 1.0)} depth={2.8} position={[0, 0, sofaFront + 0.35 - 1.35]} />
          <TrackArmSofa position={[0, 0, sofaZ]} rotation={Math.PI} />
          {/* Chairs face each other across the table */}
          {[-1, 1].map((s) => (
            <LoungeChair key={s} position={[s * sx, 0, tableZ]} rotation={-s * (Math.PI / 2)} tone="accent" scale={1.1} />
          ))}
          <RealisticFurnitureAsset modelPath={ASSET_PATHS.coffeeTable} position={[0, 0, tableZ]} rotation={[0, Math.PI / 2, 0]} />
          <CeramicVase position={[0, 0.39, tableZ]} height={0.24} radius={0.08} tone="cream" stems />
          {/* Twin side tables and lamps flank the sofa */}
          {[-1, 1].map((s) => (
            <group key={s}>
              <RealisticFurnitureAsset modelPath={ASSET_PATHS.sideTable} position={[s * 1.55, 0, sofaZ + 0.05]} />
              <TableLamp position={[s * 1.55, 0.55, sofaZ + 0.05]} height={0.54} intensity={1.4} />
            </group>
          ))}
          <Chandelier x={0} z={tableZ} ceilingY={roomH} drop={Math.min(0.9, roomH * 0.28)} />
          <MediaWall halfW={halfW} decor="full" />
          {cornerPlant}
        </group>
      );
    }

    case 'loft':
      return (
        <group>
          <AreaRug width={Math.min(3.6, halfL * 2 - 1.2)} depth={2.6} position={[0, 0, sofaFront + 0.35 - 1.25]} />
          <TrackArmSofa position={[0, 0, sofaZ]} rotation={Math.PI} />
          {[-1, 1].map((s) => (
            <LoungeChair
              key={s}
              position={[s * chairX, 0, chairZ - 0.05]}
              rotation={faceTowards([s * chairX, chairZ], [0, tableZ + 0.2])}
              tone="accent"
              scale={1.1}
            />
          ))}
          <RealisticFurnitureAsset modelPath={ASSET_PATHS.coffeeTable} position={[0, 0, tableZ]} rotation={[0, Math.PI / 2, 0]} />
          <BookStack position={[0.2, 0.39, tableZ]} rotation={0.4} />
          <Pouf position={[chairX + 0.75, 0, tableZ + 0.5]} radius={0.27} height={0.4} tone="leather" />
          {[-1, 1].map((s) => (
            <FloorLamp key={s} position={[s * 1.5, 0, sofaZ + 0.15]} intensity={2.8} />
          ))}
          <MediaWall halfW={halfW} decor="sparse" />
          {cornerPlant}
        </group>
      );

    case 'lounge':
    default:
      return (
        <group>
          <AreaRug width={rugW} depth={2.5} position={[0, 0, sofaFront + 0.35 - 1.25]} />

          {/* Seating group */}
          <TrackArmSofa position={[0, 0, sofaZ]} rotation={Math.PI} />
          <TrackArmChair position={[-chairX, 0, chairZ]} rotation={faceTowards([-chairX, chairZ], [0, tableZ + 0.25])} />
          <TrackArmChair position={[chairX, 0, chairZ]} rotation={faceTowards([chairX, chairZ], [0, tableZ + 0.25])} />

          {/* Oak & stone coffee table, long axis parallel to the sofa */}
          <RealisticFurnitureAsset modelPath={ASSET_PATHS.coffeeTable} position={[0, 0, tableZ]} rotation={[0, Math.PI / 2, 0]} />
          <BookStack position={[0.22, 0.39, tableZ]} rotation={0.15} />
          <CeramicVase position={[-0.3, 0.39, tableZ + 0.02]} height={0.16} radius={0.07} tone="charcoal" />

          {/* Oak side table + reading lamp at the sofa's west arm */}
          <RealisticFurnitureAsset modelPath={ASSET_PATHS.sideTable} position={[-1.45, 0, sofaZ + 0.05]} />
          <TableLamp position={[-1.45, 0.55, sofaZ + 0.05]} height={0.52} intensity={1.4} />

          {/* Floor lamp beside the east arm */}
          <FloorLamp position={[1.4, 0, sofaZ + 0.15]} />

          <MediaWall halfW={halfW} decor="full" />

          {/* Single statement plant in the corner away from the window and door */}
          {cornerPlant}
        </group>
      );
  }
}
