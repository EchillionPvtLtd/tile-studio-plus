import * as THREE from 'three';
import { noise3 } from './Furniture/softGoodsGeometry';

export interface CurtainOptions {
  /** Pleat crest-to-crest spacing at the head of the curtain, metres. */
  pleatSpacing?: number;
  /** Fold depth, metres. */
  pleatDepth?: number;
  seed?: number;
}

/**
 * One drawn-back drapery panel hanging from a rod: width × height in metres, origin at the bottom centre,
 * folds running vertically. Pleats are tight and regular at the head, then relax and deepen toward the floor
 * the way gathered linen falls, with a slightly uneven hem.
 */
export function buildCurtainGeometry(width: number, height: number, opts: CurtainOptions = {}): THREE.BufferGeometry {
  const { pleatSpacing = 0.1, pleatDepth = 0.05, seed = 1 } = opts;
  const NX = Math.max(48, Math.round((width / pleatSpacing) * 14));
  const NY = 28;
  const pleats = width / pleatSpacing;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let j = 0; j <= NY; j++) {
    const v = j / NY; // 0 floor … 1 head
    const y = v * height;
    const fromTop = 1 - v;
    // Folds meander a little as the cloth falls and fan out toward the hem
    const sway = Math.sin(v * 3.1 + seed) * 0.22 + (noise3(v * 2.2, seed, 0, seed) - 0.5) * 0.5;
    const spread = 1 + fromTop * 0.12;
    const depth = pleatDepth * (0.78 + 0.5 * fromTop) * (v > 0.94 ? 0.85 : 1);
    for (let i = 0; i <= NX; i++) {
      const u = i / NX;
      const x = (u - 0.5) * width * spread;
      const phase = (u * pleats + sway) * Math.PI * 2;
      // Main fold, a lighter second harmonic so the crests are rounder than the valleys
      let z = depth * (Math.sin(phase) * 0.78 + Math.sin(phase * 2.07 + 1.2 + seed) * 0.16 + (noise3(u * 9, v * 3, seed, seed) - 0.5) * 0.18);
      // The cloth is clipped to the rod at the head and drawn straight at the very edge of the panel
      const edge = Math.min(1, Math.min(u, 1 - u) * 14);
      z *= edge;
      // Hem lifts and dips a touch
      const hem = v < 0.04 ? (noise3(u * 12, 0, seed, seed + 3) - 0.5) * 0.02 * (1 - v / 0.04) : 0;
      positions.push(x, y + hem, z);
      uvs.push(u * (width / 0.6), v * (height / 0.6));
    }
  }
  for (let j = 0; j < NY; j++) {
    for (let i = 0; i < NX; i++) {
      const a = j * (NX + 1) + i;
      const b = a + 1;
      const c = a + NX + 1;
      const d = c + 1;
      indices.push(a, b, c, b, d, c);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}
