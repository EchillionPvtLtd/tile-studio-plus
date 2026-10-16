'use client';

import * as THREE from 'three';
import type { TemplateStyle } from '@/types/template';
import { DEFAULT_STYLE, getStyleTheme, useStyleKey, type StyleTheme } from './styleThemes';
import {
  getWoodGrainMap,
  getWoodNormalMap,
  getMarbleMap,
  getTravertineMap,
  getConcreteMap,
  getFabricNormalMap,
  getFabricRoughnessMap,
  getBoucleNormalMap,
  getLeatherNormalMap,
  getBrushedMetalRoughnessMap,
  getLampGlowMap,
} from '@/three/proceduralPBR';

/**
 * One house, one palette.
 *
 * Every room draws its furniture, decor and finishes from this single
 * modern-luxury-minimalist colour system so the property reads as the work of
 * one designer: ~60% warm neutrals, ~20% natural wood, ~10% charcoal/black,
 * and only small touches of brushed brass, stone and glass.
 */
export const PALETTE = {
  // Warm neutrals
  warmWhite: '#f3efe8',
  cream: '#ece4d6',
  linen: '#e4dacb',
  oatmeal: '#d3c6b1',
  beige: '#c9b89d',
  taupe: '#a39382',
  greige: '#bdb3a6',
  softGray: '#c9c5bf',

  // Natural materials
  walnut: '#6b4c36',
  walnutDark: '#4f3725',
  oak: '#c09a6b',
  teak: '#9c7048',
  stone: '#e6e0d6',
  travertine: '#d8c9b0',
  concrete: '#bdb7ae',

  // Darks
  charcoal: '#3a3633',
  matteBlack: '#1e1d1c',

  // Accents (used sparingly)
  brass: '#b59a6a',
  steel: '#c3c2be',

  // Light colours (2700K – 4000K)
  lightWarm: '#ffd9ae',
  lightSoft: '#ffe8cc',
  lightNeutral: '#fff4e6',
} as const;

export interface InteriorMaterials {
  // Upholstery & textiles
  fabricCream: THREE.MeshPhysicalMaterial;
  fabricOatmeal: THREE.MeshPhysicalMaterial;
  fabricTaupe: THREE.MeshPhysicalMaterial;
  boucle: THREE.MeshPhysicalMaterial;
  beddingWhite: THREE.MeshStandardMaterial;
  leatherTaupe: THREE.MeshStandardMaterial;
  rugWool: THREE.MeshStandardMaterial;
  rugBorder: THREE.MeshStandardMaterial;
  outdoorFabric: THREE.MeshStandardMaterial;
  curtainLinen: THREE.MeshStandardMaterial;

  // Wood
  walnut: THREE.MeshStandardMaterial;
  walnutDark: THREE.MeshStandardMaterial;
  oak: THREE.MeshStandardMaterial;
  teak: THREE.MeshStandardMaterial;

  // Stone & mineral
  marble: THREE.MeshPhysicalMaterial;
  travertine: THREE.MeshStandardMaterial;
  concrete: THREE.MeshStandardMaterial;
  ceramicWhite: THREE.MeshPhysicalMaterial;
  ceramicMatte: THREE.MeshStandardMaterial;
  ceramicCharcoal: THREE.MeshStandardMaterial;
  lacquerWarmWhite: THREE.MeshStandardMaterial;
  lacquerGreige: THREE.MeshStandardMaterial;

  // Metal
  matteBlack: THREE.MeshStandardMaterial;
  brushedBrass: THREE.MeshStandardMaterial;
  brushedSteel: THREE.MeshStandardMaterial;

  // Glass & light
  glass: THREE.MeshPhysicalMaterial;
  mirror: THREE.MeshStandardMaterial;
  blackGlass: THREE.MeshPhysicalMaterial;
  opalGlass: THREE.MeshStandardMaterial;
  lampShade: THREE.MeshStandardMaterial;
  ledWarm: THREE.MeshBasicMaterial;
}

const cache = new Map<TemplateStyle, InteriorMaterials>();

