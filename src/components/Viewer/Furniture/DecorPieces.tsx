'use client';

import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { RoundedBox } from '@react-three/drei';
import { RealisticFurnitureAsset } from './RealisticFurnitureAsset';
import { useInteriorMaterials, PALETTE } from './interiorMaterials';
import { useStyleTheme } from './styleThemes';
import { useRoomStore } from '@/stores/roomStore';
import { getFabricMottleMap, getFabricNormalMap, getFlutedNormalMap, getRugPileNormalMap } from '@/three/proceduralPBR';
import { SoftCushion, Pillow, ThrowBlanket } from './SoftGoods';
import { FX_LAYER } from '../viewerLayers';

/*
 * Curated decor & lighting family shared by every room. Using the same rug,
 * lamp, pendant, ceramic and planter language throughout keeps the house
 * reading as one cohesive design rather than a collection of unrelated models.
 */

type Vec3 = [number, number, number];

export interface FurnitureProps {
  lengthFt: number;
  widthFt: number;
  heightFt: number;
}

export const FT2M = 0.3048;

// Curated GLB assets (PBR scans) that pass the design audit once re-finished.
export const ASSET_PATHS = {
  loungeChair: '/models/3D-ASSET-LIBRARY/Living-Room/Seating/Contemporary/contemporary_curved_armchair_01.glb',
  coffeeTable: '/models/3D-ASSET-LIBRARY/Living-Room/Surfaces/Coffee-Tables/modern_oak_stone_coffee_table_01.glb',
  sideTable: '/models/3D-ASSET-LIBRARY/Living-Room/Surfaces/Side-Tables/minimalist_round_side_table_01.glb',
  credenza: '/models/3D-ASSET-LIBRARY/Living-Room/Storage/TV-Units/contemporary_wall_tv_credenza_01.glb',
  plant: '/models/3D-ASSET-LIBRARY/Living-Room/Decor/monstera_deliciosa_potted_plant_01.glb',
  bed: '/models/furniture/bed_modern_lincoln.glb',
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Re-finished GLB seating
// ─────────────────────────────────────────────────────────────────────────────

/** Main seating upholstery shared by the track-arm sofa and its matching armchairs, in the preset's sofa colour. */
function useTrackArmFabric() {
  const m = useInteriorMaterials();
  const theme = useStyleTheme();
  // A shade deeper than the shared taupe so the seating anchors the room under warm light.
  const fabric = useMemo(() => {
    const f = m.fabricTaupe.clone();
    f.color.set(theme.sofa);
    f.sheenColor.set(theme.sofaSheen);
    if (theme.sofaIsLeather) {
      f.sheen = 0;
      f.roughness = 0.5;
      f.roughnessMap = null;
    } else {
      // Brushed-suede nap: soft cloudiness and fine streaks so large panels never look like flat colour
      f.map = getFabricMottleMap(1, 1);
    }
    return f;
  }, [m, theme]);
  useEffect(() => () => fabric.dispose(), [fabric]);
  return fabric;
}

/** Cloth for a throw: the cream textile, double-sided so both faces of the drape render. */
function useThrowFabric() {
  const m = useInteriorMaterials();
  const throwFabric = useMemo(() => {
    const f = m.fabricCream.clone();
    f.side = THREE.DoubleSide;
    return f;
  }, [m]);
  useEffect(() => () => throwFabric.dispose(), [throwFabric]);
  return throwFabric;
}

/** Scatter-pillow bouclé, a touch deeper than the shared cream so lit pillows keep their nub and shading instead of clipping to white. */
function usePillowFabric() {
  const m = useInteriorMaterials();
  const cloth = useMemo(() => {
    const c = m.boucle.clone();
    c.color.multiplyScalar(0.9);
    c.normalScale.set(0.95, 0.95);
    c.sheen = 0.4;
    return c;
  }, [m]);
  useEffect(() => () => cloth.dispose(), [cloth]);
  return cloth;
}

const SEAT_TOP = 0.43;
const ARM_TOP = 0.6;

/**
 * Upholstered track-arm frame: recessed walnut plinth, base, square arms, back frame and
 * one plump loose seat + back cushion per seat. Front faces +Z; origin at floor centre.
 */
function TrackArmFrame({ width, depth, armW, seats, fabric, seed = 1 }: { width: number; depth: number; armW: number; seats: number; fabric: THREE.Material; seed?: number }) {
  const m = useInteriorMaterials();
  const plinthH = 0.07;
  const baseTop = 0.26;
  const backFrameD = 0.18;
  const innerW = width - armW * 2;
  const cushionW = innerW / seats - 0.012;
  const seatD = depth - backFrameD - 0.02;
  const seatX = (i: number) => -innerW / 2 + (i + 0.5) * (innerW / seats);

  return (
    <>
      {/* Recessed walnut plinth — reads as a shadow line so the piece floats */}
      <mesh position={[0, plinthH / 2, 0]} material={m.walnutDark} castShadow receiveShadow>
        <boxGeometry args={[width - 0.16, plinthH, depth - 0.16]} />
      </mesh>

      <SoftCushion size={[width, baseTop - plinthH, depth]} position={[0, (plinthH + baseTop) / 2, 0]} radius={0.035} crown={0.004} puff={0.004} wobble={0.0012} seed={seed} material={fabric} />
      {[-1, 1].map((sx) => (
        <SoftCushion
          key={sx}
          size={[armW, ARM_TOP - plinthH, depth]}
          position={[sx * (width / 2 - armW / 2), (plinthH + ARM_TOP) / 2, 0]}
          radius={0.06}
          crown={0.006}
          puff={0.007}
          wobble={0.0015}
          seed={seed + sx + 3}
          material={fabric}
        />
      ))}
      <SoftCushion size={[innerW, 0.32, backFrameD]} position={[0, baseTop + 0.16, -depth / 2 + backFrameD / 2]} radius={0.045} crown={0.006} puff={0.006} wobble={0.002} seed={seed + 11} material={fabric} />

      {Array.from({ length: seats }).map((_, i) => (
        <group key={i}>
          <SoftCushion
            size={[cushionW, SEAT_TOP - baseTop, seatD]}
            position={[seatX(i), (baseTop + SEAT_TOP) / 2 + (i % 2) * 0.002, depth / 2 - seatD / 2]}
            radius={0.055}
            crown={0.018}
            puff={0.009}
            wobble={0.003}
            seed={seed + 20 + i}
            material={fabric}
          />
          <SoftCushion
            size={[cushionW, 0.36, 0.2]}
            position={[seatX(i), SEAT_TOP + 0.17, -depth / 2 + backFrameD + 0.1]}
            rotation={[-0.14 - (i % 2) * 0.02, (i - (seats - 1) / 2) * 0.012, 0]}
            radius={0.075}
            crown={0.022}
            puff={0.014}
            wobble={0.004}
            seed={seed + 40 + i}
            material={fabric}
          />
        </group>
      ))}
    </>
  );
}

/**
 * Low-profile track-arm three-seater (2.34 W × 0.96 D × 0.78 H, seat 0.43) in deep greige-taupe,
 * with loose seat and back cushions on a recessed walnut plinth. Front faces +Z.
 */
export function TrackArmSofa({ position, rotation = 0 }: { position: Vec3; rotation?: number }) {
  const m = useInteriorMaterials();
  const fabric = useTrackArmFabric();
  const pillow = usePillowFabric();
  const throwFabric = useThrowFabric();
  const W = 2.34;
  const armW = 0.17;

  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <TrackArmFrame width={W} depth={0.96} armW={armW} seats={3} fabric={fabric} />

      {/* Styling: bouclé squares leaning at the ends, a tonal lumbar between, and a linen throw over the west arm (local −X) */}
      <Pillow width={0.48} height={0.46} thickness={0.17} position={[-0.74, SEAT_TOP + 0.235, -0.0]} rotation={[-0.3, 0.32, -0.06]} material={pillow} seed={2} />
      <Pillow width={0.48} height={0.46} thickness={0.17} position={[0.74, SEAT_TOP + 0.235, -0.0]} rotation={[-0.3, -0.34, 0.07]} material={pillow} seed={5} />
      <Pillow width={0.56} height={0.3} thickness={0.13} position={[0.06, SEAT_TOP + 0.17, 0.02]} rotation={[-0.34, -0.06, 0.02]} material={m.fabricOatmeal} seed={9} dent={0.12} />
      <ThrowBlanket
        material={throwFabric}
        position={[0, 0, 0.06]}
        innerX={-(W / 2 - armW)}
        outerX={-W / 2}
        armTop={ARM_TOP}
        seatTop={SEAT_TOP + 0.02}
        width={0.5}
        drop={0.34}
        seatDir={1}
      />
    </group>
  );
}

