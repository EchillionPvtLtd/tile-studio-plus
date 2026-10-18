export type Quality = 'low' | 'high';

/**
 * Touch devices (phones, tablets) and low-spec machines get lighter 3D settings: no antialiasing,
 * no extra pixel density, smaller shadow maps and fewer accent lights. That keeps the shader
 * compile and every frame light enough for a small tablet's GPU.
 */
export function detectQuality(): Quality {
  if (typeof window === 'undefined') return 'high';
  const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
  const nav = navigator as Navigator & { deviceMemory?: number };
  const weakDevice = (nav.deviceMemory ?? 8) <= 4 || (navigator.hardwareConcurrency ?? 8) <= 4;
  return coarsePointer || weakDevice ? 'low' : 'high';
}
