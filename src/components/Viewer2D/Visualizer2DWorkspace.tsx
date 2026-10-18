'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Box,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Columns2,
  Images,
  Info,
  Layers,
  Maximize2,
  Minimize2,
  Paintbrush,
  Redo2,
  RotateCcw,
  Undo2,
  X,
} from 'lucide-react';
import { BUILTIN_ROOMS } from '@/data/rooms2d';
import { buildGroups, sanitizeDesign, snapshotTile } from '@/lib/viz2d/design';
import type { ShopProfile } from '@/lib/quotationPdf';
import type { Design, PolygonShape, RoomScene, SurfaceDef } from '@/lib/viz2d/types';
import { roomKindLabel, type RoomKind } from '@/lib/viz2d/roomKinds';
import { thumbUrlOf } from '@/lib/viz2d/roomSchema';
import type { Tile } from '@/types/tile';
import { cn } from '@/lib/utils';
import { ThemeToggle } from '@/components/ThemeToggle';
import { TileCatalog } from '@/components/Visualizer/TileCatalog';
import { dataFromDraft, draftFromFile, draftFromRoom, sceneFromDraft } from './editor/drafts';
import { selectDraft, useRoomEditor, type EditorDraft } from './editor/editorStore';
import { EditorHint } from './editor/EditorHint';
import { RoomEditorPanel } from './editor/RoomEditorPanel';
import { useEditorBridge } from './editor/useEditorBridge';
import { DesignPanel } from './panels/DesignPanel';
import { DownloadMenu } from './panels/DownloadMenu';
import { RoomsPanel } from './panels/RoomsPanel';
import type { RemoteSaveResult } from './panels/SavePanel';
import { loadRoom, type LoadedRoom } from './roomLoader';
import { loadAutosave, saveAutosave, savedDesignFits, type SavedDesign2D } from './savedDesigns';
import { Stage, type StageHandle } from './Stage';
import { currentDesign, selectCanRedo, selectCanUndo, useViz2D } from './store';

export type PanelTab = 'rooms' | 'design' | 'collections';

/** The stand-in ids of a room while it is being added or edited: nothing is kept for them. */
const isEditingScene = (id: string) => id.startsWith('draft-') || id.startsWith('edit-');

export const TABS: { id: PanelTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'rooms', label: 'Room', icon: Images },
  { id: 'design', label: 'Design', icon: Paintbrush },
  { id: 'collections', label: 'Collections', icon: Layers },
];

export interface SaveRoomRequest {
  id?: string;
  name: string;
  roomType: RoomKind;
  imageUrl: string;
  width: number;
  height: number;
  data: { surfaces: SurfaceDef[]; occluders: PolygonShape[] };
}

export interface Visualizer2DWorkspaceProps {
  /** The showroom's tile catalogue. */
  tiles: Tile[];
  isLoadingTiles?: boolean;
  /** Showroom details for quotation and header branding. */
  shop?: ShopProfile | null;
  shopId?: string;
  isOwner?: boolean;
  onBackToShowroom?: () => void;
  onSwitchTo3D?: () => void;
  /** Rooms the showroom added itself (photos with surfaces they marked). */
  customRooms?: RoomScene[];
  /** Records a saved design in the showroom's account. Omit when nobody is signed in. */
  onSaveRemote?: (input: { roomId: string; design: Design; thumbnail: string; name: string }) => Promise<RemoteSaveResult>;
  /** Saves a room the showroom added. When omitted, rooms cannot be added or edited. */
  onSaveRoom?: (input: SaveRoomRequest) => Promise<{ success: boolean; message?: string; id?: string }>;
  onDeleteRoom?: (id: string) => Promise<{ success: boolean; message?: string }>;
  /** Whether the Download button is shown. A showroom switches this in its settings. */
  allowDownload?: boolean;
  className?: string;
}

