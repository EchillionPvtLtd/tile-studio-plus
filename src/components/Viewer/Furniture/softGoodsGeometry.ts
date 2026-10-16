import * as THREE from 'three';

/*
 * Procedural soft-furnishing geometry: plump cushions, sewn pillows and a draped throw.
 * Everything is built as one closed, welded mesh so smooth normals have no seams, then shaded by
 * the shared fabric materials.
 */

// ── Seeded noise ────────────────────────────────────────────────────────────

function hash3(x: number, y: number, z: number, seed: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + seed * 19.19) * 43758.5453;
  return s - Math.floor(s);
}

/** Smooth 3D value noise in [0, 1]. */
export function noise3(x: number, y: number, z: number, seed = 0): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const fx = x - xi;
  const fy = y - yi;
  const fz = z - zi;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const w = fz * fz * (3 - 2 * fz);
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const c = (dx: number, dy: number, dz: number) => hash3(xi + dx, yi + dy, zi + dz, seed);
  return lerp(
    lerp(lerp(c(0, 0, 0), c(1, 0, 0), u), lerp(c(0, 1, 0), c(1, 1, 0), u), v),
    lerp(lerp(c(0, 0, 1), c(1, 0, 1), u), lerp(c(0, 1, 1), c(1, 1, 1), u), v),
    w,
  );
}

/** Two-octave noise centred on zero, roughly in [-0.5, 0.5]. */
function softNoise(x: number, y: number, z: number, seed: number): number {
  return noise3(x, y, z, seed) * 0.65 + noise3(x * 2.3, y * 2.3, z * 2.3, seed + 7) * 0.35 - 0.5;
}

// ── Cushion: a rounded box with a crowned top, puffed sides and soft irregularity ──

export interface CushionOptions {
  /** Edge rounding in metres. */
  radius?: number;
  /** How far the top and bottom faces bulge outward in the middle. */
  crown?: number;
  /** How far the four side faces bulge outward in the middle. */
  puff?: number;
  /** Amplitude of the soft irregularity of stuffed fabric. */
  wobble?: number;
  seed?: number;
}

/** Vertex positions along one axis: dense in the rounded zones, sparse across the flat middle. */
function axisStops(half: number, r: number, flatSeg: number, roundSeg: number): number[] {
  const a = half - r;
  const out: number[] = [];
  for (let i = 0; i <= roundSeg; i++) out.push(-half + (r * i) / roundSeg);
  for (let i = 1; i < flatSeg; i++) out.push(-a + (2 * a * i) / flatSeg);
  for (let i = 0; i <= roundSeg; i++) out.push(a + (r * i) / roundSeg);
  return out;
}

/**
 * Welded rounded box (width × height × depth, centred on the origin) with soft stuffing: the top and
 * bottom crown, the sides puff, and a low-frequency wobble keeps no two cushions identical.
 */
