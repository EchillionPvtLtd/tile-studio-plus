'use client';

import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { useInteriorMaterials } from './interiorMaterials';

/** Bowl length out from the cistern panel and half-width, in metres. A real wall-hung pan is ~0.36 wide and projects ~0.55 from the wall. */
const LEN = 0.36;
const HALF_W = 0.18;
/** Points per outline segment: side, front curve, front curve, side, back. Fixed so every ring of the loft lines up. */
const SEGMENTS = [8, 24, 24, 8, 6] as const;
const RING_POINTS = SEGMENTS.reduce((a, b) => a + b, 0);

const bez = (p0: THREE.Vector2, p1: THREE.Vector2, p2: THREE.Vector2, p3: THREE.Vector2, t: number) => {
  const k = 1 - t;
  return new THREE.Vector2(
    k * k * k * p0.x + 3 * k * k * t * p1.x + 3 * k * t * t * p2.x + t * t * t * p3.x,
    k * k * k * p0.y + 3 * k * k * t * p1.y + 3 * k * t * t * p2.y + t * t * t * p3.y,
  );
};

/**
 * Plan outline of the pan, pulled in by `inset` all round except at the wall: flat at the back (u = 0), straight
 * sides, then an elongated oval front. u runs out from the wall, v across it. Always RING_POINTS points.
 */
function outline(inset: number): THREE.Vector2[] {
  const L = LEN - inset;
  const W = HALF_W - inset;
  const v = (x: number, y: number) => new THREE.Vector2(x, y);
  const out: THREE.Vector2[] = [];
  const [nA, nB, nC, nD, nE] = SEGMENTS;
  for (let i = 0; i < nA; i++) out.push(v((0.3 * L * i) / nA, -W));
  const b0 = v(0.3 * L, -W), b1 = v(0.64 * L, -W), b2 = v(L, -0.62 * W), b3 = v(L, 0);
  for (let i = 0; i < nB; i++) out.push(bez(b0, b1, b2, b3, i / nB));
  const c0 = v(L, 0), c1 = v(L, 0.62 * W), c2 = v(0.64 * L, W), c3 = v(0.3 * L, W);
  for (let i = 0; i < nC; i++) out.push(bez(c0, c1, c2, c3, i / nC));
  for (let i = 0; i < nD; i++) out.push(v(0.3 * L - (0.3 * L * i) / nD, W));
  for (let i = 0; i < nE; i++) out.push(v(0, W - (2 * W * i) / nE));
  return out;
}

/**
 * Profile of the pan from its underside up to the rim: [inset from the rim outline, height below the rim].
 * It is full width at the rim and curves under and in toward a narrow base, like a wall-hung bowl.
 */
const PROFILE: [number, number][] = [
  [0.165, -0.215],
  [0.152, -0.208],
  [0.13, -0.195],
  [0.105, -0.176],
  [0.08, -0.148],
  [0.056, -0.115],
  [0.036, -0.08],
  [0.02, -0.05],
  [0.008, -0.026],
  [0.002, -0.012],
  [0.0, -0.006],
  [0.002, -0.002],
  [0.007, 0],
  [0.016, 0],
];

