'use client';

import { useEffect, useState } from 'react';
import type { Tile } from '@/types/tile';
import type { PublicShopProfile } from '@/lib/shopProfile';

/**
 * The showroom's tile catalogue and public details for the full-screen 2D visualizer.
 * Without a `shopId` it is an anonymous demo: whatever the API offers, and no showroom details.
 */
export function useShopData(shopId: string) {
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [shop, setShop] = useState<PublicShopProfile | null>(null);

  useEffect(() => {
    let alive = true;
    const query = shopId ? `?shopId=${encodeURIComponent(shopId)}` : '';
    fetch(`/api/tiles${query}${query ? '&' : '?'}viz=2d`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => alive && setTiles(Array.isArray(data) ? (data as Tile[]) : []))
      .catch((err) => console.error('Failed to fetch showroom tiles:', err))
      .finally(() => alive && setIsLoading(false));
    fetch(`/api/shop/public${query}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((profile) => alive && setShop(profile))
      .catch(() => alive && setShop(null));
    return () => {
      alive = false;
    };
  }, [shopId]);

  return { tiles, isLoading, shop };
}
