'use client';

import React, { useMemo } from 'react';
import * as THREE from 'three';
import { ModernLuxuryRefrigerator, FRIDGE_HOUSING_WIDTH, FRIDGE_HOUSING_DEPTH } from './ModernLuxuryRefrigerator';
import { useInteriorMaterials, PALETTE } from './interiorMaterials';
import { useSetup, type KitchenSetup } from './styleThemes';
import { FurnitureProps, FT2M, GlobePendant, CeramicVase, CeramicBowl, PottedPlant, Cushion, BookStack } from './DecorPieces';

export const COUNTER_TOP = 0.91;
const BASE_DEPTH = 0.6;
const WORKTOP_DEPTH = 0.63;
const TOE_KICK = 0.1;

/** Upholstered counter stool: taupe leather seat and low back on a matte black frame with a brass foot ring. Front faces +Z. */
function CounterStool({ position, rotation = 0 }: { position: [number, number, number]; rotation?: number }) {
  const m = useInteriorMaterials();
  const seatH = 0.66;
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {[-1, 1].flatMap((sx) =>
        [-1, 1].map((sz) => (
          <mesh key={`${sx}${sz}`} position={[sx * 0.16, (seatH - 0.05) / 2, sz * 0.15]} material={m.matteBlack} castShadow>
            <cylinderGeometry args={[0.011, 0.011, seatH - 0.05, 8]} />
          </mesh>
        )),
      )}
      {[-1, 1].map((s) => (
        <group key={s}>
          <mesh position={[0, 0.26, s * 0.15]} rotation={[0, 0, Math.PI / 2]} material={m.brushedBrass}>
            <cylinderGeometry args={[0.008, 0.008, 0.32, 8]} />
          </mesh>
          <mesh position={[s * 0.16, 0.26, 0]} rotation={[Math.PI / 2, 0, 0]} material={m.brushedBrass}>
            <cylinderGeometry args={[0.008, 0.008, 0.3, 8]} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, seatH - 0.05, 0]} material={m.matteBlack}>
        <boxGeometry args={[0.36, 0.02, 0.34]} />
      </mesh>
      <Cushion size={[0.44, 0.07, 0.42]} position={[0, seatH - 0.005, 0]} radius={0.03} material={m.leatherTaupe} />
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.16, seatH + 0.09, -0.18]} material={m.matteBlack}>
          <cylinderGeometry args={[0.008, 0.008, 0.18, 8]} />
        </mesh>
      ))}
      <Cushion size={[0.42, 0.15, 0.05]} position={[0, seatH + 0.17, -0.2]} rotation={[0.12, 0, 0]} radius={0.024} material={m.leatherTaupe} />
    </group>
  );
}

/** Matte black gooseneck mixer. */
function KitchenFaucet({ position }: { position: [number, number, number] }) {
  const m = useInteriorMaterials();
  const arc = useMemo(() => new THREE.TorusGeometry(0.09, 0.011, 10, 24, Math.PI), []);
  return (
    <group position={position}>
      <mesh position={[0, 0.02, 0]} material={m.matteBlack} castShadow>
        <cylinderGeometry args={[0.028, 0.03, 0.04, 20]} />
      </mesh>
      <mesh position={[0, 0.2, 0]} material={m.matteBlack} castShadow>
        <cylinderGeometry args={[0.012, 0.014, 0.32, 14]} />
      </mesh>
      <mesh position={[0, 0.36, 0.09]} rotation={[0, Math.PI / 2, 0]} geometry={arc} material={m.matteBlack} castShadow />
      <mesh position={[0, 0.32, 0.18]} material={m.matteBlack} castShadow>
        <cylinderGeometry args={[0.014, 0.012, 0.08, 14]} />
      </mesh>
      <mesh position={[0.045, 0.12, 0]} rotation={[0, 0, -1.2]} material={m.matteBlack}>
        <cylinderGeometry args={[0.006, 0.006, 0.07, 8]} />
      </mesh>
    </group>
  );
}

