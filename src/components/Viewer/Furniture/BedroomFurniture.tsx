'use client';

import React from 'react';
import { RealisticFurnitureAsset } from './RealisticFurnitureAsset';
import { ModernLuxuryWardrobe } from './ModernLuxuryWardrobe';
import { FEATURE_WALL_DEPTH } from '../roomLayout';
import { useInteriorMaterials, faceTowards } from './interiorMaterials';
import { useSetup, useStyleTheme, type BedroomSetup } from './styleThemes';
import {
  FurnitureProps,
  FT2M,
  ASSET_PATHS,
  LoungeChair,
  AreaRug,
  RoundCoffeeTable,
  Pouf,
  Chandelier,
  GlobePendant,
  TableLamp,
  CeramicVase,
  BookStack,
  PottedPlant,
  Cushion,
} from './DecorPieces';

// Lincoln bed GLB footprint (local): length along X with the headboard at -X,
// width along Z offset by +0.40 m, mattress top at 0.63 m.
const BED_SCALE = 1.06;
const BED_LOCAL_Z_CENTER = 0.4;
const BED_HEADBOARD_BACK = 1.09;
const BED_LENGTH = 2.09 * BED_SCALE;
const BED_WIDTH = 1.6 * BED_SCALE;
const MATTRESS_TOP = 0.63 * BED_SCALE;

/** Walnut bedside table on slim black legs with a single drawer and open shelf. */
function Nightstand({ position }: { position: [number, number, number] }) {
  const m = useInteriorMaterials();
  const w = 0.52;
  const d = 0.4;
  const legH = 0.14;
  const bodyH = 0.42;
  return (
    <group position={position}>
      {[-1, 1].flatMap((sx) =>
        [-1, 1].map((sz) => (
          <mesh key={`${sx}${sz}`} position={[sx * (w / 2 - 0.04), legH / 2, sz * (d / 2 - 0.04)]} material={m.matteBlack} castShadow>
            <cylinderGeometry args={[0.011, 0.009, legH, 10]} />
          </mesh>
        )),
      )}
      <Cushion size={[w, bodyH, d]} position={[0, legH + bodyH / 2, 0]} radius={0.012} material={m.walnut} />
      {/* Open shelf recess */}
      <mesh position={[0, legH + 0.11, d / 2 - 0.12]} material={m.walnutDark}>
        <boxGeometry args={[w - 0.06, 0.13, 0.25]} />
      </mesh>
      {/* Drawer reveal + slim brushed brass pull */}
      <mesh position={[0, legH + 0.215, d / 2 + 0.001]} material={m.walnutDark}>
        <boxGeometry args={[w - 0.03, 0.006, 0.002]} />
      </mesh>
      <mesh position={[0, legH + 0.33, d / 2 + 0.008]} material={m.brushedBrass}>
        <boxGeometry args={[0.12, 0.012, 0.012]} />
      </mesh>
    </group>
  );
}