/** The pan: a smooth loft of the outline through the profile, closed top and bottom. */
function buildPanGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  PROFILE.forEach(([inset, y]) => {
    outline(inset).forEach((p) => positions.push(p.x, y, p.y));
  });
  const rings = PROFILE.length;
  for (let i = 0; i < rings - 1; i++) {
    for (let j = 0; j < RING_POINTS; j++) {
      const a = i * RING_POINTS + j;
      const b = i * RING_POINTS + ((j + 1) % RING_POINTS);
      const c = (i + 1) * RING_POINTS + j;
      const d = (i + 1) * RING_POINTS + ((j + 1) % RING_POINTS);
      indices.push(a, c, b, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  // Flat caps, kept as separate vertices so the rim and the underside keep a crisp edge
  const cap = (ringIndex: number, up: boolean) => {
    const ring = outline(PROFILE[ringIndex][0]);
    const y = PROFILE[ringIndex][1];
    const centre = new THREE.Vector2();
    ring.forEach((p) => centre.add(p));
    centre.multiplyScalar(1 / ring.length);
    const pos: number[] = [centre.x, y, centre.y];
    ring.forEach((p) => pos.push(p.x, y, p.y));
    const idx: number[] = [];
    for (let j = 0; j < ring.length; j++) {
      const p = 1 + j;
      const q = 1 + ((j + 1) % ring.length);
      if (up) idx.push(0, q, p);
      else idx.push(0, p, q);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  };
  const merged = mergeParts([geo, cap(0, false), cap(rings - 1, true)]);
  geo.dispose();
  return merged;
}

/** Concatenates indexed geometries that share the same attributes (position + normal). */
function mergeParts(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const idx: number[] = [];
  let base = 0;
  for (const g of parts) {
    const p = g.getAttribute('position');
    const n = g.getAttribute('normal');
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      nor.push(n.getX(i), n.getY(i), n.getZ(i));
    }
    const index = g.getIndex()!;
    for (let i = 0; i < index.count; i++) idx.push(index.getX(i) + base);
    base += p.count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setIndex(idx);
  return out;
}

/** A slab with softly rounded edges that follows the pan outline (used for the seat and the lid). Sits on y = 0 and rises by `thickness`. */
function buildSlabGeometry(inset: number, thickness: number, bevel: number): THREE.BufferGeometry {
  const shape = new THREE.Shape(outline(inset + bevel));
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: thickness - bevel * 2,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 5,
    curveSegments: 8,
  });
  geo.rotateX(-Math.PI / 2); // the outline lies flat, extruding upward
  geo.translate(0, bevel, 0);
  const smooth = toCreasedNormals(geo, Math.PI / 3);
  geo.dispose();
  return smooth;
}

/**
 * Wall-hung WC: a pan that tapers and curves under toward the cistern panel, with a separate seat and a
 * domed closed lid (so there is a visible seam between rim, seat and lid), and hinge caps at the back.
 *
 * Local frame: the origin is where the pan meets the panel, +x runs out into the room, y = 0 is the top of the pan rim.
 * Place it with `rotation={[0, Math.PI, 0]}` on a wall that faces -x, at rim height (about 0.40 m).
 */
export function WallHungToilet() {
  const m = useInteriorMaterials();
  const pan = useMemo(() => buildPanGeometry(), []);
  const seat = useMemo(() => buildSlabGeometry(0.006, 0.03, 0.007), []);
  const lid = useMemo(() => buildSlabGeometry(0.004, 0.034, 0.012), []);
  // Same shader variant as the pan's glaze, so it adds no extra shader compile
  const plastic = useMemo(
    () => new THREE.MeshPhysicalMaterial({ color: '#f4f2ee', roughness: 0.3, clearcoat: 0.4, clearcoatRoughness: 0.2 }),
    [],
  );

  useEffect(
    () => () => {
      pan.dispose();
      seat.dispose();
      lid.dispose();
      plastic.dispose();
    },
    [pan, seat, lid, plastic],
  );

  return (
    <group>
      <mesh geometry={pan} material={m.ceramicWhite} castShadow receiveShadow />
      {/* Seat rests a few millimetres above the rim, the lid on the seat: the seams read as thin shadow lines */}
      <mesh geometry={seat} material={plastic} position={[0, 0.004, 0]} castShadow receiveShadow />
      <mesh geometry={lid} material={plastic} position={[0, 0.034, 0]} castShadow receiveShadow />
      {/* Hinge bars resting on the back of the lid */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[0.03, 0.074, s * 0.11]} rotation={[Math.PI / 2, 0, 0]} material={m.brushedSteel} castShadow>
          <cylinderGeometry args={[0.009, 0.009, 0.04, 14]} />
        </mesh>
      ))}
    </group>
  );
}
