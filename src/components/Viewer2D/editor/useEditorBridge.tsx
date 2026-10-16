'use client';

import React, { useMemo } from 'react';
import { nearestEdge, nearestVertex, ringProblem, type VertexRef } from '@/lib/viz2d/editing';
import { centroidOf, pointInShape } from '@/lib/viz2d/geometry';
import { closeMask, dilate, growRegion, maskToShapes, removeSpecks } from '@/lib/viz2d/raster';
import type { PolygonShape, Pt, SurfaceDef } from '@/lib/viz2d/types';
import type { PhotoPointer, StageEditor, StageGeometry } from '../Stage';
import { useRoomEditor } from './editorStore';

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const shapesOf = (s: SurfaceDef): PolygonShape[] => (s.mask.kind === 'polygons' ? s.mask.shapes : []);
const screenDist = (a: Pt, b: Pt, scale: [number, number]) => Math.hypot((a[0] - b[0]) * scale[0], (a[1] - b[1]) * scale[1]);

// ── Smart select: a working copy of the photo, made once per photo ───────────

const WAND_SIZE = 640;
const pixelCache = new WeakMap<ImageBitmap, { rgba: Uint8ClampedArray; w: number; h: number }>();

function photoPixels(photo: ImageBitmap) {
  let hit = pixelCache.get(photo);
  if (!hit) {
    const k = Math.min(1, WAND_SIZE / Math.max(photo.width, photo.height));
    const w = Math.max(1, Math.round(photo.width * k));
    const h = Math.max(1, Math.round(photo.height * k));
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(photo, 0, 0, w, h);
    hit = { rgba: ctx.getImageData(0, 0, w, h).data, w, h };
    pixelCache.set(photo, hit);
  }
  return hit;
}

/** Selects the region of similar colour under a point and returns it as editable outlines. */
function wandShapes(photo: ImageBitmap, u: number, v: number, tolerance: number, edge: number): PolygonShape[] {
  const { rgba, w, h } = photoPixels(photo);
  let mask = growRegion(rgba, w, h, u * w, v * h, { tolerance, edgeStop: edge });
  // The edge test keeps the region a pixel short of a strong edge, so give that pixel back, then tidy specks and gaps
  mask = dilate(mask, w, h, 1);
  mask = closeMask(mask, w, h, 2);
  mask = removeSpecks(mask, w, h, 80);
  return maskToShapes(mask, w, h, 1.6, 80);
}

// ── The pointer ──────────────────────────────────────────────────────────────

type Drag = { type: 'vertex'; ref: VertexRef } | { type: 'corner'; index: number } | null;

