'use client';

import React, { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { OrbitControls } from '@react-three/drei';
import { useRoomStore } from '@/stores/roomStore';
import { onCameraZoom } from '@/three/cameraZoom';

const FT2M = 0.3048;

export function CameraEngine() {
  const { roomType, lengthFt, widthFt, heightFt, cameraPreset } = useRoomStore();
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const { camera } = useThree();

  const lengthM = lengthFt * FT2M;
  const widthM  = widthFt * FT2M;
  const heightM = heightFt * FT2M;

  const halfL = lengthM / 2;
  const halfW = widthM / 2;

  useEffect(() => {
    if (!controlsRef.current) return;
    const controls = controlsRef.current;

    switch (cameraPreset) {
      case 'eye-level':
        if (roomType === 'staircase') {
          camera.position.set(0, 1.7, halfW * 0.95);
          controls.target.set(0, 1.35, -halfW * 0.2);
        } else if (roomType === 'kitchen') {
          camera.position.set(0, 1.75, halfW * 1.05);
          controls.target.set(0, 1.15, -halfW * 0.2);
        } else if (roomType === 'bathroom') {
          camera.position.set(0, 1.58, halfW * 0.94);
          controls.target.set(0, 1.2, -halfW * 0.2);
        } else if (roomType === 'dining-room') {
          camera.position.set(0, 1.7, halfW * 1.05);
          controls.target.set(0, 1.0, -halfW * 0.2);
        } else if (roomType === 'bedroom') {
          camera.position.set(0, 1.6, halfW * 0.95);
          controls.target.set(0, 1.0, -halfW * 0.15);
        } else {
          camera.position.set(0, 1.55, halfW * 0.92);
          controls.target.set(0, 1.1, -halfW * 0.18);
        }
        break;

      case 'corner':
        if (roomType === 'staircase') {
          camera.position.set(halfL * 0.82, 1.85, halfW * 0.82);
          controls.target.set(-halfL * 0.12, 1.35, -halfW * 0.2);
        } else if (roomType === 'bedroom') {
          camera.position.set(halfL * 0.85, 1.7, halfW * 0.85);
          controls.target.set(-halfL * 0.1, 1.05, -halfW * 0.15);
        } else if (roomType === 'bathroom') {
          camera.position.set(halfL * 0.82, 1.85, halfW * 0.86);
          controls.target.set(-halfL * 0.18, 1.05, -halfW * 0.18);
        } else {
          camera.position.set(halfL * 0.82, 1.65, halfW * 0.82);
          controls.target.set(-halfL * 0.1, 1.0, -halfW * 0.15);
        }
        break;

      case 'floor':
        camera.position.set(0, 0.7, halfW * 0.86);
        controls.target.set(0, 0.05, -halfW * 0.15);
        break;

      case 'wall':
        camera.position.set(0, 1.5, halfW * 0.82);
        controls.target.set(0, heightM * 0.45, -halfW * 0.4);
        break;

      case 'top':
        camera.position.set(0, Math.max(lengthM, widthM) * 1.55, 0.001);
        controls.target.set(0, 0, 0);
        break;

      case 'walkthrough':
        camera.position.set(-halfL * 0.35, 1.5, halfW * 0.55);
        controls.target.set(halfL * 0.2, 1.25, -halfW * 0.25);
        break;

      default:
        camera.position.set(0, 1.5, halfW * 0.88);
        controls.target.set(0, 1.1, -halfW * 0.18);
        break;
    }

    controls.update();
  }, [cameraPreset, roomType, lengthFt, widthFt, heightFt, halfL, halfW, camera]);

  // Zoom +/− buttons in the toolbar: move the camera along its line to the target
  useEffect(
    () =>
      onCameraZoom((factor) => {
        const controls = controlsRef.current;
        if (!controls) return;
        const offset = camera.position.clone().sub(controls.target);
        const distance = Math.min(Math.max(offset.length() * factor, controls.minDistance), controls.maxDistance);
        camera.position.copy(controls.target).add(offset.setLength(distance));
        controls.update();
      }),
    [camera],
  );

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      minDistance={0.5}
      maxDistance={Math.max(lengthM, widthM) * 3}
      maxPolarAngle={Math.PI / 2.02}
      enableDamping
      dampingFactor={0.08}
    />
  );
}
