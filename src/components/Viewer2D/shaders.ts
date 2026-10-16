/**
 * GLSL for the 2D visualizer. One full-screen pass draws the photo and, for every tiled surface, the tile pattern
 * laid out on that surface's real-world plane (millimetres) and seen through its own perspective.
 *
 * The pattern maths mirrors src/lib/viz2d/pattern.ts, which is what the tests check — keep the two in step.
 */

export const MAX_SURFACES = 16;
export const TILE_LAYERS = 8;

export const VERTEX_SHADER = /* glsl */ `#version 300 es
out vec2 vUv;
void main() {
  // One oversized triangle covers the screen: (0,0) (2,0) (0,2)
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = vec2(p.x, 1.0 - p.y); // image space: origin top-left, y down
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;

export const FRAGMENT_SHADER = /* glsl */ `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
precision highp sampler2DArray;

#define MAX_SURF ${MAX_SURFACES}

in vec2 vUv;
out vec4 outColor;

uniform sampler2D uBase;          // the photo (sRGB, decoded to linear by the hardware)
uniform sampler2DArray uMasks;    // one coverage mask per surface
uniform sampler2DArray uTiles;    // tile images (sRGB)
uniform sampler2D uLight;         // the photo's own light on each surface, 1.0 = normally lit

uniform vec2 uRes;                // size of what is being drawn, in pixels
uniform vec4 uView;               // the part of the photo on screen: x, y, width, height (0..1)
uniform int uCount;
uniform mat3 uHinv[MAX_SURF];     // photo (0..1) -> millimetres on the surface
uniform vec4 uTile[MAX_SURF];     // tile width, tile height, grout (mm), texture layer (< 0: no tile)
uniform vec4 uLay[MAX_SURF];      // layout kind, rotation (rad, including the layout's own turn), origin x, origin y (mm)
uniform vec4 uGrout[MAX_SURF];    // grout colour (linear rgb), how much of the photo's light to keep
uniform vec4 uMisc[MAX_SURF];     // tone variation, gloss, edge bevel, 1 when the surface's y axis points up

uniform float uCompare;           // < 0: off; otherwise the before/after divider position, 0..1
uniform int uDebug;               // 0 normal, 1 show masks, 2 show a measuring grid on every surface
uniform float uSoft;              // screen pixels per photo pixel (>= 1): tiles are filtered as softly as the photo they sit in
uniform vec3 uTint;              // the colour cast of the room's light (luminance 1), carried onto tiles as far as 'photo lighting' allows

