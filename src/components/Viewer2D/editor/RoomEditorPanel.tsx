'use client';

import React, { useEffect, useMemo } from 'react';
import { ArrowDown, ArrowLeft, ArrowUp, Eraser, Grid3X3, Loader2, MousePointer2, PenLine, Plus, Redo2, Scissors, Sparkles, Trash2, Undo2, Wand2, Box } from 'lucide-react';
import { calibrationSize } from '@/lib/viz2d/editing';
import { ROOM_KINDS } from '@/lib/viz2d/roomKinds';
import { validateRoomData } from '@/lib/viz2d/roomSchema';
import { surfaceAreaSqFt } from '@/lib/viz2d/quote2d';
import { SURFACE_KINDS, type SurfaceKind } from '@/lib/viz2d/types';
import { cn } from '@/lib/utils';
import { Section } from '@/components/Visualizer/Section';
import { ChipRow, NumberField, RangeRow } from '../panels/controls';
import { dataFromDraft } from './drafts';
import { selectActiveSurface, selectDraft, selectEditorCanRedo, selectEditorCanUndo, useRoomEditor, type EditorDraft, type EditorTool } from './editorStore';

interface RoomEditorPanelProps {
  onCancel: () => void;
  onSave: (draft: EditorDraft) => Promise<{ success: boolean; message?: string }>;
}

const TOOLS: { id: EditorTool; label: string; icon: typeof PenLine; help: string }[] = [
  { id: 'draw', label: 'Outline', icon: PenLine, help: 'Click around the surface to outline it. Click the first point again, double-click or press Enter to finish.' },
  { id: 'wand', label: 'Smart select', icon: Wand2, help: 'Click inside the surface: the area of similar colour, up to the next edge, is outlined for you. Check it, then fix any points that are off.' },
  { id: 'points', label: 'Move points', icon: MousePointer2, help: 'Drag a point to move it. Click a line to add a point. Hold Shift or Alt and click a point to delete it.' },
  { id: 'cutout', label: 'Cut out', icon: Scissors, help: 'Outline something in front of the surface, such as a window or a door, to take it out of the surface.' },
];