/** Walnut base cabinetry with handle-less reveals, slim brass edge pulls and a marble worktop. */
function BaseRun({
  x0,
  x1,
  wallZ,
  drawerStackX,
  body,
  reveal,
  top,
}: {
  x0: number;
  x1: number;
  wallZ: number;
  drawerStackX: number;
  body: THREE.Material;
  reveal: THREE.Material;
  top: THREE.Material;
}) {
  const m = useInteriorMaterials();
  const len = x1 - x0;
  const cx = (x0 + x1) / 2;
  const bodyH = COUNTER_TOP - 0.03 - TOE_KICK;
  const frontZ = wallZ + BASE_DEPTH;
  const panels = Math.max(2, Math.round(len / 0.6));
  const panelW = len / panels;
  const panelCentres = Array.from({ length: panels }, (_, i) => x0 + panelW * (i + 0.5));
  const drawerPanel = panelCentres.reduce((best, c) => (Math.abs(c - drawerStackX) < Math.abs(best - drawerStackX) ? c : best), panelCentres[0]);

  return (
    <group>
      <mesh position={[cx, TOE_KICK / 2, wallZ + (BASE_DEPTH - 0.06) / 2]} material={m.matteBlack} receiveShadow>
        <boxGeometry args={[len, TOE_KICK, BASE_DEPTH - 0.06]} />
      </mesh>
      <Cushion size={[len, bodyH, BASE_DEPTH]} position={[cx, TOE_KICK + bodyH / 2, wallZ + BASE_DEPTH / 2]} radius={0.004} material={body} />

      {/* Door reveals */}
      {panelCentres.slice(1).map((c) => (
        <mesh key={c} position={[c - panelW / 2, TOE_KICK + bodyH / 2, frontZ + 0.001]} material={reveal}>
          <boxGeometry args={[0.004, bodyH, 0.002]} />
        </mesh>
      ))}

      {/* Pulls: one per door, three on the drawer stack beside the hob */}
      {panelCentres.map((c) =>
        c === drawerPanel ? (
          [0.26, 0.52].map((h) => (
            <mesh key={`${c}-${h}`} position={[c, TOE_KICK + h, frontZ + 0.001]} material={reveal}>
              <boxGeometry args={[panelW - 0.01, 0.004, 0.002]} />
            </mesh>
          ))
        ) : null,
      )}
      {panelCentres.map((c) =>
        (c === drawerPanel ? [0.2, 0.46, 0.7] : [bodyH - 0.06]).map((h) => (
          <mesh key={`p${c}-${h}`} position={[c, TOE_KICK + h, frontZ + 0.006]} material={m.brushedBrass}>
            <boxGeometry args={[Math.min(0.22, panelW * 0.4), 0.01, 0.012]} />
          </mesh>
        )),
      )}

      {/* Worktop */}
      <mesh position={[cx, COUNTER_TOP - 0.015, wallZ + WORKTOP_DEPTH / 2]} material={top} castShadow receiveShadow>
        <boxGeometry args={[len, 0.03, WORKTOP_DEPTH]} />
      </mesh>
    </group>
  );
}

/**
 * Kitchen — a calm two-tone working kitchen.
 * North wall: walnut base run with marble worktop, undermount sink, induction
 * hob under a plaster-white hood, one floating walnut shelf, and a warm-white
 * tall fridge column. Centre: waterfall marble island with leather counter
 * stools and two globe pendants. Only kitchen objects; no loose furniture.
 */
