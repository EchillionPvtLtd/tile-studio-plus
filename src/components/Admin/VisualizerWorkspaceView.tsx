'use client';

import React, { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import {
  Box,
  BrickWall,
  ChevronLeft,
  ChevronRight,
  FileText,
  Images,
  LayoutGrid,
  Maximize2,
  Minimize2,
  RotateCcw,
} from 'lucide-react';
import { useRoomStore } from '@/stores/roomStore';
import { ROOM_CONFIGS } from '@/types/room';
import { ThemeToggle } from '@/components/ThemeToggle';
import { cn } from '@/lib/utils';
import { useCatalogTiles, useShopProfile } from '@/components/Visualizer/hooks';
import { RoomPanel } from '@/components/Visualizer/RoomPanel';
import { FloorPanel } from '@/components/Visualizer/FloorPanel';
import { WallsPanel, normaliseWall } from '@/components/Visualizer/WallsPanel';
import { QuotePanel } from '@/components/Visualizer/QuotePanel';
import { CanvasToolbar } from '@/components/Visualizer/CanvasToolbar';
import { DownloadMenu3D } from '@/components/Visualizer/DownloadMenu3D';

const SceneCanvas = dynamic(
  () => import('@/components/Viewer/SceneCanvas').then((m) => m.SceneCanvas),
  { ssr: false, loading: () => <ViewerLoadingPlaceholder /> }
);

function ViewerLoadingPlaceholder() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-muted text-muted-foreground">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-foreground border-t-transparent" />
      <p className="text-xs font-medium">Loading 3D room…</p>
    </div>
  );
}

type StudioTab = 'room' | 'floor' | 'walls' | 'quote';

const TABS: { id: StudioTab; label: string; icon: typeof Box }[] = [
  { id: 'room', label: 'Room', icon: Box },
  { id: 'floor', label: 'Floor', icon: LayoutGrid },
  { id: 'walls', label: 'Walls', icon: BrickWall },
  { id: 'quote', label: 'Quote', icon: FileText },
];

const SURFACE_NAMES: Record<string, string> = {
  floor: 'Floor',
  'wall-n': 'North wall',
  'wall-s': 'South wall',
  'wall-e': 'East wall',
  'wall-w': 'West wall',
  backsplash: 'Backsplash',
  'shower-wall': 'Shower walls',
};

