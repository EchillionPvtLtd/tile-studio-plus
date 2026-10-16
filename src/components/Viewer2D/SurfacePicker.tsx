'use client';

import React from 'react';
import { Check } from 'lucide-react';
import { activePills, type PickerPill } from '@/lib/viz2d/picker';
import { clamp } from '@/lib/viz2d/geometry';
import { cn } from '@/lib/utils';

interface SurfacePickerProps {
  pills: PickerPill[];
  /** Where each surface group's tick goes on the photo (0..1). */
  anchors: Record<string, [number, number]>;
  names: Record<string, string>;
  selected: string[];
  stickyKey: string | null;
  /** A point of the photo on the stage, in pixels. */
  project: (u: number, v: number) => [number, number];
  size: { w: number; h: number };
  onPill: (pill: PickerPill) => void;
  onToggle: (pill: PickerPill, groupId: string) => void;
}

/**
 * The floating labels and ticks over the photo. At first each kind of surface has a label ("Floor", "Wall 0/2"); clicking one
 * selects it and shows a tick on every surface it stands for. A tick that is on means the next tile goes there, one that is
 * off leaves that surface out.
 */
export function SurfacePicker({ pills, anchors, names, selected, stickyKey, project, size, onPill, onToggle }: SurfacePickerProps) {
  const active = activePills(pills, selected, stickyKey);

  /** Pixels on the stage, kept clear of the zoom buttons and the edges; null when the point is out of view. */
  const place = (a: [number, number]): [number, number] | null => {
    const [x, y] = project(a[0], a[1]);
    if (x < -24 || y < -24 || x > size.w + 24 || y > size.h + 24) return null;
    return [clamp(x, 48, Math.max(48, size.w - 88)), clamp(y, 26, Math.max(26, size.h - 26))];
  };

  return (
    <div className="pointer-events-none absolute inset-0 z-[11]">
      {active.length === 0 &&
        pills.map((p) => {
          const at = place(p.anchor);
          if (!at) return null;
          const all = p.done === p.total;
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => onPill(p)}
              className={cn(
                'pointer-events-auto absolute flex h-10 -translate-x-1/2 -translate-y-1/2 animate-in fade-in zoom-in-95 items-center gap-2 whitespace-nowrap rounded-full px-4 text-sm font-semibold shadow-lg ring-1 ring-black/10 transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white',
                all ? 'bg-neutral-900 text-white' : 'bg-white text-neutral-900',
              )}
              style={{ left: at[0], top: at[1] }}
              title={p.counted ? `${p.label}: ${p.done} of ${p.total} tiled. Click to choose ${p.total === 1 ? 'it' : 'them'}.` : `${p.label}: click to tile it`}
              aria-label={p.counted ? `${p.label}, ${p.done} of ${p.total} tiled. Select ${p.total === 1 ? 'it' : 'them'} to tile.` : `${p.label}. Select it to tile.`}
            >
              {p.label}
              {p.counted && <span className={cn('rounded-full px-2 py-0.5 text-xs tabular-nums', all ? 'bg-white/20' : 'bg-neutral-200 text-neutral-700')}>{`${p.done}/${p.total}`}</span>}
            </button>
          );
        })}

      {active.flatMap((p) =>
        p.groupIds.map((id) => {
          const a = anchors[id];
          const at = a && place(a);
          if (!at) return null;
          const on = selected.includes(id);
          const name = names[id] ?? p.label;
          return (
            <button
              key={id}
              type="button"
              aria-pressed={on}
              onClick={() => onToggle(p, id)}
              className={cn(
                'pointer-events-auto absolute flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 animate-in fade-in zoom-in-95 items-center justify-center rounded-xl shadow-lg transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white',
                on ? 'bg-neutral-900 text-white ring-2 ring-white' : 'bg-white text-neutral-500 ring-1 ring-black/15',
              )}
              style={{ left: at[0], top: at[1] }}
              title={on ? `${name}: the next tile goes here. Click to leave it out.` : `${name}: left out. Click to tile it too.`}
              aria-label={on ? `${name}, selected` : `${name}, not selected`}
            >
              {on ? <Check className="h-5 w-5" strokeWidth={3} /> : <span className="h-4 w-4 rounded-full border-2 border-neutral-500" />}
            </button>
          );
        }),
      )}
    </div>
  );
}