/** Matching single-seat track-arm armchair (0.9 W × 0.9 D) with one bouclé pillow. Front faces +Z. */
export function TrackArmChair({ position, rotation = 0 }: { position: Vec3; rotation?: number }) {
  const fabric = useTrackArmFabric();
  const pillow = usePillowFabric();
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <TrackArmFrame width={0.9} depth={0.9} armW={0.14} seats={1} fabric={fabric} seed={60} />
      <Pillow width={0.44} height={0.44} thickness={0.16} position={[0.03, SEAT_TOP + 0.225, -0.0]} rotation={[-0.3, 0.16, 0.05]} material={pillow} seed={7} />
    </group>
  );
}

/** Low lounge chair (0.83 W × 0.57 D), re-upholstered from mango velvet to oatmeal/taupe. Front faces +Z. */
export function LoungeChair({
  position,
  rotation = 0,
  tone = 'oatmeal',
  scale = 1,
}: {
  position: Vec3;
  rotation?: number;
  /** oatmeal / taupe follow the preset's soft neutrals; accent matches the main sofa. */
  tone?: 'oatmeal' | 'taupe' | 'accent';
  scale?: number;
}) {
  const theme = useStyleTheme();
  const overrides = useMemo(() => {
    const color = tone === 'accent' ? theme.sofa : tone === 'taupe' ? theme.fabricTaupe : theme.fabricOatmeal;
    const sheen = tone === 'accent' ? theme.sofaSheen : tone === 'taupe' ? theme.fabricTaupe : theme.fabricCream;
    return {
      'fabric Mystere Mango Velvet': { color, sheenColor: sheen, roughness: tone === 'accent' && theme.sofaIsLeather ? 0.5 : 0.85 },
      'wood Brown': { color: theme.walnut },
    };
  }, [tone, theme]);
  return (
    <RealisticFurnitureAsset
      modelPath={ASSET_PATHS.loungeChair}
      position={position}
      rotation={[0, rotation, 0]}
      scale={scale}
      overrides={overrides}
      hide={['SheenChair_label']}
    />
  );
}

