'use client';

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { RoomType, SurfaceKey, ROOM_CONFIGS } from '@/types/room';
import { Tile, TileLayout } from '@/types/tile';
import { RoomTemplatePreset } from '@/types/template';
import { ROOM_TEMPLATE_PRESETS } from '@/data/roomTemplates';
import { SAMPLE_TILES } from '@/data/sampleTiles';

export type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night';
export type CameraPreset = 'eye-level' | 'floor' | 'wall' | 'corner' | 'top' | 'walkthrough';

/** The four room walls that can carry their own paint colour. */
export type PaintableWall = 'wall-n' | 'wall-s' | 'wall-e' | 'wall-w';
export const PAINTABLE_WALLS: PaintableWall[] = ['wall-n', 'wall-s', 'wall-e', 'wall-w'];

interface RoomStore {
  // Room config
  roomType: RoomType;
  lengthFt: number;
  widthFt: number;
  heightFt: number;

  // Door & Window config
  doorWidthFt: number;
  doorHeightFt: number;
  doorPositionRatio: number;
  windowWidthFt: number;
  windowHeightFt: number;
  windowPositionRatio: number;

  // Active Template Preset System
  activeTemplateId: string | null;
  activeTemplate: RoomTemplatePreset | null;
  isApplyingTemplate: boolean;

  // Active surface being edited
  activeSurface: SurfaceKey;

  // Tiles per surface
  floorTile: Tile | null;
  wallNTile: Tile | null;
  wallSTile: Tile | null;
  wallETile: Tile | null;
  wallWTile: Tile | null;
  featureWallTile: Tile | null;
  backsplashTile: Tile | null;
  showerWallTile: Tile | null;

  // Layout / grout
  layout: TileLayout;
  groutWidthMm: number;
  groutColor: string;

  // Lighting & Environment
  timeOfDay: TimeOfDay;

  // Camera system
  cameraPreset: CameraPreset;

  // Compare & Multi-tile slot feature
  isCompareMode: boolean;
  compareTile: Tile | null;
  tileSlots: (Tile | null)[];

  // UI state
  isSidebarOpen: boolean;
  isCalculatorOpen: boolean;

  // Wall Design
  wallColor: string;
  /** Per-wall paint overrides; walls without an entry use wallColor. */
  wallPaints: Partial<Record<PaintableWall, string>>;
  wallTreatment: 'painted' | 'tiles' | 'wood-slats' | 'marble-slab' | 'concrete' | 'limewash';
  featureWallTreatment: 'none' | 'wood-slats' | 'marble-slab' | 'fluted-panel' | 'accent-tile';
  featureWallColor: string;
  featureWallBacklight: boolean;

  // Actions
  setRoomType: (type: RoomType) => void;
  setDimensions: (l: number, w: number, h: number) => void;
  setLengthFt: (v: number) => void;
  setWidthFt: (v: number) => void;
  setHeightFt: (v: number) => void;
  setDoorConfig: (widthFt: number, heightFt: number, posRatio: number) => void;
  setWindowConfig: (widthFt: number, heightFt: number, posRatio: number) => void;
  setActiveSurface: (s: SurfaceKey) => void;
  setTileForSurface: (surface: SurfaceKey, tile: Tile | null) => void;
  setLayout: (l: TileLayout) => void;
  setGroutWidthMm: (w: number) => void;
  setGroutColor: (c: string) => void;
  setTimeOfDay: (t: TimeOfDay) => void;
  setCameraPreset: (p: CameraPreset) => void;
  setCompareMode: (enabled: boolean) => void;
  setCompareTile: (tile: Tile | null) => void;
  setTileSlot: (index: number, tile: Tile | null) => void;
  toggleSidebar: () => void;
  toggleCalculator: () => void;
  resetDesign: () => void;

  // Wall Design Actions
  setWallColor: (color: string) => void;
  /** Paints one wall and removes its tile / panel so the colour is visible. */
  setWallPaint: (wall: PaintableWall, color: string) => void;
  /** Paints every wall one colour and removes wall tiles and panels. */
  paintAllWalls: (color: string) => void;
  setWallTreatment: (treatment: 'painted' | 'tiles' | 'wood-slats' | 'marble-slab' | 'concrete' | 'limewash') => void;
  setFeatureWallTreatment: (treatment: 'none' | 'wood-slats' | 'marble-slab' | 'fluted-panel' | 'accent-tile') => void;
  setFeatureWallColor: (color: string) => void;
  setFeatureWallBacklight: (enabled: boolean) => void;
  applyTileToAllWalls: (tile: Tile | null) => void;
  clearAllWalls: () => void;

