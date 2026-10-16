'use client';

import { useEffect, useMemo, useRef } from 'react';
import type { RefObject } from 'react';
import * as THREE from 'three';
import { registerPreRender, renderFlags, type PreRenderContext } from './renderHooks';
import { getSceneEpoch } from '@/three/sceneDirty';
import { useRoomStore } from '@/stores/roomStore';

/** Maps clip space to texture space. */
const BIAS = new THREE.Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);

/** Colour seen where a reflected ray leaves the room: a dark warm grey, close to the page behind the canvas. */
const VOID = new THREE.Color(0x2c2825);

export interface FloorReflectionSettings {
  /** 0 disables the pass. 1 is a mirror-polished stone floor. */
  strength: number;
  /** Extra mip level used when sampling, i.e. how soft the reflection is. */
  blur: number;
}

type ReflectionUniforms = {
  tReflect: { value: THREE.Texture | null };
  uReflectMatrix: { value: THREE.Matrix4 };
  uReflectStrength: { value: number };
  uReflectBias: { value: number };
  uReflectDistort: { value: number };
};

/** Patches a standard material's shader to blend in the planar reflection by Fresnel. Returns the undo. */
function installReflectionShader(material: THREE.MeshStandardMaterial, uniforms: ReflectionUniforms): () => void {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec4 vReflectCoord;\nuniform mat4 uReflectMatrix;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvReflectCoord = uReflectMatrix * modelMatrix * vec4( transformed, 1.0 );');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec4 vReflectCoord;\nuniform sampler2D tReflect;\nuniform float uReflectStrength;\nuniform float uReflectBias;\nuniform float uReflectDistort;',
      )
      .replace(
        '#include <opaque_fragment>',
        `if ( uReflectStrength > 0.0 ) {
  vec3 rView = normalize( vViewPosition );
  float rNV = clamp( dot( normalize( normal ), rView ), 0.0, 1.0 );
  float rFres = 0.05 + 0.95 * pow( 1.0 - rNV, 5.0 );
  vec4 rc = vReflectCoord;
  rc.xy += normal.xy * uReflectDistort * rc.w;
  vec3 rCol = textureProj( tReflect, rc, uReflectBias ).rgb;
  float rAmt = clamp( ( 0.14 + rFres ) * uReflectStrength, 0.0, 0.85 );
  outgoingLight = mix( outgoingLight, rCol, rAmt );
}
#include <opaque_fragment>`,
      );
  };
  material.customProgramCacheKey = () => 'floor-planar-reflection';
  material.needsUpdate = true;
  return () => {
    material.onBeforeCompile = () => {};
    material.customProgramCacheKey = () => '';
    material.needsUpdate = true;
  };
}

/**
 * Gives the floor a true planar reflection of the room, the way polished and glazed tiles mirror
 * furniture, lamps and windows. The room is drawn once more from beneath the floor into a half-size
 * target; the floor material then blends that image in by Fresnel, so reflections strengthen at grazing
 * angles. The extra pass only runs for glossy finishes, and only when the camera or the scene changed.
 */