function fabric(color: string, sheenColor: string, normal: THREE.Texture, normalScale = 0.35) {
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.92,
    roughnessMap: getFabricRoughnessMap(8, 8),
    normalMap: normal,
    normalScale: new THREE.Vector2(normalScale, normalScale),
    sheen: 0.6,
    sheenRoughness: 0.75,
    sheenColor: new THREE.Color(sheenColor),
  });
}

function wood(color: string, roughness: number) {
  return new THREE.MeshStandardMaterial({
    color,
    map: getWoodGrainMap(1, 1),
    normalMap: getWoodNormalMap(1, 1),
    normalScale: new THREE.Vector2(0.12, 0.12),
    roughness,
  });
}

/** Lighter version of a colour, used for the sheen on upholstery. */
function lift(color: string, amount = 0.12) {
  const c = new THREE.Color(color);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  return `#${c.setHSL(hsl.h, hsl.s * 0.8, Math.min(1, hsl.l + amount)).getHexString()}`;
}

function buildMaterials(t: StyleTheme): InteriorMaterials {
  const fabricNormal = getFabricNormalMap(10, 10);
  const boucleNormal = getBoucleNormalMap(5, 5);
  const brushed = getBrushedMetalRoughnessMap(1, 6);

  return {
    fabricCream: fabric(t.fabricCream, lift(t.fabricCream, 0.06), fabricNormal),
    fabricOatmeal: fabric(t.fabricOatmeal, lift(t.fabricOatmeal), fabricNormal),
    fabricTaupe: fabric(t.fabricTaupe, lift(t.fabricTaupe, 0.16), fabricNormal),
    boucle: fabric(t.boucle, lift(t.boucle, 0.06), boucleNormal, 0.6),
    beddingWhite: new THREE.MeshStandardMaterial({
      color: t.bedding,
      roughness: 0.95,
      normalMap: fabricNormal,
      normalScale: new THREE.Vector2(0.18, 0.18),
    }),
    leatherTaupe: new THREE.MeshStandardMaterial({
      color: t.leather,
      roughness: 0.55,
      normalMap: getLeatherNormalMap(8, 8),
      normalScale: new THREE.Vector2(0.15, 0.15),
    }),
    rugWool: new THREE.MeshStandardMaterial({
      color: t.rug,
      roughness: 1,
      normalMap: getBoucleNormalMap(14, 14),
      normalScale: new THREE.Vector2(0.45, 0.45),
    }),
    rugBorder: new THREE.MeshStandardMaterial({
      color: t.rugBorder,
      roughness: 1,
      normalMap: fabricNormal,
      normalScale: new THREE.Vector2(0.3, 0.3),
    }),
    outdoorFabric: new THREE.MeshStandardMaterial({
      color: t.outdoorFabric,
      roughness: 0.96,
      normalMap: getFabricNormalMap(16, 16),
      normalScale: new THREE.Vector2(0.35, 0.35),
    }),
    curtainLinen: new THREE.MeshStandardMaterial({
      color: t.curtain,
      roughness: 0.95,
      normalMap: fabricNormal,
      normalScale: new THREE.Vector2(0.25, 0.25),
      side: THREE.DoubleSide,
    }),

    walnut: wood(t.walnut, t.woodRoughness),
    walnutDark: wood(t.walnutDark, t.woodRoughness - 0.05),
    oak: wood(t.oak, t.woodRoughness + 0.05),
    teak: wood(t.teak, t.woodRoughness + 0.15),

    marble: new THREE.MeshPhysicalMaterial({
      color: t.marble,
      map: getMarbleMap(1, 1),
      roughness: 0.22,
      clearcoat: 0.25,
      clearcoatRoughness: 0.3,
    }),
    travertine: new THREE.MeshStandardMaterial({
      color: t.travertine,
      map: getTravertineMap(1, 1),
      roughness: 0.75,
    }),
    concrete: new THREE.MeshStandardMaterial({
      color: t.concrete,
      map: getConcreteMap(1, 1),
      roughness: 0.9,
    }),
    ceramicWhite: new THREE.MeshPhysicalMaterial({
      color: '#f7f5f1',
      roughness: 0.18,
      clearcoat: 0.6,
      clearcoatRoughness: 0.15,
    }),
    ceramicMatte: new THREE.MeshStandardMaterial({ color: t.ceramicMatte, roughness: 0.8 }),
    ceramicCharcoal: new THREE.MeshStandardMaterial({ color: t.ceramicCharcoal, roughness: 0.75 }),
    lacquerWarmWhite: new THREE.MeshStandardMaterial({ color: t.lacquerWarmWhite, roughness: 0.55 }),
    lacquerGreige: new THREE.MeshStandardMaterial({ color: t.lacquerGreige, roughness: 0.6 }),

    matteBlack: new THREE.MeshStandardMaterial({ color: t.matteBlack, roughness: 0.55, metalness: 0.45 }),
    // The accent metal role: brass in luxury rooms, black steel, chrome, copper or bronze elsewhere.
    brushedBrass: new THREE.MeshStandardMaterial({
      color: t.accentMetal,
      roughness: t.accentMetalRoughness,
      roughnessMap: brushed,
      metalness: 1,
    }),
    brushedSteel: new THREE.MeshStandardMaterial({
      color: t.steel,
      roughness: 0.32,
      roughnessMap: brushed,
      metalness: 1,
    }),

    glass: new THREE.MeshPhysicalMaterial({
      color: '#f4f7f6',
      roughness: 0.04,
      metalness: 0,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
    mirror: new THREE.MeshStandardMaterial({ color: '#eef1f0', roughness: 0.03, metalness: 1, envMapIntensity: 2.2 }),
    blackGlass: new THREE.MeshPhysicalMaterial({ color: '#0d0d0e', roughness: 0.06, clearcoat: 1, clearcoatRoughness: 0.05 }),
    opalGlass: new THREE.MeshStandardMaterial({
      color: '#fbf7f0',
      roughness: 0.35,
      emissive: new THREE.Color(t.ledWarm),
      emissiveIntensity: 0.85,
    }),
    // Linen drum: weave in the cloth and a bulb-height glow gradient. DynamicLighting sets the intensity from the time of day.
    lampShade: new THREE.MeshStandardMaterial({
      color: t.lampShade,
      roughness: 0.95,
      normalMap: getFabricNormalMap(12, 12),
      normalScale: new THREE.Vector2(0.2, 0.2),
      emissive: new THREE.Color(t.accentLight),
      emissiveMap: getLampGlowMap(),
      emissiveIntensity: 0.9,
      side: THREE.DoubleSide,
    }),
    ledWarm: new THREE.MeshBasicMaterial({ color: t.ledWarm, toneMapped: false }),
  };
}

/**
 * Shared, lazily-created material sets, one per design style. Materials are singletons so every
 * room of a style renders identical finishes and the GPU only compiles each program once.
 */
export function getInteriorMaterials(style: TemplateStyle = DEFAULT_STYLE): InteriorMaterials {
  let set = cache.get(style);
  if (!set) {
    set = buildMaterials(getStyleTheme(style));
    cache.set(style, set);
  }
  return set;
}

/** The finishes of the active design preset. Switching preset swaps the whole material set. */
export function useInteriorMaterials(): InteriorMaterials {
  return getInteriorMaterials(useStyleKey());
}

const LAMP_GLOW = { morning: 0.5, afternoon: 0.4, evening: 0.95, night: 1.6 } as const;

/** Lit shades read as barely glowing in daylight and warm lanterns after dark. */
export function setLampGlow(materials: InteriorMaterials, timeOfDay: keyof typeof LAMP_GLOW) {
  materials.lampShade.emissiveIntensity = LAMP_GLOW[timeOfDay];
}

/** Rotation (about Y) that turns a model whose front faces +Z towards a target point. */
export function faceTowards(from: [number, number], to: [number, number]): number {
  return Math.atan2(to[0] - from[0], to[1] - from[1]);
}