function makeController(photo: ImageBitmap | null, tool: string): StageEditor {
  let drag: Drag = null;
  const st = () => useRoomEditor.getState();
  const active = () => st().history?.present.surfaces.find((s) => s.id === st().activeId) ?? null;

  const cursor = tool === 'draw' || tool === 'cutout' || tool === 'object' || tool === 'wand' ? 'crosshair' : tool === 'perspective' ? 'move' : 'default';

  return {
    cursor,

    onDown(p: PhotoPointer) {
      const s = st();
      const d = s.history?.present;
      if (!d) return false;
      const at: Pt = [clamp01(p.u), clamp01(p.v)];
      const surface = active();

      switch (s.tool) {
        case 'draw':
        case 'cutout':
        case 'object': {
          if (!surface && s.tool !== 'object') {
            s.setMessage('Add a surface first, then outline it on the photo.');
            return true;
          }
          const first = s.drawing[0];
          // Clicking the first point again closes the outline
          if (first && s.drawing.length >= 3 && screenDist(first, at, p.scale) < 12) {
            s.finishDrawing();
            return true;
          }
          s.setMessage(null);
          s.addDrawingPoint(at);
          return true;
        }

        case 'points': {
          if (!surface) return false;
          const shapes = shapesOf(surface);
          const v = nearestVertex(shapes, [p.u, p.v], 10, p.scale);
          if (v) {
            if (p.altKey || p.shiftKey) {
              s.deleteVertexAt(v);
              return true;
            }
            s.setVertex(v);
            drag = { type: 'vertex', ref: v };
            return true;
          }
          const e = nearestEdge(shapes, [p.u, p.v], 8, p.scale);
          if (e) {
            const ref = s.insertVertexAt(e, e.point);
            s.setVertex(ref);
            drag = { type: 'vertex', ref };
            return true;
          }
          // A click inside another surface makes that one the active one
          const inside = [...d.surfaces].reverse().find((x) => shapesOf(x).some((sh) => pointInShape(sh, p.u, p.v)));
          if (inside && inside.id !== s.activeId) {
            s.setActive(inside.id);
            return true;
          }
          s.setVertex(null);
          return false;
        }

        case 'wand': {
          if (!surface || !photo) return true;
          const shapes = wandShapes(photo, at[0], at[1], s.wand.tolerance, s.wand.edge);
          if (!shapes.length) s.setMessage('Nothing was selected there. Click inside the surface, or raise the colour tolerance.');
          else {
            s.setMessage(null);
            s.addShapes(shapes);
          }
          return true;
        }

        case 'perspective': {
          if (!surface) return false;
          let best = -1;
          let bestDist = 16;
          surface.calibration.image.forEach((q, i) => {
            const dist = screenDist(q, [p.u, p.v], p.scale);
            if (dist < bestDist) {
              best = i;
              bestDist = dist;
            }
          });
          if (best < 0) return false;
          drag = { type: 'corner', index: best };
          return true;
        }
      }
      return false;
    },

    onMove(p, dragging) {
      const s = st();
      s.setPointer([p.u, p.v]);
      if (!dragging || !drag) return;
      const at: Pt = [Math.min(1.4, Math.max(-0.4, p.u)), Math.min(1.4, Math.max(-0.4, p.v))];
      if (drag.type === 'vertex') s.moveVertexTo(drag.ref, [clamp01(at[0]), clamp01(at[1])]);
      else s.setCalibrationPoint(drag.index, at);
    },

    onUp() {
      const s = st();
      if (drag?.type === 'vertex') {
        const surface = active();
        const shape = surface && shapesOf(surface)[drag.ref.shape];
        const ring = shape && (drag.ref.ring < 0 ? shape.outer : shape.holes?.[drag.ref.ring]);
        s.setMessage(ring ? ringProblem(ring) : null);
      }
      drag = null;
    },

    onDoubleClick(p) {
      const s = st();
      if (s.tool !== 'draw' && s.tool !== 'cutout' && s.tool !== 'object') return;
      // The two clicks of a double click each added a point; the second is a duplicate
      const pts = s.drawing;
      if (pts.length >= 2 && screenDist(pts[pts.length - 1], pts[pts.length - 2], p.scale) < 8) useRoomEditor.setState({ drawing: pts.slice(0, -1) });
      if (useRoomEditor.getState().drawing.length >= 3) useRoomEditor.getState().finishDrawing();
    },
  };
}

// ── The overlay ──────────────────────────────────────────────────────────────

const ringPath = (ring: Pt[], g: StageGeometry) => ring.map((q, i) => `${i ? 'L' : 'M'}${g.project(q[0], q[1]).map((n) => n.toFixed(1)).join(' ')}`).join(' ') + ' Z';
const shapePath = (s: PolygonShape, g: StageGeometry) => [s.outer, ...(s.holes ?? [])].map((r) => ringPath(r, g)).join(' ');

function Halo({ d, dash, w = 2, color = '#fff', fill = 'none' }: { d: string; dash?: string; w?: number; color?: string; fill?: string }) {
  return (
    <>
      <path d={d} fill="none" stroke="rgba(0,0,0,0.55)" strokeWidth={w + 2.5} strokeLinejoin="round" strokeDasharray={dash} fillRule="evenodd" />
      <path d={d} fill={fill} stroke={color} strokeWidth={w} strokeLinejoin="round" strokeDasharray={dash} fillRule="evenodd" />
    </>
  );
}

function Handle({ x, y, r = 5, fill = '#fff', stroke = '#111' }: { x: number; y: number; r?: number; fill?: string; stroke?: string }) {
  return <circle cx={x} cy={y} r={r} fill={fill} stroke={stroke} strokeWidth={1.6} />;
}