export function Visualizer2DWorkspace({
  tiles,
  isLoadingTiles = false,
  shop = null,
  shopId,
  isOwner = false,
  onBackToShowroom,
  onSwitchTo3D,
  customRooms = [],
  onSaveRemote,
  onSaveRoom,
  onDeleteRoom,
  allowDownload = true,
  className,
}: Visualizer2DWorkspaceProps) {
  // A room that was just saved shows at once, before the page has been refreshed with it
  const [pendingRooms, setPendingRooms] = useState<RoomScene[]>([]);
  const rooms = useMemo(
    () => [...BUILTIN_ROOMS, ...customRooms, ...pendingRooms.filter((p) => !customRooms.some((c) => c.id === p.id))],
    [customRooms, pendingRooms]
  );
  useEffect(() => {
    // Forget the stand-ins once the real rooms have arrived
    setPendingRooms((list) =>
      list.some((p) => customRooms.some((c) => c.id === p.id))
        ? list.filter((p) => !customRooms.some((c) => c.id === p.id))
        : list
    );
  }, [customRooms]);

  const editingDraft = useRoomEditor(selectDraft);
  const editing = !!editingDraft;
  const roomId = useViz2D((s) => s.roomId);
  const design = useViz2D(currentDesign);
  const canUndo = useViz2D(selectCanUndo);
  const canRedo = useViz2D(selectCanRedo);
  const compare = useViz2D((s) => s.compare);
  const notice = useViz2D((s) => s.notice);

  const room = useMemo(() => rooms.find((r) => r.id === roomId) ?? null, [rooms, roomId]);
  const roomsRef = useRef(rooms);
  useEffect(() => {
    roomsRef.current = rooms;
  }, [rooms]);

  const [tab, setTab] = useState<PanelTab>('rooms');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isCanvasExpanded, setIsCanvasExpanded] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<StageHandle>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const panelScroll = useRef<HTMLDivElement>(null);
  const roomBeforeEditing = useRef<string | null>(null);

  // Phones and tablets start with canvas visible; studio drawer opens on demand
  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      setIsSidebarCollapsed(true);
    }
  }, []);

  // ── Start: restore work in progress, or open first room ─────────────
  useEffect(() => {
    const store = useViz2D.getState();
    if (store.roomId && rooms.some((r) => r.id === store.roomId)) return;
    const auto = loadAutosave(rooms);
    auto.designs.forEach((d) => store.hydrate(d));
    const start = auto.roomId && rooms.some((r) => r.id === auto.roomId) ? auto.roomId : rooms[0]?.id;
    if (start) store.setRoom(start);
    if (auto.designs.length) setTab('design');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep work in progress so refresh doesn't lose it
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const unsub = useViz2D.subscribe((s, prev) => {
      if (s.histories === prev.histories && s.roomId === prev.roomId) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        const designs: Record<string, Design> = {};
        for (const [id, h] of Object.entries(s.histories)) if (!isEditingScene(id)) designs[id] = h.present;
        const photos: Record<string, string> = {};
        for (const id of Object.keys(designs)) {
          const src = roomsRef.current.find((r) => r.id === id)?.image.src;
          if (src) photos[id] = src;
        }
        saveAutosave(designs, s.roomId && !isEditingScene(s.roomId) ? s.roomId : null, photos);
      }, 600);
    });
    return () => {
      clearTimeout(timer);
      unsub();
    };
  }, []);

  // ── Room drawing draft ───────────────────────────────────────────
  const [draftScene, setDraftScene] = useState<RoomScene | null>(null);
  useEffect(() => {
    if (!editingDraft) {
      setDraftScene(null);
      return;
    }
    const t = setTimeout(() => setDraftScene(sceneFromDraft(editingDraft)), draftScene ? 300 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingDraft]);

  const shownRoom = editing ? draftScene : room;
  const [loaded, setLoaded] = useState<LoadedRoom | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!shownRoom) return;
    let alive = true;
    setLoading(true);
    setError(null);
    loadRoom(shownRoom)
      .then((l) => {
        if (!alive) return;
        setLoaded(l);
        setLoading(false);
      })
      .catch((e) => {
        if (!alive) return;
        setError(e instanceof Error ? e.message : 'The room could not be loaded.');
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [shownRoom, attempt]);

  const stageRoom = loaded && shownRoom && loaded.room.id === shownRoom.id ? loaded : null;
  const groups = useMemo(() => (room ? buildGroups(room) : []), [room]);
  const bridge = useEditorBridge(stageRoom?.image ?? null);

  useEffect(() => {
    panelScroll.current?.scrollTo({ top: 0 });
  }, [tab, editing]);

  const selectedCount = useViz2D((s) => s.selected.length);
  useEffect(() => {
    if (selectedCount > 0 && !editing) {
      setTab('design');
      setIsSidebarCollapsed(false);
    }
  }, [selectedCount, editing]);

  // Notices auto-dismiss
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => useViz2D.getState().dismissNotice(), notice.kind === 'error' ? 8000 : 4500);
    return () => clearTimeout(t);
  }, [notice]);

  // Keyboard undo/redo/escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (useRoomEditor.getState().history) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      const store = useViz2D.getState();
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) store.redo();
        else store.undo();
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        store.redo();
      } else if (e.key === 'Escape') {
        if (store.compare) store.setCompare(false);
        else store.clearSelection();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Fullscreen sync
  useEffect(() => {
    const onChange = () => {
      const fs = !!document.fullscreenElement;
      setFullscreen(fs);
      if (!fs) setIsCanvasExpanded(false);
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggleExpandVisualizer = async () => {
    try {
      if (!document.fullscreenElement) {
        if (containerRef.current?.requestFullscreen) {
          await containerRef.current.requestFullscreen();
        }
        setFullscreen(true);
        setIsCanvasExpanded(true);
        setIsSidebarCollapsed(true); // Auto-hide sidebar to give full immersion!
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        }
        setFullscreen(false);
        setIsCanvasExpanded(false);
      }
    } catch {
      setIsCanvasExpanded((prev) => {
        const next = !prev;
        if (next) setIsSidebarCollapsed(true);
        return next;
      });
    }
  };

  /**
   * Tapping the active tab button while sidebar is open HIDES it (disappears!),
   * exactly like in the 3D visualizer studio. Tapping when closed opens it!
   */
  const handleTabClick = (tId: PanelTab) => {
    if (tab === tId && !isSidebarCollapsed) {
      setIsSidebarCollapsed(true);
    } else {
      setTab(tId);
      setIsSidebarCollapsed(false);
    }
  };


  const startEditing = useCallback((draft: EditorDraft) => {
    const store = useViz2D.getState();
    roomBeforeEditing.current = store.roomId;
    store.setCompare(false);
    store.setRoom(draft.sceneId);
    useRoomEditor.getState().open(draft);
    setIsSidebarCollapsed(false);
  }, []);

  const stopEditing = useCallback(() => {
    const draft = useRoomEditor.getState().history?.present;
    if (draft?.image.src.startsWith('blob:')) URL.revokeObjectURL(draft.image.src);
    useRoomEditor.getState().close();
    const back = roomBeforeEditing.current;
    useViz2D.getState().setRoom(back && rooms.some((r) => r.id === back) ? back : rooms[0]?.id ?? '');
  }, [rooms]);

  const cancelEditing = () => {
    const dirty = !!useRoomEditor.getState().history?.past.length;
    if (dirty && !window.confirm('Leave without saving this room? Your outlines will be lost.')) return;
    stopEditing();
  };

  const addRoomFromFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      startEditing(await draftFromFile(file));
    } catch (e) {
      useViz2D.getState().notify(e instanceof Error ? e.message : 'That photo could not be used.', 'error');
    }
  };

  const saveEditing = async (draft: EditorDraft): Promise<{ success: boolean; message?: string }> => {
    if (!onSaveRoom) return { success: false, message: 'Saving rooms is not available here.' };
    let { uploadedUrl, width, height } = draft.image;
    if (!uploadedUrl) {
      if (!draft.image.file) return { success: false, message: 'The photo is missing. Start again from a photo.' };
      const form = new FormData();
      form.append('file', draft.image.file, 'room.jpg');
      const res = await fetch('/api/upload/room', { method: 'POST', body: form });
      const body = (await res.json().catch(() => ({}))) as { imageUrl?: string; width?: number; height?: number; error?: string };
      if (!res.ok || !body.imageUrl) return { success: false, message: body.error ?? 'The photo could not be uploaded.' };
      uploadedUrl = body.imageUrl;
      width = body.width ?? width;
      height = body.height ?? height;
    }
    const data = dataFromDraft(draft);
    const result = await onSaveRoom({ id: draft.roomId ?? undefined, name: draft.name.trim(), roomType: draft.roomType, imageUrl: uploadedUrl, width, height, data });
    if (!result.success || !result.id) return { success: false, message: result.message ?? 'The room could not be saved.' };

    const saved: RoomScene = {
      id: result.id,
      name: draft.name.trim(),
      roomType: draft.roomType,
      source: 'custom',
      image: { src: uploadedUrl, width, height, thumb: thumbUrlOf(uploadedUrl) },
      surfaces: data.surfaces,
      occluders: data.occluders,
      version: 1,
    };
    setPendingRooms((list) => [...list.filter((p) => p.id !== saved.id), saved]);
    if (draft.image.src.startsWith('blob:')) URL.revokeObjectURL(draft.image.src);
    useRoomEditor.getState().close();
    const store = useViz2D.getState();
    const before = store.histories[saved.id];
    if (before) store.hydrate(sanitizeDesign(before.present, saved));
    store.setRoom(saved.id);
    setTab('design');
    setIsSidebarCollapsed(false);
    store.notify(draft.roomId ? `Saved the changes to “${saved.name}”.` : `Saved “${saved.name}”. Click a surface to start tiling.`, 'success');
    return { success: true };
  };

  const deleteRoom = async (target: RoomScene) => {
    if (!onDeleteRoom || !window.confirm(`Delete “${target.name}”? Its photo and outlines are removed.`)) return;
    const res = await onDeleteRoom(target.id);
    if (!res.success) {
      useViz2D.getState().notify(res.message ?? 'The room could not be deleted.', 'error');
      return;
    }
    setPendingRooms((list) => list.filter((p) => p.id !== target.id));
    const store = useViz2D.getState();
    if (store.roomId === target.id) store.setRoom(rooms.find((r) => r.id !== target.id)?.id ?? '');
    store.notify(`Deleted “${target.name}”.`, 'success');
  };

  const roomLabel = shownRoom ? roomKindLabel(shownRoom.roomType) : null;
  const tiledCount = Object.keys(design.surfaces).length;

  const handleBackToShowroom = () => {
    if (onBackToShowroom) {
      onBackToShowroom();
      return;
    }
    if (shopId) {
      window.location.href = `/shop?shopId=${encodeURIComponent(shopId)}`;
    } else {
      window.location.href = '/shop';
    }
  };

  return (
    <div
      ref={containerRef}
      className={cn('flex h-dvh w-full flex-col overflow-hidden bg-background text-foreground select-none', className)}
    >
      <input
        ref={fileInput}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          void addRoomFromFile(e.target.files?.[0]);
          e.target.value = '';
        }}
        aria-label="Choose a room photo"
      />

      {/* ── TOP HEADER (Unified like 3D visualizer) ─────────────── */}
      <header className="z-30 flex h-14 shrink-0 items-center gap-2 sm:gap-3 border-b border-border bg-card px-2.5 sm:px-4">
        {/* Left: Tile Studio Logo, Showroom Logo & Name */}
        <div className="flex min-w-0 flex-1 items-center gap-1.5 sm:gap-2">
          {/* Tile Studio Logo */}
          <button
            type="button"
            onClick={handleBackToShowroom}
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
              <span className="truncate text-sm sm:text-base font-bold text-foreground tracking-tight max-w-[150px] sm:max-w-[240px]">
                {shop.shopName}
              </span>
            </>
          )}
        </div>

        {/* Center: Room Name & Surface Count */}
        <div className="hidden min-w-0 items-center gap-1.5 text-xs text-muted-foreground lg:flex">
          <span className="font-semibold text-foreground truncate max-w-[180px]">
            {editing ? editingDraft?.name || 'New room' : room?.name ?? '2D Visualizer'}
          </span>
          <span>·</span>
          <span className="truncate">
            {editing ? 'Marking surfaces' : roomLabel}
            {!editing && tiledCount > 0 && ` (${tiledCount} surface${tiledCount === 1 ? '' : 's'} tiled)`}
          </span>
        </div>

        {/* Right: Undo, Redo, Reset, Compare, Download, 3D, Theme, Expand, Quotation */}
        <div className="flex flex-1 items-center justify-end gap-1 sm:gap-2">
          {!editing && (
            <>
              <button
                type="button"
                onClick={() => useViz2D.getState().undo()}
                disabled={!canUndo}
                className="ds-btn ds-btn-outline w-8 sm:w-9 px-0 cursor-pointer"
                title="Undo (Ctrl+Z)"
                aria-label="Undo"
              >
                <Undo2 className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => useViz2D.getState().redo()}
                disabled={!canRedo}
                className="ds-btn ds-btn-outline w-8 sm:w-9 px-0 cursor-pointer"
                title="Redo (Ctrl+Y)"
                aria-label="Redo"
              >
                <Redo2 className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => useViz2D.getState().resetDesign()}
                disabled={tiledCount === 0}
                className="ds-btn ds-btn-outline w-8 sm:w-9 px-0 sm:w-auto sm:px-2.5 cursor-pointer"
                title="Reset all surfaces: back to original photo"
                aria-label="Reset tiles"
              >
                <RotateCcw className="h-4 w-4" />
                <span className="hidden xl:inline">Reset</span>
              </button>
              <button
                type="button"
                onClick={() => useViz2D.getState().setCompare(!compare)}
                disabled={!stageRoom}
                className={cn(
                  'ds-btn w-8 sm:w-9 px-0 sm:w-auto sm:px-3 cursor-pointer',
                  compare ? 'ds-btn-primary' : 'ds-btn-outline'
                )}
                title="Compare before and after"
                aria-pressed={compare}
              >
                <Columns2 className="h-4 w-4" />
                <span className="hidden sm:inline">Compare</span>
              </button>
              {allowDownload && (
                <DownloadMenu
                  stage={stageRef}
                  roomName={room?.name ?? 'room'}
                  disabled={!stageRoom}
                />
              )}
            </>
          )}

          {onSwitchTo3D && (
            <button
              type="button"
              onClick={onSwitchTo3D}
              className="ds-btn ds-btn-outline w-8 sm:w-9 px-0 sm:w-auto sm:px-3.5 cursor-pointer"
              title="Open the 3D visualizer"
              aria-label="Open 3D visualizer"
            >
              <Box className="h-4 w-4" />
              <span className="hidden sm:inline">3D</span>
            </button>
          )}

          <ThemeToggle scope="shop" ownerId={shopId || undefined} iconOnly />

          {/* Fullscreen / Expand Canvas Toggle */}
          <button
            type="button"
            onClick={toggleExpandVisualizer}
            className={cn(
              'ds-btn w-8 sm:w-9 px-0 cursor-pointer',
              fullscreen || isCanvasExpanded ? 'ds-btn-primary' : 'ds-btn-outline'
            )}
            title={fullscreen || isCanvasExpanded ? 'Exit full screen (Esc)' : 'Expand to full screen'}
            aria-label={fullscreen || isCanvasExpanded ? 'Exit full screen' : 'Expand to full screen'}
          >
            {fullscreen || isCanvasExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
        </div>
      </header>

      {/* ── WORKSPACE BODY (Hidable Studio Sidebar + Canvas Stage) ── */}
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

        {/* Studio Sidebar Panel */}
        <aside
          className={cn(
            'absolute z-20 flex shrink-0 flex-col border-border bg-card shadow-elevated transition-[margin,transform] duration-300 overflow-visible',
            'inset-x-0 bottom-0 h-[64%] rounded-t-2xl border-t',
            'md:inset-y-0 md:left-0 md:right-auto md:bottom-auto md:h-auto md:w-[360px] md:rounded-none md:border-r md:border-t-0',
            'lg:relative lg:shadow-none',
            isSidebarCollapsed
              ? 'translate-y-full md:translate-y-0 md:-translate-x-full lg:translate-x-0 lg:-ml-[360px]'
              : 'translate-y-0 md:translate-x-0'
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

          {/* Mobile Sheet Drag Handle */}
          <button
            type="button"
            onClick={() => setIsSidebarCollapsed(true)}
            className="flex h-6 w-full shrink-0 items-center justify-center md:hidden cursor-pointer"
            aria-label="Close studio panel"
          >
            <span className="h-1 w-10 rounded-full bg-border" />
          </button>

          {/* Desktop Studio Tab Bar (Clicking active tab HIDES it!) */}
          {!editing && (
            <nav
              className="hidden shrink-0 grid-cols-3 gap-1 border-b border-border p-2 md:grid"
              role="tablist"
              aria-label="2D visualizer tabs"
            >
              {TABS.map((t) => {
                const Icon = t.icon;
                const active = tab === t.id && !isSidebarCollapsed;
                return (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => handleTabClick(t.id)}
                    className={cn(
                      'flex flex-col items-center gap-1 rounded-xl py-2 text-2xs font-semibold transition-colors cursor-pointer',
                      active
                        ? 'bg-primary text-primary-foreground shadow-xs'
                        : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                    )}
                    title={active ? `Click to hide ${t.label} panel` : `Open ${t.label} panel`}
                  >
                    <Icon className="h-4 w-4" />
                    {t.label}
                    {t.id === 'design' && tiledCount > 0 && (
                      <span className="sr-only">{tiledCount} tiled</span>
                    )}
                  </button>
                );
              })}
            </nav>
          )}

          {/* Panel Content Body */}
          <div
            ref={panelScroll}
            className="custom-scrollbar min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain p-4 pb-8"
          >
            {editing ? (
              <RoomEditorPanel onCancel={cancelEditing} onSave={saveEditing} />
            ) : (
              <>
                {tab === 'rooms' && (
                  <RoomsPanel
                    rooms={rooms}
                    activeId={roomId}
                    onSelect={(id) => {
                      useViz2D.getState().setRoom(id);
                      setTab('design');
                    }}
                    onAdd={onSaveRoom ? () => fileInput.current?.click() : undefined}
                    onEdit={onSaveRoom ? (r) => startEditing(draftFromRoom(r)) : undefined}
                    onDelete={onDeleteRoom ? deleteRoom : undefined}
                  />
                )}
                {tab === 'design' && room && (
                  <DesignPanel
                    groups={groups}
                    tiles={tiles}
                    isLoadingTiles={isLoadingTiles}
                    leftOut={room.leftOut}
                  />
                )}
                {tab === 'collections' && (
                  <div className="space-y-4">
                    <TileCatalog
                      tiles={tiles}
                      isLoading={isLoadingTiles}
                      use="all"
                      selectedSku={null}
                      onSelect={(t) => {
                        const targetGroup = groups.find((g) => g.kind === 'floor') ?? groups[0];
                        if (targetGroup) {
                          useViz2D.getState().selectGroup(targetGroup.id, 'replace');
                          useViz2D.getState().applyTileTo(snapshotTile(t as Tile), [targetGroup.id]);
                          useViz2D.getState().notify(`Applied ${t.name} to ${targetGroup.name}`, 'success');
                        }
                      }}
                    />
                  </div>
                )}
              </>
            )}
          </div>
        </aside>

        {/* ── 2D Canvas Stage ─────────────────────────────────────── */}
        <main className="relative flex-1 h-full min-h-0 overflow-hidden bg-muted">
          <Stage
            ref={stageRef}
            loaded={stageRoom}
            loading={!stageRoom && (loading || (!!shownRoom && !error))}
            error={error}
            onRetry={() => setAttempt((n) => n + 1)}
            editor={bridge.editor}
            overlay={bridge.overlay}
            debug={bridge.debug}
            className="absolute inset-0"
          />

          {editing && <EditorHint />}

          {notice && (
            <div className="pointer-events-none absolute inset-x-0 bottom-4 z-40 flex justify-center px-4">
              <div
                role={notice.kind === 'error' ? 'alert' : 'status'}
                className={cn(
                  'pointer-events-auto flex max-w-md items-start gap-2.5 rounded-2xl border bg-card px-3.5 py-2.5 text-xs shadow-elevated',
                  notice.kind === 'error' ? 'border-destructive/40' : 'border-border'
                )}
              >
                {notice.kind === 'error' ? (
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                ) : notice.kind === 'success' ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                ) : (
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <p className="text-foreground">{notice.text}</p>
                <button
                  type="button"
                  onClick={() => useViz2D.getState().dismissNotice()}
                  className="-mr-1 shrink-0 rounded-full p-0.5 text-muted-foreground hover:text-foreground cursor-pointer"
                  aria-label="Dismiss"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* ── Phone Bottom Thumb Bar (Matches 3D visualizer) ───────── */}
      {!editing && (
        <nav
          className="grid shrink-0 grid-cols-3 border-t border-border bg-card pb-[env(safe-area-inset-bottom)] md:hidden z-30"
          aria-label="2D visualizer navigation"
        >
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id && !isSidebarCollapsed;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => handleTabClick(t.id)}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex h-14 flex-col items-center justify-center gap-1 text-2xs font-semibold transition-colors cursor-pointer',
                  active ? 'text-foreground' : 'text-muted-foreground'
                )}
              >
                <span
                  className={cn(
                    'flex h-7 w-12 items-center justify-center rounded-full transition-colors',
                    active && 'bg-primary text-primary-foreground'
                  )}
                >
                  <Icon className="h-4 w-4" />
                </span>
                {t.label}
              </button>
            );
          })}
        </nav>
      )}
    </div>
  );
}