export function buildCushionGeometry(w: number, h: number, d: number, opts: CushionOptions = {}): THREE.BufferGeometry {
  const { crown = 0.012, puff = 0.006, wobble = 0.004, seed = 1 } = opts;
  const hx = w / 2;
  const hy = h / 2;
  const hz = d / 2;
  const r = Math.max(0.004, Math.min(opts.radius ?? 0.04, Math.min(hx, hy, hz) * 0.98));
  const XS = axisStops(hx, r, 8, 4);
  const YS = axisStops(hy, r, Math.max(2, Math.round(h / 0.05)), 4);
  const ZS = axisStops(hz, r, 8, 4);
  const nx = XS.length;
  const ny = YS.length;
  const nz = ZS.length;

  const index = new Map<number, number>();
  const positions: number[] = [];
  const uvs: number[] = [];
  const key = (i: number, j: number, k: number) => (i * ny + j) * nz + k;

  const vertex = (i: number, j: number, k: number): number => {
    const kk = key(i, j, k);
    const hit = index.get(kk);
    if (hit !== undefined) return hit;

    // Rounded-box projection: clamp to the inner box, then push out by the radius
    const px = XS[i];
    const py = YS[j];
    const pz = ZS[k];
    const cx = Math.max(-(hx - r), Math.min(hx - r, px));
    const cy = Math.max(-(hy - r), Math.min(hy - r, py));
    const cz = Math.max(-(hz - r), Math.min(hz - r, pz));
    let dx = px - cx;
    let dy = py - cy;
    let dz = pz - cz;
    const len = Math.hypot(dx, dy, dz) || 1;
    dx /= len;
    dy /= len;
    dz /= len;
    let x = cx + dx * r;
    let y = cy + dy * r;
    let z = cz + dz * r;

    // Stuffing: displace along the analytic normal, strongest in the middle of each face
    const tx = x / hx;
    const ty = y / hy;
    const tz = z / hz;
    const wx = Math.max(0, 1 - tx * tx);
    const wy = Math.max(0, 1 - ty * ty);
    const wz = Math.max(0, 1 - tz * tz);
    const bulge = crown * wx * wz * Math.abs(dy) + puff * (wx * wy * Math.abs(dz) + wy * wz * Math.abs(dx));
    const n = softNoise(x * 7, y * 7, z * 7, seed) * wobble * 2;
    const push = bulge + n;
    x += dx * push;
    y += dy * push;
    z += dz * push;

    // Box-mapped UVs (0..1 across the dominant face) for the micro weave and nap maps
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    const az = Math.abs(dz);
    let u: number;
    let v: number;
    if (ay >= ax && ay >= az) {
      u = x / w + 0.5;
      v = z / d + 0.5;
    } else if (az >= ax) {
      u = x / w + 0.5;
      v = y / h + 0.5;
    } else {
      u = z / d + 0.5;
      v = y / h + 0.5;
    }

    const idx = positions.length / 3;
    positions.push(x, y, z);
    uvs.push(u, v);
    index.set(kk, idx);
    return idx;
  };

  const indices: number[] = [];
  const quad = (a: number, b: number, c: number, e: number, flip: boolean) => {
    if (flip) indices.push(a, c, b, b, c, e);
    else indices.push(a, b, c, b, e, c);
  };

  // x faces: grid over (y, z)
  for (const [i, flip] of [[nx - 1, false], [0, true]] as const) {
    for (let j = 0; j < ny - 1; j++) {
      for (let k = 0; k < nz - 1; k++) {
        quad(vertex(i, j, k), vertex(i, j + 1, k), vertex(i, j, k + 1), vertex(i, j + 1, k + 1), flip);
      }
    }
  }
  // y faces: grid over (z, x)
  for (const [j, flip] of [[ny - 1, false], [0, true]] as const) {
    for (let k = 0; k < nz - 1; k++) {
      for (let i = 0; i < nx - 1; i++) {
        quad(vertex(i, j, k), vertex(i, j, k + 1), vertex(i + 1, j, k), vertex(i + 1, j, k + 1), flip);
      }
    }
  }
  // z faces: grid over (x, y)
  for (const [k, flip] of [[nz - 1, false], [0, true]] as const) {
    for (let i = 0; i < nx - 1; i++) {
      for (let j = 0; j < ny - 1; j++) {
        quad(vertex(i, j, k), vertex(i + 1, j, k), vertex(i, j + 1, k), vertex(i + 1, j + 1, k), flip);
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

// ── Pillow: two panels sewn at the edge and inflated, so corners pinch ─────────

export interface PillowOptions {
  /** Thickness at the centre, metres. */
  thickness?: number;
  /** Amount the centre is pressed in (0 = none). */
  dent?: number;
  /** Sideways sag, as a fraction of the width. */
  sag?: number;
  wrinkle?: number;
  seed?: number;
}

/** Welded two-panel pillow (width × height, +Z is the front face) centred on the origin. */
export function buildPillowGeometry(w: number, h: number, opts: PillowOptions = {}): THREE.BufferGeometry {
  const { thickness = 0.15, dent = 0.25, sag = 0.04, wrinkle = 0.004, seed = 3 } = opts;
  const N = 26;
  const p = 2.3;
  const q = 0.62;
  const f = (s: number) => Math.pow(Math.max(0, 1 - Math.pow(Math.abs(s), p)), q);

  const positions: number[] = [];
  const uvs: number[] = [];
  const ids = new Map<string, number>();

  const vertex = (i: number, j: number, side: 1 | -1): number => {
    const edge = i === 0 || j === 0 || i === N || j === N;
    const k = edge ? `e${i}_${j}` : `${side}_${i}_${j}`;
    const hit = ids.get(k);
    if (hit !== undefined) return hit;

    let u = (i / N) * 2 - 1;
    let v = (j / N) * 2 - 1;
    // Fabric is drawn in at the corners when the pillow is stuffed
    const pull = 1 - 0.07 * u * u * v * v;
    u *= pull;
    v *= pull;
    const fu = f(u);
    const fv = f(v);
    let z = (thickness / 2) * fu * fv;
    z *= 1 - dent * Math.exp(-(u * u + v * v) * 3.2);
    z += softNoise(u * 3.1, v * 3.1, side * 1.7, seed) * wrinkle * 2 * fu * fv;
    // A leaning pillow bows along its width
    const x = (u * w) / 2 + Math.sin(v * 1.2) * sag * w * (1 - Math.abs(u)) * 0.5;
    const y = (v * h) / 2;

    const idx = positions.length / 3;
    positions.push(x, y, edge ? 0 : z * side);
    uvs.push(i / N, j / N);
    ids.set(k, idx);
    return idx;
  };

  const indices: number[] = [];
  for (const side of [1, -1] as const) {
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const a = vertex(i, j, side);
        const b = vertex(i + 1, j, side);
        const c = vertex(i, j + 1, side);
        const e = vertex(i + 1, j + 1, side);
        if (side === 1) indices.push(a, b, c, b, e, c);
        else indices.push(a, c, b, b, c, e);
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

// ── Throw: a blanket draped over the arm of a sofa ────────────────────────────

export interface ThrowOptions {
  /** Local X of the arm's inner face (the seat side) and its outer face. */
  innerX: number;
  outerX: number;
  /** Height of the arm top and of the seat the throw starts on. */
  armTop: number;
  seatTop: number;
  /** Width of the throw along the arm (local Z), metres. */
  width?: number;
  /** How far down the outside of the arm it hangs, metres. */
  drop?: number;
  /** Direction the throw lies on the seat: -1 toward −X (default for an arm at −X). */
  seatDir?: 1 | -1;
  seed?: number;
}

/** Double-sided blanket mesh with soft folds; UVs run along the cloth for weave texturing. */
export function buildThrowGeometry(o: ThrowOptions): THREE.BufferGeometry {
  const { width = 0.5, drop = 0.3, seatDir = 1, seed = 5 } = o;
  const s = seatDir;
  // Cross-section path over the arm (x across the sofa, y up)
  const lift = 0.012;
  // `s` points from the arm toward the seat, so "+s" is inboard and "-s" is outboard
  const pts = [
    new THREE.Vector3(o.innerX + s * 0.34, o.seatTop + lift, 0),
    new THREE.Vector3(o.innerX + s * 0.12, o.seatTop + lift + 0.004, 0),
    new THREE.Vector3(o.innerX + s * 0.012, o.seatTop + 0.05, 0),
    new THREE.Vector3(o.innerX + s * 0.012, o.armTop - 0.03, 0),
    new THREE.Vector3(o.innerX - s * 0.02, o.armTop + lift, 0),
    new THREE.Vector3(o.outerX + s * 0.02, o.armTop + lift, 0),
    new THREE.Vector3(o.outerX - s * 0.012, o.armTop - 0.05, 0),
    new THREE.Vector3(o.outerX - s * 0.02, o.armTop - drop * 0.55, 0),
    new THREE.Vector3(o.outerX - s * 0.045, o.armTop - drop, 0),
  ];
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const NS = 48;
  const NT = 22;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let a = 0; a <= NS; a++) {
    const sPar = a / NS;
    const c = curve.getPoint(sPar);
    for (let b = 0; b <= NT; b++) {
      const t = (b / NT) * 2 - 1;
      const z = (t * width) / 2;
      // Folds ripple along the hanging part and flatten where the cloth rests on the seat
      const hang = THREE.MathUtils.smoothstep(sPar, 0.55, 1);
      const rest = THREE.MathUtils.smoothstep(sPar, 0, 0.45);
      const fold =
        Math.sin(t * 9.0 + softNoise(sPar * 2, t * 2, 0, seed) * 4) * 0.012 * hang +
        Math.sin(t * 4.5 + 1.3) * 0.006 * (hang + rest * 0.5) +
        softNoise(sPar * 5, t * 4, 1, seed + 2) * 0.01 * hang;
      // Edge of the cloth ripples slightly and the hem is a touch uneven
      const hem = sPar > 0.9 ? softNoise(0, t * 6, 2, seed + 4) * 0.025 * (sPar - 0.9) * 10 : 0;
      positions.push(c.x + fold * s, c.y + hem + Math.abs(t) * 0.004 * hang, z);
      uvs.push(sPar * 1.4, (t + 1) / 2);
    }
  }
  for (let a = 0; a < NS; a++) {
    for (let b = 0; b < NT; b++) {
      const i0 = a * (NT + 1) + b;
      const i1 = i0 + 1;
      const i2 = i0 + NT + 1;
      const i3 = i2 + 1;
      indices.push(i0, i2, i1, i1, i2, i3);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}
