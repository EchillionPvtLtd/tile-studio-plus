'use client';

import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import {
  buildCushionGeometry,
  buildPillowGeometry,
  buildThrowGeometry,
  type CushionOptions,
  type PillowOptions,
  type ThrowOptions,
} from './softGoodsGeometry';

type Vec3 = [number, number, number];

/** Frees a geometry built in useMemo when its piece unmounts or its shape changes. */
function useDispose(geo: THREE.BufferGeometry) {
  useEffect(() => () => geo.dispose(), [geo]);
}

/**
 * Plump upholstered block with a crowned top, puffed sides and a little irregularity — the loose
 * cushions, arms and bases of a sofa. `seed` makes each one slightly different.
 */
export function SoftCushion({
  size,
  position,
  rotation = [0, 0, 0],
  radius = 0.04,
  crown,
  puff,
  wobble,
  seed = 1,
  material,
  castShadow = true,
}: {
  size: Vec3;
  position: Vec3;
  rotation?: Vec3;
  material: THREE.Material;
  /** Flat pieces such as rugs only need to receive shadows. */
  castShadow?: boolean;
} & CushionOptions) {
  const [w, h, d] = size;
  const geo = useMemo(() => buildCushionGeometry(w, h, d, { radius, crown, puff, wobble, seed }), [w, h, d, radius, crown, puff, wobble, seed]);
  useDispose(geo);
  return <mesh geometry={geo} material={material} position={position} rotation={rotation} castShadow={castShadow} receiveShadow />;
}

/** Sewn, inflated scatter pillow: pinched corners and a seam all round. Front faces +Z. */
export function Pillow({
  width,
  height,
  position,
  rotation = [0, 0, 0],
  material,
  thickness,
  dent,
  sag,
  wrinkle,
  seed = 3,
}: {
  width: number;
  height: number;
  position: Vec3;
  rotation?: Vec3;
  material: THREE.Material;
} & PillowOptions) {
  const geo = useMemo(() => buildPillowGeometry(width, height, { thickness, dent, sag, wrinkle, seed }), [width, height, thickness, dent, sag, wrinkle, seed]);
  useDispose(geo);
  return <mesh geometry={geo} material={material} position={position} rotation={rotation} castShadow receiveShadow />;
}

/** A blanket slung over a sofa arm. Its material should be double-sided. */
export function ThrowBlanket({ material, position = [0, 0, 0], ...opts }: { material: THREE.Material; position?: Vec3 } & ThrowOptions) {
  const { innerX, outerX, armTop, seatTop, width, drop, seatDir, seed } = opts;
  const geo = useMemo(
    () => buildThrowGeometry({ innerX, outerX, armTop, seatTop, width, drop, seatDir, seed }),
    [innerX, outerX, armTop, seatTop, width, drop, seatDir, seed],
  );
  useDispose(geo);
  return <mesh geometry={geo} material={material} position={position} castShadow receiveShadow />;
}