export function RoomEditorPanel({ onCancel, onSave }: RoomEditorPanelProps) {
  const draft = useRoomEditor(selectDraft);
  const active = useRoomEditor(selectActiveSurface);
  const activeId = useRoomEditor((s) => s.activeId);
  const tool = useRoomEditor((s) => s.tool);
  const drawing = useRoomEditor((s) => s.drawing);
  const vertex = useRoomEditor((s) => s.vertex);
  const grid = useRoomEditor((s) => s.grid);
  const wand = useRoomEditor((s) => s.wand);
  const saving = useRoomEditor((s) => s.saving);
  const message = useRoomEditor((s) => s.message);
  const canUndo = useRoomEditor(selectEditorCanUndo);
  const canRedo = useRoomEditor(selectEditorCanRedo);
  const ed = useRoomEditor.getState;

  // Keys while editing: Enter closes the outline, Escape cancels it, Delete removes the selected point, Ctrl+Z / Y undo and redo
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      const s = ed();
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        s.redo();
      } else if (e.key === 'Enter' && s.drawing.length >= 3) {
        e.preventDefault();
        s.finishDrawing();
      } else if (e.key === 'Escape') {
        if (s.drawing.length) s.cancelDrawing();
        else s.setVertex(null);
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && s.vertex) {
        e.preventDefault();
        s.deleteVertexAt(s.vertex);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ed]);

  const validation = useMemo(() => (draft ? validateRoomData(dataFromDraft(draft)) : null), [draft]);
  if (!draft) return null;

  const outlined = draft.surfaces.filter((s) => s.mask.kind === 'polygons' && s.mask.shapes.length > 0).length;
  const size = active ? calibrationSize(active.calibration) : null;
  const area = active ? surfaceAreaSqFt({ ...active, areaSqFt: undefined }) : 0;
  const toolHelp = tool === 'perspective' ? null : tool === 'object' ? 'Outline furniture and other objects that stand in front of every surface, so tiles stay behind them.' : TOOLS.find((t) => t.id === tool)?.help;
  const drawingTool = tool === 'draw' || tool === 'cutout' || tool === 'object';

  return (
    <div className="space-y-7">
      <div className="flex items-center gap-2">
        <button type="button" onClick={onCancel} disabled={saving} className="ds-btn ds-btn-ghost w-9 px-0" aria-label="Leave without saving" title="Leave without saving">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{draft.roomId ? 'Edit room' : 'New room'}</p>
          <p className="truncate text-2xs text-muted-foreground">Mark each surface that can be tiled</p>
        </div>
        <button type="button" onClick={() => ed().undo()} disabled={!canUndo} className="ds-btn ds-btn-outline w-9 px-0" title="Undo (Ctrl+Z)" aria-label="Undo">
          <Undo2 className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => ed().redo()} disabled={!canRedo} className="ds-btn ds-btn-outline w-9 px-0" title="Redo (Ctrl+Y)" aria-label="Redo">
          <Redo2 className="h-4 w-4" />
        </button>
      </div>

      <Section title="Room">
        <input className="ds-field" value={draft.name} maxLength={80} onChange={(e) => ed().rename(e.target.value)} placeholder="Room name" aria-label="Room name" />
        <select className="ds-field" value={draft.roomType} onChange={(e) => ed().setRoomMeta({ roomType: e.target.value as EditorDraft['roomType'] })} aria-label="Room type">
          {ROOM_KINDS.map((r) => (
            <option key={r.type} value={r.type}>
              {r.label}
            </option>
          ))}
        </select>
      </Section>

      <Section title="Surfaces" aside={`${outlined} outlined`}>
        <ul className="space-y-1.5">
          {draft.surfaces.map((s, i) => {
            const on = s.id === activeId;
            const empty = s.mask.kind !== 'polygons' || s.mask.shapes.length === 0;
            return (
              <li key={s.id} className={cn('rounded-2xl border p-2', on ? 'border-foreground bg-accent ring-1 ring-foreground' : 'border-border bg-card')}>
                <div className="flex items-center gap-2">
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => ed().setActive(s.id)} aria-pressed={on}>
                    <span className="block truncate text-xs font-semibold text-foreground">{s.name || 'Unnamed'}</span>
                    <span className="block truncate text-2xs text-muted-foreground">
                      {SURFACE_KINDS.find((k) => k.id === s.kind)?.label} · {empty ? 'not outlined yet' : `${Math.round(surfaceAreaSqFt({ ...s, areaSqFt: undefined }))} sq.ft`}
                    </span>
                  </button>
                  <button type="button" className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-card hover:text-foreground disabled:opacity-30" disabled={i === 0} onClick={() => ed().moveSurface(s.id, -1)} aria-label={`Move ${s.name} behind`} title="Move behind">
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-card hover:text-foreground disabled:opacity-30" disabled={i === draft.surfaces.length - 1} onClick={() => ed().moveSurface(s.id, 1)} aria-label={`Move ${s.name} in front`} title="Move in front (wins where surfaces overlap)">
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-card hover:text-destructive" onClick={() => ed().removeSurface(s.id)} aria-label={`Delete ${s.name}`} title="Delete this surface">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
        <div className="flex flex-wrap gap-1.5">
          {SURFACE_KINDS.map((k) => (
            <button key={k.id} type="button" className="ds-tab h-7 px-3 text-2xs" onClick={() => ed().addSurface(k.id)}>
              <Plus className="h-3 w-3" /> {k.label}
            </button>
          ))}
        </div>
      </Section>

      {active && (
        <>
          <Section title="This surface" aside={active.name}>
            <input className="ds-field" value={active.name} maxLength={60} onChange={(e) => ed().renameSurface(active.id, e.target.value)} aria-label="Surface name" placeholder="Surface name" />
            <select className="ds-field" value={active.kind} onChange={(e) => ed().setKind(active.id, e.target.value as SurfaceKind)} aria-label="Surface type">
              {SURFACE_KINDS.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.label}
                </option>
              ))}
            </select>
          </Section>

          <Section title="Outline">
            <div className="grid grid-cols-2 gap-1.5">
              {TOOLS.map((t) => {
                const Icon = t.icon;
                const on = tool === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => ed().setTool(t.id)}
                    className={cn('flex h-9 items-center justify-center gap-2 rounded-xl border text-xs font-semibold transition-colors', on ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-foreground hover:bg-accent')}
                  >
                    <Icon className="h-4 w-4" />
                    {t.label}
                  </button>
                );
              })}
            </div>
            {toolHelp && <p className="rounded-xl bg-muted px-3 py-2 text-2xs leading-relaxed text-muted-foreground">{toolHelp}</p>}
            {tool === 'wand' && (
              <div className="space-y-3">
                <RangeRow label="Colour tolerance" value={wand.tolerance} min={6} max={80} format={(v) => String(v)} onChange={(v) => ed().setWand({ tolerance: v })} />
                <RangeRow label="Stop at edges" value={wand.edge} min={8} max={120} format={(v) => String(v)} onChange={(v) => ed().setWand({ edge: v })} />
              </div>
            )}
            {drawingTool && drawing.length > 0 && (
              <div className="flex gap-2">
                <button type="button" className="ds-btn ds-btn-primary flex-1" disabled={drawing.length < 3} onClick={() => ed().finishDrawing()}>
                  Finish outline
                </button>
                <button type="button" className="ds-btn ds-btn-outline" onClick={() => ed().cancelDrawing()}>
                  Cancel
                </button>
              </div>
            )}
            {vertex && tool === 'points' && (
              <button type="button" className="ds-btn ds-btn-outline w-full text-destructive" onClick={() => ed().deleteVertexAt(vertex)}>
                <Eraser className="h-4 w-4" /> Delete the selected point
              </button>
            )}
            {active.mask.kind === 'polygons' && active.mask.shapes.length > 0 && (
              <button type="button" className="ds-btn ds-btn-ghost w-full" onClick={() => ed().clearOutline(active.id)}>
                Clear this surface&apos;s outline
              </button>
            )}
          </Section>

          <Section title="Perspective" aside={area > 0 ? `${area.toFixed(0)} sq.ft measured` : undefined}>
            <p className="rounded-xl bg-muted px-3 py-2 text-2xs leading-relaxed text-muted-foreground">
              Tiles shrink with distance only if the app knows the shape of the surface. Drag the four numbered corners onto the corners of a real rectangle on it (for a floor, the corners of a room; for a wall, its top and bottom corners), then enter that rectangle&apos;s real size.
            </p>
            <button
              type="button"
              onClick={() => ed().setTool('perspective')}
              aria-pressed={tool === 'perspective'}
              className={cn('flex h-9 w-full items-center justify-center gap-2 rounded-xl border text-xs font-semibold transition-colors', tool === 'perspective' ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-foreground hover:bg-accent')}
            >
              <Box className="h-4 w-4" /> Place the 4 corners
            </button>
            {size && (
              <div className="flex items-center gap-2">
                <NumberField label="Real width in millimetres" value={size.width} min={100} max={100000} step={50} suffix="mm" onCommit={(v) => ed().setCalibrationSize(v, size.height)} />
                <span className="text-xs text-muted-foreground">×</span>
                <NumberField label="Real height in millimetres" value={size.height} min={100} max={100000} step={50} suffix="mm" onCommit={(v) => ed().setCalibrationSize(size.width, v)} />
              </div>
            )}
            <div className="flex gap-2">
              <button type="button" className="ds-btn ds-btn-outline flex-1" onClick={() => ed().guessPerspective()} title="Use the corners of the outline and a typical size">
                <Sparkles className="h-4 w-4" /> Guess from outline
              </button>
              <button type="button" className={cn('ds-btn flex-1', grid ? 'ds-btn-primary' : 'ds-btn-outline')} aria-pressed={grid} onClick={() => ed().setGrid(!grid)} title="Draw a 50 cm grid over the surfaces: its squares should look like real squares on the floor or wall">
                <Grid3X3 className="h-4 w-4" /> Check grid
              </button>
            </div>
            {grid && <p className="text-2xs text-muted-foreground">The grid squares are 50 cm; thicker lines are every metre. If they look stretched or tilted, adjust the corners.</p>}
          </Section>
        </>
      )}

      <Section title="In front of the surfaces" aside={draft.occluders.length ? `${draft.occluders.length}` : undefined}>
        <button
          type="button"
          onClick={() => ed().setTool('object')}
          aria-pressed={tool === 'object'}
          className={cn('flex h-9 w-full items-center justify-center gap-2 rounded-xl border text-xs font-semibold transition-colors', tool === 'object' ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-foreground hover:bg-accent')}
        >
          <PenLine className="h-4 w-4" /> Outline furniture or other objects
        </button>
        {draft.occluders.length > 0 && (
          <ul className="space-y-1">
            {draft.occluders.map((_, i) => (
              <li key={i} className="flex items-center justify-between rounded-xl bg-muted px-3 py-1.5 text-2xs text-muted-foreground">
                Object {i + 1}
                <button type="button" className="text-destructive hover:underline" onClick={() => ed().removeOccluder(i)}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {(message || (validation && !validation.ok && outlined > 0)) && (
        <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {message ?? validation?.message}
        </p>
      )}
      {!message && outlined === 0 && <p className="rounded-xl bg-muted px-3 py-2 text-2xs leading-relaxed text-muted-foreground">Outline at least one surface on the photo, then save the room.</p>}

      <div className="sticky bottom-0 -mx-4 flex gap-2 border-t border-border bg-card px-4 py-3">
        <button type="button" className="ds-btn ds-btn-outline" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button
          type="button"
          className="ds-btn ds-btn-primary flex-1"
          disabled={saving || !validation?.ok || !draft.name.trim()}
          onClick={async () => {
            ed().setSaving(true);
            ed().setMessage(null);
            const res = await onSave(draft).catch(() => ({ success: false, message: 'Could not save the room. Please try again.' }));
            ed().setSaving(false);
            if (!res.success) ed().setMessage(res.message ?? 'Could not save the room.');
          }}
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Save room
        </button>
      </div>
    </div>
  );
}

