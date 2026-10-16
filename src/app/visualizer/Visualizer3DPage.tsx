'use client';

import React, { useEffect, Suspense } from 'react';
import { VisualizerWorkspaceView } from '@/components/Admin/VisualizerWorkspaceView';
import { useAdminStore } from '@/stores/adminStore';

/** The 3D visualizer, full screen. The server page in front of it has already checked that this showroom may use it. */
export function Visualizer3DPage() {
  const { initLogoUrl } = useAdminStore();

  useEffect(() => {
    initLogoUrl();
  }, [initLogoUrl]);

  return (
    <div className="h-dvh w-screen overflow-hidden bg-background font-sans text-foreground antialiased">
      <Suspense fallback={<div className="h-dvh w-screen bg-background" />}>
        <VisualizerWorkspaceView />
      </Suspense>
    </div>
  );
}
