'use client';

import React from 'react';
import { useInteriorMaterials, PALETTE } from './interiorMaterials';
import { useSetup, type BalconySetup } from './styleThemes';
import { FurnitureProps, FT2M, AreaRug, CeramicVase, CeramicBowl, PottedPlant, WallSconce, Cushion } from './DecorPieces';
import { getRoomOpenings } from '../roomLayout';

/** Teak-framed outdoor sofa with sand weatherproof cushions. Front faces +Z. */
function OutdoorSofa({ position, width = 1.8, rotation = 0 }: { position: [number, number, number]; width?: number; rotation?: number }) {
  const m = useInteriorMaterials();
  const d = 0.82;
  const seats = width > 1.5 ? 2 : 1;
  const seatW = (width - 0.16) / seats;
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* Teak base frame and slatted arms */}
      <Cushion size={[width, 0.06, d]} position={[0, 0.2, 0]} radius={0.01} material={m.teak} />
      {[-1, 1].flatMap((sx) =>
        [-1, 1].map((sz) => (
          <mesh key={`${sx}${sz}`} position={[sx * (width / 2 - 0.05), 0.085, sz * (d / 2 - 0.05)]} material={m.teak} castShadow>
            <boxGeometry args={[0.06, 0.17, 0.06]} />
          </mesh>
        )),
      )}
      {[-1, 1].map((s) => (
        <Cushion key={s} size={[0.07, 0.38, d]} position={[s * (width / 2 - 0.035), 0.42, 0]} radius={0.012} material={m.teak} />
      ))}
      <Cushion size={[width - 0.14, 0.42, 0.07]} position={[0, 0.44, -d / 2 + 0.035]} radius={0.012} material={m.teak} />
      {/* Cushions */}
      {Array.from({ length: seats }, (_, i) => {
        const x = -width / 2 + 0.08 + seatW * (i + 0.5);
        return (
          <group key={i}>
            <Cushion size={[seatW - 0.01, 0.14, d - 0.12]} position={[x, 0.3, 0.035]} radius={0.04} material={m.outdoorFabric} />
            <Cushion size={[seatW - 0.04, 0.42, 0.15]} position={[x, 0.55, -d / 2 + 0.14]} rotation={[-0.16, 0, 0]} radius={0.05} material={m.outdoorFabric} />
          </group>
        );
      })}
      <Cushion size={[0.42, 0.3, 0.12]} position={[width / 2 - 0.32, 0.47, -d / 2 + 0.26]} rotation={[-0.25, 0.3, 0]} radius={0.05} material={m.fabricTaupe} />
    </group>
  );
}

/** Low teak lounge chair with a deep sand cushion. Front faces +Z. */
function OutdoorLoungeChair({ position, rotation = 0 }: { position: [number, number, number]; rotation?: number }) {
  const m = useInteriorMaterials();
  const w = 0.74;
  const d = 0.8;
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <Cushion size={[w, 0.05, d]} position={[0, 0.2, 0]} radius={0.01} material={m.teak} />
      {[-1, 1].flatMap((sx) =>
        [-1, 1].map((sz) => (
          <mesh key={`${sx}${sz}`} position={[sx * (w / 2 - 0.04), 0.09, sz * (d / 2 - 0.05)]} material={m.teak} castShadow>
            <boxGeometry args={[0.05, 0.18, 0.05]} />
          </mesh>
        )),
      )}
      {[-1, 1].map((s) => (
        <Cushion key={s} size={[0.06, 0.32, d]} position={[s * (w / 2 - 0.03), 0.39, 0]} radius={0.01} material={m.teak} />
      ))}
      <Cushion size={[w - 0.12, 0.14, d - 0.1]} position={[0, 0.29, 0.03]} radius={0.04} material={m.outdoorFabric} />
      <Cushion size={[w - 0.14, 0.42, 0.14]} position={[0, 0.54, -d / 2 + 0.1]} rotation={[-0.2, 0, 0]} radius={0.05} material={m.outdoorFabric} />
    </group>
  );
}

