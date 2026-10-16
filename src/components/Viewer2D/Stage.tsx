'use client';

import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Loader2, Maximize, MousePointerClick, RefreshCw } from 'lucide-react';
import { buildGroups, distinctTiles, groupIdOf, tileablePhrase, tileKey } from '@/lib/viz2d/design';
import { groupAnchors } from '@/lib/viz2d/anchors';
import { LayerAllocator } from '@/lib/viz2d/layers';
import { buildPills, type PickerPill } from '@/lib/viz2d/picker';
import { buildRenderStates } from '@/lib/viz2d/renderState';
import { FIT_VIEW, MAX_ZOOM, clampView, panBy, viewportToPhoto, visibleWindow, zoomAt, type ViewState } from '@/lib/viz2d/view';
import { cn } from '@/lib/utils';
import { TileProjector } from './projector';
import { SurfacePicker } from './SurfacePicker';
import { surfaceAt, type LoadedRoom } from './roomLoader';
import { TILE_LAYERS } from './shaders';
import { currentDesign, useViz2D } from './store';
import { blobToDataUrl } from './savedDesigns';
import { loadTileBitmap } from './tileImages';
import { TileUploads } from './tileUploads';

export interface StageHandle {
  /** The finished picture at the photo's own resolution (capped at 4096 px). */
  exportImage(type?: 'image/jpeg' | 'image/png', quality?: number): Promise<Blob>;
  /** A small JPEG data URL of the finished picture. */
  thumbnail(maxSide?: number, quality?: number): Promise<string>;
}

/** Where things are on screen, for drawing over the photo. */
export interface StageGeometry {
  size: { w: number; h: number };
  /** A point of the photo (0..1) on the stage, in pixels. */
  project: (u: number, v: number) => [number, number];
  /** Stage pixels per unit of the photo (to size handles and hit areas). */
  pxPerUnit: number;
  zoom: number;
}

/** A pointer over the photo, in photo coordinates as well as stage pixels. */
export interface PhotoPointer {
  u: number;
  v: number;
  x: number;
  y: number;
  button: number;
  shiftKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  insidePhoto: boolean;
  /** Stage pixels per unit of the photo along x and y, to turn distances on the photo into distances on screen. */
  scale: [number, number];
}

/** A tool that uses the pointer on the photo (the surface editor). */
export interface StageEditor {
  cursor?: string;
  /** Return true to take the gesture: the stage then neither pans nor selects. */
  onDown(p: PhotoPointer): boolean;
  onMove(p: PhotoPointer, dragging: boolean): void;
  onUp(p: PhotoPointer): void;
  onDoubleClick?(p: PhotoPointer): void;
}

interface StageProps {
  loaded: LoadedRoom | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  /** Drawn over the photo in an SVG that does not take pointer events (outlines and handles of the surface editor). */
  overlay?: (g: StageGeometry) => React.ReactNode;
  /** A tool that gets the pointer on the photo. While set, clicking does not select surfaces. */
  editor?: StageEditor | null;
  /** 2 shows a measuring grid on every surface, to check a perspective by eye. */
  debug?: 0 | 1 | 2;
  className?: string;
}

const MAX_PIXELS = 4_500_000; // the shader is heavy per pixel, so very large screens render a little below native resolution

