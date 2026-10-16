import { describe, expect, it } from "vitest";
import { herringboneFaces, samplePattern, samplePatternSpace, tileCoverage, toPatternSpace, type PatternParams } from "@/lib/viz2d/pattern";

const base: PatternParams = { kind: "straight", tileW: 600, tileH: 300, grout: 4, rotation: 0, originX: 0, originY: 0 };

// A small deterministic generator so the statistical tests are repeatable
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

describe("grid patterns", () => {
  it("puts the face in the middle of the lattice cell and grout around it", () => {
    // cell = (600+4) × (300+4); face centre at (2 + 300, 2 + 150)
    const centre = samplePattern(base, 302, 152);
    expect(centre.dist).toBeCloseTo(-150, 6); // 150 mm to the nearest (horizontal) edge
    expect(centre.u).toBeCloseTo(0.5, 6);
    expect(centre.v).toBeCloseTo(0.5, 6);
    // On the cell boundary the grout is `grout / 2` deep
    expect(samplePattern(base, 0, 100).dist).toBeCloseTo(2, 6);
    expect(samplePattern(base, 300, 0).dist).toBeCloseTo(2, 6);
  });

  it("measures grout width as the gap between two faces", () => {
    // Walk across a vertical joint: it must be exactly `grout` mm wide
    const widthOfGrout = (() => {
      let inGrout = 0;
      for (let x = 0; x < 604; x += 0.01) if (samplePattern(base, x, 150).dist > 0) inGrout += 0.01;
      return inGrout;
    })();
    expect(widthOfGrout).toBeCloseTo(4, 1);
  });

  it("offsets alternate rows by half a tile in brick bond", () => {
    const brick = { ...base, kind: "brick" as const };
    // Vertical joint of row 0 is at x = 0 (mod 604); of row 1 at x = 302
    expect(samplePattern(brick, 0, 150).dist).toBeGreaterThan(0);
    expect(samplePattern(brick, 0, 150 + 304).dist).toBeLessThan(0);
    expect(samplePattern(brick, 302, 150 + 304).dist).toBeGreaterThan(0);
    expect(samplePattern(brick, 302, 150).dist).toBeLessThan(0);
    // Row 2 is back in line with row 0
    expect(samplePattern(brick, 0, 150 + 608).dist).toBeGreaterThan(0);
  });

  it("shifts each row by a third in 1/3 offset", () => {
    const off = { ...base, kind: "offset" as const };
    const px = 604;
    const jointAt = (row: number, x: number) => samplePattern(off, x, row * 304 + 150).dist > 0;
    expect(jointAt(0, 0)).toBe(true);
    expect(jointAt(1, px / 3)).toBe(true);
    expect(jointAt(2, (2 * px) / 3)).toBe(true);
    expect(jointAt(3, 0)).toBe(true); // wraps
    expect(jointAt(1, 0)).toBe(false);
  });

  it("is periodic and handles negative coordinates", () => {
    const a = samplePattern({ ...base, kind: "brick" }, -1234.5, -987.25);
    const b = samplePattern({ ...base, kind: "brick" }, -1234.5 + 604 * 2, -987.25 + 304 * 2);
    expect(a.dist).toBeCloseTo(b.dist, 6);
    expect(a.u).toBeCloseTo(b.u, 6);
  });

  it("uses the origin to decide where the first tile starts", () => {
    const shifted = { ...base, originX: 100, originY: 50 };
    expect(samplePattern(shifted, 100, 50 + 100).dist).toBeCloseTo(2, 6); // on a joint
    expect(samplePattern(base, 100, 50 + 100).dist).toBeLessThan(0);
  });

  it("turns the grid 45° for the diagonal layout", () => {
    const diag: PatternParams = { ...base, kind: "diagonal", tileW: 300, tileH: 300 };
    const straight: PatternParams = { ...diag, kind: "straight" };
    const [qx, qy] = toPatternSpace(diag, 420, 910);
    const viaDiagonal = samplePattern(diag, 420, 910);
    const viaStraight = samplePatternSpace(straight, qx, qy);
    expect(viaDiagonal.dist).toBeCloseTo(viaStraight.dist, 9);
    // And joints really run at 45° in surface space
    const along = samplePattern(diag, 0, 0).dist;
    const sameLine = samplePattern(diag, 100 * Math.SQRT1_2 * 1, 100 * Math.SQRT1_2 * 1);
    expect(sameLine.dist).toBeCloseTo(along, 6); // a joint line passes through the origin along the diagonal
  });

  it("reports the tile coverage of a layout", () => {
    expect(tileCoverage("straight", 600, 600, 3)).toBeCloseTo((600 * 600) / (603 * 603), 9);
    expect(tileCoverage("herringbone", 600, 150, 3)).toBeCloseTo((600 * 150) / (603 * 153), 9);
  });
});

