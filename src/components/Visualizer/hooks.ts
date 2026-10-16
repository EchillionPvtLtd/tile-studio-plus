'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRoomStore } from '@/stores/roomStore';
import { SAMPLE_TILES } from '@/data/sampleTiles';
import type { Tile } from '@/types/tile';
import type { PublicShopProfile } from '@/lib/shopProfile';

/** Showroom tiles from the API plus any built-in samples, loaded once for every panel. */
export function useCatalogTiles(shopId: string) {
  const [dbTiles, setDbTiles] = useState<Tile[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setIsLoading(true);
        const res = await fetch(shopId ? `/api/tiles?shopId=${encodeURIComponent(shopId)}&viz=3d` : '/api/tiles?viz=3d');
        if (!res.ok) return;
        const data: Tile[] = await res.json();
        if (!alive) return;
        setDbTiles(data);
        // Give an untouched room a real floor straight away.
        if (!useRoomStore.getState().floorTile && data.length > 0) {
          useRoomStore.getState().setTileForSurface('floor', data[0]);
        }
      } catch (err) {
        console.error('Failed to fetch showroom tiles:', err);
      } finally {
        if (alive) setIsLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [shopId]);

  const tiles = useMemo(() => {
    const all: Tile[] = [...dbTiles];
    for (const st of SAMPLE_TILES) {
      if (all.some((t) => t.sku === st.sku)) continue;
      all.push({ ...st, id: st.sku, createdAt: new Date().toISOString() } as Tile);
    }
    return all;
  }, [dbTiles]);

  return { tiles, isLoading };
}

/** Public identity of the showroom running the visualizer (null for anonymous demos). */
export function useShopProfile(shopId: string) {
  const [profile, setProfile] = useState<PublicShopProfile | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(shopId ? `/api/shop/public?shopId=${encodeURIComponent(shopId)}` : '/api/shop/public')
      .then((r) => (r.ok ? r.json() : null))
      .then((p) => alive && setProfile(p))
      .catch(() => alive && setProfile(null));
    return () => {
      alive = false;
    };
  }, [shopId]);

  return profile;
}