export const Stage = forwardRef<StageHandle, StageProps>(function Stage({ loaded, loading, error, onRetry, overlay, editor = null, debug = 0, className }, ref) {
  const interactive = !editor;
  const viewportRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const lastPointer = useRef<{ x: number; y: number } | null>(null);
  const [projector, setProjector] = useState<TileProjector | null>(null);
  const [glError, setGlError] = useState<string | null>(null);
  const [canvasKey, setCanvasKey] = useState(0);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<ViewState>(FIT_VIEW);
  const [pendingTiles, setPendingTiles] = useState(0);
  const [readyVersion, setReadyVersion] = useState(0);

  const allocator = useMemo(() => new LayerAllocator(TILE_LAYERS), []);
  const uploads = useRef(new TileUploads());
  const liveProjector = useRef<TileProjector | null>(null);

  const design = useViz2D(currentDesign);
  const selected = useViz2D((s) => s.selected);
  const hover = useViz2D((s) => s.hover);
  const compare = useViz2D((s) => s.compare);
  const comparePos = useViz2D((s) => s.comparePos);
  const room = loaded?.room ?? null;
  const groups = useMemo(() => (room ? buildGroups(room) : []), [room]);
  // Which surfaces this photo lets a person tile, in words: it differs from room to room
  const tileable = useMemo(() => (room ? tileablePhrase(room) : ''), [room]);
  // The floating labels ("Floor", "Wall 0/2") and the ticks that replace them once one is chosen
  const anchors = useMemo(
    () => (loaded && groups.length ? groupAnchors(loaded.labels, loaded.lightWidth, loaded.lightHeight, Object.fromEntries(groups.map((g) => [g.id, g.facets]))) : {}),
    [loaded, groups],
  );
  const pills = useMemo(() => buildPills(groups, anchors, design), [groups, anchors, design]);
  const groupNames = useMemo(() => Object.fromEntries(groups.map((g) => [g.id, g.name])), [groups]);
  // The label that stays open after its last tick was turned off, so that its surfaces can be ticked again
  const [stickyKey, setStickyKey] = useState<string | null>(null);
  useEffect(() => {
    setStickyKey(null);
  }, [room?.id]);
  useEffect(() => {
    if (selected.length) setStickyKey(null);
  }, [selected]);
  const sizes = useMemo(() => (loaded ? { vw: size.w, vh: size.h, imgW: loaded.width, imgH: loaded.height } : null), [loaded, size]);

  // ── The projector and its canvas ──────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let p: TileProjector;
    try {
      p = new TileProjector(canvas);
    } catch (e) {
      setGlError(e instanceof Error ? e.message : 'WebGL 2 is not available.');
      return;
    }
    setGlError(null);
    setProjector(p);
    // A lost context (GPU reset, too many tabs) comes back on a fresh canvas
    const onRestored = () => setCanvasKey((k) => k + 1);
    canvas.addEventListener('webglcontextrestored', onRestored);
    return () => {
      canvas.removeEventListener('webglcontextrestored', onRestored);
      p.dispose();
      setProjector(null);
      // React may remount straight away (development double-mount); only release the context if nothing took the canvas over
      setTimeout(() => {
        if (!canvas.isConnected) p.loseContext();
      }, 100);
    };
  }, [canvasKey]);

  // Everything on the GPU is new with a new projector
  useEffect(() => {
    liveProjector.current = projector;
    allocator.clear();
    uploads.current.clear();
    setReadyVersion((v) => v + 1);
  }, [projector, allocator]);

  // ── Size of the viewport ───────────────────────────────────────────────────
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ w: Math.round(width), h: Math.round(height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!projector || !size.w || !size.h) return;
    const native = Math.min(2, window.devicePixelRatio || 1);
    const ratio = Math.max(1, Math.min(native, Math.sqrt(MAX_PIXELS / (size.w * size.h))));
    projector.resize(size.w * ratio, size.h * ratio);
  }, [projector, size]);

  // ── The room ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!projector || !loaded) return;
    projector.setScene({
      image: loaded.image,
      width: loaded.width,
      height: loaded.height,
      masks: loaded.masks,
      light: loaded.light,
      lightWidth: loaded.lightWidth,
      lightHeight: loaded.lightHeight,
      tint: loaded.tint,
    });
    setView(FIT_VIEW);
  }, [projector, loaded]);

  // ── Tile pictures: upload each different tile once ─────────────────────────
  // What is loading, ready or broken is kept in `uploads`, not in this effect: the design can change while a picture is
  // still on its way, and that picture must still be used when it arrives.
  const notify = useViz2D((s) => s.notify);
  useEffect(() => {
    if (!projector) return;
    const tiles = distinctTiles(design);
    allocator.assign(tiles.map(tileKey));
    for (const key of uploads.current.want(tiles.map(tileKey))) {
      const tile = tiles.find((t) => tileKey(t) === key)!;
      setPendingTiles((n) => n + 1);
      loadTileBitmap(tile)
        .then((bmp) => {
          if (liveProjector.current !== projector) return; // the canvas was replaced meanwhile: its new projector asks again
          const layer = allocator.get(key);
          if (!uploads.current.finish(key, 'arrived') || layer < 0) return;
          projector.setTileImage(layer, bmp);
          setReadyVersion((v) => v + 1);
        })
        .catch(() => {
          if (liveProjector.current !== projector) return;
          if (uploads.current.finish(key, 'failed')) notify(`The picture of “${tile.name}” could not be loaded, so it is not shown. Check the tile's image link.`, 'error');
        })
        .finally(() => setPendingTiles((n) => Math.max(0, n - 1)));
    }
  }, [projector, design, allocator, notify]);

  const surfaces = useMemo(
    () => (room ? buildRenderStates(room, design, (t) => (uploads.current.isReady(tileKey(t)) ? allocator.get(tileKey(t)) : -1)) : []),
    // readyVersion changes when a tile picture arrives
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [room, design, allocator, readyVersion],
  );
  useEffect(() => {
    projector?.setSurfaces(surfaces);
  }, [projector, surfaces, loaded]);

  // ── What part of the photo is shown, and the before / after divider ───────
  const window4 = useMemo(() => (sizes && sizes.vw && sizes.vh ? visibleWindow(view, sizes) : ([0, 0, 1, 1] as [number, number, number, number])), [view, sizes]);
  useEffect(() => {
    projector?.setFrame({
      compare: compare ? comparePos : null,
      view: window4,
      debug,
    });
  }, [projector, loaded, compare, comparePos, window4, debug]);

  useImperativeHandle(
    ref,
    () => ({
      exportImage: async (type = 'image/jpeg', quality = 0.92) => {
        if (!projector) throw new Error('The room is not ready yet');
        return projector.exportBlob(type, quality, 4096);
      },
      thumbnail: async (maxSide = 480, quality = 0.78) => {
        if (!projector) throw new Error('The room is not ready yet');
        return blobToDataUrl(await projector.exportBlob('image/jpeg', quality, maxSide));
      },
    }),
    [projector],
  );

  // ── Pointer: hover, click to select, drag to pan, pinch / ctrl-wheel to zoom ──
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef({ startX: 0, startY: 0, moved: false, startView: FIT_VIEW as ViewState, pinchDist: 0, spaceDown: false, panning: false, ignore: false, editorActive: false });
  const [cursor, setCursor] = useState<'default' | 'pointer' | 'grab' | 'grabbing'>('default');

  const fractions = useCallback((clientX: number, clientY: number): [number, number] => {
    const r = viewportRef.current!.getBoundingClientRect();
    return [(clientX - r.left) / r.width, (clientY - r.top) / r.height];
  }, []);

  /** The surface group under a point of the viewport, with the photo coordinates of that point. */
  const probe = useCallback(
    (clientX: number, clientY: number) => {
      if (!loaded || !sizes) return null;
      const [fx, fy] = fractions(clientX, clientY);
      const [u, v] = viewportToPhoto(fx, fy, view, sizes);
      const insidePhoto = u >= 0 && u < 1 && v >= 0 && v < 1;
      const idx = surfaceAt(loaded, u, v);
      return { fx, fy, u, v, insidePhoto, group: idx >= 0 ? groupIdOf(loaded.room.surfaces[idx]) : null };
    },
    [loaded, sizes, fractions, view],
  );

  const photoPointer = useCallback(
    (e: { clientX: number; clientY: number; button?: number; shiftKey: boolean; altKey: boolean; ctrlKey: boolean; metaKey: boolean }): PhotoPointer | null => {
      if (!sizes) return null;
      const r = viewportRef.current!.getBoundingClientRect();
      const [fx, fy] = [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height];
      const [u, v] = viewportToPhoto(fx, fy, view, sizes);
      const [, , ww, wh] = visibleWindow(view, sizes);
      return { u, v, x: e.clientX - r.left, y: e.clientY - r.top, button: e.button ?? 0, shiftKey: e.shiftKey, altKey: e.altKey, ctrlKey: e.ctrlKey, metaKey: e.metaKey, insidePhoto: u >= 0 && u <= 1 && v >= 0 && v <= 1, scale: [r.width / ww, r.height / wh] };
    },
    [sizes, view],
  );

  const setViewClamped = useCallback((next: ViewState) => sizes && setView(clampView(next, sizes)), [sizes]);

  const placeLabel = useCallback(() => {
    const label = labelRef.current;
    const p = lastPointer.current;
    if (!label || !p || !viewportRef.current) return;
    const r = viewportRef.current.getBoundingClientRect();
    // Keep the label inside the viewport: flip it to the other side of the pointer near the edges
    const w = label.offsetWidth;
    const x = p.x - r.left + 14 + w > r.width ? p.x - r.left - 14 - w : p.x - r.left + 14;
    label.style.transform = `translate(${Math.max(4, x)}px, ${p.y - r.top + 16}px)`;
  }, []);

  /** True for presses and moves on the buttons and handles floating over the photo, which the photo must not react to. */
  const onControl = (e: React.PointerEvent) => !!(e.target as HTMLElement).closest('button, [role="slider"], input, a');

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button === 2 || onControl(e)) {
      gesture.current.ignore = true;
      return;
    }
    gesture.current.ignore = false;
    gesture.current.editorActive = false;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      g.pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      g.moved = true;
      return;
    }
    g.startX = e.clientX;
    g.startY = e.clientY;
    g.moved = false;
    g.startView = view;
    g.panning = e.button === 1 || g.spaceDown;
    if (editor && e.button === 0 && !g.panning) {
      const p = photoPointer(e);
      if (p && editor.onDown(p)) g.editorActive = true;
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (onControl(e) && !pointers.current.size) {
      useViz2D.getState().setHover(null);
      setCursor('default');
      return;
    }
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 2 && sizes) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (g.pinchDist > 0) {
        const [fx, fy] = fractions((a.x + b.x) / 2, (a.y + b.y) / 2);
        setView((v) => zoomAt(v, dist / g.pinchDist, fx, fy, sizes));
      }
      g.pinchDist = dist;
      return;
    }

    if (editor) {
      const p = photoPointer(e);
      if (p) editor.onMove(p, g.editorActive && e.buttons > 0);
      if (g.editorActive) return;
    }

    if (pointers.current.has(e.pointerId) && e.buttons) {
      const dx = e.clientX - g.startX;
      const dy = e.clientY - g.startY;
      if (!g.moved && Math.hypot(dx, dy) > 5) g.moved = true;
      // Drag pans when zoomed in (or with the middle button / space); at zoom 1 a drag does nothing
      if (g.moved && sizes && (view.zoom > 1 || g.panning)) {
        setView(panBy(g.startView, dx, dy, sizes));
        setCursor('grabbing');
      }
      return;
    }

    // Plain hover (an editing tool has no use for it)
    if (editor) {
      setCursor(view.zoom > 1 ? 'grab' : 'default');
      return;
    }
    const hit = probe(e.clientX, e.clientY);
    useViz2D.getState().setHover(hit?.group ?? null);
    setCursor(hit?.group && interactive ? 'pointer' : view.zoom > 1 ? 'grab' : 'default');
    lastPointer.current = { x: e.clientX, y: e.clientY };
    placeLabel();
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (g.ignore) {
      g.ignore = false;
      return;
    }
    const wasPinch = pointers.current.size >= 2;
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0) g.pinchDist = 0;
    setCursor('default');
    if (g.editorActive) {
      g.editorActive = false;
      const p = photoPointer(e);
      if (p && editor) editor.onUp(p);
      return;
    }
    if (wasPinch || g.moved || e.button !== 0 || !interactive) return;

    const hit = probe(e.clientX, e.clientY);
    const store = useViz2D.getState();
    if (!hit || !hit.insidePhoto) {
      store.clearSelection();
      setStickyKey(null);
    } else if (hit.group) {
      store.selectGroup(hit.group, e.shiftKey || e.metaKey || e.ctrlKey ? 'toggle' : 'replace');
    } else if (store.selected.length > 0 || stickyKey) {
      // A click on anything else puts the labels back
      store.clearSelection();
      setStickyKey(null);
    } else {
      // Furniture, ceiling, windows, and any wall or floor that could not be outlined accurately: nothing is ever applied
      // to what is not a tileable surface, and it stays exactly as photographed
      store.notify(tileable ? `That part of the photo stays as it is. Click ${tileable} to tile.` : 'Nothing in this photo can be tiled accurately, so it is shown as photographed.', 'info');
    }
  };

  const onPointerCancel = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    gesture.current.pinchDist = 0;
  };

  // Smooth scroll / wheel zooms about the pointer, and touch pinch zooms
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!sizes) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const fx = (e.clientX - r.left) / r.width;
      const fy = (e.clientY - r.top) / r.height;
      setView((v) => zoomAt(v, Math.exp(-e.deltaY * 0.0025), fx, fy, sizes));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [sizes]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) gesture.current.spaceDown = true;
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') gesture.current.spaceDown = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  const zoomBy = (factor: number) => sizes && setView((v) => zoomAt(v, factor, 0.5, 0.5, sizes));

  // ── The before / after divider ─────────────────────────────────────────────
  const dragCompare = (e: React.PointerEvent) => {
    if (!sizes || e.buttons !== 1) return;
    const [fx, fy] = fractions(e.clientX, e.clientY);
    const [u] = viewportToPhoto(fx, fy, view, sizes);
    useViz2D.getState().setComparePos(u);
  };
  const compareX = compare && sizes ? ((comparePos - window4[0]) / window4[2]) * size.w : null;
  // The photo's own edges on screen: when it doesn't fill the stage, the Before / After labels sit inside the picture, not on the empty margin
  const photoLeftPx = Math.max(0, ((0 - window4[0]) / window4[2]) * size.w);
  const photoRightPx = Math.min(size.w, ((1 - window4[0]) / window4[2]) * size.w);

  const hoverGroup = hover ? groups.find((g) => g.id === hover) : null;
  // The label has just appeared: put it at the pointer straight away rather than at the corner until the next move
  useLayoutEffect(() => {
    placeLabel();
  }, [hoverGroup, placeLabel]);
  const hoverTile = hover ? design.surfaces[hover]?.tile?.name : null;
  const selectedNames = selected.map((id) => groups.find((g) => g.id === id)?.name).filter(Boolean) as string[];
  const hasTiles = Object.keys(design.surfaces).length > 0;
  const pickerVisible = !!loaded && interactive && !compare && !loading && pills.length > 0 && size.w > 0;
  const onPill = (p: PickerPill) => useViz2D.getState().selectGroups(p.groupIds);
  const onTick = (p: PickerPill, id: string) => {
    // Turning off the last tick keeps its label open
    if (selected.length === 1 && selected[0] === id) setStickyKey(p.key);
    useViz2D.getState().selectGroup(id, 'toggle');
  };

  return (
    <div
      ref={viewportRef}
      className={cn('relative h-full min-h-[320px] w-full select-none overflow-hidden bg-muted', className)}
      style={{ touchAction: 'none', cursor: editor?.cursor ?? cursor }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onDoubleClick={(e) => {
        const p = editor && photoPointer(e);
        if (p) editor!.onDoubleClick?.(p);
      }}
      onPointerLeave={() => {
        if (!pointers.current.size) useViz2D.getState().setHover(null);
      }}
    >
      <canvas key={canvasKey} ref={canvasRef} className="absolute inset-0 h-full w-full" aria-label="Room photo with tiles" role="img" />

      {overlay && sizes && size.w > 0 && (
        <svg className="pointer-events-none absolute inset-0 z-[5]" width={size.w} height={size.h} aria-hidden="true">
          {overlay({
            size,
            zoom: view.zoom,
            pxPerUnit: size.w / window4[2],
            project: (u, v) => [((u - window4[0]) / window4[2]) * size.w, ((v - window4[1]) / window4[3]) * size.h],
          })}
        </svg>
      )}

      {pickerVisible && (
        <SurfacePicker
          pills={pills}
          anchors={anchors}
          names={groupNames}
          selected={selected}
          stickyKey={stickyKey}
          size={size}
          project={(u, v) => [((u - window4[0]) / window4[2]) * size.w, ((v - window4[1]) / window4[3]) * size.h]}
          onPill={onPill}
          onToggle={onTick}
        />
      )}

      {/* What is under the pointer */}
      {hoverGroup && !compare && interactive && (
        <div
          ref={labelRef}
          className="pointer-events-none absolute left-0 top-0 z-20 whitespace-nowrap rounded-full border border-border bg-card/95 px-2.5 py-1 text-2xs font-semibold text-foreground shadow-sm backdrop-blur"
        >
          {hoverGroup.name}
          <span className="ml-1.5 font-normal text-muted-foreground">{hoverTile ?? 'click to select'}</span>
        </div>
      )}

      {/* Selected surfaces */}
      {selectedNames.length > 0 && !compare && interactive && (
        <div className="pointer-events-none absolute left-3 top-3 z-10 flex max-w-[70%] items-center gap-2 rounded-full border border-border bg-card/90 px-3 py-1.5 text-xs shadow-sm backdrop-blur">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-foreground" />
          <span className="text-muted-foreground">Editing</span>
          <span className="truncate font-semibold text-foreground">{selectedNames.join(' · ')}</span>
        </div>
      )}

      {/* Where to begin */}
      {loaded && interactive && !hasTiles && selected.length === 0 && !compare && pills.length === 0 && (
        <div className="pointer-events-none absolute inset-x-0 bottom-5 z-10 flex justify-center px-4">
          <div className="flex items-center gap-2 rounded-full border border-border bg-card/95 px-4 py-2 text-center text-xs font-medium text-foreground shadow-sm backdrop-blur">
            <MousePointerClick className="h-4 w-4 shrink-0 text-muted-foreground" />
            {tileable ? `Click ${tileable} to start tiling` : 'No surface in this photo can be tiled accurately'}
          </div>
        </div>
      )}

      {pendingTiles > 0 && (
        <div className="pointer-events-none absolute left-1/2 top-3 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full border border-border bg-card/95 px-3 py-1.5 text-2xs font-medium text-muted-foreground shadow-sm backdrop-blur">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading tile
        </div>
      )}

      {/* Reset Fit button shown only when zoomed in */}
      {view.zoom > 1 && (
        <div className="absolute right-3 top-3 z-10 flex flex-col gap-1.5 animate-in fade-in duration-200">
          <button type="button" onClick={() => setView(FIT_VIEW)} className="ds-btn ds-btn-outline w-9 px-0 shadow-sm" title="Fit the whole room (Reset zoom)" aria-label="Fit the whole room">
            <Maximize className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Before / after */}
      {compareX !== null && compareX > -20 && compareX < size.w + 20 && (
        <>
          <span className="pointer-events-none absolute top-3 z-10 rounded-full bg-black/60 px-2.5 py-1 text-2xs font-semibold text-white" style={{ left: photoLeftPx + 12 }}>Before</span>
          <div
            role="slider"
            aria-label="Compare before and after"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(comparePos * 100)}
            tabIndex={0}
            className="absolute top-0 z-20 flex h-full w-10 -translate-x-1/2 cursor-ew-resize items-center justify-center"
            style={{ left: compareX, touchAction: 'none' }}
            onPointerDown={(e) => {
              e.stopPropagation();
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              e.stopPropagation();
              dragCompare(e);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowLeft') useViz2D.getState().setComparePos(comparePos - 0.02);
              if (e.key === 'ArrowRight') useViz2D.getState().setComparePos(comparePos + 0.02);
            }}
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full border border-white/70 bg-black/55 text-white shadow-lg backdrop-blur">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 6l-6 6 6 6M15 6l6 6-6 6" />
              </svg>
            </span>
          </div>
          <span className="pointer-events-none absolute top-3 z-10 rounded-full bg-black/60 px-2.5 py-1 text-2xs font-semibold text-white" style={{ right: Math.max(56, size.w - photoRightPx + 12) }}>After</span>
        </>
      )}

      {/* Loading, errors */}
      {loading && (
        <div className="absolute inset-0 z-30 flex animate-in fade-in flex-col items-center justify-center gap-3 bg-muted/80 text-muted-foreground backdrop-blur-sm [animation-delay:250ms] [animation-fill-mode:backwards]">
          <div className="h-9 w-9 animate-spin rounded-full border-2 border-foreground border-t-transparent" />
          <p className="text-xs font-medium">Preparing the room…</p>
        </div>
      )}
      {(error || glError) && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-muted px-6 text-center">
          <AlertTriangle className="h-8 w-8 text-warning" />
          <p className="max-w-sm text-sm font-semibold text-foreground">{glError ? 'The 2D visualizer needs WebGL 2' : 'This room could not be loaded'}</p>
          <p className="max-w-sm text-xs text-muted-foreground">{glError ?? error}</p>
          {!glError && (
            <button type="button" onClick={onRetry} className="ds-btn ds-btn-outline">
              <RefreshCw className="h-4 w-4" />
              Try again
            </button>
          )}
        </div>
      )}
    </div>
  );
});
