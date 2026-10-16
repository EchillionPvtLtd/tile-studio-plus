'use client';

import React from 'react';
import type * as THREE from 'three';
import { useRoomStore } from '@/stores/roomStore';
import { RealisticFurnitureAsset } from './RealisticFurnitureAsset';
import { FEATURE_WALL_DEPTH } from '../roomLayout';
import { useInteriorMaterials } from './interiorMaterials';
import { useSetup, type DiningSetup } from './styleThemes';
import {
  FurnitureProps,
  FT2M,
  ASSET_PATHS,
  AreaRug,
  Chandelier,
  GlobePendant,
  CeramicVase,
  CeramicBowl,
  TableLamp,
  BookStack,
  PottedPlant,
  useCredenzaOverrides,
  Artwork,
  Cushion,
} from './DecorPieces';

const TABLE_H = 0.75;
const TABLE_D = 1.0;
const CHAIR_DEPTH = 0.55;
const CHAIR_TUCK = 0.08; // how far the seat front slides under the table edge

/** Upholstered dining chair: oatmeal seat and gently raked back on a walnut frame. Front faces +Z. */
function DiningChair({
  position,
  rotation = 0,
  frame,
  seat,
}: {
  position: [number, number, number];
  rotation?: number;
  frame?: THREE.Material;
  seat?: THREE.Material;
}) {
  const m = useInteriorMaterials();
  const wood = frame ?? m.walnut;
  const cushion = seat ?? m.fabricOatmeal;
  const seatY = 0.47;
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {[-1, 1].flatMap((sx) =>
        [-1, 1].map((sz) => (
          <mesh key={`${sx}${sz}`} position={[sx * 0.2, (seatY - 0.06) / 2, sz * 0.19]} rotation={[sz * 0.04, 0, -sx * 0.04]} material={wood} castShadow>
            <cylinderGeometry args={[0.017, 0.013, seatY - 0.06, 10]} />
          </mesh>
        )),
      )}
      <mesh position={[0, seatY - 0.06, 0]} material={wood} castShadow>
        <boxGeometry args={[0.46, 0.035, 0.44]} />
      </mesh>
      <Cushion size={[0.5, 0.08, 0.48]} position={[0, seatY - 0.005, 0.01]} radius={0.035} material={cushion} />
      {/* Raked upholstered back with a walnut shell */}
      <group position={[0, seatY + 0.25, -0.22]} rotation={[-0.12, 0, 0]}>
        <Cushion size={[0.47, 0.36, 0.06]} position={[0, 0, 0.012]} radius={0.028} material={cushion} />
        <Cushion size={[0.49, 0.38, 0.03]} position={[0, 0, -0.025]} radius={0.012} material={wood} />
      </group>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.2, seatY + 0.07, -0.215]} rotation={[-0.06, 0, 0]} material={wood}>
          <boxGeometry args={[0.025, 0.2, 0.025]} />
        </mesh>
      ))}
    </group>
  );
}

/** Walnut dining table on twin travertine pedestals. */
function DiningTable({
  position,
  length,
  top,
  base,
  legs,
}: {
  position: [number, number, number];
  length: number;
  top: THREE.Material;
  base: THREE.Material;
  /** Twin pedestals, or four slim legs. */
  legs: 'pedestal' | 'four';
}) {
  const pedestalH = TABLE_H - 0.045;
  return (
    <group position={position}>
      <Cushion size={[length, 0.045, TABLE_D]} position={[0, TABLE_H - 0.0225, 0]} radius={0.012} material={top} />
      {legs === 'pedestal'
        ? [-1, 1].map((s) => (
            <mesh key={s} position={[s * length * 0.26, pedestalH / 2, 0]} scale={[1, 1, 1.45]} material={base} castShadow receiveShadow>
              <cylinderGeometry args={[0.15, 0.17, pedestalH, 48]} />
            </mesh>
          ))
        : [-1, 1].flatMap((sx) =>
            [-1, 1].map((sz) => (
              <mesh
                key={`${sx}${sz}`}
                position={[sx * (length / 2 - 0.12), pedestalH / 2, sz * (TABLE_D / 2 - 0.1)]}
                rotation={[sz * 0.06, 0, -sx * 0.06]}
                material={base}
                castShadow
              >
                <cylinderGeometry args={[0.03, 0.022, pedestalH, 14]} />
              </mesh>
            )),
          )}
    </group>
  );
}

/**
 * Dining room — one coordinated collection.
 * Walnut & travertine table with six matching upholstered chairs (two per side,
 * one at each end), a low walnut sideboard on the north wall, three opal globe
 * pendants over the table, one rug sized for pulled-out chairs, a single
 * centrepiece and one plant.
 */
