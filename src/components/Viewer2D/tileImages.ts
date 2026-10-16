import { tileKey } from '@/lib/viz2d/design';
import type { TileSnapshot } from '@/lib/viz2d/types';

/** Images on this site load directly; anything else goes through the tile proxy, which makes it safe to read pixels from. */
export function tileImageUrl(url: string): string {
  if (!url || url.startsWith('/') || url.startsWith('data:') || url.startsWith('blob:')) return url;
  return `/api/tiles/proxy?url=${encodeURIComponent(url)}`;
}

const cache = new Map<string, Promise<ImageBitmap>>();

/** Loads a tile's picture once; the result is shared by every surface and every room that uses the tile. */
export function loadTileBitmap(tile: Pick<TileSnapshot, 'id' | 'textureUrl'>): Promise<ImageBitmap> {
  const key = tileKey(tile);
  const hit = cache.get(key);
  if (hit) return hit;
  const promise = (async () => {
    const res = await fetch(tileImageUrl(tile.textureUrl));
    if (!res.ok) throw new Error(`The tile image could not be loaded (${res.status})`);
    return createImageBitmap(await res.blob());
  })();
  cache.set(key, promise);
  promise.catch(() => cache.delete(key)); // try again next time
  return promise;
}
