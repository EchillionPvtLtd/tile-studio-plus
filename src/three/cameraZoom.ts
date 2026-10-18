/**
 * The +/− buttons live in the page toolbar, outside the Canvas, while the camera lives inside it.
 * The toolbar calls zoomCamera(); the camera controls subscribe with onCameraZoom().
 */
type Listener = (factor: number) => void;
const listeners = new Set<Listener>();

/** factor < 1 moves the camera closer to what it is looking at, > 1 moves it away. */
export function zoomCamera(factor: number) {
  listeners.forEach((fn) => fn(factor));
}

export function onCameraZoom(fn: Listener) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