/**
 * The credenza GLB ships in dark walnut. Luxury and classic rooms keep it; the other presets
 * re-finish it in their own wood (flat colour, so the preset's tone reads clearly).
 */
export function useCredenzaOverrides() {
  const theme = useStyleTheme();
  const style = useRoomStore((st) => st.activeTemplate?.style);
  return useMemo(() => {
    if (!style || style === 'modern-luxury' || style === 'classic-luxury') return undefined;
    return { modern_wooden_cabinet: { map: null, color: theme.walnut, roughness: theme.woodRoughness } } as const;
  }, [style, theme]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Textiles
// ─────────────────────────────────────────────────────────────────────────────

/** Low-pile wool rug: a plush field inside a flat bound border, edges softly rounded and slightly proud of the floor. */
export function AreaRug({ width, depth, position, rotation = 0 }: { width: number; depth: number; position: Vec3; rotation?: number }) {
  const m = useInteriorMaterials();
  const border = 0.07;
  const { field, trim } = useMemo(() => {
    const f = m.rugWool.clone();
    f.map = getFabricMottleMap(1, 1);
    f.normalMap = getRugPileNormalMap(Math.max(1, Math.round(width * 7)), Math.max(1, Math.round(depth * 7)));
    f.normalScale.set(0.7, 0.7);
    const t = m.rugBorder.clone();
    t.normalMap = getFabricNormalMap(Math.round(width * 24), Math.round(depth * 24));
    t.normalScale.set(0.4, 0.4);
    return { field: f, trim: t };
  }, [m, width, depth]);
  useEffect(
    () => () => {
      field.dispose();
      trim.dispose();
    },
    [field, trim],
  );
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <SoftCushion size={[width, 0.014, depth]} position={[0, 0.007, 0]} radius={0.006} crown={0.0012} puff={0} wobble={0.0005} seed={4} material={trim} castShadow={false} />
      <SoftCushion size={[width - border * 2, 0.016, depth - border * 2]} position={[0, 0.008, 0]} radius={0.007} crown={0.002} puff={0.0005} wobble={0.0009} seed={8} material={field} castShadow={false} />
    </group>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Lighting fixtures
// ─────────────────────────────────────────────────────────────────────────────

let glowTexture: THREE.CanvasTexture | null = null;

/** Radial falloff used for the soft halo around a lit shade. */
function getGlowTexture(): THREE.CanvasTexture | null {
  if (glowTexture) return glowTexture;
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.16, 'rgba(255,255,255,0.5)');
  g.addColorStop(0.42, 'rgba(255,255,255,0.13)');
  g.addColorStop(0.75, 'rgba(255,255,255,0.03)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  glowTexture = new THREE.CanvasTexture(c);
  glowTexture.colorSpace = THREE.SRGBColorSpace;
  return glowTexture;
}

/** How visible light halos are: faint in daylight, strong once it is dark. */
const GLOW_BY_TIME = { morning: 0.3, afternoon: 0.2, evening: 0.85, night: 1.5 } as const;

/**
 * Soft additive halo around a light source — the bloom a camera sees around a lit shade or downlight.
 * Lives on the effects layer so it never feeds the ambient-occlusion pass.
 */
export function LightGlow({ position, size = 0.8, color = PALETTE.lightWarm, strength = 1 }: { position: Vec3; size?: number; color?: string; strength?: number }) {
  const timeOfDay = useRoomStore((s) => s.timeOfDay);
  const map = useMemo(() => getGlowTexture(), []);
  if (!map) return null;
  return (
    <sprite position={position} scale={[size, size, 1]} layers={FX_LAYER}>
      <spriteMaterial map={map} color={color} blending={THREE.AdditiveBlending} transparent depthWrite={false} opacity={Math.min(1, 0.5 * strength * GLOW_BY_TIME[timeOfDay])} toneMapped={false} />
    </sprite>
  );
}


const vaseProfile = (h: number, r: number) =>
  [
    [0.001, 0],
    [r * 0.55, 0],
    [r * 0.85, h * 0.12],
    [r, h * 0.42],
    [r * 0.82, h * 0.78],
    [r * 0.42, h * 0.94],
    [r * 0.38, h],
    [0.001, h],
  ].map(([x, y]) => new THREE.Vector2(x, y));

/** Ceramic table lamp with linen drum shade and a soft warm glow. Total height ≈ `height`. */
export function TableLamp({
  position,
  height = 0.58,
  intensity = 1.6,
  base = 'cream',
}: {
  position: Vec3;
  height?: number;
  intensity?: number;
  base?: 'cream' | 'charcoal';
}) {
  const m = useInteriorMaterials();
  const baseH = height * 0.5;
  const shadeH = height * 0.38;
  const shadeR = height * 0.3;
  const baseGeo = useMemo(() => new THREE.LatheGeometry(vaseProfile(baseH, height * 0.13), 32), [baseH, height]);
  return (
    <group position={position}>
      <mesh geometry={baseGeo} material={base === 'cream' ? m.ceramicMatte : m.ceramicCharcoal} castShadow />
      <mesh position={[0, baseH + 0.04, 0]} material={m.brushedBrass}>
        <cylinderGeometry args={[0.008, 0.008, 0.08, 10]} />
      </mesh>
      <mesh position={[0, height - shadeH / 2, 0]} material={m.lampShade}>
        <cylinderGeometry args={[shadeR * 0.9, shadeR, shadeH, 40, 1, true]} />
      </mesh>
      <pointLight position={[0, height - shadeH * 0.6, 0]} color={PALETTE.lightWarm} intensity={intensity} distance={3.2} decay={2} />
      <LightGlow position={[0, height - shadeH / 2, 0]} size={height * 2.6} />
    </group>
  );
}

/** Slim floor lamp: weighted black base, matte black stem, linen drum shade. */
export function FloorLamp({ position, intensity = 2.4 }: { position: Vec3; intensity?: number }) {
  const m = useInteriorMaterials();
  return (
    <group position={position}>
      <mesh position={[0, 0.012, 0]} material={m.matteBlack} castShadow receiveShadow>
        <cylinderGeometry args={[0.16, 0.17, 0.024, 40]} />
      </mesh>
      <mesh position={[0, 0.74, 0]} material={m.matteBlack} castShadow>
        <cylinderGeometry args={[0.011, 0.011, 1.44, 12]} />
      </mesh>
      <mesh position={[0, 1.2, 0]} material={m.brushedBrass}>
        <cylinderGeometry args={[0.016, 0.016, 0.04, 12]} />
      </mesh>
      <mesh position={[0, 1.42, 0]} material={m.lampShade}>
        <cylinderGeometry args={[0.2, 0.22, 0.34, 48, 1, true]} />
      </mesh>
      <pointLight position={[0, 1.38, 0]} color={PALETTE.lightWarm} intensity={intensity} distance={4} decay={2} />
      <LightGlow position={[0, 1.42, 0]} size={1.15} />
    </group>
  );
}

/** Opal-glass globe pendant on a fine cord. `bottomY` is the height of the underside of the globe. */
export function GlobePendant({
  x,
  z,
  ceilingY,
  bottomY,
  diameter = 0.3,
  intensity = 2.2,
  castShadow = false,
  light = true,
}: {
  x: number;
  z: number;
  ceilingY: number;
  bottomY: number;
  diameter?: number;
  intensity?: number;
  castShadow?: boolean;
  /** Clusters only need a couple of real lights; the rest glow via the emissive glass. */
  light?: boolean;
}) {
  const m = useInteriorMaterials();
  const r = diameter / 2;
  const globeY = bottomY + r;
  const cordLen = Math.max(0.05, ceilingY - (globeY + r) - 0.02);
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, ceilingY - 0.012, 0]} material={m.matteBlack}>
        <cylinderGeometry args={[0.06, 0.06, 0.024, 24]} />
      </mesh>
      <mesh position={[0, ceilingY - 0.024 - cordLen / 2, 0]} material={m.matteBlack}>
        <cylinderGeometry args={[0.003, 0.003, cordLen, 6]} />
      </mesh>
      <mesh position={[0, globeY + r * 0.92, 0]} material={m.brushedBrass}>
        <cylinderGeometry args={[r * 0.28, r * 0.36, r * 0.22, 24]} />
      </mesh>
      <mesh position={[0, globeY, 0]} material={m.opalGlass}>
        <sphereGeometry args={[r, 40, 28]} />
      </mesh>
      {light && (
        <pointLight
          position={[0, globeY - r * 0.2, 0]}
          color={PALETTE.lightWarm}
          intensity={intensity}
          distance={4.5}
          decay={2}
          castShadow={castShadow}
          shadow-mapSize={[512, 512]}
          shadow-bias={-0.002}
        />
      )}
    </group>
  );
}

