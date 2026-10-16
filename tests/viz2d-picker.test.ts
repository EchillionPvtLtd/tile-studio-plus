import { describe, expect, it } from 'vitest';
import { groupAnchors } from '@/lib/viz2d/anchors';
import { activePills, buildPills } from '@/lib/viz2d/picker';
import type { SurfaceGroup } from '@/lib/viz2d/design';

const grid = (w: number, h: number, at: (x: number, y: number) => number) => {
  const labels = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) labels[y * w + x] = at(x, y);
  return labels;
};
const pixelOf = (a: [number, number], w: number, h: number) => [Math.floor(a[0] * w), Math.floor(a[1] * h)] as const;

describe('groupAnchors', () => {
  it('puts the anchor deep inside the surface, away from its edge', () => {
    // facet 0 on the left half, facet 1 on the right half
    const labels = grid(20, 10, (x) => (x < 10 ? 1 : 2));
    const a = groupAnchors(labels, 20, 10, { left: [0], right: [1] });
    const [lx, ly] = pixelOf(a.left, 20, 10);
    expect(lx).toBeGreaterThanOrEqual(3);
    expect(lx).toBeLessThanOrEqual(6);
    expect(ly).toBeGreaterThanOrEqual(3);
    expect(ly).toBeLessThanOrEqual(6);
    expect(pixelOf(a.right, 20, 10)[0]).toBeGreaterThanOrEqual(13);
  });

  it('stays on the surface when its middle is empty (a ring)', () => {
    const w = 31;
    const labels = grid(w, w, (x, y) => (Math.abs(x - 15) < 5 && Math.abs(y - 15) < 5 ? 0 : 1));
    const a = groupAnchors(labels, w, w, { ring: [0] });
    const [x, y] = pixelOf(a.ring, w, w);
    expect(labels[y * w + x]).toBe(1);
  });

  it('joins the facets of one group and skips a group that has no pixels', () => {
    const labels = grid(20, 10, (x) => (x < 4 ? 1 : x >= 12 ? 2 : 0));
    const a = groupAnchors(labels, 20, 10, { both: [0, 1], none: [5] });
    expect(a.none).toBeUndefined();
    // facet 1 (x 12..19) is the wider piece, so the anchor is there
    expect(pixelOf(a.both, 20, 10)[0]).toBeGreaterThanOrEqual(12);
  });

  it('gives nothing for a map of the wrong size', () => {
    expect(groupAnchors(new Uint8Array(5), 20, 10, { a: [0] })).toEqual({});
  });
});

const group = (id: string, kind: SurfaceGroup['kind'], areaSqFt: number, name = id): SurfaceGroup => ({ id, name, kind, facets: [0], areaSqFt, priority: 1 });
const tile = { id: 't', sku: 't', name: 't', textureUrl: '/t.jpg', widthMm: 600, heightMm: 600, finish: 'Matt', pricePerSqFt: 1 };
const settings = { tile, layout: 'straight', rotationDeg: 0, tileWidthMm: 600, tileHeightMm: 600, groutMm: 3, groutColor: '#cccccc', offsetX: 0, offsetY: 0, lighting: 1, variation: 0.3 } as const;

describe('buildPills', () => {
  const anchors: Record<string, [number, number]> = { f: [0.5, 0.8], w1: [0.2, 0.2], w2: [0.7, 0.2], w3: [0.9, 0.2] };

  it('makes a label for the floor and one for all the walls, counting the walls that have a tile', () => {
    const groups = [group('f', 'floor', 30, 'Floor'), group('w1', 'wall', 20, 'Left wall'), group('w2', 'wall', 40, 'Back wall')];
    const pills = buildPills(groups, anchors, { surfaces: { w1: settings } });
    expect(pills.map((p) => p.key)).toEqual(['floor:f', 'wall']);
    const wall = pills.find((p) => p.key === 'wall')!;
    expect(wall).toMatchObject({ label: 'Wall', done: 1, total: 2, counted: true, groupIds: ['w1', 'w2'] });
    // the label sits on the biggest wall
    expect(wall.anchor).toEqual(anchors.w2);
    expect(pills[0]).toMatchObject({ label: 'Floor', done: 0, total: 1, counted: false });
  });

  it('names a lone wall by its own name and does not count it', () => {
    const pills = buildPills([group('w1', 'wall', 20, 'Back wall')], anchors, { surfaces: {} });
    expect(pills).toHaveLength(1);
    expect(pills[0]).toMatchObject({ label: 'Back wall', total: 1, counted: false });
  });

  it('leaves out a surface that has no anchor, and gives nothing when no surface can be placed', () => {
    const groups = [group('w1', 'wall', 20), group('nowhere', 'wall', 50)];
    expect(buildPills(groups, anchors, { surfaces: {} })[0].groupIds).toEqual(['w1']);
    expect(buildPills(groups, {}, { surfaces: {} })).toEqual([]);
  });

  it('gives each other marked surface its own label', () => {
    const pills = buildPills([group('b', 'backsplash', 5, 'Backsplash')], { b: [0.3, 0.3] }, { surfaces: {} });
    expect(pills).toEqual([expect.objectContaining({ key: 'backsplash:b', label: 'Backsplash' })]);
  });
});

describe('activePills', () => {
  const groups = [group('f', 'floor', 30), group('w1', 'wall', 20), group('w2', 'wall', 40)];
  const pills = buildPills(groups, { f: [0.5, 0.8], w1: [0.2, 0.2], w2: [0.7, 0.2] }, { surfaces: {} });

  it('is empty while nothing is selected', () => {
    expect(activePills(pills, [], null)).toEqual([]);
  });

  it('keeps the labels of what is selected, each with all its surfaces', () => {
    expect(activePills(pills, ['w1'], null).map((p) => p.key)).toEqual(['wall']);
    expect(activePills(pills, ['f', 'w2'], null).map((p) => p.key)).toEqual(['floor:f', 'wall']);
  });

  it('keeps a label open after its last tick was turned off, but only a label that exists', () => {
    expect(activePills(pills, [], 'wall').map((p) => p.key)).toEqual(['wall']);
    expect(activePills(pills, [], 'wall:gone')).toEqual([]);
    // a selection wins over the open label
    expect(activePills(pills, ['f'], 'wall').map((p) => p.key)).toEqual(['floor:f']);
  });
});
