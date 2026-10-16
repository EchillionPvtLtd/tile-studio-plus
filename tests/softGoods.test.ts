import { describe, expect, it } from 'vitest';
import type * as THREE from 'three';
import { buildCushionGeometry, buildPillowGeometry, buildThrowGeometry } from '@/components/Viewer/Furniture/softGoodsGeometry';
import { buildCurtainGeometry } from '@/components/Viewer/curtainGeometry';

/** Every number in the mesh is finite and every index points at a real vertex. */
function expectSound(geo: THREE.BufferGeometry) {
  const pos = geo.getAttribute('position');
  const normal = geo.getAttribute('normal');
  const index = geo.getIndex()!;
  expect(pos.count).toBeGreaterThan(0);
  expect(normal.count).toBe(pos.count);
  for (let i = 0; i < pos.array.length; i++) expect(Number.isFinite(pos.array[i])).toBe(true);
  for (let i = 0; i < normal.count; i++) {
    const len = Math.hypot(normal.getX(i), normal.getY(i), normal.getZ(i));
    // Welded seams and pinched corners can leave a zero-area vertex, but a normal is never NaN
    expect(Number.isFinite(len)).toBe(true);
  }
  for (let i = 0; i < index.count; i++) expect(index.getX(i)).toBeLessThan(pos.count);
}

/** For a closed, consistently wound surface every directed edge appears once, and so does its reverse. */
function expectClosedAndOutward(geo: THREE.BufferGeometry) {
  const index = geo.getIndex()!;
  const edges = new Map<string, number>();
  const add = (a: number, b: number) => edges.set(`${a}>${b}`, (edges.get(`${a}>${b}`) ?? 0) + 1);
  for (let i = 0; i < index.count; i += 3) {
    const a = index.getX(i);
    const b = index.getX(i + 1);
    const c = index.getX(i + 2);
    // Collapsed triangles carry no surface
    if (a === b || b === c || a === c) continue;
    add(a, b);
    add(b, c);
    add(c, a);
  }
  edges.forEach((count, key) => {
    expect(count, `edge ${key} used ${count} times`).toBe(1);
    const [a, b] = key.split('>');
    expect(edges.get(`${b}>${a}`), `edge ${key} has no matching reverse`).toBe(1);
  });
}

/**
 * Winding is consistent when every directed edge is matched by as many reverse edges. Unlike the check above this
 * tolerates the pinched corners of a pillow, where front and back panels share a flat zero-thickness sliver.
 */
function expectBalancedWinding(geo: THREE.BufferGeometry) {
  const index = geo.getIndex()!;
  const edges = new Map<string, number>();
  const add = (a: number, b: number) => edges.set(`${a}>${b}`, (edges.get(`${a}>${b}`) ?? 0) + 1);
  for (let i = 0; i < index.count; i += 3) {
    const a = index.getX(i);
    const b = index.getX(i + 1);
    const c = index.getX(i + 2);
    if (a === b || b === c || a === c) continue;
    add(a, b);
    add(b, c);
    add(c, a);
  }
  edges.forEach((count, key) => {
    const [a, b] = key.split('>');
    expect(edges.get(`${b}>${a}`) ?? 0, `edge ${key} is not matched by its reverse`).toBe(count);
  });
}

/** Signed volume of a closed mesh: positive when the triangles face outward. */
function signedVolume(geo: THREE.BufferGeometry): number {
  const pos = geo.getAttribute('position');
  const index = geo.getIndex()!;
  let v = 0;
  for (let i = 0; i < index.count; i += 3) {
    const [a, b, c] = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
    const ax = pos.getX(a), ay = pos.getY(a), az = pos.getZ(a);
    const bx = pos.getX(b), by = pos.getY(b), bz = pos.getZ(b);
    const cx = pos.getX(c), cy = pos.getY(c), cz = pos.getZ(c);
    v += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
  }
  return v;
}