/** Layered bedding: duvet, folded throw, sleeping pillows, euro shams and a lumbar. */
function BedDressing({ x, headZ, footZ }: { x: number; headZ: number; footZ: number }) {
  const m = useInteriorMaterials();
  const top = MATTRESS_TOP;
  const duvetStart = headZ + 0.6;
  const duvetLen = footZ + 0.04 - duvetStart;
  const duvetW = BED_WIDTH + 0.08;
  const drop = 0.18;
  return (
    <group position={[x, 0, 0]}>
      {/* Duvet top + side and foot drapes */}
      <Cushion size={[duvetW, 0.07, duvetLen]} position={[0, top + 0.025, duvetStart + duvetLen / 2]} radius={0.03} material={m.beddingWhite} />
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (duvetW / 2 - 0.008), top - drop / 2 + 0.03, duvetStart + duvetLen / 2]} material={m.beddingWhite} castShadow>
          <boxGeometry args={[0.016, drop, duvetLen]} />
        </mesh>
      ))}
      <mesh position={[0, top - drop / 2 + 0.03, footZ + 0.035]} material={m.beddingWhite} castShadow>
        <boxGeometry args={[duvetW, drop, 0.016]} />
      </mesh>

      {/* Folded throw across the foot */}
      <Cushion size={[duvetW + 0.02, 0.035, 0.5]} position={[0, top + 0.075, footZ - 0.24]} radius={0.015} material={m.fabricTaupe} />
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (duvetW / 2 + 0.006), top - 0.07, footZ - 0.24]} material={m.fabricTaupe} castShadow>
          <boxGeometry args={[0.014, 0.26, 0.5]} />
        </mesh>
      ))}
      <Cushion size={[duvetW + 0.03, 0.22, 0.03]} position={[0, top - 0.035, footZ + 0.05]} radius={0.012} material={m.fabricTaupe} />

      {/* Euro shams leaning on the headboard */}
      {[-0.4, 0.4].map((px) => (
        <Cushion key={`e${px}`} size={[0.62, 0.6, 0.16]} position={[px * BED_SCALE, top + 0.3, headZ + 0.12]} rotation={[-0.22, 0, 0]} radius={0.07} material={m.fabricOatmeal} />
      ))}
      {/* Sleeping pillows */}
      {[-0.38, 0.38].map((px) => (
        <Cushion key={`p${px}`} size={[0.7, 0.42, 0.15]} position={[px * BED_SCALE, top + 0.2, headZ + 0.3]} rotation={[-0.5, 0, 0]} radius={0.07} material={m.beddingWhite} />
      ))}
      {/* Lumbar */}
      <Cushion size={[0.6, 0.28, 0.13]} position={[0, top + 0.14, headZ + 0.46]} rotation={[-0.55, 0, 0]} radius={0.05} material={m.fabricTaupe} />
    </group>
  );
}

/** Upholstered bouclé bench on a walnut base, for the foot of the bed. */
function BedBench({ position, width }: { position: [number, number, number]; width: number }) {
  const m = useInteriorMaterials();
  const d = 0.42;
  return (
    <group position={position}>
      <Cushion size={[width, 0.05, d]} position={[0, 0.36, 0]} radius={0.01} material={m.walnut} />
      <Cushion size={[width - 0.02, 0.1, d - 0.02]} position={[0, 0.43, 0]} radius={0.045} material={m.boucle} />
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (width / 2 - 0.08), 0.17, 0]} material={m.walnut} castShadow>
          <boxGeometry args={[0.05, 0.34, d - 0.06]} />
        </mesh>
      ))}
    </group>
  );
}

/**
 * Bedroom — calm, symmetrical and bed-centred. The design preset picks the arrangement:
 *   suite    walnut nightstands and lamps, wardrobe wall, bench and reading chair (modern luxury)
 *   classic  formal hotel suite: chandelier, a pair of reading chairs and a round table
 *   scandi   light and airy: hanging pendants instead of lamps, pouf, two plants, no bench
 *   minimal  low and bare: bed, nightstands, wardrobe and a single plant
 */