/** Minimal wall sconce: matte black backplate with an opal glass cylinder. Mount on a wall facing +Z. */
export function WallSconce({ position, rotation = 0, intensity = 0.9 }: { position: Vec3; rotation?: number; intensity?: number }) {
  const m = useInteriorMaterials();
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh position={[0, 0, 0.006]} material={m.matteBlack}>
        <boxGeometry args={[0.07, 0.2, 0.012]} />
      </mesh>
      <mesh position={[0, 0, 0.065]} material={m.opalGlass}>
        <cylinderGeometry args={[0.035, 0.035, 0.18, 24]} />
      </mesh>
      <mesh position={[0, 0.095, 0.065]} material={m.matteBlack}>
        <cylinderGeometry args={[0.038, 0.038, 0.012, 24]} />
      </mesh>
      <mesh position={[0, 0, 0.035]} rotation={[Math.PI / 2, 0, 0]} material={m.matteBlack}>
        <cylinderGeometry args={[0.008, 0.008, 0.05, 8]} />
      </mesh>
      <pointLight position={[0, 0, 0.14]} color={PALETTE.lightWarm} intensity={intensity} distance={2.2} decay={2} />
    </group>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Accessories
// ─────────────────────────────────────────────────────────────────────────────

/** Hand-thrown stoneware vase, optionally holding a few dried stems. */
export function CeramicVase({
  position,
  height = 0.3,
  radius = 0.08,
  tone = 'cream',
  stems = false,
}: {
  position: Vec3;
  height?: number;
  radius?: number;
  tone?: 'cream' | 'charcoal' | 'white';
  stems?: boolean;
}) {
  const m = useInteriorMaterials();
  const geo = useMemo(() => new THREE.LatheGeometry(vaseProfile(height, radius), 32), [height, radius]);
  const mat = tone === 'charcoal' ? m.ceramicCharcoal : tone === 'white' ? m.ceramicWhite : m.ceramicMatte;
  return (
    <group position={position}>
      <mesh geometry={geo} material={mat} castShadow receiveShadow />
      {stems &&
        [
          [0.0, 0.1, 0.0],
          [0.12, 0.0, -0.05],
          [-0.1, 0.06, 0.08],
        ].map(([tilt, yaw, extra], i) => (
          <group key={i} position={[0, height * 0.9, 0]} rotation={[tilt, yaw * 10, tilt * 0.5 + extra]}>
            <mesh position={[0, height * 0.55, 0]} material={m.walnutDark}>
              <cylinderGeometry args={[0.002, 0.003, height * 1.1, 5]} />
            </mesh>
            <mesh position={[0, height * 1.1, 0]} material={m.oak}>
              <sphereGeometry args={[0.012, 8, 6]} />
            </mesh>
          </group>
        ))}
    </group>
  );
}

/** Wide, open stoneware serving bowl. */
export function CeramicBowl({
  position,
  radius = 0.14,
  height = 0.08,
  tone = 'white',
}: {
  position: Vec3;
  radius?: number;
  height?: number;
  tone?: 'white' | 'charcoal';
}) {
  const m = useInteriorMaterials();
  const geo = useMemo(
    () =>
      new THREE.LatheGeometry(
        [
          [0.001, 0],
          [radius * 0.42, 0],
          [radius * 0.82, height * 0.35],
          [radius, height],
          [radius * 0.95, height],
          [radius * 0.78, height * 0.4],
          [radius * 0.38, height * 0.14],
          [0.001, height * 0.12],
        ].map(([x, y]) => new THREE.Vector2(x, y)),
        40,
      ),
    [radius, height],
  );
  return <mesh position={position} geometry={geo} material={tone === 'charcoal' ? m.ceramicCharcoal : m.ceramicWhite} castShadow receiveShadow />;
}

/** Small stack of linen-bound coffee-table books. */
export function BookStack({ position, rotation = 0 }: { position: Vec3; rotation?: number }) {
  const m = useInteriorMaterials();
  const books: { w: number; d: number; h: number; mat: THREE.Material; rot: number }[] = [
    { w: 0.32, d: 0.24, h: 0.035, mat: m.fabricTaupe, rot: 0 },
    { w: 0.28, d: 0.22, h: 0.03, mat: m.fabricCream, rot: 0.08 },
    { w: 0.24, d: 0.18, h: 0.025, mat: m.ceramicCharcoal, rot: -0.05 },
  ];
  let y = 0;
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {books.map((b, i) => {
        const cy = y + b.h / 2;
        y += b.h;
        return (
          <mesh key={i} position={[0, cy, 0]} rotation={[0, b.rot, 0]} material={b.mat} castShadow receiveShadow>
            <boxGeometry args={[b.w, b.h, b.d]} />
          </mesh>
        );
      })}
    </group>
  );
}

