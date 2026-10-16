'use client';

import React, { useEffect, useMemo, useState, Suspense } from 'react';
import { useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { compileSafely } from '@/three/compileSafely';
import { markSceneDirty } from '@/three/sceneDirty';

/**
 * Re-finishes a material inside a GLB so third-party assets follow the house
 * palette (e.g. a royal-blue velvet sofa becomes cream velvet).
 * `material` replaces the material outright; the other fields tint a clone.
 */
export interface MaterialOverride {
  material?: THREE.Material;
  color?: string;
  /** Pass null to drop a coloured base texture so `color` reads cleanly. */
  map?: null;
  roughness?: number;
  metalness?: number;
  sheenColor?: string;
}

interface RealisticFurnitureAssetProps {
  modelPath: string;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: number | [number, number, number];
  fallback?: React.ReactNode;
  /** Keyed by GLB material name or mesh/node name. */
  overrides?: Record<string, MaterialOverride>;
  /** Node names to hide (e.g. a tablecloth, product labels, decorative props). */
  hide?: string[];
}

function applyOverride(source: THREE.Material, o: MaterialOverride): THREE.Material {
  if (o.material) return o.material;
  const m = source.clone() as THREE.MeshPhysicalMaterial;
  if (o.color) m.color?.set(o.color);
  if (o.map === null) m.map = null;
  if (o.roughness !== undefined) m.roughness = o.roughness;
  if (o.metalness !== undefined) m.metalness = o.metalness;
  if (o.sheenColor && m.sheenColor) {
    m.sheenColor.set(o.sheenColor);
    m.sheenColorMap = null;
  }
  m.needsUpdate = true;
  return m;
}

function GLTFModelInner({
  modelPath,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = 1,
  overrides,
  hide,
  fallback,
}: RealisticFurnitureAssetProps) {
  const { scene } = useGLTF(modelPath);
  const gl = useThree((s) => s.gl);
  const roomScene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  // Keyed manually: JSON.stringify would invoke Material.toJSON() and serialise every texture.
  const overridesKey = Object.entries(overrides ?? {})
    .map(([k, { material, ...rest }]) => `${k}:${material?.uuid ?? ''}:${JSON.stringify(rest)}`)
    .join('|');
  const hideKey = (hide ?? []).join('|');

  const { clonedScene, ownedMaterials } = useMemo(() => {
    const clone = scene.clone(true);
    const strayLights: THREE.Object3D[] = [];
    const owned: THREE.Material[] = [];

    clone.traverse((child) => {
      // Some sample assets ship their own punctual lights (fireflies, a 3-lux sun) — never let them light the room.
      if ((child as THREE.Light).isLight) {
        strayLights.push(child);
        return;
      }
      if (hide?.includes(child.name)) child.visible = false;

      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;

      if (overrides) {
        const swap = (mat: THREE.Material) => {
          const o = overrides[mat.name] ?? overrides[mesh.name];
          if (!o) return mat;
          const next = applyOverride(mat, o);
          if (!o.material) owned.push(next);
          return next;
        };
        mesh.material = Array.isArray(mesh.material) ? mesh.material.map(swap) : swap(mesh.material);
      }
    });

    strayLights.forEach((l) => l.parent?.remove(l));
    return { clonedScene: clone, ownedMaterials: owned };
    // overrides/hide are compared by value via their serialised keys
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, overridesKey, hideKey]);

  // Compile the model's shaders (large, because of the room's many lights) in parallel before it is added,
  // so it does not freeze the page the first time it is drawn. The stand-in shows until then.
  const [compiled, setCompiled] = useState<THREE.Object3D | null>(null);
  useEffect(() => {
    let alive = true;
    const done = () => alive && setCompiled(clonedScene);
    compileSafely(gl, clonedScene, camera, roomScene).then(done, done);
    return () => {
      alive = false;
    };
  }, [gl, camera, roomScene, clonedScene]);
  const isReady = compiled === clonedScene;

  // A model that has just appeared changes the shadows.
  useEffect(() => {
    if (isReady) markSceneDirty();
  }, [clonedScene, isReady]);

  // Tinted clones belong to this instance; shared house materials and the cached GLB are left alone.
  useEffect(() => () => ownedMaterials.forEach((mat) => mat.dispose()), [ownedMaterials]);

  const scaleVector: [number, number, number] = typeof scale === 'number' ? [scale, scale, scale] : scale;

  if (!isReady) return <>{fallback}</>;

  return (
    <primitive
      object={clonedScene}
      position={position}
      rotation={rotation}
      scale={scaleVector}
    />
  );
}

class ModelErrorBoundary extends React.Component<
  { fallback?: React.ReactNode; children: React.ReactNode; modelPath: string },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { fallback?: React.ReactNode; children: React.ReactNode; modelPath: string }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: unknown) {
    console.warn(`[RealisticFurnitureAsset] Gracefully handled load error for: ${this.props.modelPath}`, error);
    try {
      useGLTF.clear(this.props.modelPath);
    } catch (_) {}
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? null;
    }
    return this.props.children;
  }
}

export function RealisticFurnitureAsset({
  modelPath,
  position,
  rotation,
  scale,
  fallback = null,
  overrides,
  hide,
}: RealisticFurnitureAssetProps) {
  return (
    <ModelErrorBoundary fallback={fallback} modelPath={modelPath}>
      <Suspense fallback={fallback}>
        <GLTFModelInner
          modelPath={modelPath}
          position={position}
          rotation={rotation}
          scale={scale}
          overrides={overrides}
          hide={hide}
          fallback={fallback}
        />
      </Suspense>
    </ModelErrorBoundary>
  );
}
