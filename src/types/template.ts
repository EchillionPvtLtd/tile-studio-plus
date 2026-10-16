'use client';

import { RoomType, SurfaceKey } from './room';
import { TileLayout } from './tile';
import { TimeOfDay, CameraPreset } from '@/stores/roomStore';

export type TemplateStyle =
  | 'modern-luxury'
  | 'modern-minimal'
  | 'scandinavian'
  | 'contemporary'
  | 'classic-luxury'
  | 'industrial'
  | 'spa';

export type TemplateMood = 'warm' | 'cool' | 'neutral' | 'dark' | 'light';

export interface TemplateFurnitureItem {
  id: string;
  name: string;
  category: string;
  position: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
  color?: string;
  finish?: string;
}

export interface RoomTemplatePreset {
  id: string;
  name: string;
  roomType: RoomType;
  style: TemplateStyle;
  mood: TemplateMood;
  description: string;
  tags: string[];
  recommendedFor: string;
  accentColor: string;
  gradientBg: string;

  // Geometry
  dimensions: {
    lengthFt: number;
    widthFt: number;
    heightFt: number;
  };

  // Architectural Details
  architecture: {
    ceilingStyle: 'cove' | 'smooth' | 'beam' | 'coffered' | 'exposed';
    featureWallStyle: 'marble-slab' | 'wood-slats' | 'concrete-panel' | 'moulding' | 'accent-paint' | 'none';
    skirtingStyle: 'modern-white' | 'dark-wood' | 'marble' | 'minimal';
    windowStyle: 'panoramic-glass' | 'divided-pane' | 'minimal-frame' | 'black-metal';
    doorStyle: 'paneled-wood' | 'glass-sliding' | 'minimal-white' | 'flush-dark';
    curtainStyle: 'sheer-draped' | 'heavy-velvet' | 'roman-blinds' | 'none';
  };

  // Lighting & Environment
  lighting: {
    timeOfDay: TimeOfDay;
    colorTemperatureK: number;
    sunIntensity: number;
    ambientIntensity: number;
    downlightIntensity: number;
    accentLightColor: string;
  };

  // Material & Tile Defaults
  recommendedPalette: {
    wallColor: string;
    woodTone: string;
    metalFinish: string;
    fabricColor: string;
    accentColor: string;
    defaultFloorTileId?: string;
    defaultWallTileId?: string;
    defaultFeatureWallTileId?: string;
    groutColor: string;
    groutWidthMm: number;
    layout: TileLayout;
  };

  // Camera Preset
  camera: {
    preset: CameraPreset;
    position: [number, number, number];
    target: [number, number, number];
  };

  // Furniture & Decor
  furniture: TemplateFurnitureItem[];
  decorations: string[];
}