describe('soft goods geometry', () => {
  it('builds a welded, outward-facing cushion near its nominal size', () => {
    const [w, h, d] = [0.7, 0.17, 0.62];
    const geo = buildCushionGeometry(w, h, d, { radius: 0.055, crown: 0.018, puff: 0.009, wobble: 0.003, seed: 3 });
    expectSound(geo);
    expectClosedAndOutward(geo);

    const volume = signedVolume(geo);
    expect(volume).toBeGreaterThan(0);
    // A rounded, slightly stuffed block holds a little less than the bounding box, never more than a few percent over
    expect(volume).toBeGreaterThan(w * h * d * 0.85);
    expect(volume).toBeLessThan(w * h * d * 1.1);

    geo.computeBoundingBox();
    const box = geo.boundingBox!;
    expect(box.max.x - box.min.x).toBeGreaterThan(w * 0.97);
    expect(box.max.x - box.min.x).toBeLessThan(w + 0.04);
    expect(box.max.y - box.min.y).toBeLessThan(h + 0.05);
    expect(box.max.z - box.min.z).toBeLessThan(d + 0.04);
  });

  it('keeps cushions different from one another through the seed', () => {
    const a = buildCushionGeometry(0.5, 0.2, 0.5, { seed: 1 });
    const b = buildCushionGeometry(0.5, 0.2, 0.5, { seed: 9 });
    expect(a.getAttribute('position').count).toBe(b.getAttribute('position').count);
    let differs = 0;
    for (let i = 0; i < a.getAttribute('position').array.length; i++) {
      if (Math.abs(a.getAttribute('position').array[i] - b.getAttribute('position').array[i]) > 1e-6) differs++;
    }
    expect(differs).toBeGreaterThan(100);
  });

  it('survives extreme rounding on thin pieces such as rugs', () => {
    const geo = buildCushionGeometry(3.4, 0.014, 2.5, { radius: 0.5, crown: 0.001, puff: 0, wobble: 0.0005 });
    expectSound(geo);
    expectClosedAndOutward(geo);
    expect(signedVolume(geo)).toBeGreaterThan(0);
  });

  it('builds a closed pillow that pinches to a seam all round', () => {
    const geo = buildPillowGeometry(0.48, 0.46, { thickness: 0.17 });
    expectSound(geo);
    expectBalancedWinding(geo);
    expect(signedVolume(geo)).toBeGreaterThan(0);

    geo.computeBoundingBox();
    const box = geo.boundingBox!;
    // Two panels, each rising about half the thickness; the seam sits on z = 0
    expect(box.max.z).toBeGreaterThan(0.05);
    expect(box.max.z).toBeLessThan(0.1);
    expect(box.min.z).toBeCloseTo(-box.max.z, 1);
    expect(box.max.x - box.min.x).toBeLessThan(0.5);
  });

  it('drapes a throw over the arm and down the far side', () => {
    const geo = buildThrowGeometry({ innerX: -1.0, outerX: -1.17, armTop: 0.6, seatTop: 0.45, width: 0.5, drop: 0.34, seatDir: 1 });
    expectSound(geo);
    geo.computeBoundingBox();
    const box = geo.boundingBox!;
    // Starts on the seat inboard of the arm, ends hanging outboard of it and below the arm top
    expect(box.max.x).toBeGreaterThan(-0.75);
    expect(box.min.x).toBeLessThan(-1.17);
    expect(box.max.y).toBeGreaterThan(0.6);
    expect(box.min.y).toBeLessThan(0.6 - 0.25);
    expect(box.max.z - box.min.z).toBeGreaterThan(0.45);
  });
});

describe('curtain geometry', () => {
  it('builds a pleated drapery panel from the floor to the head', () => {
    const geo = buildCurtainGeometry(0.66, 3.2, { seed: 2 });
    expectSound(geo);
    geo.computeBoundingBox();
    const box = geo.boundingBox!;
    expect(box.min.y).toBeGreaterThan(-0.05);
    expect(box.max.y).toBeCloseTo(3.2, 1);
    // Folds stand clear of the rod line by a few centimetres, no more
    expect(box.max.z - box.min.z).toBeGreaterThan(0.05);
    expect(box.max.z - box.min.z).toBeLessThan(0.2);
    // The panel fans out a little toward the hem but stays close to its drawn width
    expect(box.max.x - box.min.x).toBeGreaterThan(0.64);
    expect(box.max.x - box.min.x).toBeLessThan(0.8);
  });
});