/** Round teak dining table on a matte black pedestal with four teak chairs. */
function OutdoorDiningSet({ position }: { position: [number, number, number] }) {
  const m = useInteriorMaterials();
  return (
    <group position={position}>
      <mesh position={[0, 0.73, 0]} material={m.teak} castShadow receiveShadow>
        <cylinderGeometry args={[0.55, 0.55, 0.035, 48]} />
      </mesh>
      <mesh position={[0, 0.36, 0]} material={m.matteBlack} castShadow>
        <cylinderGeometry args={[0.04, 0.04, 0.7, 16]} />
      </mesh>
      <mesh position={[0, 0.015, 0]} material={m.matteBlack} receiveShadow>
        <cylinderGeometry args={[0.3, 0.32, 0.03, 32]} />
      </mesh>
      {[0, 1, 2, 3].map((i) => {
        const a = (i * Math.PI) / 2 + Math.PI / 4;
        const r = 0.68;
        return (
          <group key={i} position={[Math.sin(a) * r, 0, Math.cos(a) * r]} rotation={[0, a + Math.PI, 0]}>
            {[-1, 1].flatMap((sx) =>
              [-1, 1].map((sz) => (
                <mesh key={`${sx}${sz}`} position={[sx * 0.2, 0.22, sz * 0.2]} material={m.teak} castShadow>
                  <boxGeometry args={[0.035, 0.44, 0.035]} />
                </mesh>
              )),
            )}
            <Cushion size={[0.46, 0.035, 0.46]} position={[0, 0.45, 0]} radius={0.008} material={m.teak} />
            <Cushion size={[0.42, 0.05, 0.4]} position={[0, 0.49, 0.01]} radius={0.02} material={m.outdoorFabric} />
            <Cushion size={[0.46, 0.3, 0.03]} position={[0, 0.72, -0.22]} rotation={[-0.1, 0, 0]} radius={0.01} material={m.teak} />
          </group>
        );
      })}
      <CeramicVase position={[0, 0.75, 0]} height={0.22} radius={0.07} tone="charcoal" stems />
    </group>
  );
}

/** Small round bistro table with two teak chairs. */
function BistroSet({ position, rotation = 0 }: { position: [number, number, number]; rotation?: number }) {
  const m = useInteriorMaterials();
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh position={[0, 0.72, 0]} material={m.matteBlack} castShadow receiveShadow>
        <cylinderGeometry args={[0.36, 0.36, 0.03, 40]} />
      </mesh>
      <mesh position={[0, 0.36, 0]} material={m.matteBlack} castShadow>
        <cylinderGeometry args={[0.025, 0.025, 0.7, 12]} />
      </mesh>
      <mesh position={[0, 0.012, 0]} material={m.matteBlack} receiveShadow>
        <cylinderGeometry args={[0.22, 0.24, 0.024, 28]} />
      </mesh>
      {[-1, 1].map((s) => (
        <group key={s} position={[0, 0, s * 0.62]} rotation={[0, s > 0 ? Math.PI : 0, 0]}>
          {[-1, 1].flatMap((sx) =>
            [-1, 1].map((sz) => (
              <mesh key={`${sx}${sz}`} position={[sx * 0.18, 0.22, sz * 0.18]} material={m.matteBlack} castShadow>
                <cylinderGeometry args={[0.012, 0.01, 0.44, 8]} />
              </mesh>
            )),
          )}
          <Cushion size={[0.42, 0.03, 0.42]} position={[0, 0.45, 0]} radius={0.01} material={m.teak} />
          <Cushion size={[0.4, 0.3, 0.025]} position={[0, 0.68, -0.2]} rotation={[-0.08, 0, 0]} radius={0.01} material={m.teak} />
        </group>
      ))}
      <CeramicVase position={[0, 0.735, 0]} height={0.18} radius={0.05} tone="charcoal" stems />
    </group>
  );
}

/** Round concrete fire pit with a warm glow. */
function FirePit({ position }: { position: [number, number, number] }) {
  const m = useInteriorMaterials();
  return (
    <group position={position}>
      <mesh position={[0, 0.2, 0]} material={m.concrete} castShadow receiveShadow>
        <cylinderGeometry args={[0.46, 0.5, 0.4, 48]} />
      </mesh>
      <mesh position={[0, 0.405, 0]} rotation={[-Math.PI / 2, 0, 0]} material={m.ledWarm}>
        <circleGeometry args={[0.34, 32]} />
      </mesh>
      <pointLight position={[0, 0.7, 0]} color={PALETTE.lightWarm} intensity={1.6} distance={4} decay={2} />
    </group>
  );
}

/**
 * Terrace / balcony — an outdoor living room off the glass sliders.
 * Teak sofa against the facade, concrete coffee table, outdoor rug, fibrestone
 * planters and two wall sconces. Larger terraces add a pair of lounge chairs
 * and a four-seat teak dining set; small balconies stay uncluttered.
 */
