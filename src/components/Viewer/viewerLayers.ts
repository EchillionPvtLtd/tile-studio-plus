/**
 * Three.js layer for light glows and other additive effects. The renderer draws it with the scene
 * but leaves it out of the ambient-occlusion pre-pass, so a halo never darkens the wall behind it.
 */
export const FX_LAYER = 1;
