'use client';

import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { wallTransform, type Opening } from './roomLayout';

/** Direction and strength of the light that comes through a window. */
export interface SunBeam {
  /** Degrees the beam travels downward as it enters the room. */
  elevationDeg: number;
  /** Degrees it slants along the wall, so the patch is never perfectly square-on. */
  skewDeg: number;
  intensity: number;
  color: string;
}

/** Slim black steel window layout shared with SteelWindow: a centre mullion and, when clear, a transom at 72% height. */
const MULLION = 0.022;
const TRANSOM_AT = 0.72;

/** Window pane rectangles in the opening's local frame (x along the wall from centre, y up from the sill). */
function paneRects(width: number, height: number, frosted: boolean): [number, number, number, number][] {
  const xs: [number, number][] = [
    [-width / 2, -MULLION / 2],
    [MULLION / 2, width / 2],
  ];
  const ys: [number, number][] = frosted
    ? [[0, height]]
    : [
        [0, height * TRANSOM_AT - MULLION / 2],
        [height * TRANSOM_AT + MULLION / 2, height],
      ];
  return xs.flatMap(([x0, x1]) => ys.map(([y0, y1]) => [x0, y0, x1, y1] as [number, number, number, number]));
}

function buildBeam(opening: Opening, halfL: number, halfW: number, frosted: boolean, beam: SunBeam) {
  const tf = wallTransform(opening.wall, opening.offset, opening.sill, halfL, halfW, 0);
  const rot = new THREE.Matrix4().makeRotationY(tf.rotation[1]);
  const origin = new THREE.Vector3(...tf.position);
  const toWorld = (x: number, y: number) => new THREE.Vector3(x, y, 0).applyMatrix4(rot).add(origin);

  const centre = toWorld(0, opening.height / 2);
  const inward = new THREE.Vector3(0, 0, 1).applyMatrix4(rot);
  const along = new THREE.Vector3(1, 0, 0).applyMatrix4(rot);
  const el = THREE.MathUtils.degToRad(beam.elevationDeg);
  const sk = THREE.MathUtils.degToRad(beam.skewDeg);
  const dir = inward
    .clone()
    .multiplyScalar(Math.cos(el))
    .add(new THREE.Vector3(0, -Math.sin(el), 0))
    .add(along.clone().multiplyScalar(Math.sin(sk) * Math.cos(el)))
    .normalize();

  // The light sits outside the wall, looking back through the window
  const position = centre.clone().addScaledVector(dir, -4);
  const cam = new THREE.PerspectiveCamera(60, 1, 0.1, 60);
  cam.position.copy(position);
  cam.lookAt(centre);
  cam.updateMatrixWorld();
  cam.updateProjectionMatrix();

  const quads = paneRects(opening.width, opening.height, frosted).map(([x0, y0, x1, y1]) => [
    toWorld(x0, y0),
    toWorld(x1, y0),
    toWorld(x1, y1),
    toWorld(x0, y1),
  ]);

  // Cone wide enough that the whole window sits inside its inscribed circle (the spot's edge is round, its mask square)
  let rmax = 0;
  quads.flat().forEach((p) => {
    const n = p.clone().project(cam);
    rmax = Math.max(rmax, Math.hypot(n.x, n.y));
  });
  const angle = Math.min(Math.atan((Math.tan(THREE.MathUtils.degToRad(30)) * rmax) / 0.8), 1.2);
  cam.fov = THREE.MathUtils.radToDeg(angle) * 2;
  cam.updateProjectionMatrix();

  // The mask: white where light passes through glass, black elsewhere, softened a touch like a real sun disc
  const S = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, S, S);
  ctx.filter = `blur(${(S * 0.003).toFixed(1)}px)`;
  ctx.fillStyle = '#fff';
  quads.forEach((q) => {
    ctx.beginPath();
    q.forEach((p, i) => {
      const n = p.clone().project(cam);
      const px = (n.x * 0.5 + 0.5) * S;
      const py = (1 - (n.y * 0.5 + 0.5)) * S;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.closePath();
    ctx.fill();
  });
  const gobo = new THREE.CanvasTexture(canvas);
  gobo.colorSpace = THREE.SRGBColorSpace;
  gobo.generateMipmaps = false;
  gobo.minFilter = THREE.LinearFilter;

  return { position: position.toArray() as [number, number, number], target: centre.toArray() as [number, number, number], angle, gobo };
}

/**
 * Direct sunlight (or moonlight) that only reaches the room through the window panes. A shadow-casting
 * spot light shines through a mask shaped like the glazing, so the floor gets a real patch of light
 * crossed by the mullion shadows, and furniture and curtains shade it.
 */
export function WindowSun({ opening, halfL, halfW, frosted = false, beam }: { opening: Opening; halfL: number; halfW: number; frosted?: boolean; beam: SunBeam }) {
  const { wall, offset, width, height, sill } = opening;
  const { elevationDeg, skewDeg } = beam;
  const built = useMemo(
    () => buildBeam({ wall, offset, width, height, sill }, halfL, halfW, frosted, { elevationDeg, skewDeg, intensity: 0, color: '#fff' }),
    [wall, offset, width, height, sill, halfL, halfW, frosted, elevationDeg, skewDeg],
  );
  useEffect(() => () => built.gobo.dispose(), [built]);
  const target = useMemo(() => new THREE.Object3D(), []);

  return (
    <>
      <primitive object={target} position={built.target} />
      <spotLight
        position={built.position}
        target={target}
        angle={built.angle}
        penumbra={0}
        decay={0}
        distance={40}
        intensity={beam.intensity}
        color={beam.color}
        map={built.gobo}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
        shadow-camera-near={0.3}
      />
    </>
  );
}
