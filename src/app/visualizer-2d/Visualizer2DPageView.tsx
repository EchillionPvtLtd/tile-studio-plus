'use client';

import React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Visualizer2DWorkspace } from '@/components/Viewer2D/Visualizer2DWorkspace';
import { useShopData } from '@/components/Viewer2D/useShopData';
import { saveDesign2D } from '@/actions/viz2d';
import { deleteRoom2D, saveRoom2D } from '@/actions/rooms2d';
import type { RoomScene } from '@/lib/viz2d/types';

interface Visualizer2DPageViewProps {
  shopId: string;
  /** The rooms this showroom added itself. */
  customRooms: RoomScene[];
  /** The signed-in showroom that owns this page: it may add rooms and its saved designs are recorded in its account. */
  isOwner: boolean;
}

/** The 2D visualizer as a page of its own, mirroring the 3D visualizer layout with unified header and hidable studio drawer. */
export function Visualizer2DPageView({ shopId, customRooms, isOwner }: Visualizer2DPageViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { tiles, isLoading, shop } = useShopData(shopId);

  const backToShowroom = () => {
    const isFs = typeof document !== 'undefined' && !!document.fullscreenElement;
    router.push(isFs ? '/shop?tab=visualizer-2d&fullscreen=true' : '/shop?tab=visualizer-2d');
  };

  const otherAvailable = shop ? shop.access.viz3d : !shopId;
  const switchTo3D = () => {
    const isFs = typeof document !== 'undefined' && !!document.fullscreenElement;
    const params = new URLSearchParams();
    if (shopId) params.set('shopId', shopId);
    if (isFs) params.set('fullscreen', 'true');
    const query = params.toString();
    router.push(query ? `/visualizer?${query}` : '/visualizer');
  };

  return (
    <div className="h-dvh w-screen overflow-hidden bg-background font-sans text-foreground antialiased">
      <Visualizer2DWorkspace
        tiles={tiles}
        isLoadingTiles={isLoading}
        shop={shop}
        shopId={shopId}
        isOwner={isOwner}
        onBackToShowroom={isOwner ? backToShowroom : undefined}
        onSwitchTo3D={otherAvailable ? switchTo3D : undefined}
        customRooms={customRooms}
        onSaveRemote={isOwner ? saveDesign2D : undefined}
        onSaveRoom={isOwner ? saveRoom2D : undefined}
        onDeleteRoom={isOwner ? deleteRoom2D : undefined}
        allowDownload={!!shop?.downloads.viz2d}
        className="h-full w-full"
      />
    </div>
  );
}
