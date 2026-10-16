'use client';

import { useRoomStore } from '@/stores/roomStore';
import type { TemplateStyle } from '@/types/template';

/**
 * Design-preset theming.
 *
 * Every room draws its finishes from named material *roles* (walnut, fabricTaupe, brushedBrass …).
 * A preset's style decides what those roles are made of, so the same sofa or cabinet reads as
 * walnut and brass in a luxury room, pale oak and black steel in a Scandinavian one, or reclaimed
 * wood and copper in an industrial loft. Roles keep their names; only their colours change
 * (e.g. under the industrial theme `brushedBrass` is copper, under Scandinavian it is black steel).
 */
export interface StyleTheme {
  // Wood roles
  walnut: string;
  walnutDark: string;
  oak: string;
  teak: string;
  woodRoughness: number;

  // Upholstery & textiles
  fabricCream: string;
  fabricOatmeal: string;
  fabricTaupe: string;
  boucle: string;
  bedding: string;
  leather: string;
  rug: string;
  rugBorder: string;
  curtain: string;
  outdoorFabric: string;
  /** Main seating upholstery (sofa + matching chairs). */
  sofa: string;
  sofaSheen: string;
  /** Leather seating reads shiny, not soft. */
  sofaIsLeather: boolean;

  // Metals
  accentMetal: string;
  accentMetalRoughness: number;
  steel: string;
  matteBlack: string;

  // Stone & ceramics
  marble: string;
  travertine: string;
  concrete: string;
  ceramicMatte: string;
  ceramicCharcoal: string;
  lacquerWarmWhite: string;
  lacquerGreige: string;

  // Light
  lampShade: string;
  ledWarm: string;
  /** Room ambient fill colour (colour temperature feel). */
  ambientColor: string;
  /** Warm accent light colour (downlights, lamps). */
  accentLight: string;
  /** Multiplier on the reflection environment — higher reads brighter and airier. */
  envMul: number;
}

/** The house default: modern luxury — warm neutrals, walnut, brushed brass. */
const BASE: StyleTheme = {
  walnut: '#6b4c36',
  walnutDark: '#4f3725',
  oak: '#c09a6b',
  teak: '#9c7048',
  woodRoughness: 0.55,

  fabricCream: '#ece4d6',
  fabricOatmeal: '#d3c6b1',
  fabricTaupe: '#a39382',
  boucle: '#e9e1d3',
  bedding: '#f6f2ea',
  leather: '#8f7b68',
  rug: '#ddd3c3',
  rugBorder: '#b3a48f',
  curtain: '#eee7db',
  outdoorFabric: '#ddd2bf',
  sofa: '#766859',
  sofaSheen: '#b3a593',
  sofaIsLeather: false,

  accentMetal: '#b59a6a',
  accentMetalRoughness: 0.38,
  steel: '#c3c2be',
  matteBlack: '#1e1d1c',

  marble: '#f1ece4',
  travertine: '#d8c9b0',
  concrete: '#bdb7ae',
  ceramicMatte: '#e3dacb',
  ceramicCharcoal: '#46423e',
  lacquerWarmWhite: '#efeae2',
  lacquerGreige: '#cfc5b7',

  lampShade: '#efe6d8',
  ledWarm: '#ffe3c0',
  ambientColor: '#fff0e0',
  accentLight: '#ffe4c4',
  envMul: 1,
};