vec3 toSrgb(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float modf1(float a, float n) { return a - n * floor(a / n); }

// Coverage of a pixel footprint (width w) by a grout band (half width h) whose centre line is s away.
// Exact for a one-dimensional box filter: sharp edges when the band is wider than a pixel, a faint line when it is thinner.
float band(float s, float h, float w) {
  float ww = max(w, 1e-4);
  float overlap = clamp(h + 0.5 * ww - s, 0.0, min(ww, 2.0 * h));
  return overlap / ww;
}

float rectDist(vec2 r, vec2 lo, vec2 hi) {
  vec2 d = max(lo - r, r - hi);
  return max(d.x, d.y);
}

struct Pat {
  vec2 tuv;       // position on the tile face, 0..1 across the tile's own width and height
  mat2 duv;       // d(tuv) / d(pattern-space position), for texture filtering
  vec2 id;        // which tile this is (for per-tile variation)
  float cov;      // how much of this pixel is grout, filtered over the pixel footprint
  float inner;    // distance from the nearest tile edge, inside the tile (mm)
  float fade;     // 0..1: the pixel spans several tiles, so show their average instead of detail
  float groutAvg; // grout's share of the surface, for that average
};

// Straight, brick (half offset) and one-third offset: rows of tiles, optionally shifted row by row
Pat gridPattern(int kind, float tw, float th, float g, vec2 q, vec2 wq) {
  float px = tw + g;
  float py = th + g;
  float row = floor(q.y / py);
  float shift = 0.0;
  if (kind == 1) shift = modf1(row, 2.0) * 0.5;
  else if (kind == 2) shift = modf1(row, 3.0) / 3.0;
  float sx = q.x - shift * px;
  float col = floor(sx / px);
  float a = sx - col * px;
  float b = q.y - row * py;
  float h = g * 0.5;
  float covX = band(min(a, px - a), h, wq.x);
  float covY = band(min(b, py - b), h, wq.y);
  Pat p;
  p.cov = 1.0 - (1.0 - covX) * (1.0 - covY);
  p.tuv = vec2((a - h) / tw, (b - h) / th);
  p.duv = mat2(1.0 / tw, 0.0, 0.0, 1.0 / th);
  p.id = vec2(col, row);
  p.inner = max(0.0, min(min(a - h, h + tw - a), min(b - h, h + th - b)));
  p.fade = smoothstep(0.35, 0.9, max(wq.x / px, wq.y / py));
  p.groutAvg = 1.0 - (tw * th) / (px * py);
  return p;
}

// Herringbone: lying and standing tiles interlocking along a lattice (see herringboneFaces in pattern.ts)
Pat herringbonePattern(float tw, float th, float g, vec2 q, vec2 wq) {
  bool longIsWidth = tw >= th;
  float L = max(tw, th);
  float Wd = min(tw, th);
  float Lp = L + g;
  float Wp = Wd + g;
  float h = g * 0.5;
  float k = Lp / Wp;
  float fa = (q.x - q.y) / (2.0 * Lp);
  float fb = ((Lp - Wp) * q.x + (Lp + Wp) * q.y) / (2.0 * Lp * Wp);
  int ia0 = int(floor(fa));
  int ib0 = int(floor(fb - (k + 1.0) * 0.5));
  int ibCount = min(int(floor(fb)) + 1 - ib0 + 1, 40);

  float best = 1e9;
  float second = 1e9;
  vec2 bestRel = vec2(0.0);
  vec2 bestLo = vec2(0.0);
  vec2 bestHi = vec2(0.0);
  float bestVar = 0.0;
  vec2 bestId = vec2(0.0);
  for (int ia = -1; ia <= 1; ia++) {
    float iaf = float(ia0 + ia);
    for (int j = 0; j < 40; j++) {
      if (j >= ibCount) break;
      float ibf = float(ib0 + j);
      vec2 r = q - vec2(iaf * (Lp + Wp) + ibf * Wp, iaf * (Wp - Lp) + ibf * Wp);
      vec2 loH = vec2(h, h);
      vec2 hiH = vec2(Lp - h, Wp - h);
      vec2 loV = vec2(Lp + h, Wp - Lp + h);
      vec2 hiV = vec2(Lp + Wp - h, Wp - h);
      float dH = rectDist(r, loH, hiH);
      float dV = rectDist(r, loV, hiV);
      if (dH < best) { second = best; best = dH; bestRel = r; bestLo = loH; bestHi = hiH; bestVar = 0.0; bestId = vec2(iaf, ibf); }
      else if (dH < second) { second = dH; }
      if (dV < best) { second = best; best = dV; bestRel = r; bestLo = loV; bestHi = hiV; bestVar = 1.0; bestId = vec2(iaf, ibf); }
      else if (dV < second) { second = dV; }
    }
  }

  // Which edge of the nearest tile is closest decides which way the pixel footprint is measured
  vec2 dEdge = max(bestLo - bestRel, bestRel - bestHi);
  float wn = dEdge.x > dEdge.y ? wq.x : wq.y;
  float s = abs(best - second) * 0.5; // distance from the centre line of the grout band

  vec2 rowU;
  vec2 rowV;
  float along;
  float across;
  if (bestVar < 0.5) {
    along = (bestRel.x - h) / L;
    across = (bestRel.y - h) / Wd;
    rowU = longIsWidth ? vec2(1.0 / L, 0.0) : vec2(0.0, 1.0 / Wd);
    rowV = longIsWidth ? vec2(0.0, 1.0 / Wd) : vec2(1.0 / L, 0.0);
  } else {
    along = (bestRel.y - (Wp - Lp) - h) / L;
    across = (bestRel.x - Lp - h) / Wd;
    rowU = longIsWidth ? vec2(0.0, 1.0 / L) : vec2(1.0 / Wd, 0.0);
    rowV = longIsWidth ? vec2(1.0 / Wd, 0.0) : vec2(0.0, 1.0 / L);
  }
  Pat p;
  p.tuv = longIsWidth ? vec2(along, across) : vec2(across, along);
  p.duv = transpose(mat2(rowU, rowV));
  p.id = bestId + vec2(bestVar * 0.5, bestVar * 0.25);
  p.cov = band(s, h, wn);
  p.inner = max(0.0, -best);
  p.fade = smoothstep(0.35, 0.9, max(wq.x, wq.y) / Wp);
  p.groutAvg = 1.0 - (L * Wd) / (Lp * Wp);
  return p;
}

// The colour of surface i at this pixel, linear, before blending into the photo
vec3 surfaceColor(int i, vec2 uv, float light, vec3 baseLin) {
  mat3 Hm = uHinv[i];
  vec3 Pw = Hm * vec3(uv, 1.0);
  float W = Pw.z;
  vec2 p = Pw.xy / W;
  // How far one pixel moves across the surface, from the perspective transform's derivative. A small photo shown large is
  // soft, so the footprint is widened to match (the measuring grid keeps the true one).
  vec2 dpdu = (Hm[0].xy * W - Pw.xy * Hm[0].z) / (W * W);
  vec2 dpdv = (Hm[1].xy * W - Pw.xy * Hm[1].z) / (W * W);
  float soft = uDebug == 2 ? 1.0 : uSoft;
  vec2 dpdx = dpdu * (uView.z / uRes.x) * soft;
  vec2 dpdy = dpdv * (uView.w / uRes.y) * soft;

  vec4 T = uTile[i];
  vec4 Ly = uLay[i];
  float c = cos(Ly.y);
  float s = sin(Ly.y);
  vec2 d = p - Ly.zw;
  vec2 q = vec2(c * d.x + s * d.y, -s * d.x + c * d.y);
  vec2 dqdx = vec2(c * dpdx.x + s * dpdx.y, -s * dpdx.x + c * dpdx.y);
  vec2 dqdy = vec2(c * dpdy.x + s * dpdy.y, -s * dpdy.x + c * dpdy.y);
  vec2 wq = vec2(abs(dqdx.x) + abs(dqdy.x), abs(dqdx.y) + abs(dqdy.y));

  if (uDebug == 2) {
    // A measuring grid: a line every 500 mm, heavier every metre, so a calibration can be judged by eye
    vec2 fw = abs(dpdx) + abs(dpdy);
    vec2 m = p / 500.0;
    vec2 f = abs(fract(m - 0.5) - 0.5) / max(fw / 500.0, vec2(1e-5));
    float line = 1.0 - clamp(min(f.x, f.y) - 0.5, 0.0, 1.0);
    vec2 m2 = p / 1000.0;
    vec2 f2 = abs(fract(m2 - 0.5) - 0.5) / max(fw / 1000.0, vec2(1e-5));
    float heavy = 1.0 - clamp(min(f2.x, f2.y) - 1.0, 0.0, 1.0);
    vec3 g = mix(baseLin, vec3(0.0, 0.3, 1.0), 0.85 * line);
    return mix(g, vec3(1.0, 0.3, 0.0), 0.9 * heavy);
  }

  int kind = int(Ly.x + 0.5);
  Pat pat;
  if (kind == 3) pat = herringbonePattern(T.x, T.y, T.z, q, wq);
  else pat = gridPattern(kind == 4 ? 0 : kind, T.x, T.y, T.z, q, wq);

  // A tile's picture has its top at v = 0. On a surface measured upward from the floor the pattern's y runs up, so flip it
  // to keep the picture the right way up.
  bool flipV = uMisc[i].w > 0.5;
  vec2 gx = pat.duv * dqdx;
  vec2 gy = pat.duv * dqdy;
  if (flipV) {
    pat.tuv.y = 1.0 - pat.tuv.y;
    gx.y = -gx.y;
    gy.y = -gy.y;
  }
  vec2 tuv = clamp(pat.tuv, 0.0, 1.0);
  vec3 tex = textureGrad(uTiles, vec3(tuv, T.w), gx, gy).rgb;
  vec3 avgTex = textureLod(uTiles, vec3(0.5, 0.5, T.w), 12.0).rgb;

  // Each tile is a touch different, as real tiles are
  float tone = 1.0 + (hash12(pat.id + float(i) * 17.31) - 0.5) * 0.16 * uMisc[i].x;
  tex *= tone;
  avgTex *= 1.0; // the average already has the variation averaged out

  // A hairline of shade at the tile edge, where a real tile is slightly bevelled and the joint casts a shadow
  tex *= 1.0 - uMisc[i].z * (1.0 - pat.fade) * (1.0 - smoothstep(0.0, 2.2, pat.inner));

  vec3 groutCol = uGrout[i].rgb;
  vec3 col = mix(tex, groutCol, pat.cov);
  col = mix(col, mix(avgTex, groutCol, pat.groutAvg), pat.fade);

  // The photo's own light and shadow, so the tile sits in the room instead of floating over it
  float shade = pow(clamp(light, 0.2, 1.8), uGrout[i].a);
  col *= shade;
  // ... and the colour of that light: warm lamps warm a white tile, a cool room cools it
  col *= mix(vec3(1.0), uTint, clamp(uGrout[i].a, 0.0, 1.0));

  // Glossy finishes pick up a little of the bright light on the floor
  col += vec3(uMisc[i].y * 0.22 * max(light - 1.15, 0.0));

  // Roll the brightest values off smoothly instead of clipping them, so a white tile in a sunny patch keeps its veining
  vec3 over = max(col - 0.82, 0.0);
  col = min(col, vec3(0.82)) + 0.18 * (1.0 - exp(-over * 6.0));
  return col;
}

void main() {
  vec2 uvRaw = uView.xy + vUv * uView.zw;
  bool inside = uvRaw.x >= 0.0 && uvRaw.y >= 0.0 && uvRaw.x <= 1.0 && uvRaw.y <= 1.0;
  vec2 uv = clamp(uvRaw, 0.0, 1.0);
  vec3 baseLin = texture(uBase, uv).rgb;
  float light = texture(uLight, uv).r;

  float a[MAX_SURF];
  float sum = 0.0;
  for (int i = 0; i < MAX_SURF; i++) {
    if (i >= uCount) break;
    a[i] = texture(uMasks, vec3(uv, float(i))).r;
    sum += a[i];
  }
  // Where edges meet, coverage can add up to a little over 1: share it out instead of over-painting
  float norm = 1.0 / max(1.0, sum);

  vec3 delta = vec3(0.0);
  for (int i = 0; i < MAX_SURF; i++) {
    if (i >= uCount) break;
    float ai = a[i] * norm;
    if (uDebug == 1) {
      vec3 tint = vec3(hash12(vec2(float(i), 1.0)), hash12(vec2(float(i), 2.0)), hash12(vec2(float(i), 3.0)));
      delta += ai * (tint - baseLin);
      continue;
    }
    if (ai < 0.002) continue;
    if (uTile[i].w < -0.5 && uDebug != 2) continue;
    delta += ai * (surfaceColor(i, uv, light, baseLin) - baseLin);
  }
  vec3 outLin = baseLin + delta;

  vec3 srgb = toSrgb(outLin);
  if (uCompare >= 0.0) {
    if (uv.x < uCompare) srgb = toSrgb(baseLin);
    float dx = abs(uvRaw.x - uCompare) * uRes.x / uView.z;
    srgb = mix(srgb, vec3(1.0), 1.0 - smoothstep(0.6, 1.6, dx));
  }
  // A whisper of noise hides banding in smooth gradients
  srgb += (hash12(gl_FragCoord.xy) - 0.5) / 255.0;
  // Outside the photo (when zoomed out) the page shows through
  outColor = inside ? vec4(srgb, 1.0) : vec4(0.0);
}
`;