export function BedroomFurniture({ lengthFt, widthFt, heightFt }: FurnitureProps) {
  const setup = useSetup<BedroomSetup>('suite');
  const theme = useStyleTheme();
  const halfL = (lengthFt * FT2M) / 2;
  const halfW = (widthFt * FT2M) / 2;
  const roomH = heightFt * FT2M;

  // Headboard fabric follows the preset: ivory, deep navy, oat or grey.
  const headboard = setup === 'classic' ? theme.sofa : setup === 'minimal' ? theme.fabricTaupe : setup === 'scandi' ? theme.fabricOatmeal : theme.fabricCream;
  const bedOverrides = React.useMemo(() => ({ 'lincoln fab': { color: headboard } }), [headboard]);

  const bedX = 0;
  const wallZ = -halfW + FEATURE_WALL_DEPTH;
  const bedPosZ = wallZ + BED_HEADBOARD_BACK * BED_SCALE;
  const headZ = wallZ + 0.1 * BED_SCALE;
  const footZ = wallZ + BED_LENGTH;
  const standX = BED_WIDTH / 2 + 0.06 + 0.26;
  const standZ = wallZ + 0.22;

  const wardrobeW = Math.min(2.4, halfW * 2 - 1.3);
  const wardrobeZ = -halfW + 0.85 + wardrobeW / 2;

  const chairPos: [number, number] = [halfL - 0.72, Math.min(footZ - 0.1, halfW - 0.8)];
  const rugW = Math.min(BED_WIDTH + (setup === 'classic' ? 1.9 : setup === 'minimal' ? 0.8 : 1.3), halfL * 2 - 1.8);

  return (
    <group>
      <AreaRug width={rugW} depth={setup === 'classic' ? 2.7 : 2.3} position={[bedX, 0, footZ - 0.35]} />

      {/* Bed — the focal point */}
      <RealisticFurnitureAsset
        modelPath={ASSET_PATHS.bed}
        position={[bedX + BED_LOCAL_Z_CENTER * BED_SCALE, 0, bedPosZ]}
        rotation={[0, -Math.PI / 2, 0]}
        scale={BED_SCALE}
        overrides={bedOverrides}
      />
      <BedDressing x={bedX} headZ={headZ} footZ={footZ} />
      {(setup === 'suite' || setup === 'classic') && (
        <BedBench position={[bedX, 0, footZ + 0.38]} width={Math.min(1.35, BED_WIDTH - 0.2)} />
      )}

      {/* Matched bedside pair: lamps, or hanging pendants in the Scandinavian room */}
      {[-1, 1].map((s) => (
        <group key={s}>
          <Nightstand position={[bedX + s * standX, 0, standZ]} />
          {setup === 'scandi' ? (
            <GlobePendant x={bedX + s * standX} z={standZ + 0.05} ceilingY={roomH} bottomY={1.15} diameter={0.28} intensity={1.6} />
          ) : (
            <TableLamp
              position={[bedX + s * standX - s * 0.06, 0.56, standZ - 0.02]}
              height={setup === 'classic' ? 0.58 : 0.5}
              intensity={setup === 'minimal' ? 0.9 : 1.1}
            />
          )}
        </group>
      ))}
      {setup !== 'minimal' && (
        <>
          <BookStack position={[bedX + standX + 0.12, 0.56, standZ + 0.06]} rotation={0.3} />
          <CeramicVase position={[bedX - standX + 0.14, 0.56, standZ + 0.05]} height={0.14} radius={0.05} tone="charcoal" />
        </>
      )}

      {/* Wardrobe wall (west) */}
      <ModernLuxuryWardrobe
        position={[-halfL + 0.32, 0, wardrobeZ]}
        width={wardrobeW}
        height={Math.min(2.5, roomH - 0.2)}
        depth={0.62}
      />

      {/* Seating by the window */}
      {setup === 'suite' && <LoungeChair position={[chairPos[0], 0, chairPos[1]]} rotation={faceTowards(chairPos, [0, footZ - 0.6])} />}
      {setup === 'classic' && (
        <>
          <LoungeChair position={[chairPos[0], 0, chairPos[1] - 0.55]} rotation={faceTowards([chairPos[0], chairPos[1] - 0.55], [halfL - 1.6, chairPos[1]])} tone="accent" />
          <LoungeChair position={[chairPos[0], 0, chairPos[1] + 0.55]} rotation={faceTowards([chairPos[0], chairPos[1] + 0.55], [halfL - 1.6, chairPos[1]])} tone="accent" />
          <RoundCoffeeTable position={[chairPos[0] - 0.05, 0, chairPos[1]]} radius={0.28} height={0.5} top="marble" legs="brass" />
          <Chandelier x={0} z={footZ - 0.2} ceilingY={roomH} drop={Math.min(0.8, roomH * 0.25)} radius={0.36} intensity={2.4} />
        </>
      )}
      {setup === 'scandi' && <Pouf position={[chairPos[0] - 0.1, 0, chairPos[1]]} radius={0.3} height={0.42} />}

      <PottedPlant position={[-halfL + 0.42, 0, -halfW + 0.42]} scale={1.05} planter="stone" planterHeight={0.36} rotation={2.2} />
      {setup === 'scandi' && (
        <PottedPlant position={[halfL - 0.42, 0, -halfW + 0.42]} scale={0.95} planter="stone" planterHeight={0.34} rotation={-1.1} />
      )}
    </group>
  );
}
