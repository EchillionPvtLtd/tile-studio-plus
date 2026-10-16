/**
 * Where a label or a tick goes on each surface: the point deepest inside it, farthest from its edge and from the edge of the
 * photo, so that it plainly sits on that surface and not on its rim or on the furniture next to it.
 *
 * `labels` is the click map (index + 1 of the facet at each point, 0 where there is none), `facets` the facet indices of every
 * surface group. A group with no pixels in the map is left out. Points are in photo coordinates (0..1).
 */
export function groupAnchors(labels: Uint8Array, width: number, height: number, facets: Record<string, number[]>): Record<string, [number, number]> {
  const out: Record<string, [number, number]> = {};
  const n = width * height;
  if (!width || !height || labels.length < n) return out;
  const dist = new Int32Array(n);
  const FAR = 1 << 20;

  for (const [id, list] of Object.entries(facets)) {
    const member = new Uint8Array(256);
    for (const f of list) if (f >= 0 && f + 1 < 256) member[f + 1] = 1;

    let any = false;
    for (let i = 0; i < n; i++) {
      if (member[labels[i]]) {
        dist[i] = FAR;
        any = true;
      } else dist[i] = 0;
    }
    if (!any) continue;

    // Chamfer 3-4 distance to the nearest point that is not on the surface; outside the photo counts as not on it
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        if (!dist[i]) continue;
        const up = y > 0 ? dist[i - width] : 0;
        const left = x > 0 ? dist[i - 1] : 0;
        const upLeft = x > 0 && y > 0 ? dist[i - width - 1] : 0;
        const upRight = x < width - 1 && y > 0 ? dist[i - width + 1] : 0;
        dist[i] = Math.min(dist[i], up + 3, left + 3, upLeft + 4, upRight + 4);
      }
    }
    let best = -1;
    let bestAt = 0;
    for (let y = height - 1; y >= 0; y--) {
      for (let x = width - 1; x >= 0; x--) {
        const i = y * width + x;
        if (!dist[i]) continue;
        const down = y < height - 1 ? dist[i + width] : 0;
        const right = x < width - 1 ? dist[i + 1] : 0;
        const downRight = x < width - 1 && y < height - 1 ? dist[i + width + 1] : 0;
        const downLeft = x > 0 && y < height - 1 ? dist[i + width - 1] : 0;
        dist[i] = Math.min(dist[i], down + 3, right + 3, downRight + 4, downLeft + 4);
        // Scanning from the bottom right, `>=` leaves the top-most, left-most point of a ridge of equally deep points
        if (dist[i] >= best) {
          best = dist[i];
          bestAt = i;
        }
      }
    }
    out[id] = [((bestAt % width) + 0.5) / width, (Math.floor(bestAt / width) + 0.5) / height];
  }
  return out;
}
