import type * as THREE from 'three';

/** The longest to wait for shaders: a driver that never reports ready must not keep a timer polling for ever. */
const MAX_WAIT_MS = 60_000;

type ProgramHolder = { currentProgram?: { isReady(): boolean } };

/**
 * `renderer.compileAsync` with one difference: a material that is disposed while its shader is still compiling is
 * simply no longer waited for.
 *
 * three.js polls each material's program from a timer and throws (outside of anything that can catch it) when a
 * material was disposed meanwhile, because its program is gone ("Cannot read properties of undefined (reading
 * 'isReady')"). Here the room and its furniture change all the time, so a model being replaced or the room switched
 * during the first compile triggered it. Resolves when every material that still exists is ready.
 */
export function compileSafely(gl: THREE.WebGLRenderer, scene: THREE.Object3D, camera: THREE.Camera, targetScene?: THREE.Scene | null): Promise<void> {
  const materials = gl.compile(scene, camera, targetScene ?? undefined);
  const started = Date.now();
  return new Promise((resolve) => {
    const check = () => {
      materials.forEach((material) => {
        const program = (gl.properties.get(material) as ProgramHolder | undefined)?.currentProgram;
        // no program: the material was disposed meanwhile, so there is nothing left to wait for
        if (!program || program.isReady()) materials.delete(material);
      });
      if (materials.size === 0 || Date.now() - started > MAX_WAIT_MS) resolve();
      else setTimeout(check, 10);
    };
    check();
  });
}