export function BalconyFurniture({ lengthFt, widthFt, heightFt }: FurnitureProps) {
  const setup = useSetup<BalconySetup>('modern');
  const m = useInteriorMaterials();
  const lengthM = lengthFt * FT2M;
  const widthM = widthFt * FT2M;
  const halfL = lengthM / 2;
  const halfW = widthM / 2;
  const { slider } = getRoomOpenings('outdoor', lengthM, widthM, heightFt * FT2M, 0.9, 2.1, 1.8, 1.4);
  const sliderEast = slider ? slider.offset + slider.width / 2 : -halfL + 0.3;

  const isTerrace = widthM >= 3.5 && lengthM >= 5.5;
  const sofaW = Math.min(setup === 'daybed' ? 2.7 : isTerrace ? 2.2 : 1.8, halfL - sliderEast - 0.85);
  const sofaX = sliderEast + 0.2 + sofaW / 2;
  const sofaZ = -halfW + 0.46;
  const tableZ = sofaZ + 0.41 + 0.42 + 0.25;
  const railZ = halfW * 0.96;
  const postCount = Math.max(3, Math.round(lengthM / 1.2) + 1);
  const postXs = Array.from({ length: postCount }, (_, i) => -lengthM * 0.47 + (i * lengthM * 0.94) / (postCount - 1));

  return (
    <group>
      {/* Black steel & glass balustrade on the open (south) edge */}
      <group position={[0, 0, railZ]}>
        <mesh position={[0, 1.0, 0]} material={m.matteBlack} castShadow>
          <boxGeometry args={[lengthM * 0.98, 0.04, 0.05]} />
        </mesh>
        {postXs.map((x) => (
          <mesh key={x} position={[x, 0.5, 0]} material={m.matteBlack} castShadow>
            <boxGeometry args={[0.035, 1.0, 0.035]} />
          </mesh>
        ))}
        <mesh position={[0, 0.52, 0]} material={m.glass}>
          <boxGeometry args={[lengthM * 0.96, 0.86, 0.012]} />
        </mesh>
      </group>

      {setup === 'bistro' ? (
        <>
          <BistroSet position={[sliderEast + 0.9 + Math.min(0.6, (halfL - sliderEast) * 0.2), 0, -halfW + 1.3]} rotation={0.2} />
          <AreaRug width={1.7} depth={1.7} position={[sliderEast + 0.9 + Math.min(0.6, (halfL - sliderEast) * 0.2), 0, -halfW + 1.3]} />
        </>
      ) : (
        <>
          <AreaRug width={sofaW + 0.6} depth={1.7} position={[sofaX, 0, sofaZ + 0.75]} />
          <OutdoorSofa position={[sofaX, 0, sofaZ]} width={sofaW} />
          {setup === 'luxury' ? (
            <FirePit position={[sofaX, 0, tableZ]} />
          ) : (
            <>
              <Cushion size={[Math.min(1.0, sofaW * 0.55), 0.36, 0.55]} position={[sofaX, 0.18, tableZ]} radius={0.02} material={m.concrete} />
              <CeramicBowl position={[sofaX - 0.15, 0.36, tableZ]} radius={0.16} height={0.07} tone="charcoal" />
            </>
          )}
          {/* A second sofa closes the lounge in the luxury terrace */}
          {setup === 'luxury' && halfL - sofaX > 3.2 && (
            <OutdoorSofa position={[sofaX + sofaW / 2 + 0.95, 0, tableZ + 0.2]} width={1.6} rotation={-Math.PI / 2} />
          )}
        </>
      )}

      {(isTerrace || setup === 'tropical' || setup === 'daybed') && setup !== 'bistro' && (
        <>
          {[-1, 1].map((s) => (
            <OutdoorLoungeChair key={s} position={[sofaX + s * 0.55, 0, tableZ + 0.75]} rotation={Math.PI + s * 0.25} />
          ))}
        </>
      )}
      {isTerrace && (setup === 'modern' || setup === 'luxury') && <OutdoorDiningSet position={[-halfL + 1.6, 0, halfW - 1.5]} />}

      {/* Fibrestone planters at the ends of the terrace */}
      <PottedPlant position={[halfL - 0.35, 0, -halfW + 0.35]} scale={1.0} planter="charcoal" planterHeight={0.5} rotation={0.4} />
      <PottedPlant position={[-halfL + 0.4, 0, railZ - 0.42]} scale={1.2} planter="concrete" planterHeight={0.55} rotation={-0.8} />
      {isTerrace && <PottedPlant position={[halfL - 0.45, 0, railZ - 0.45]} scale={1.2} planter="concrete" planterHeight={0.55} rotation={2.1} />}
      {/* Tropical: lush planting along the facade and rail */}
      {setup === 'tropical' && (
        <>
          <PottedPlant position={[halfL - 0.4, 0, railZ - 0.45]} scale={1.5} planter="stone" planterHeight={0.55} rotation={2.1} />
          <PottedPlant position={[-halfL + 0.45, 0, -halfW + 0.4]} scale={1.6} planter="charcoal" planterHeight={0.6} rotation={1.0} />
          <PottedPlant position={[sofaX + sofaW / 2 + 0.55, 0, -halfW + 0.4]} scale={1.3} planter="stone" planterHeight={0.5} rotation={-0.3} />
          <PottedPlant position={[0, 0, railZ - 0.4]} scale={1.1} planter="concrete" planterHeight={0.5} rotation={0.7} />
        </>
      )}

      {/* Facade lighting flanking the sliders */}
      {slider && [slider.offset - slider.width / 2 - 0.2, sliderEast + 0.2].map((x) => (
        <WallSconce key={x} position={[x, 1.95, -halfW + 0.004]} intensity={0.8} />
      ))}
    </group>
  );
}