export const STYLE_THEMES: Record<TemplateStyle, StyleTheme> = {
  'modern-luxury': BASE,

  // Cool greys and pale smoked oak with matte black hardware: calm, uncluttered, gallery-like.
  'modern-minimal': {
    ...BASE,
    walnut: '#5b5249',
    walnutDark: '#3b3631',
    oak: '#cbb89b',
    teak: '#a48a67',
    fabricCream: '#e9e8e4',
    fabricOatmeal: '#d6d4ce',
    fabricTaupe: '#9a9a96',
    boucle: '#efeeea',
    bedding: '#f4f4f1',
    leather: '#6f6a64',
    rug: '#d9d8d3',
    rugBorder: '#bdbcb6',
    curtain: '#f1f0ec',
    outdoorFabric: '#dcdad4',
    sofa: '#8d8d89',
    sofaSheen: '#c7c7c3',
    accentMetal: '#2b2b2b',
    accentMetalRoughness: 0.45,
    steel: '#d0d0cf',
    marble: '#f2f2f0',
    travertine: '#dcd8cf',
    concrete: '#b3b3b0',
    ceramicMatte: '#dcdad4',
    ceramicCharcoal: '#3c3c3b',
    lacquerWarmWhite: '#f1f1ee',
    lacquerGreige: '#cdcdc8',
    lampShade: '#f3f2ee',
    ledWarm: '#fff0dc',
    ambientColor: '#fbf9f5',
    accentLight: '#fff1de',
    envMul: 1.05,
  },

  // Bright and airy: light oak and ash, soft linen, thin black metal, a gentle sage-grey sofa.
  scandinavian: {
    ...BASE,
    walnut: '#c9a97a',
    walnutDark: '#a88659',
    oak: '#dcc39b',
    teak: '#b99668',
    woodRoughness: 0.62,
    fabricCream: '#f1eee8',
    fabricOatmeal: '#e2dccf',
    fabricTaupe: '#b9b2a4',
    boucle: '#f4efe6',
    bedding: '#faf8f3',
    leather: '#b4835a',
    rug: '#e9e4da',
    rugBorder: '#cfc8ba',
    curtain: '#f6f3ee',
    outdoorFabric: '#e6e0d3',
    sofa: '#a7ada0',
    sofaSheen: '#d6dad1',
    accentMetal: '#2d2d2d',
    accentMetalRoughness: 0.5,
    steel: '#cfcfcc',
    marble: '#f6f4f0',
    travertine: '#e4dac6',
    concrete: '#c9c5bd',
    ceramicMatte: '#e8e1d4',
    ceramicCharcoal: '#5a5f5c',
    lacquerWarmWhite: '#f7f5f0',
    lacquerGreige: '#ddd6ca',
    lampShade: '#f7f2ea',
    ledWarm: '#fff0d8',
    ambientColor: '#fffaf2',
    accentLight: '#ffeed6',
    envMul: 1.2,
  },

  // Slate and charcoal with chrome: crisp, urban, a little cooler.
  contemporary: {
    ...BASE,
    walnut: '#3f3c3a',
    walnutDark: '#2c2a29',
    oak: '#a08a6c',
    teak: '#8c7050',
    fabricCream: '#dcdcd8',
    fabricOatmeal: '#c7c8c4',
    fabricTaupe: '#6d7278',
    boucle: '#d9dadb',
    bedding: '#eceeef',
    leather: '#4a4541',
    rug: '#b9bcbe',
    rugBorder: '#8f9498',
    curtain: '#d8dadb',
    outdoorFabric: '#c9ccce',
    sofa: '#4f565e',
    sofaSheen: '#8a929b',
    accentMetal: '#d7d9db',
    accentMetalRoughness: 0.22,
    steel: '#d7d9db',
    matteBlack: '#17181a',
    marble: '#ecedee',
    travertine: '#cfcdc8',
    concrete: '#a6a8a8',
    ceramicMatte: '#cfd2d4',
    ceramicCharcoal: '#33373b',
    lacquerWarmWhite: '#e8eaeb',
    lacquerGreige: '#bfc3c6',
    lampShade: '#e4e6e7',
    ledWarm: '#f3f1ee',
    ambientColor: '#f2f5fa',
    accentLight: '#f3f1ee',
    envMul: 0.95,
  },

  // Ivory, dark mahogany, polished brass and a deep navy velvet sofa: formal and symmetrical.
  'classic-luxury': {
    ...BASE,
    walnut: '#4a2c1f',
    walnutDark: '#2f1b12',
    oak: '#8c6a43',
    teak: '#6e4a2c',
    woodRoughness: 0.4,
    fabricCream: '#efe6d0',
    fabricOatmeal: '#e0d2b4',
    fabricTaupe: '#6b5a45',
    boucle: '#f2e9d6',
    bedding: '#f8f1e2',
    leather: '#5a3a24',
    rug: '#d8c8a6',
    rugBorder: '#a8884f',
    curtain: '#e9dcc0',
    outdoorFabric: '#e0d4b8',
    sofa: '#2b3a55',
    sofaSheen: '#7686a6',
    accentMetal: '#c9a24a',
    accentMetalRoughness: 0.24,
    steel: '#cbbf9f',
    matteBlack: '#241c17',
    marble: '#f3eee3',
    travertine: '#dccfb4',
    concrete: '#b7aea0',
    ceramicMatte: '#e9dcc3',
    ceramicCharcoal: '#3d3028',
    lacquerWarmWhite: '#f1ead9',
    lacquerGreige: '#d4c7ad',
    lampShade: '#f0e2c4',
    ledWarm: '#ffd9a0',
    ambientColor: '#ffe8c8',
    accentLight: '#ffd08a',
    envMul: 0.8,
  },

  // Cognac leather, black steel, concrete and reclaimed wood; copper accents under dimmer, warmer light.
  industrial: {
    ...BASE,
    walnut: '#5c4632',
    walnutDark: '#33271c',
    oak: '#8d7355',
    teak: '#7a5a3a',
    woodRoughness: 0.72,
    fabricCream: '#cfc8bb',
    fabricOatmeal: '#b6ae9f',
    fabricTaupe: '#6d6a66',
    boucle: '#cdc6b9',
    bedding: '#e2ddd2',
    leather: '#8a5a36',
    rug: '#5d5750',
    rugBorder: '#3f3a35',
    curtain: '#bdb5a6',
    outdoorFabric: '#b8b0a2',
    sofa: '#8a5a36',
    sofaSheen: '#b98a63',
    sofaIsLeather: true,
    accentMetal: '#a65f3a',
    accentMetalRoughness: 0.45,
    steel: '#8f9194',
    matteBlack: '#1a1918',
    marble: '#d8d4cc',
    travertine: '#bfb4a0',
    concrete: '#8f8b84',
    ceramicMatte: '#b9b2a4',
    ceramicCharcoal: '#2f2d2b',
    lacquerWarmWhite: '#d7d2c8',
    lacquerGreige: '#a79f92',
    lampShade: '#35322f',
    ledWarm: '#ffc98a',
    ambientColor: '#ffe1c0',
    accentLight: '#ffb46b',
    envMul: 0.45,
  },

  // Natural stone, teak and bamboo with sage linen and bronze: soft, tactile, calm.
  spa: {
    ...BASE,
    walnut: '#8a6a45',
    walnutDark: '#6c5030',
    oak: '#d2b78a',
    teak: '#9c7a50',
    woodRoughness: 0.68,
    fabricCream: '#eee9dc',
    fabricOatmeal: '#d9d3c0',
    fabricTaupe: '#a9a58f',
    boucle: '#efe9dc',
    bedding: '#f5f1e6',
    leather: '#8a7457',
    rug: '#e3dccb',
    rugBorder: '#c4b99f',
    curtain: '#f0ebde',
    outdoorFabric: '#dcd5c2',
    sofa: '#a7ad98',
    sofaSheen: '#d3d7c8',
    accentMetal: '#8c7a5c',
    accentMetalRoughness: 0.5,
    steel: '#bfbcb0',
    marble: '#eeeae0',
    travertine: '#d6cdb8',
    concrete: '#bcb7a8',
    ceramicMatte: '#d8d2c0',
    ceramicCharcoal: '#5b564a',
    lacquerWarmWhite: '#ece7da',
    lacquerGreige: '#cdc6b2',
    lampShade: '#f0e8d4',
    ledWarm: '#ffe0b4',
    ambientColor: '#fff1da',
    accentLight: '#ffd9a8',
    envMul: 0.7,
  },
};

