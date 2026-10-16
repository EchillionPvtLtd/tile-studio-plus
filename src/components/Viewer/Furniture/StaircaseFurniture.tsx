'use client';

import React, { useMemo } from 'react';
import * as THREE from 'three';
import { useRoomStore } from '@/stores/roomStore';
import { useTileMaterial } from '@/three/useTileMaterial';
import { useInteriorMaterials, PALETTE } from './interiorMaterials';
import { FurnitureProps, FT2M, GlobePendant, PottedPlant, Artwork } from './DecorPieces';
import { getStaircaseLayout } from '../roomLayout';

/**
 * Staircase hall — treated as architecture, not a furniture zone.
 * Tile-clad treads (follow the active floor tile) on a solid plastered stair
 * with a sloped soffit, frameless glass balustrades with walnut
 * handrails, warm LED nosing lights, a raised upper landing with its own door,
 * a staggered globe pendant cluster over the open hall, one artwork and one plant.
 */
export function StaircaseFurniture({ lengthFt, widthFt, heightFt }: FurnitureProps) {
  const { floorTile, layout, groutWidthMm, groutColor } = useRoomStore();
  const m = useInteriorMaterials();
  const roomL = lengthFt * FT2M;
  const roomW = widthFt * FT2M;
  const roomH = heightFt * FT2M;
  const halfL = roomL / 2;
  const halfW = roomW / 2;

  const s = getStaircaseLayout(roomL, roomW, roomH);
  const { totalRise, stepCount, rise, run, stepWidth, flightLength, stairStartX, stairStartZ, landingStartX, landingWidth, landingDepth } = s;

  // Tread Tile Material mapped from active floor tile
  const treadMat = useTileMaterial({
    textureUrl: floorTile?.textureUrl ?? null,
    surfaceLengthFt: 4,
    surfaceWidthFt: 1.2,
    tileWidthMm: floorTile?.widthMm ?? 600,
    tileHeightMm: floorTile?.heightMm ?? 300,
    finish: floorTile?.finish,
    layout,
    groutWidthMm,
    groutColor,
    defaultColor: '#efe9e0',
  });

  const treadThickness = 0.045;
  const slope = Math.atan2(totalRise, flightLength);
  const openSideZ = stepWidth / 2;
  const landingCenterX = landingStartX + landingWidth / 2;
  const landingCenterZ = -halfW + landingDepth / 2;
  const landingSouthZ = -halfW + landingDepth;
  const guardStartZ = stairStartZ + stepWidth / 2 + 0.03;
  const guardLen = landingSouthZ - guardStartZ - 0.03;
  const railH = 0.9;

  // Balustrade glass with vertical ends, following the nosing line from the first step to the landing
  const flightGlass = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(0.05, rise + 0.04);
    shape.lineTo(flightLength, totalRise + 0.04);
    shape.lineTo(flightLength, totalRise + railH - 0.03);
    shape.lineTo(0.05, rise + railH - 0.03);
    shape.closePath();
    return new THREE.ExtrudeGeometry(shape, { depth: 0.012, bevelEnabled: false });
  }, [rise, flightLength, totalRise]);
  const railStart = new THREE.Vector2(0.05, rise + railH);
  const railEnd = new THREE.Vector2(flightLength, totalRise + railH);
  const railLen = railStart.distanceTo(railEnd);

  // Solid plastered stair body: sawtooth top under the treads, sloped soffit underneath
  const stairBody = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    for (let i = 0; i < stepCount; i++) {
      shape.lineTo(i * run, (i + 1) * rise - treadThickness);
      shape.lineTo((i + 1) * run, (i + 1) * rise - treadThickness);
    }
    shape.lineTo(flightLength, totalRise - treadThickness - 0.24);
    shape.lineTo(run * 1.5, 0);
    shape.closePath();
    const g = new THREE.ExtrudeGeometry(shape, { depth: stepWidth, bevelEnabled: false });
    g.translate(0, 0, -stepWidth / 2);
    return g;
  }, [stepCount, run, rise, flightLength, totalRise, stepWidth]);

  return (
    <group>
      {/* ── Flight ── */}
      <group position={[stairStartX, 0, stairStartZ]}>
        {Array.from({ length: stepCount }).map((_, i) => {
          const stepY = i * rise;
          return (
            <group key={i} position={[i * run, 0, 0]}>
              <mesh position={[run / 2 - 0.01, stepY + rise - treadThickness / 2, 0.01]} castShadow receiveShadow>
                <boxGeometry args={[run + 0.02, treadThickness, stepWidth + 0.02]} />
                <primitive object={treadMat} attach="material" />
              </mesh>
              {/* Recessed LED under each nosing */}
              <mesh position={[-0.012, stepY + rise - treadThickness - 0.003, 0]} material={m.ledWarm}>
                <boxGeometry args={[0.004, 0.004, stepWidth * 0.92]} />
              </mesh>
            </group>
          );
        })}

        <mesh geometry={stairBody} material={m.lacquerWarmWhite} castShadow receiveShadow />

        {/* Frameless glass balustrade with walnut handrail */}
        <mesh geometry={flightGlass} material={m.glass} position={[0, 0, openSideZ + 0.024]} />
        <mesh
          position={[(railStart.x + railEnd.x) / 2, (railStart.y + railEnd.y) / 2, openSideZ + 0.03]}
          rotation={[0, 0, slope + Math.PI / 2]}
          material={m.walnut}
          castShadow
        >
          <cylinderGeometry args={[0.024, 0.024, railLen, 16]} />
        </mesh>

        <pointLight position={[flightLength * 0.5, totalRise * 0.5 + 0.3, 0.25]} color={PALETTE.lightWarm} intensity={1.1} distance={2.6} decay={2} />
      </group>

      {/* ── Raised upper landing ── */}
      <group position={[landingCenterX, 0, landingCenterZ]}>
        <mesh position={[0, totalRise - 0.03, 0]} castShadow receiveShadow>
          <boxGeometry args={[landingWidth, 0.06, landingDepth]} />
          <primitive object={treadMat} attach="material" />
        </mesh>
        {/* Plinth: warm-white faces with recessed LED nosings on the two open edges */}
        <mesh position={[0, (totalRise - 0.06) / 2, 0]} material={m.lacquerWarmWhite} receiveShadow>
          <boxGeometry args={[landingWidth, totalRise - 0.06, landingDepth]} />
        </mesh>
        <mesh position={[-landingWidth / 2 + 0.015, totalRise - 0.066, guardStartZ + guardLen / 2 - landingCenterZ]} material={m.ledWarm}>
          <boxGeometry args={[0.006, 0.004, guardLen]} />
        </mesh>
        <mesh position={[0, totalRise - 0.066, landingDepth / 2 - 0.015]} material={m.ledWarm}>
          <boxGeometry args={[landingWidth - 0.04, 0.004, 0.006]} />
        </mesh>

        {/* Glass guards with walnut rails on the open west and south edges */}
        <group position={[-landingWidth / 2 + 0.03, totalRise + railH / 2, guardStartZ + guardLen / 2 - landingCenterZ]}>
          <mesh material={m.glass}>
            <boxGeometry args={[0.012, railH - 0.04, guardLen]} />
          </mesh>
          <mesh position={[0, railH / 2, 0]} rotation={[Math.PI / 2, 0, 0]} material={m.walnut} castShadow>
            <cylinderGeometry args={[0.024, 0.024, guardLen + 0.03, 16]} />
          </mesh>
        </group>
        <group position={[0.015, totalRise + railH / 2, landingDepth / 2 - 0.03]}>
          <mesh material={m.glass}>
            <boxGeometry args={[landingWidth - 0.03, railH - 0.04, 0.012]} />
          </mesh>
          <mesh position={[0, railH / 2, 0]} rotation={[0, 0, Math.PI / 2]} material={m.walnut} castShadow>
            <cylinderGeometry args={[0.024, 0.024, landingWidth - 0.03, 16]} />
          </mesh>
        </group>
      </group>

      {/* ── Staggered globe cluster over the open hall ── */}
      {[
        { dx: 0, dz: 0, drop: 1.2, d: 0.3, light: true },
        { dx: 0.32, dz: 0.12, drop: 0.9, d: 0.24, light: false },
        { dx: -0.28, dz: 0.18, drop: 0.75, d: 0.22, light: false },
        { dx: 0.1, dz: -0.3, drop: 1.05, d: 0.26, light: true },
        { dx: -0.18, dz: -0.2, drop: 0.6, d: 0.2, light: false },
      ].map((p, i) => (
        <GlobePendant
          key={i}
          x={stairStartX + flightLength * 0.45 + p.dx}
          z={stairStartZ + stepWidth / 2 + 0.9 + p.dz}
          ceilingY={roomH}
          bottomY={Math.max(2.1, roomH - p.drop - p.d)}
          diameter={p.d}
          intensity={2.2}
          light={p.light}
        />
      ))}

      {/* Artwork facing the foot of the stair, and one plant at the foot of the gallery */}
      <Artwork position={[-halfL + 0.005, 1.6, Math.min(halfW - 0.9, stairStartZ + stepWidth / 2 + 1.1)]} rotation={Math.PI / 2} width={0.9} height={1.15} variant={0} />
      <PottedPlant position={[landingStartX + 0.45, 0, landingSouthZ + 0.42]} scale={1.2} planter="stone" planterHeight={0.42} rotation={1.4} />
    </group>
  );
}