export function useFloorReflection(floorRef: RefObject<THREE.Mesh | null>, material: THREE.MeshStandardMaterial, settings: FloorReflectionSettings) {
  const uniforms = useMemo(
    () => ({
      tReflect: { value: null as THREE.Texture | null },
      uReflectMatrix: { value: new THREE.Matrix4() },
      uReflectStrength: { value: 0 },
      uReflectBias: { value: 1 },
      uReflectDistort: { value: 0.035 },
    }),
    [],
  );
  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  });

  // Teach the floor material to read the reflection
  useEffect(() => installReflectionShader(material, uniforms), [material, uniforms]);

  // The mirrored render
  const state = useRef({
    rt: null as THREE.WebGLRenderTarget | null,
    virtual: new THREE.PerspectiveCamera(),
    view: new THREE.Matrix4(),
    proj: new THREE.Matrix4(),
    epoch: -1,
    /** Any design change (wall paint, tile, finish …) keeps the reflection refreshing until this time, while React catches up. */
    dirtyUntil: 0,
    clear: new THREE.Color(),
    scratch: {
      pos: new THREE.Vector3(),
      look: new THREE.Vector3(),
      up: new THREE.Vector3(),
      rot: new THREE.Matrix4(),
      plane: new THREE.Plane(),
      clip: new THREE.Vector4(),
      q: new THREE.Vector4(),
    },
  });

  useEffect(() => {
    const st = state.current;
    const render = ({ gl, scene, camera }: PreRenderContext) => {
      const floor = floorRef.current;
      const { strength, blur } = settingsRef.current;
      const camY = camera.matrixWorld.elements[13];
      if (!floor || strength <= 0 || !renderFlags.reflections || camY < 0.03) {
        uniforms.uReflectStrength.value = 0;
        return;
      }
      uniforms.uReflectStrength.value = strength;
      uniforms.uReflectBias.value = blur;

      // Half-size target: reflections are soft by nature
      const dpr = gl.getPixelRatio();
      const size = gl.getSize(new THREE.Vector2());
      const w = Math.max(256, Math.min(1280, Math.round(size.x * dpr * 0.5)));
      const h = Math.max(256, Math.min(1280, Math.round(size.y * dpr * 0.5)));
      if (!st.rt || st.rt.width !== w || st.rt.height !== h) {
        st.rt?.dispose();
        st.rt = new THREE.WebGLRenderTarget(w, h, {
          type: THREE.HalfFloatType,
          generateMipmaps: true,
          minFilter: THREE.LinearMipmapLinearFilter,
          magFilter: THREE.LinearFilter,
        });
        st.epoch = -1;
      }
      uniforms.tReflect.value = st.rt.texture;

      const epoch = getSceneEpoch();
      const moved = !st.view.equals(camera.matrixWorld) || !st.proj.equals((camera as THREE.PerspectiveCamera).projectionMatrix);
      if (!moved && epoch === st.epoch && performance.now() > st.dirtyUntil) return;
      st.view.copy(camera.matrixWorld);
      st.proj.copy((camera as THREE.PerspectiveCamera).projectionMatrix);
      st.epoch = epoch;

      // Mirror the camera in the floor plane (y = 0)
      const { pos, look, up, rot, plane, clip, q } = st.scratch;
      const v = st.virtual;
      pos.setFromMatrixPosition(camera.matrixWorld);
      rot.extractRotation(camera.matrixWorld);
      look.set(0, 0, -1).applyMatrix4(rot).add(pos);
      up.set(0, 1, 0).applyMatrix4(rot);
      pos.y *= -1;
      look.y *= -1;
      up.y *= -1;
      v.position.copy(pos);
      v.up.copy(up);
      v.lookAt(look);
      v.layers.mask = camera.layers.mask;
      v.projectionMatrix.copy((camera as THREE.PerspectiveCamera).projectionMatrix);
      v.projectionMatrixInverse.copy((camera as THREE.PerspectiveCamera).projectionMatrixInverse);
      v.far = (camera as THREE.PerspectiveCamera).far;
      v.updateMatrixWorld();
      v.matrixWorldInverse.copy(v.matrixWorld).invert();

      // Texture matrix is built from the un-clipped projection
      uniforms.uReflectMatrix.value.copy(BIAS).multiply(v.projectionMatrix).multiply(v.matrixWorldInverse);

      // Oblique near plane so nothing beneath the floor is drawn (http://www.terathon.com/code/oblique.html)
      plane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 0));
      plane.applyMatrix4(v.matrixWorldInverse);
      clip.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
      const pm = v.projectionMatrix;
      q.x = (Math.sign(clip.x) + pm.elements[8]) / pm.elements[0];
      q.y = (Math.sign(clip.y) + pm.elements[9]) / pm.elements[5];
      q.z = -1;
      q.w = (1 + pm.elements[10]) / pm.elements[14];
      clip.multiplyScalar(2 / clip.dot(q));
      pm.elements[2] = clip.x;
      pm.elements[6] = clip.y;
      pm.elements[10] = clip.z + 1 - 0.003;
      pm.elements[14] = clip.w;

      // Draw the room as seen from beneath the floor, without the floor itself
      const prevTarget = gl.getRenderTarget();
      const prevAuto = gl.shadowMap.autoUpdate;
      const wasVisible = floor.visible;
      gl.getClearColor(st.clear);
      const prevAlpha = gl.getClearAlpha();
      gl.setClearColor(VOID, 1);
      floor.visible = false;
      gl.shadowMap.autoUpdate = false;
      gl.setRenderTarget(st.rt);
      gl.render(scene, v);
      gl.setRenderTarget(prevTarget);
      gl.shadowMap.autoUpdate = prevAuto;
      floor.visible = wasVisible;
      gl.setClearColor(st.clear, prevAlpha);
    };
    const off = registerPreRender(render);
    const offStore = useRoomStore.subscribe(() => {
      st.dirtyUntil = performance.now() + 600;
    });
    return () => {
      off();
      offStore();
      st.rt?.dispose();
      st.rt = null;
    };
  }, [floorRef, uniforms]);
}