export function DiningFurniture({ lengthFt, widthFt, heightFt }: FurnitureProps) {
  const setup = useSetup<DiningSetup>('modern');
  const m = useInteriorMaterials();
  const credenza = useCredenzaOverrides();
  const featureWallTreatment = useRoomStore((s) => s.featureWallTreatment);
  const halfL = (lengthFt * FT2M) / 2;
  const halfW = (widthFt * FT2M) / 2;
  const roomH = heightFt * FT2M;

  // Sideboard: the living-room credenza family, scaled down to a 0.42 m-deep buffet
  const sbScale: [number, number, number] = [0.8, 1.1, 0.8];
  const sbTop = 0.68 * sbScale[1];
  const sbZ = -halfW + FEATURE_WALL_DEPTH + 0.22;
  const sbFront = sbZ + 0.2 * sbScale[2];

  // Table centred in the space left in front of the sideboard
  const tableZ = (sbFront + halfW) / 2;
  const tableLen = Math.min(setup === 'classic' ? 2.8 : 2.2, halfL * 2 - 2.7);
  const sideChairZ = TABLE_D / 2 - CHAIR_TUCK + CHAIR_DEPTH / 2 - 0.08;
  const endChairX = tableLen / 2 - CHAIR_TUCK + CHAIR_DEPTH / 2 - 0.08;
  const sideXs = setup === 'classic' && tableLen >= 2.4 ? [-0.7, 0, 0.7] : tableLen >= 1.8 ? [-0.48, 0.48] : [0];

  // Table and chairs per preset: walnut on travertine, marble on dark wood, or light oak on slim legs
  const dress = {
    modern: { top: m.walnut, base: m.travertine, legs: 'pedestal' as const, frame: m.walnut, seat: m.fabricOatmeal },
    classic: { top: m.marble, base: m.walnutDark, legs: 'pedestal' as const, frame: m.walnutDark, seat: m.fabricCream },
    scandi: { top: m.oak, base: m.oak, legs: 'four' as const, frame: m.oak, seat: m.fabricOatmeal },
  }[setup];

  return (
    <group>
      <AreaRug width={Math.min(tableLen + 1.4, halfL * 2 - 0.9)} depth={Math.min(TABLE_D + 1.5, halfW * 2 - 0.8)} position={[0, 0, tableZ]} />

      <DiningTable position={[0, 0, tableZ]} length={tableLen} top={dress.top} base={dress.base} legs={dress.legs} />
      {sideXs.flatMap((x) => [
        <DiningChair key={`n${x}`} position={[x, 0, tableZ - sideChairZ]} rotation={0} frame={dress.frame} seat={dress.seat} />,
        <DiningChair key={`s${x}`} position={[x, 0, tableZ + sideChairZ]} rotation={Math.PI} frame={dress.frame} seat={dress.seat} />,
      ])}
      <DiningChair position={[-endChairX, 0, tableZ]} rotation={Math.PI / 2} frame={dress.frame} seat={dress.seat} />
      <DiningChair position={[endChairX, 0, tableZ]} rotation={-Math.PI / 2} frame={dress.frame} seat={dress.seat} />

      {/* Centrepiece */}
      <CeramicVase position={[0.12, TABLE_H, tableZ]} height={0.34} radius={0.085} tone="cream" stems />
      <CeramicBowl position={[-0.22, TABLE_H, tableZ + 0.05]} radius={0.15} height={0.08} />

      {/* Lighting over the table: three opal globes, a chandelier, or one large pendant */}
      {setup === 'modern' &&
        [-1, 0, 1].map((i) => (
          <GlobePendant key={i} x={i * tableLen * 0.3} z={tableZ} ceilingY={roomH} bottomY={TABLE_H + 0.85} diameter={0.3} intensity={2} />
        ))}
      {setup === 'classic' && <Chandelier x={0} z={tableZ} ceilingY={roomH} drop={Math.min(1.0, roomH * 0.3)} radius={0.5} intensity={3.4} />}
      {setup === 'scandi' && <GlobePendant x={0} z={tableZ} ceilingY={roomH} bottomY={TABLE_H + 0.8} diameter={0.62} intensity={2.6} />}

      {/* Sideboard wall */}
      <group position={[0, 0, sbZ]}>
        <RealisticFurnitureAsset modelPath={ASSET_PATHS.credenza} scale={sbScale} overrides={credenza} />
        <TableLamp position={[-0.66, sbTop, 0]} height={0.6} intensity={1.2} />
        <CeramicVase position={[0.55, sbTop, -0.02]} height={0.28} radius={0.075} tone="charcoal" />
        <BookStack position={[0.2, sbTop, 0]} rotation={0.12} />
      </group>
      {featureWallTreatment === 'none' && (
        <Artwork position={[0, sbTop + 0.85, -halfW + FEATURE_WALL_DEPTH]} width={1.1} height={0.8} variant={1} />
      )}

      {/* One plant in the corner clear of the door and walkway */}
      <PottedPlant position={[halfL - 0.48, 0, -halfW + 0.48]} scale={1.2} planter="stone" planterHeight={0.42} rotation={-0.6} />
      {setup === 'scandi' && <PottedPlant position={[-halfL + 0.48, 0, -halfW + 0.48]} scale={1.0} planter="stone" planterHeight={0.38} rotation={0.8} />}
    </group>
  );
}