function EditorOverlay({ g }: { g: StageGeometry }) {
  const draft = useRoomEditor((s) => s.history?.present ?? null);
  const activeId = useRoomEditor((s) => s.activeId);
  const tool = useRoomEditor((s) => s.tool);
  const drawing = useRoomEditor((s) => s.drawing);
  const pointer = useRoomEditor((s) => s.pointer);
  const vertex = useRoomEditor((s) => s.vertex);
  if (!draft) return null;
  const drawingTool = tool === 'draw' || tool === 'cutout' || tool === 'object';

  return (
    <g fontFamily="system-ui, sans-serif">
      {/* Foreground objects */}
      {draft.occluders.map((o, i) => (
        <g key={`o${i}`}>
          <Halo d={shapePath(o, g)} dash="5 4" color="#fb7185" fill="rgba(244,63,94,0.2)" />
        </g>
      ))}

      {/* Every surface */}
      {draft.surfaces.map((s) => {
        const on = s.id === activeId;
        const shapes = shapesOf(s);
        if (!shapes.length) return null;
        const label = shapes.length ? g.project(...centroidOf(shapes[0].outer)) : null;
        return (
          <g key={s.id}>
            {shapes.map((sh, i) => (
              <Halo key={i} d={shapePath(sh, g)} color={on ? '#fff' : 'rgba(255,255,255,0.6)'} w={on ? 2 : 1.4} dash={on ? undefined : '4 4'} fill={on ? 'rgba(56,189,248,0.2)' : 'rgba(255,255,255,0.06)'} />
            ))}
            {label && (
              <text x={label[0]} y={label[1]} textAnchor="middle" fontSize={12} fontWeight={600} fill="#fff" stroke="rgba(0,0,0,0.65)" strokeWidth={3} paintOrder="stroke">
                {s.name}
              </text>
            )}
          </g>
        );
      })}

      {/* Points of the active surface */}
      {(tool === 'points' || tool === 'cutout') &&
        draft.surfaces
          .filter((s) => s.id === activeId)
          .flatMap((s) =>
            shapesOf(s).flatMap((sh, si) =>
              [sh.outer, ...(sh.holes ?? [])].flatMap((ring, ri) =>
                ring.flatMap((q, i) => {
                  const [x, y] = g.project(q[0], q[1]);
                  const next = ring[(i + 1) % ring.length];
                  const [mx, my] = g.project((q[0] + next[0]) / 2, (q[1] + next[1]) / 2);
                  const selected = vertex && vertex.shape === si && vertex.ring === ri - 1 && vertex.index === i;
                  return [
                    <Handle key={`v${si}-${ri}-${i}`} x={x} y={y} r={selected ? 7 : 5} fill={selected ? '#38bdf8' : '#fff'} />,
                    tool === 'points' ? <circle key={`m${si}-${ri}-${i}`} cx={mx} cy={my} r={3} fill="rgba(255,255,255,0.75)" stroke="rgba(0,0,0,0.5)" strokeWidth={1} /> : null,
                  ];
                }),
              ),
            ),
          )}

      {/* The outline being drawn */}
      {drawingTool && drawing.length > 0 && (
        <g>
          <polyline
            points={[...drawing, ...(pointer ? [pointer] : [])].map((q) => g.project(q[0], q[1]).join(',')).join(' ')}
            fill="none"
            stroke="rgba(0,0,0,0.55)"
            strokeWidth={4.5}
            strokeLinejoin="round"
          />
          <polyline points={[...drawing, ...(pointer ? [pointer] : [])].map((q) => g.project(q[0], q[1]).join(',')).join(' ')} fill="none" stroke="#fbbf24" strokeWidth={2} strokeLinejoin="round" strokeDasharray="6 4" />
          {drawing.map((q, i) => {
            const [x, y] = g.project(q[0], q[1]);
            return <Handle key={i} x={x} y={y} r={i === 0 && drawing.length >= 3 ? 8 : 4.5} fill={i === 0 ? '#fbbf24' : '#fff'} />;
          })}
        </g>
      )}

      {/* The four corners that set the perspective */}
      {tool === 'perspective' &&
        draft.surfaces
          .filter((s) => s.id === activeId)
          .map((s) => {
            const pts = s.calibration.image.map((q) => g.project(q[0], q[1]));
            return (
              <g key="quad">
                <Halo d={`M${pts.map((p) => p.join(' ')).join(' L')} Z`} color="#38bdf8" w={2} fill="rgba(56,189,248,0.1)" />
                {pts.map(([x, y], i) => (
                  <g key={i}>
                    <rect x={x - 10} y={y - 10} width={20} height={20} rx={5} fill="#0ea5e9" stroke="#fff" strokeWidth={2} />
                    <text x={x} y={y + 4.5} textAnchor="middle" fontSize={12} fontWeight={700} fill="#fff">
                      {i + 1}
                    </text>
                  </g>
                ))}
              </g>
            );
          })}
    </g>
  );
}

/**
 * What the Stage needs while a room is being edited: the tool that uses the pointer on the photo, and the overlay
 * drawn over it. Both are null when no room is being edited.
 */
export function useEditorBridge(photo: ImageBitmap | null) {
  const editing = useRoomEditor((s) => !!s.history);
  const tool = useRoomEditor((s) => s.tool);
  const grid = useRoomEditor((s) => s.grid);
  const editor = useMemo(() => (editing ? makeController(photo, tool) : null), [editing, photo, tool]);
  const overlay = useMemo(() => (editing ? (g: StageGeometry) => <EditorOverlay g={g} /> : undefined), [editing]);
  return { editor, overlay, debug: (editing && grid ? 2 : 0) as 0 | 2 };
}