const artCache = new Map<string, THREE.CanvasTexture>();

/** Generates a quiet, gallery-style abstract composition in the house palette. */
function getArtworkTexture(variant: number): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const key = `art_${variant}`;
  const hit = artCache.get(key);
  if (hit) return hit;

  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 640;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#ebe4d8';
  ctx.fillRect(0, 0, 512, 640);

  // Soft paper grain
  for (let i = 0; i < 9000; i++) {
    ctx.fillStyle = `rgba(120,100,80,${Math.random() * 0.04})`;
    ctx.fillRect(Math.random() * 512, Math.random() * 640, 2, 2);
  }

  if (variant % 2 === 0) {
    // Large tonal arch over a horizon
    ctx.fillStyle = '#cdbba2';
    ctx.beginPath();
    ctx.arc(256, 330, 150, Math.PI, 0);
    ctx.lineTo(406, 470);
    ctx.lineTo(106, 470);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#8f7a66';
    ctx.fillRect(70, 470, 372, 10);
    ctx.fillStyle = '#3d3834';
    ctx.beginPath();
    ctx.arc(330, 230, 34, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Gestural charcoal brush stroke
    ctx.strokeStyle = 'rgba(58,54,51,0.85)';
    ctx.lineCap = 'round';
    for (let pass = 0; pass < 6; pass++) {
      ctx.lineWidth = 34 - pass * 4;
      ctx.beginPath();
      ctx.moveTo(110 + pass * 3, 470 - pass * 2);
      ctx.bezierCurveTo(140, 180, 380, 160, 400 - pass * 2, 420 + pass * 3);
      ctx.stroke();
    }
    ctx.fillStyle = '#c4ae90';
    ctx.fillRect(150, 520, 210, 6);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  artCache.set(key, tex);
  return tex;
}

/** Framed artwork with a slim walnut frame. Hangs on a wall facing +Z. */
export function Artwork({
  position,
  rotation = 0,
  width = 0.8,
  height = 1.0,
  variant = 0,
}: {
  position: Vec3;
  rotation?: number;
  width?: number;
  height?: number;
  variant?: number;
}) {
  const m = useInteriorMaterials();
  const tex = useMemo(() => getArtworkTexture(variant), [variant]);
  const frame = 0.025;
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh position={[0, 0, 0.015]} material={m.walnutDark} castShadow>
        <boxGeometry args={[width, height, 0.03]} />
      </mesh>
      <mesh position={[0, 0, 0.031]}>
        <planeGeometry args={[width - frame * 2, height - frame * 2]} />
        <meshStandardMaterial map={tex} color="#ffffff" roughness={0.9} />
      </mesh>
    </group>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Planting
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Monstera in a designer planter. The GLB's terracotta nursery pot is hidden
 * and the plant is seated inside a cylinder planter that matches the house.
 */
export function PottedPlant({
  position,
  scale = 1.2,
  planter = 'stone',
  planterHeight = 0.42,
  rotation = 0,
}: {
  position: Vec3;
  scale?: number;
  planter?: 'stone' | 'charcoal' | 'concrete' | 'none';
  planterHeight?: number;
  rotation?: number;
}) {
  const m = useInteriorMaterials();
  const potR = 0.24 * scale;
  const soilTop = 0.34 * scale;
  const r = potR + 0.03;
  // The cream planter is fluted stoneware; the darker ones stay smooth
  const flutedStone = useMemo(() => {
    const c = m.ceramicMatte.clone();
    c.normalMap = getFlutedNormalMap(44);
    c.normalScale.set(1, 1);
    return c;
  }, [m]);
  useEffect(() => () => flutedStone.dispose(), [flutedStone]);
  const mat = planter === 'charcoal' ? m.ceramicCharcoal : planter === 'concrete' ? m.concrete : flutedStone;
  const plantY = planter === 'none' ? 0 : planterHeight - soilTop - 0.02;

  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {planter !== 'none' && (
        <>
          <mesh position={[0, planterHeight / 2, 0]} material={mat} castShadow receiveShadow>
            <cylinderGeometry args={[r, r * 0.86, planterHeight, 40]} />
          </mesh>
          {/* Soil disc so the hidden nursery pot never shows through the rim */}
          <mesh position={[0, planterHeight - 0.025, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[r * 0.96, 32]} />
            <meshStandardMaterial color="#3a2e24" roughness={1} />
          </mesh>
        </>
      )}
      <RealisticFurnitureAsset
        modelPath={ASSET_PATHS.plant}
        position={[0, plantY, 0]}
        scale={scale}
        hide={
          planter === 'none'
            ? ['firefly1', 'firefly1_wing_right', 'firefly1_wing_left', 'firefly2', 'firefly2_wing_left', 'firefly2_wing_right']
            : ['pot', 'firefly1', 'firefly1_wing_right', 'firefly1_wing_left', 'firefly2', 'firefly2_wing_left', 'firefly2_wing_right']
        }
      />
    </group>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Round pieces used by the softer presets
// ─────────────────────────────────────────────────────────────────────────────

/** Round rug with a tonal bound edge. */
export function RoundRug({ radius, position }: { radius: number; position: Vec3 }) {
  const m = useInteriorMaterials();
  return (
    <group position={position}>
      <mesh position={[0, 0.005, 0]} material={m.rugBorder} receiveShadow>
        <cylinderGeometry args={[radius, radius, 0.01, 64]} />
      </mesh>
      <mesh position={[0, 0.0105, 0]} material={m.rugWool} receiveShadow>
        <cylinderGeometry args={[radius - 0.07, radius - 0.07, 0.002, 64]} />
      </mesh>
    </group>
  );
}

/** Low round coffee table on three slim legs. `top` picks the surface, `legs` the frame. */
export function RoundCoffeeTable({
  position,
  radius = 0.45,
  height = 0.4,
  top = 'oak',
  legs = 'black',
}: {
  position: Vec3;
  radius?: number;
  height?: number;
  top?: 'oak' | 'walnut' | 'marble' | 'concrete';
  legs?: 'black' | 'brass' | 'wood';
}) {
  const m = useInteriorMaterials();
  const topMat = { oak: m.oak, walnut: m.walnut, marble: m.marble, concrete: m.concrete }[top];
  const legMat = legs === 'brass' ? m.brushedBrass : legs === 'wood' ? m.walnut : m.matteBlack;
  return (
    <group position={position}>
      <mesh position={[0, height - 0.0175, 0]} material={topMat} castShadow receiveShadow>
        <cylinderGeometry args={[radius, radius, 0.035, 56]} />
      </mesh>
      {[0, 1, 2].map((i) => {
        const a = (i * Math.PI * 2) / 3 + Math.PI / 6;
        return (
          <mesh
            key={i}
            position={[Math.sin(a) * radius * 0.62, (height - 0.035) / 2, Math.cos(a) * radius * 0.62]}
            rotation={[Math.cos(a) * 0.08, 0, -Math.sin(a) * 0.08]}
            material={legMat}
            castShadow
          >
            <cylinderGeometry args={[0.014, 0.011, height - 0.035, 10]} />
          </mesh>
        );
      })}
    </group>
  );
}

/** Round upholstered pouf / ottoman. */
export function Pouf({ position, radius = 0.28, height = 0.4, tone = 'boucle' }: { position: Vec3; radius?: number; height?: number; tone?: 'boucle' | 'leather' | 'taupe' }) {
  const m = useInteriorMaterials();
  const mat = tone === 'leather' ? m.leatherTaupe : tone === 'taupe' ? m.fabricTaupe : m.boucle;
  return (
    <mesh position={[position[0], position[1] + height / 2, position[2]]} material={mat} castShadow receiveShadow>
      <cylinderGeometry args={[radius, radius * 0.92, height, 40]} />
    </mesh>
  );
}

/** Statement ceiling light: a ring of opal globes on brass arms. */
export function Chandelier({ x, z, ceilingY, drop = 0.9, radius = 0.42, intensity = 3 }: { x: number; z: number; ceilingY: number; drop?: number; radius?: number; intensity?: number }) {
  const m = useInteriorMaterials();
  const y = ceilingY - drop;
  const arms = 6;
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, ceilingY - drop / 2, 0]} material={m.brushedBrass}>
        <cylinderGeometry args={[0.012, 0.012, drop, 8]} />
      </mesh>
      <mesh position={[0, y, 0]} material={m.brushedBrass} castShadow>
        <sphereGeometry args={[0.07, 20, 14]} />
      </mesh>
      <mesh position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]} material={m.brushedBrass}>
        <torusGeometry args={[radius, 0.012, 8, 48]} />
      </mesh>
      {Array.from({ length: arms }, (_, i) => {
        const a = (i / arms) * Math.PI * 2;
        return (
          <group key={i} position={[Math.sin(a) * radius, y, Math.cos(a) * radius]}>
            <mesh position={[0, 0.045, 0]} material={m.brushedBrass}>
              <cylinderGeometry args={[0.012, 0.012, 0.09, 8]} />
            </mesh>
            <mesh position={[0, 0.14, 0]} material={m.opalGlass}>
              <sphereGeometry args={[0.058, 20, 14]} />
            </mesh>
          </group>
        );
      })}
      <pointLight position={[0, y - 0.1, 0]} color={PALETTE.lightWarm} intensity={intensity} distance={6} decay={2} />
    </group>
  );
}

/** Upholstered rounded block — the building unit for benches, cushions and headboards. */
export function Cushion({
  size,
  position,
  rotation = [0, 0, 0],
  radius = 0.04,
  material,
}: {
  size: Vec3;
  position: Vec3;
  rotation?: Vec3;
  radius?: number;
  material: THREE.Material;
}) {
  const safeR = Math.min(radius, Math.min(...size) / 2 - 0.001);
  return (
    <RoundedBox args={size} radius={safeR} smoothness={4} position={position} rotation={rotation} material={material} castShadow receiveShadow />
  );
}
