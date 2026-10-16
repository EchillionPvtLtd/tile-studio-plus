'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { calcUVRepeat } from '@/lib/tileCalculations';
import { TileLayout } from '@/types/tile';
import { getTileNormalMap, getPlasterCloudMap } from './proceduralPBR';

interface UseTileMaterialOptions {
  textureUrl: string | null;
  surfaceLengthFt: number;
  surfaceWidthFt: number;
  tileWidthMm: number;
  tileHeightMm: number;
  layout: TileLayout;
  groutWidthMm: number;
  groutColor: string;
  finish?: string;
  defaultColor?: string;
  /** Walls without a tile are painted plaster; the default is a plain floor colour. */
  surface?: 'wall' | 'floor';
}

const textureCache = new Map<string, THREE.Texture>();

function getProxiedUrl(url: string): string {
  if (!url) return url;
  if (url.startsWith('/') || url.startsWith('data:') || url.startsWith('blob:')) {
    return url;
  }
  return `/api/tiles/proxy?url=${encodeURIComponent(url)}`;
}

function loadTexture(url: string, onUpdate?: () => void, onError?: () => void): THREE.Texture {
  if (textureCache.has(url)) {
    const cached = textureCache.get(url)!;
    if (cached.image && onUpdate) {
      onUpdate();
    }
    return cached;
  }
  const loader = new THREE.TextureLoader();
  loader.setCrossOrigin('anonymous');
  const targetUrl = getProxiedUrl(url);
  const tex = loader.load(
    targetUrl,
    () => {
      tex.needsUpdate = true;
      if (onUpdate) onUpdate();
    },
    undefined,
    (err) => {
      console.warn(`[TextureLoader] Error loading texture for ${url}:`, err);
      // Drop the dead texture so a corrected link (or a retry) loads again, and let the surface fall back to a flat colour
      textureCache.delete(url);
      tex.dispose();
      onError?.();
    }
  );
  
  // Crucial: Set sRGB color space for 100% color accuracy with JPEG/PNG texture images
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 16; // Maximum sharpness at angled camera views

  textureCache.set(url, tex);
  return tex;
}

export function useTileMaterial(opts: UseTileMaterialOptions): THREE.MeshStandardMaterial {
  const matRef = useRef<THREE.MeshStandardMaterial | null>(null);

  if (!matRef.current) {
    matRef.current = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.5,
      metalness: 0.0,
    });
  }

  useEffect(() => {
    const mat = matRef.current!;

    if (!opts.textureUrl) {
      const paintedWall = opts.surface === 'wall';
      // About one cloud per metre and a half of wall
      mat.map = paintedWall
        ? getPlasterCloudMap(Math.max(1, Math.round((opts.surfaceLengthFt * 0.3048) / 1.5)), Math.max(1, Math.round((opts.surfaceWidthFt * 0.3048) / 1.5)))
        : null;
      mat.normalMap = null;
      mat.color.set(opts.defaultColor ?? '#f0efe9');
      mat.roughness = paintedWall ? 0.92 : 0.8;
      mat.metalness = 0.0;
      mat.envMapIntensity = 0.4;
      mat.needsUpdate = true;
      return;
    }

    const tex = loadTexture(
      opts.textureUrl,
      () => {
        if (matRef.current) {
          matRef.current.needsUpdate = true;
        }
      },
      () => {
        // The image could not be loaded: show the tile's own colour instead of a blank surface
        const m = matRef.current;
        if (!m) return;
        m.map = null;
        m.normalMap = null;
        m.color.set(opts.defaultColor ?? '#f0efe9');
        m.roughness = 0.8;
        m.metalness = 0.0;
        m.envMapIntensity = 0.4;
        m.needsUpdate = true;
      }
    );

    // CRITICAL: Reset material color to pure white so it doesn't tint or darken the original tile JPEG image
    mat.color.set(0xffffff);

    const { repeatX, repeatY } = calcUVRepeat(
      opts.surfaceLengthFt,
      opts.surfaceWidthFt,
      opts.tileWidthMm,
      opts.tileHeightMm,
    );

    // Apply layout rotation
    if (opts.layout === 'diagonal' || opts.layout === 'herringbone') {
      tex.rotation = Math.PI / 4;
      tex.center.set(0.5, 0.5);
    } else {
      tex.rotation = 0;
      tex.center.set(0, 0);
    }

    // Offset factor per layout
    const offset = opts.layout === 'brick' ? 0.5 : opts.layout === 'offset' ? 1 / 3 : 0;

    tex.repeat.set(repeatX, repeatY);
    tex.offset.set(offset, 0);

    // Attach procedural normal map for micro grout & edge bevel details
    mat.normalMap = getTileNormalMap(repeatX, repeatY);
    mat.normalScale.set(0.15, 0.15);

    // Realistic non-metallic tile PBR finishes
    const finishMap: Record<string, [number, number, number]> = {
      Matt:      [0.85, 0.0,  0.3],
      Gloss:     [0.15, 0.05, 1.3],
      Polished:  [0.05, 0.08, 1.7],
      Satin:     [0.35, 0.02, 0.8],
    };
    
    const finishKey = opts.finish ?? 'Matt';
    const [roughness, metalness, envMapIntensity] = finishMap[finishKey] ?? [0.5, 0.0, 0.5];
    mat.roughness = roughness;
    mat.metalness = metalness;
    mat.envMapIntensity = envMapIntensity;
    mat.map = tex;
    mat.needsUpdate = true;
  }, [
    opts.textureUrl,
    opts.surfaceLengthFt,
    opts.surfaceWidthFt,
    opts.tileWidthMm,
    opts.tileHeightMm,
    opts.layout,
    opts.groutWidthMm,
    opts.groutColor,
    opts.finish,
    opts.defaultColor,
    opts.surface,
  ]);

  return matRef.current;
}