  // Complete Template Actions
  applyTemplate: (templateId: string, applyMaterials?: boolean) => void;
  clearActiveTemplate: () => void;

  // Computed helpers
  getTileForSurface: (surface: SurfaceKey) => Tile | null;
}

function sampleTileToTile(st: (typeof SAMPLE_TILES)[0]): Tile {
  return {
    id: st.sku,
    sku: st.sku,
    name: st.name,
    brand: st.brand,
    category: st.category,
    widthMm: st.widthMm,
    heightMm: st.heightMm,
    finish: st.finish,
    color: st.color,
    colorName: st.colorName,
    material: st.material,
    textureUrl: st.textureUrl,
    previewUrl: st.previewUrl,
    pricePerSqFt: st.pricePerSqFt,
    isBuiltIn: st.isBuiltIn,
    createdAt: new Date().toISOString(),
  };
}

const defaultRoom = ROOM_CONFIGS[0];
const defaultTemplate = ROOM_TEMPLATE_PRESETS[0];

export const useRoomStore = create<RoomStore>()(
  subscribeWithSelector((set, get) => ({
    roomType: defaultTemplate.roomType,
    lengthFt: defaultTemplate.dimensions.lengthFt,
    widthFt: defaultTemplate.dimensions.widthFt,
    heightFt: defaultTemplate.dimensions.heightFt,

    doorWidthFt: 3.0,
    doorHeightFt: 7.0,
    doorPositionRatio: 0.3,

    windowWidthFt: 6.0,
    windowHeightFt: 4.5,
    windowPositionRatio: 0.5,

    // Default template active
    activeTemplateId: defaultTemplate.id,
    activeTemplate: defaultTemplate,
    isApplyingTemplate: false,

    activeSurface: 'floor',

    floorTile: null,
    wallNTile: null,
    wallSTile: null,
    wallETile: null,
    wallWTile: null,
    featureWallTile: null,
    backsplashTile: null,
    showerWallTile: null,

    wallColor: '#f3efe8',
    wallPaints: {},
    wallTreatment: 'painted',
    featureWallTreatment: 'none',
    featureWallColor: '#6b4a33',
    featureWallBacklight: true,

    layout: defaultTemplate.recommendedPalette.layout,
    groutWidthMm: defaultTemplate.recommendedPalette.groutWidthMm,
    groutColor: defaultTemplate.recommendedPalette.groutColor,

    timeOfDay: defaultTemplate.lighting.timeOfDay,
    cameraPreset: defaultTemplate.camera.preset,

    isCompareMode: false,
    compareTile: null,
    tileSlots: [null, null, null, null],

    isSidebarOpen: true,
    isCalculatorOpen: false,

    setRoomType: (type) => {
      const matchingTemplate = ROOM_TEMPLATE_PRESETS.find((t) => t.roomType === type);
      const cfg = ROOM_CONFIGS.find((r) => r.type === type) ?? defaultRoom;
      
      if (matchingTemplate) {
        get().applyTemplate(matchingTemplate.id, false);
      } else {
        set({
          roomType: type,
          lengthFt: cfg.defaultLength,
          widthFt: cfg.defaultWidth,
          heightFt: cfg.defaultHeight,
          activeTemplateId: null,
          activeTemplate: null,
        });
      }
    },

    setDimensions: (lengthFt, widthFt, heightFt) => set({ lengthFt, widthFt, heightFt }),
    setLengthFt: (lengthFt) => set({ lengthFt }),
    setWidthFt: (widthFt) => set({ widthFt }),
    setHeightFt: (heightFt) => set({ heightFt }),

    setDoorConfig: (doorWidthFt, doorHeightFt, doorPositionRatio) => set({ doorWidthFt, doorHeightFt, doorPositionRatio }),
    setWindowConfig: (windowWidthFt, windowHeightFt, windowPositionRatio) => set({ windowWidthFt, windowHeightFt, windowPositionRatio }),

    setActiveSurface: (activeSurface) => set({ activeSurface }),

    setTileForSurface: (surface, tile) => {
      switch (surface as any) {
        case 'floor': set({ floorTile: tile }); break;
        case 'wall-n':
        case 'wallN':
        case 'feature-wall':
        case 'featureWall':
          // North wall and feature wall are the same physical wall; a tile there replaces any panel.
          set({ wallNTile: tile, featureWallTile: tile, ...(tile ? { featureWallTreatment: 'none' as const } : {}) });
          break;
        case 'wall-s':
        case 'wallS': set({ wallSTile: tile }); break;
        case 'wall-e':
        case 'wallE': set({ wallETile: tile }); break;
        case 'wall-w':
        case 'wallW': set({ wallWTile: tile }); break;
        case 'backsplash': set({ backsplashTile: tile }); break;
        case 'shower-wall':
        case 'showerWall': set({ showerWallTile: tile }); break;
      }
    },

    setWallColor: (wallColor) => set({ wallColor }),
    setWallPaint: (wall, color) => {
      const wallPaints = { ...get().wallPaints, [wall]: color };
      switch (wall) {
        case 'wall-n': set({ wallPaints, wallNTile: null, featureWallTile: null, featureWallTreatment: 'none' }); break;
        case 'wall-s': set({ wallPaints, wallSTile: null }); break;
        case 'wall-e': set({ wallPaints, wallETile: null }); break;
        case 'wall-w': set({ wallPaints, wallWTile: null }); break;
      }
    },
    paintAllWalls: (wallColor) => set({
      wallColor,
      wallPaints: {},
      wallNTile: null,
      wallSTile: null,
      wallETile: null,
      wallWTile: null,
      featureWallTile: null,
      featureWallTreatment: 'none',
    }),
    setWallTreatment: (wallTreatment) => set({ wallTreatment }),
    setFeatureWallTreatment: (featureWallTreatment) => set({ featureWallTreatment }),
    setFeatureWallColor: (featureWallColor) => set({ featureWallColor }),
    setFeatureWallBacklight: (featureWallBacklight) => set({ featureWallBacklight }),
    applyTileToAllWalls: (tile) => {
      set({
        wallNTile: tile,
        wallSTile: tile,
        wallETile: tile,
        wallWTile: tile,
        featureWallTile: tile,
        ...(tile ? { featureWallTreatment: 'none' as const } : {}),
      });
    },
    clearAllWalls: () => {
      set({
        wallNTile: null,
        wallSTile: null,
        wallETile: null,
        wallWTile: null,
        featureWallTile: null,
        featureWallTreatment: 'none',
      });
    },

    setLayout: (layout) => set({ layout }),
    setGroutWidthMm: (groutWidthMm) => set({ groutWidthMm }),
    setGroutColor: (groutColor) => set({ groutColor }),

    setTimeOfDay: (timeOfDay) => set({ timeOfDay }),
    setCameraPreset: (cameraPreset) => set({ cameraPreset }),

    setCompareMode: (isCompareMode) => set({ isCompareMode }),
    setCompareTile: (compareTile) => set({ compareTile }),

    setTileSlot: (index, tile) => {
      const current = [...get().tileSlots];
      current[index] = tile;
      set({ tileSlots: current });
    },

    toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
    toggleCalculator: () => set((state) => ({ isCalculatorOpen: !state.isCalculatorOpen })),

    applyTemplate: (templateId, applyMaterials = true) => {
      const tpl = ROOM_TEMPLATE_PRESETS.find((t) => t.id === templateId);
      if (!tpl) return;

      set({ isApplyingTemplate: true });

      let floorTile = get().floorTile;
      let wallNTile = get().wallNTile;
      let featureWallTile = get().featureWallTile;
      let backsplashTile = get().backsplashTile;
      let showerWallTile = get().showerWallTile;

      if (applyMaterials && tpl.recommendedPalette) {
        if (tpl.recommendedPalette.defaultFloorTileId) {
          const found = SAMPLE_TILES.find((t) => t.sku === tpl.recommendedPalette?.defaultFloorTileId || t.sku === 'TV-1001');
          if (found) floorTile = sampleTileToTile(found);
        }
        if (tpl.recommendedPalette.defaultWallTileId) {
          const found = SAMPLE_TILES.find((t) => t.sku === tpl.recommendedPalette?.defaultWallTileId || t.sku === 'TV-1002');
          if (found) wallNTile = sampleTileToTile(found);
        }
        if (tpl.recommendedPalette.defaultFeatureWallTileId) {
          const found = SAMPLE_TILES.find((t) => t.sku === tpl.recommendedPalette?.defaultFeatureWallTileId || t.sku === 'TV-1003');
          if (found) featureWallTile = sampleTileToTile(found);
        }
        if (tpl.roomType === 'kitchen' && SAMPLE_TILES[3]) {
          backsplashTile = sampleTileToTile(SAMPLE_TILES[3]);
        }
        if (tpl.roomType === 'bathroom' && SAMPLE_TILES[1]) {
          showerWallTile = sampleTileToTile(SAMPLE_TILES[1]);
        }
      }

      const fwStyle = tpl.architecture?.featureWallStyle;
      const featureWallTreatment = (fwStyle === 'wood-slats' || fwStyle === 'marble-slab') ? fwStyle : 'none';
      const wallColor = tpl.recommendedPalette?.wallColor || '#f3efe8';
      const featureWallColor = tpl.recommendedPalette?.woodTone || (fwStyle === 'marble-slab' ? '#d9cdbb' : '#6b4a33');
      const featureWallBacklight = tpl.architecture?.ceilingStyle === 'cove' || tpl.lighting?.timeOfDay === 'evening';

      set({
        activeTemplateId: tpl.id,
        activeTemplate: tpl,
        roomType: tpl.roomType,
        lengthFt: tpl.dimensions.lengthFt,
        widthFt: tpl.dimensions.widthFt,
        heightFt: tpl.dimensions.heightFt,
        timeOfDay: tpl.lighting.timeOfDay,
        cameraPreset: tpl.camera.preset,
        layout: tpl.recommendedPalette?.layout ?? get().layout,
        groutColor: tpl.recommendedPalette?.groutColor ?? get().groutColor,
        groutWidthMm: tpl.recommendedPalette?.groutWidthMm ?? get().groutWidthMm,
        wallColor,
        wallPaints: {},
        featureWallTreatment,
        featureWallColor,
        featureWallBacklight,
        ...(applyMaterials ? { floorTile, wallNTile, featureWallTile, backsplashTile, showerWallTile } : {}),
      });

      setTimeout(() => {
        set({ isApplyingTemplate: false });
      }, 600);
    },

    clearActiveTemplate: () => set({ activeTemplateId: null, activeTemplate: null }),

    resetDesign: () => set({
      activeTemplateId: defaultTemplate.id,
      activeTemplate: defaultTemplate,
      roomType: defaultTemplate.roomType,
      lengthFt: defaultTemplate.dimensions.lengthFt,
      widthFt: defaultTemplate.dimensions.widthFt,
      heightFt: defaultTemplate.dimensions.heightFt,
      floorTile: null,
      wallNTile: null,
      wallSTile: null,
      wallETile: null,
      wallWTile: null,
      featureWallTile: null,
      backsplashTile: null,
      showerWallTile: null,
      wallColor: '#f3efe8',
      wallPaints: {},
      wallTreatment: 'painted',
      featureWallTreatment: 'none',
      featureWallColor: '#6b4a33',
      featureWallBacklight: true,
      layout: defaultTemplate.recommendedPalette.layout,
      groutWidthMm: defaultTemplate.recommendedPalette.groutWidthMm,
      groutColor: defaultTemplate.recommendedPalette.groutColor,
      timeOfDay: defaultTemplate.lighting.timeOfDay,
      cameraPreset: defaultTemplate.camera.preset,
      isCompareMode: false,
      compareTile: null,
      isApplyingTemplate: false,
    }),

    getTileForSurface: (surface) => {
      const state = get();
      switch (surface as any) {
        case 'floor': return state.floorTile;
        case 'wall-n':
        case 'wallN':
        case 'feature-wall':
        case 'featureWall': return state.featureWallTile || state.wallNTile;
        case 'wall-s':
        case 'wallS': return state.wallSTile;
        case 'wall-e':
        case 'wallE': return state.wallETile;
        case 'wall-w':
        case 'wallW': return state.wallWTile;
        case 'backsplash': return state.backsplashTile;
        case 'shower-wall':
        case 'showerWall': return state.showerWallTile;
        default: return null;
      }
    },
  }))
);