export function KitchenFurniture({ lengthFt, widthFt, heightFt }: FurnitureProps) {
  const setup = useSetup<KitchenSetup>('luxury');
  const m = useInteriorMaterials();

  // Each preset dresses the same layout differently: cabinet fronts, worktop and island.
  const finish = {
    luxury: { body: m.walnut, reveal: m.walnutDark, top: m.marble, island: m.walnut, shelf: true, pendants: 2, pendantD: 0.26 },
    white: { body: m.lacquerWarmWhite, reveal: m.lacquerGreige, top: m.marble, island: m.lacquerWarmWhite, shelf: false, pendants: 3, pendantD: 0.2 },
    scandi: { body: m.walnut, reveal: m.walnutDark, top: m.oak, island: m.lacquerWarmWhite, shelf: true, pendants: 2, pendantD: 0.34 },
    dark: { body: m.ceramicCharcoal, reveal: m.matteBlack, top: m.concrete, island: m.walnut, shelf: false, pendants: 3, pendantD: 0.24 },
  }[setup];
  const hoodMat = setup === 'dark' ? m.ceramicCharcoal : m.lacquerWarmWhite;
  const halfL = (lengthFt * FT2M) / 2;
  const halfW = (widthFt * FT2M) / 2;
  const roomH = heightFt * FT2M;
  const wallZ = -halfW;

  // Tall fridge column hard against the east wall
  const fridgeX = halfL - FRIDGE_HOUSING_WIDTH / 2 - 0.01;
  const runStart = -halfL + 0.005;
  const runEnd = fridgeX - FRIDGE_HOUSING_WIDTH / 2 - 0.005;
  const runLen = runEnd - runStart;

  const sinkX = runStart + Math.min(1.0, runLen * 0.3);
  const hobX = runEnd - Math.min(0.85, runLen * 0.28);
  const hoodBottom = COUNTER_TOP + 0.68;

  // Island: 1.0 m working aisle from the run, at least 0.55 m behind the stools
  const islandLen = Math.min(2.1, halfL * 2 - 2.2);
  const islandD = 0.85;
  const islandZ = Math.min(wallZ + WORKTOP_DEPTH + 1.0 + islandD / 2, halfW - 0.55 - 0.32 - islandD / 2);
  const showIsland = islandLen >= 1.4 && halfW * 2 >= 3.0;
  const stoolCount = Math.min(3, Math.floor((islandLen - 0.2) / 0.6));
  const stoolXs = Array.from({ length: stoolCount }, (_, i) => (i - (stoolCount - 1) / 2) * 0.6);

  const shelfLen = Math.min(1.3, hobX - 0.45 - 0.25 - runStart - 0.1);

  return (
    <group>
      <BaseRun x0={runStart} x1={runEnd} wallZ={wallZ} drawerStackX={hobX + 0.6} body={finish.body} reveal={finish.reveal} top={finish.top} />

      {/* Undermount sink & mixer */}
      <mesh position={[sinkX, COUNTER_TOP + 0.001, wallZ + 0.33]} material={m.brushedSteel} receiveShadow>
        <boxGeometry args={[0.6, 0.002, 0.42]} />
      </mesh>
      <mesh position={[sinkX, COUNTER_TOP + 0.003, wallZ + 0.36]} rotation={[-Math.PI / 2, 0, 0]} material={m.matteBlack}>
        <circleGeometry args={[0.035, 20]} />
      </mesh>
      <KitchenFaucet position={[sinkX, COUNTER_TOP, wallZ + 0.08]} />

      {/* Induction hob */}
      <mesh position={[hobX, COUNTER_TOP + 0.004, wallZ + 0.33]} material={m.blackGlass} receiveShadow>
        <boxGeometry args={[0.6, 0.008, 0.52]} />
      </mesh>
      {[-0.14, 0.14].flatMap((dx) =>
        [-0.11, 0.11].map((dz) => (
          <mesh key={`${dx}${dz}`} position={[hobX + dx, COUNTER_TOP + 0.009, wallZ + 0.33 + dz]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.075, 0.08, 40]} />
            <meshBasicMaterial color="#3a3a3a" />
          </mesh>
        )),
      )}

      {/* Hood flush to the ceiling, with integrated task light */}
      <mesh position={[hobX, (hoodBottom + roomH) / 2, wallZ + 0.25]} material={hoodMat} castShadow receiveShadow>
        <boxGeometry args={[0.9, roomH - hoodBottom, 0.5]} />
      </mesh>
      <mesh position={[hobX, hoodBottom - 0.002, wallZ + 0.3]} rotation={[Math.PI / 2, 0, 0]} material={m.ledWarm}>
        <planeGeometry args={[0.5, 0.06]} />
      </mesh>
      <pointLight position={[hobX, hoodBottom - 0.08, wallZ + 0.32]} intensity={1.2} distance={1.6} decay={2} color={PALETTE.lightNeutral} />

      {/* Floating walnut shelf over the sink */}
      {finish.shelf && shelfLen > 0.6 && (
        <group position={[sinkX, COUNTER_TOP + 0.62, wallZ + 0.125]}>
          <mesh material={m.walnut} castShadow receiveShadow>
            <boxGeometry args={[shelfLen, 0.04, 0.25]} />
          </mesh>
          <mesh position={[0, -0.021, 0.08]} material={m.ledWarm}>
            <boxGeometry args={[shelfLen - 0.08, 0.002, 0.01]} />
          </mesh>
          <pointLight position={[0, -0.12, 0.12]} color={PALETTE.lightWarm} intensity={0.8} distance={1.4} decay={2} />
          <CeramicVase position={[-shelfLen * 0.3, 0.02, 0]} height={0.24} radius={0.07} tone="cream" />
          <CeramicVase position={[-shelfLen * 0.3 + 0.14, 0.02, 0.02]} height={0.12} radius={0.055} tone="charcoal" />
          <BookStack position={[shelfLen * 0.25, 0.02, 0]} rotation={0.05} />
          {setup === 'scandi' && <PottedPlant position={[shelfLen * 0.05, 0.02, 0]} scale={0.3} planter="stone" planterHeight={0.12} rotation={0.9} />}
        </group>
      )}

      {/* Small herb planter on the worktop end */}
      <PottedPlant position={[runStart + 0.24, COUNTER_TOP, wallZ + 0.3]} scale={0.36} planter="stone" planterHeight={0.15} rotation={0.4} />

      {/* Tall fridge column */}
      <ModernLuxuryRefrigerator
        position={[fridgeX, 0, wallZ + FRIDGE_HOUSING_DEPTH / 2 + 0.005]}
        housingHeight={Math.min(2.4, roomH - 0.05)}
      />

      {showIsland && (
        <group position={[0, 0, islandZ]}>
          {/* Walnut island body set back on the seating side for knee space */}
          <mesh position={[0, TOE_KICK / 2, -islandD / 2 + 0.32]} material={m.matteBlack} receiveShadow>
            <boxGeometry args={[islandLen - 0.1, TOE_KICK, 0.54]} />
          </mesh>
          <Cushion size={[islandLen - 0.08, COUNTER_TOP - 0.04 - TOE_KICK, 0.6]} position={[0, TOE_KICK + (COUNTER_TOP - 0.04 - TOE_KICK) / 2, -islandD / 2 + 0.3]} radius={0.004} material={finish.island} />
          {/* Waterfall top and ends */}
          <mesh position={[0, COUNTER_TOP - 0.02, 0]} material={finish.top} castShadow receiveShadow>
            <boxGeometry args={[islandLen, 0.04, islandD]} />
          </mesh>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * (islandLen / 2 - 0.02), (COUNTER_TOP - 0.04) / 2, 0]} material={finish.top} castShadow receiveShadow>
              <boxGeometry args={[0.04, COUNTER_TOP - 0.04, islandD]} />
            </mesh>
          ))}

          <CeramicBowl position={[-islandLen * 0.22, COUNTER_TOP, -0.12]} radius={0.15} height={0.08} />
          <CeramicVase position={[islandLen * 0.25, COUNTER_TOP, -0.15]} height={0.26} radius={0.065} tone="cream" stems />

          {stoolXs.map((x) => (
            <CounterStool key={x} position={[x, 0, islandD / 2 + 0.11]} rotation={Math.PI} />
          ))}

          {(finish.pendants === 3 ? [-1, 0, 1] : [-0.5, 0.5]).map((s) => (
            <GlobePendant key={s} x={s * islandLen * 0.4} z={0} ceilingY={roomH} bottomY={COUNTER_TOP + 0.78} diameter={finish.pendantD} intensity={2.4} light={finish.pendants === 2 || s === 0} />
          ))}
        </group>
      )}
    </group>
  );
}