export function VisualizerWorkspaceView() {
  const store = useRoomStore();

  const [activeStudioTab, setActiveStudioTab] = useState<StudioTab>('room');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isCanvasExpanded, setIsCanvasExpanded] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const router = useRouter();
  const searchParams = useSearchParams();

  const shopId = searchParams?.get('shopId') || '';
  const { tiles, isLoading: isLoadingTiles } = useCatalogTiles(shopId);
  const shop = useShopProfile(shopId);

  // The Download menu only exists when the showroom switched it on in its settings
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const showDownloadError = (message: string) => {
    setDownloadError(message);
    setTimeout(() => setDownloadError(null), 6000);
  };

  // Phones and tablets start with the canvas visible; the studio opens on demand.
  useEffect(() => {
    if (window.innerWidth < 1024) setIsSidebarCollapsed(true);
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      const fs = !!document.fullscreenElement;
      setIsFullscreen(fs);
      if (fs) {
        sessionStorage.setItem('tileviz_fullscreen', 'true');
      } else {
        setIsCanvasExpanded(false);
        sessionStorage.setItem('tileviz_fullscreen', 'false');
      }
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);

    // Synchronize fullscreen state from document, query parameter, or sessionStorage
    const isFsActive = !!document.fullscreenElement;
    const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    const hasFsParam = searchParams.get('fullscreen') === 'true' || urlParams?.get('fullscreen') === 'true';
    const hasFsStorage = typeof window !== 'undefined' && sessionStorage.getItem('tileviz_fullscreen') === 'true';

    const shouldBeFullscreen = isFsActive || hasFsParam || hasFsStorage;

    if (shouldBeFullscreen) {
      setIsFullscreen(true);
      setIsCanvasExpanded(true);
      sessionStorage.setItem('tileviz_fullscreen', 'true');

      if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {
          // If browser requires user gesture to enter fullscreen, listen for first interaction
          const handleFirstClick = () => {
            if (sessionStorage.getItem('tileviz_fullscreen') === 'true' && !document.fullscreenElement) {
              if (document.documentElement.requestFullscreen) {
                document.documentElement.requestFullscreen().catch(() => {});
              }
            }
            window.removeEventListener('click', handleFirstClick);
          };
          window.addEventListener('click', handleFirstClick, { once: true });
        });
      }
    }

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, [searchParams]);

  const toggleExpandVisualizer = async () => {
    try {
      if (!document.fullscreenElement) {
        if (document.documentElement.requestFullscreen) {
          await document.documentElement.requestFullscreen();
        } else if (containerRef.current?.requestFullscreen) {
          await containerRef.current.requestFullscreen();
        }
        setIsFullscreen(true);
        setIsCanvasExpanded(true);
        setIsSidebarCollapsed(true);
        sessionStorage.setItem('tileviz_fullscreen', 'true');
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        }
        setIsFullscreen(false);
        setIsCanvasExpanded(false);
        sessionStorage.setItem('tileviz_fullscreen', 'false');
      }
    } catch {
      setIsCanvasExpanded((prev) => {
        const next = !prev;
        if (next) {
          setIsSidebarCollapsed(true);
          sessionStorage.setItem('tileviz_fullscreen', 'true');
        } else {
          sessionStorage.setItem('tileviz_fullscreen', 'false');
        }
        return next;
      });
    }
  };

  const openTab = (tab: StudioTab) => {
    setActiveStudioTab(tab);
    setIsSidebarCollapsed(false);
    if (tab === 'floor') store.setActiveSurface('floor');
    if (tab === 'walls') store.setActiveSurface(normaliseWall(store.activeSurface));
  };

  /** Phone bottom bar: tapping the open tab again closes the sheet so the room is fully visible. */
  const toggleTabFromBar = (tab: StudioTab) => {
    if (activeStudioTab === tab && !isSidebarCollapsed) {
      setIsSidebarCollapsed(true);
      return;
    }
    openTab(tab);
  };

  // The 2D visualizer of the same showroom, when the showroom has it (the public demo, with no showroom, has both)
  const otherAvailable = shop ? shop.access.viz2d : !shopId;
  const switchTo2D = () => {
    const keep = !!document.fullscreenElement || isFullscreen || sessionStorage.getItem('tileviz_fullscreen') === 'true';
    const params = new URLSearchParams();
    if (shopId) params.set('shopId', shopId);
    if (keep) params.set('fullscreen', 'true');
    const query = params.toString();
    router.push(query ? `/visualizer-2d?${query}` : '/visualizer-2d');
  };

  const goToShowroom = () => {
    if (shopId) {
      window.location.href = `/shop?shopId=${encodeURIComponent(shopId)}`;
    } else {
      window.location.href = '/shop';
    }
  };

  const roomLabel = ROOM_CONFIGS.find((r) => r.type === store.roomType)?.label ?? 'Room';
  const expanded = isCanvasExpanded || isFullscreen;
  const editing =
    activeStudioTab === 'floor'
      ? 'Floor'
      : activeStudioTab === 'walls'
        ? SURFACE_NAMES[normaliseWall(store.activeSurface)]
        : null;

  return (
    <div ref={containerRef} className="flex h-dvh select-none flex-col overflow-hidden bg-background text-foreground">
      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="z-30 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-card px-3 sm:px-4">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {/* Tile Studio Logo */}
          <button
            type="button"
            onClick={goToShowroom}
            className="flex items-center shrink-0 cursor-pointer rounded-lg p-1 -m-1 transition-opacity hover:opacity-80 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            title="Go back to Showroom"
            aria-label="Go back to Showroom"
          >
            <img
              src="/Logo/TS+.BK.png"
              alt="Tile Studio Plus+"
              className="h-7 w-auto object-contain dark:hidden select-none pointer-events-none"
            />
            <img
              src="/Logo/TS+.BG.png"
              alt="Tile Studio Plus+"
              className="h-7 w-auto object-contain hidden dark:block select-none pointer-events-none"
            />
          </button>

          {shop && (
            <>
              <span className="mx-1.5 hidden h-6 w-px bg-border/70 sm:block" />
              {shop.logoUrl && (
                <img
                  src={shop.logoUrl}
                  alt={shop.shopName}
                  className="h-9 w-9 sm:h-10 sm:w-10 shrink-0 rounded-xl border border-border bg-white object-cover shadow-2xs"
                />
              )}
              <span className="truncate text-sm sm:text-base font-bold text-foreground tracking-tight">
                {shop.shopName}
              </span>
            </>
          )}
        </div>

        <div className="hidden min-w-0 items-center gap-1.5 text-xs text-muted-foreground lg:flex">
          <span className="font-semibold text-foreground">{roomLabel}</span>
          {store.activeTemplate && (
            <>
              <span>·</span>
              <span className="truncate">{store.activeTemplate.name}</span>
            </>
          )}
        </div>

        <div className="flex flex-1 items-center justify-end gap-2">
          <button
            type="button"
            onClick={store.resetDesign}
            className="ds-btn ds-btn-outline w-9 px-0"
            title="Reset room to its default design"
            aria-label="Reset room"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
          {shop?.downloads.viz3d && <DownloadMenu3D shopName={shop.shopName} roomType={store.roomType} onQuote={() => openTab('quote')} onError={showDownloadError} />}
          {otherAvailable && (
            <button type="button" onClick={switchTo2D} className="ds-btn ds-btn-outline w-9 px-0 sm:w-auto sm:px-3.5" title="Open the 2D visualizer" aria-label="Open the 2D visualizer">
              <Images className="h-4 w-4" />
              <span className="hidden sm:inline">2D</span>
            </button>
          )}
          <ThemeToggle scope="shop" ownerId={shopId || undefined} iconOnly />
          <button
            type="button"
            onClick={toggleExpandVisualizer}
            className={cn('ds-btn w-9 px-0', expanded ? 'ds-btn-primary' : 'ds-btn-outline')}
            title={expanded ? 'Exit fullscreen (Esc)' : 'Fullscreen'}
            aria-label={expanded ? 'Exit fullscreen' : 'Fullscreen'}
          >
            {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
        </div>
      </header>

      {downloadError && (
        <div role="alert" className="pointer-events-none fixed inset-x-0 top-16 z-50 flex justify-center px-4">
          <p className="max-w-md rounded-xl bg-destructive-muted px-4 py-2 text-center text-xs font-medium text-destructive shadow-elevated">{downloadError}</p>
        </div>
      )}

      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {/* Floating open button for mobile when panel is collapsed */}
        {isSidebarCollapsed && (
          <button
            type="button"
            onClick={() => setIsSidebarCollapsed(false)}
            className="fixed bottom-4 left-4 z-40 flex md:hidden items-center gap-1.5 rounded-full border border-border bg-card/95 px-3.5 py-2 text-xs font-semibold text-foreground shadow-lg backdrop-blur-sm cursor-pointer"
            aria-label="Open studio panel"
          >
            <ChevronRight className="h-4 w-4 stroke-[2.5]" />
            <span>Studio</span>
          </button>
        )}

        {/* ── Studio sidebar ─────────────────────────────────────── */}
        {/* Phone: bottom sheet · Tablet: left drawer over the canvas · Desktop: docked column */}
        <aside
          className={cn(
            'absolute z-20 flex shrink-0 flex-col border-border bg-card shadow-elevated transition-[margin,transform] duration-300 overflow-visible',
            'inset-x-0 bottom-0 h-[62%] rounded-t-2xl border-t',
            'md:inset-y-0 md:left-0 md:right-auto md:bottom-auto md:h-auto md:w-[360px] md:rounded-none md:border-r md:border-t-0',
            'lg:relative lg:shadow-none',
            isSidebarCollapsed
              ? 'translate-y-full md:translate-y-0 md:-translate-x-full lg:translate-x-0 lg:-ml-[360px]'
              : 'translate-y-0 md:translate-x-0',
          )}
          aria-hidden={isSidebarCollapsed}
        >
          {/* ── FLOATING EDGE ARROW HANDLE (Mounted on Sidebar Outer Edge) ── */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => setIsSidebarCollapsed((c) => !c)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') setIsSidebarCollapsed((c) => !c);
            }}
            aria-label={isSidebarCollapsed ? 'Click to show studio panel' : 'Click to hide studio panel'}
            className="absolute left-[calc(100%-1px)] top-16 z-50 hidden md:flex h-12 w-6 items-center justify-center rounded-r-lg border border-l-0 border-border bg-card text-muted-foreground shadow-sm hover:w-7 hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-all duration-150 cursor-pointer select-none"
            title={isSidebarCollapsed ? 'Show studio panel' : 'Hide studio panel'}
          >
            {!isSidebarCollapsed ? (
              <ChevronLeft className="h-4 w-4 pointer-events-none" />
            ) : (
              <ChevronRight className="h-4 w-4 pointer-events-none" />
            )}
          </div>

          <button
            type="button"
            onClick={() => setIsSidebarCollapsed(true)}
            className="flex h-6 w-full shrink-0 items-center justify-center md:hidden cursor-pointer"
            aria-label="Close studio panel"
          >
            <span className="h-1 w-10 rounded-full bg-border" />
          </button>

          <nav className="hidden shrink-0 grid-cols-4 gap-1 border-b border-border p-2 md:grid" role="tablist" aria-label="Studio">
            {TABS.map((t) => {
              const Icon = t.icon;
              const active = activeStudioTab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => openTab(t.id)}
                  className={cn(
                    'flex flex-col items-center gap-1 rounded-xl py-2 text-2xs font-semibold transition-colors',
                    active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {t.label}
                </button>
              );
            })}
          </nav>

          <div className="custom-scrollbar min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain p-4 pb-8">
            {activeStudioTab === 'room' && <RoomPanel />}
            {activeStudioTab === 'floor' && <FloorPanel tiles={tiles} isLoading={isLoadingTiles} />}
            {activeStudioTab === 'walls' && <WallsPanel tiles={tiles} isLoading={isLoadingTiles} />}
            {activeStudioTab === 'quote' && <QuotePanel shop={shop} onBrowseTiles={() => openTab('floor')} />}
          </div>
        </aside>

        {/* ── 3D canvas ─────────────────────────────────────────── */}
        <main className="viewer-bg canvas-container relative h-full flex-1 overflow-hidden">
          <SceneCanvas />

          {editing && (
            <div
              className={cn(
                'pointer-events-none absolute left-4 top-4 z-10 flex items-center gap-2 rounded-full border border-border bg-card/90 px-3 py-1.5 text-xs shadow-sm backdrop-blur',
                !isSidebarCollapsed && 'md:max-lg:left-[376px]',
              )}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-foreground" />
              <span className="text-muted-foreground">Editing</span>
              <span className="font-semibold text-foreground">{editing}</span>
            </div>
          )}

          {/* On tablets the studio drawer overlays the canvas, so keep the controls clear of it. */}
          <CanvasToolbar className={!isSidebarCollapsed ? "md:max-lg:pl-[376px]" : undefined} />
        </main>
      </div>

      {/* ── Phone tab bar (thumb reach) ─────────────────────────── */}
      <nav
        className="grid shrink-0 grid-cols-4 border-t border-border bg-card pb-[env(safe-area-inset-bottom)] md:hidden"
        aria-label="Studio"
      >
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = activeStudioTab === t.id && !isSidebarCollapsed;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => toggleTabFromBar(t.id)}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex h-14 flex-col items-center justify-center gap-1 text-2xs font-semibold transition-colors',
                active ? 'text-foreground' : 'text-muted-foreground',
              )}
            >
              <span className={cn('flex h-7 w-12 items-center justify-center rounded-full transition-colors', active && 'bg-primary text-primary-foreground')}>
                <Icon className="h-4 w-4" />
              </span>
              {t.label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