export const DEFAULT_STYLE: TemplateStyle = 'modern-luxury';

export function getStyleTheme(style: TemplateStyle | undefined | null): StyleTheme {
  return STYLE_THEMES[style ?? DEFAULT_STYLE] ?? BASE;
}

/** The style of the active design preset (the house default when none is active). */
export function useStyleKey(): TemplateStyle {
  return useRoomStore((s) => s.activeTemplate?.style) ?? DEFAULT_STYLE;
}

export function useStyleTheme(): StyleTheme {
  return getStyleTheme(useStyleKey());
}

/**
 * How each preset arranges its room. The style (above) restyles the finishes; the variant picks the
 * furniture composition. Room components read the variant for their own room type.
 */
export type LivingSetup = 'lounge' | 'minimal' | 'scandi' | 'lshape' | 'symmetric' | 'loft';
export type BedroomSetup = 'suite' | 'classic' | 'scandi' | 'minimal';
export type KitchenSetup = 'luxury' | 'white' | 'scandi' | 'dark';
export type BathroomSetup = 'luxury' | 'minimal' | 'spa' | 'contemporary';
export type DiningSetup = 'modern' | 'classic' | 'scandi';
export type BalconySetup = 'modern' | 'tropical' | 'bistro' | 'luxury' | 'daybed';

export const PRESET_SETUPS: Record<string, string> = {
  'living-modern-luxury': 'lounge',
  'living-modern-minimal': 'minimal',
  'living-scandinavian': 'scandi',
  'living-contemporary': 'lshape',
  'living-classic-luxury': 'symmetric',
  'living-industrial': 'loft',

  'bedroom-modern-master': 'suite',
  'bedroom-luxury-hotel': 'classic',
  'bedroom-scandinavian': 'scandi',
  'bedroom-minimal': 'minimal',

  'kitchen-modern-white': 'white',
  'kitchen-luxury-marble': 'luxury',
  'kitchen-scandinavian': 'scandi',
  'kitchen-dark-modern': 'dark',

  'bathroom-luxury-marble': 'luxury',
  'bathroom-modern-minimal': 'minimal',
  'bathroom-spa': 'spa',
  'bathroom-contemporary': 'contemporary',

  'dining-modern': 'modern',
  'dining-luxury': 'classic',
  'dining-scandinavian': 'scandi',

  'balcony-modern': 'modern',
  'balcony-tropical': 'tropical',
  'balcony-minimal': 'bistro',
  'terrace-luxury': 'luxury',
  'terrace-modern': 'daybed',
  'terrace-tropical': 'tropical',
};

/** The arrangement variant of the active preset, or `fallback` when none (or a custom room) is active. */
export function useSetup<T extends string>(fallback: T): T {
  const id = useRoomStore((s) => s.activeTemplateId);
  return ((id && PRESET_SETUPS[id]) as T | undefined) ?? fallback;
}