describe("herringbone", () => {
  const cases = [
    { name: "2:1 plank, 3 mm grout", long: 600, short: 300, grout: 3 },
    { name: "6:1 plank, 2 mm grout", long: 1200, short: 200, grout: 2 },
    { name: "non-integer ratio, 5 mm grout", long: 900, short: 400, grout: 5 },
    { name: "no grout", long: 600, short: 150, grout: 0 },
  ];

  for (const c of cases) {
    it(`never lets two tiles overlap and covers the right area: ${c.name}`, () => {
      const rand = rng(1234);
      const N = 12000;
      let inside = 0;
      let overlaps = 0;
      const span = (c.long + c.short) * 6;
      for (let i = 0; i < N; i++) {
        const x = (rand() - 0.5) * span;
        const y = (rand() - 0.5) * span;
        const faces = herringboneFaces(c.grout, c.long, c.short, x, y);
        const hits = faces.filter((f) => f.dist < -1e-9).length;
        if (hits > 1) overlaps++;
        if (hits === 1) inside++;
      }
      expect(overlaps).toBe(0);
      const expected = tileCoverage("herringbone", c.long, c.short, c.grout);
      // With no grout the faces tile the plane completely
      expect(Math.abs(inside / N - expected)).toBeLessThan(0.012);
    });
  }

  it("keeps the tile coordinates of every pixel inside the tile within 0..1", () => {
    const rand = rng(99);
    const p: PatternParams = { kind: "herringbone", tileW: 600, tileH: 150, grout: 3, rotation: 0, originX: 0, originY: 0 };
    for (let i = 0; i < 2000; i++) {
      const s = samplePatternSpace(p, (rand() - 0.5) * 8000, (rand() - 0.5) * 8000);
      if (s.dist < -0.5) {
        expect(s.u).toBeGreaterThanOrEqual(-1e-9);
        expect(s.u).toBeLessThanOrEqual(1 + 1e-9);
        expect(s.v).toBeGreaterThanOrEqual(-1e-9);
        expect(s.v).toBeLessThanOrEqual(1 + 1e-9);
      }
    }
  });

  it("alternates between lying and standing tiles", () => {
    const seen = new Set<number>();
    const p: PatternParams = { kind: "herringbone", tileW: 600, tileH: 300, grout: 3, rotation: 0, originX: 0, originY: 0 };
    for (let x = 0; x < 3000; x += 37) for (let y = 0; y < 3000; y += 41) {
      const s = samplePatternSpace(p, x, y);
      if (s.dist < 0) seen.add(s.variant);
    }
    expect(seen.size).toBe(2);
  });

  it("maps the long side of the tile image along the long side of the tile (landscape and portrait tiles)", () => {
    // For a landscape tile u runs along the long side of a lying tile; for a portrait tile v does
    const land = samplePatternSpace({ kind: "herringbone", tileW: 600, tileH: 150, grout: 0 }, 5, 5);
    const port = samplePatternSpace({ kind: "herringbone", tileW: 150, tileH: 600, grout: 0 }, 5, 5);
    // Same lattice point, so the same physical position on the tile, but the image axes are swapped
    expect(land.u).toBeCloseTo(port.v, 9);
    expect(land.v).toBeCloseTo(port.u, 9);
  });
});
