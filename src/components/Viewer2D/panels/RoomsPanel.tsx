'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Armchair,
  ArrowLeft,
  Bath,
  Bed,
  Box,
  Briefcase,
  Check,
  Footprints,
  ImagePlus,
  LayoutGrid,
  Pencil,
  Trash2,
  Trees,
  Utensils,
  UtensilsCrossed,
} from 'lucide-react';
import { summarizeSurfaces } from '@/lib/viz2d/design';
import { ROOM_KINDS, type RoomKind } from '@/lib/viz2d/roomKinds';
import type { RoomScene } from '@/lib/viz2d/types';
import { cn } from '@/lib/utils';
import { Section } from '@/components/Visualizer/Section';

const ROOM_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  all: LayoutGrid,
  'living-room': Armchair,
  bedroom: Bed,
  kitchen: UtensilsCrossed,
  bathroom: Bath,
  'dining-room': Utensils,
  outdoor: Trees,
  staircase: Footprints,
  office: Briefcase,
};

interface RoomsPanelProps {
  rooms: RoomScene[];
  activeId: string | null;
  onSelect: (id: string) => void;
  /** Present when the signed-in showroom may add and edit its own rooms. */
  onAdd?: () => void;
  onEdit?: (room: RoomScene) => void;
  onDelete?: (room: RoomScene) => void;
}

type Filter = 'all' | RoomKind;

const FILTER_KEY = 'viz2d-room-filter';
const readFilter = (): Filter => {
  try {
    return (sessionStorage.getItem(FILTER_KEY) as Filter | null) ?? 'all';
  } catch {
    return 'all';
  }
};
const writeFilter = (f: Filter) => {
  try {
    sessionStorage.setItem(FILTER_KEY, f);
  } catch {
    /* private window: the filter just is not remembered */
  }
};

function RoomCard({ room, active, onSelect, onEdit, onDelete }: { room: RoomScene; active: boolean; onSelect: (id: string) => void; onEdit?: (room: RoomScene) => void; onDelete?: (room: RoomScene) => void }) {
  return (
    <div className={cn('group relative overflow-hidden rounded-2xl border bg-card transition-all', active ? 'border-foreground ring-1 ring-foreground' : 'border-border hover:border-foreground/30')}>
      <button type="button" onClick={() => onSelect(room.id)} aria-pressed={active} className="block w-full text-left">
        <div className="relative aspect-[4/3] overflow-hidden bg-muted">
          <img
            src={room.image.thumb || room.image.src}
            alt=""
            loading="lazy"
            decoding="async"
            // A thumbnail that is missing is replaced by the photo itself
            onError={(e) => {
              const el = e.currentTarget;
              if (el.dataset.fallback !== '1') {
                el.dataset.fallback = '1';
                el.src = room.image.src;
              }
            }}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
          {active && (
            <span className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
              <Check className="h-3.5 w-3.5" strokeWidth={3} />
            </span>
          )}
        </div>
        <div className="space-y-0.5 p-2.5">
          <p className="line-clamp-2 text-xs font-semibold leading-snug text-foreground">{room.name}</p>
          <p className="truncate text-2xs text-muted-foreground">{summarizeSurfaces(room)}</p>
        </div>
      </button>
      {room.source === 'custom' && (onEdit || onDelete) && (
        <div className="absolute left-1.5 top-1.5 flex gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
          {onEdit && (
            <button type="button" onClick={() => onEdit(room)} className="flex h-7 w-7 items-center justify-center rounded-full bg-card/95 text-foreground shadow-sm hover:bg-accent" title="Edit surfaces" aria-label={`Edit the surfaces of ${room.name}`}>
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
          {onDelete && (
            <button type="button" onClick={() => onDelete(room)} className="flex h-7 w-7 items-center justify-center rounded-full bg-card/95 text-destructive shadow-sm hover:bg-accent" title="Delete this room" aria-label={`Delete ${room.name}`}>
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Showrooms adding their own room photos is switched off for now; set to true to bring the "Your own rooms" section back. */
const OWN_ROOMS_ENABLED = false;

export function RoomsPanel({ rooms, activeId, onSelect, onAdd, onEdit, onDelete }: RoomsPanelProps) {
  const custom = useMemo(() => rooms.filter((r) => r.source === 'custom'), [rooms]);
  const categories = useMemo(() => {
    const templates = rooms.filter((r) => r.source !== 'custom');
    return ROOM_KINDS.map((k) => ({ type: k.type, label: k.label, shortLabel: k.shortLabel, rooms: templates.filter((r) => r.roomType === k.type) })).filter((c) => c.rooms.length > 0);
  }, [rooms]);
  const total = categories.reduce((n, c) => n + c.rooms.length, 0);

  const [stored, setStored] = useState<Filter>('all');

  useEffect(() => {
    const saved = readFilter();
    if (saved && saved !== 'all') {
      setStored(saved);
    }
  }, []);

  // A remembered category that has no rooms (any more) shows everything instead of nothing
  const filter: Filter = categories.some((c) => c.type === stored) ? stored : 'all';
  const choose = (f: Filter) => {
    setStored(f);
    writeFilter(f);
  };
  const shown = filter === 'all' ? categories : categories.filter((c) => c.type === filter);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-foreground">Choose a room</p>
        <button
          type="button"
          onClick={() => {
            if (typeof window !== 'undefined') {
              const shopId = new URLSearchParams(window.location.search).get('shopId');
              if (shopId) window.location.href = `/shop?shopId=${shopId}`;
              else window.location.href = '/shop';
            }
          }}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/80 border border-border/70 transition-colors cursor-pointer"
          title="Back to showroom"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to showroom</span>
        </button>
      </div>

      {OWN_ROOMS_ENABLED && (custom.length > 0 || onAdd) && (
        <Section title="Your own rooms" aside={custom.length ? `${custom.length}` : undefined}>
          {onAdd && (
            <button type="button" onClick={onAdd} className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-border px-3 py-3 text-xs font-semibold text-muted-foreground transition-colors hover:border-foreground/40 hover:bg-accent hover:text-foreground">
              <ImagePlus className="h-4 w-4" />
              Add your own room photo
            </button>
          )}
          {custom.length > 0 && (
            <div className="grid grid-cols-2 gap-2.5">
              {custom.map((r) => (
                <RoomCard key={r.id} room={r} active={r.id === activeId} onSelect={onSelect} onEdit={onEdit} onDelete={onDelete} />
              ))}
            </div>
          )}
        </Section>
      )}

      {categories.length > 0 && (
        <Section
          title="Room type"
          aside={<span className="text-2xs text-muted-foreground">{total} room{total === 1 ? '' : 's'}</span>}
        >
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => choose('all')}
              aria-pressed={filter === 'all'}
              className={cn(
                'flex h-11 items-center justify-between gap-2 rounded-xl border px-3 text-left text-xs font-medium transition-colors cursor-pointer',
                filter === 'all'
                  ? 'border-primary bg-primary text-primary-foreground font-semibold shadow-2xs'
                  : 'border-border bg-card text-foreground hover:bg-accent',
              )}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <LayoutGrid className="h-4 w-4 shrink-0" />
                <span className="truncate">All Rooms</span>
              </div>
              <span
                className={cn(
                  'text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0',
                  filter === 'all'
                    ? 'bg-primary-foreground/20 text-primary-foreground'
                    : 'bg-muted text-muted-foreground',
                )}
              >
                {total}
              </span>
            </button>
            {categories.map((c) => {
              const Icon = ROOM_ICONS[c.type] || Box;
              const selected = filter === c.type;
              return (
                <button
                  key={c.type}
                  type="button"
                  onClick={() => choose(c.type as Filter)}
                  aria-pressed={selected}
                  className={cn(
                    'flex h-11 items-center justify-between gap-2 rounded-xl border px-3 text-left text-xs font-medium transition-colors cursor-pointer',
                    selected
                      ? 'border-primary bg-primary text-primary-foreground font-semibold shadow-2xs'
                      : 'border-border bg-card text-foreground hover:bg-accent',
                  )}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{c.label}</span>
                  </div>
                  <span
                    className={cn(
                      'text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0',
                      selected
                        ? 'bg-primary-foreground/20 text-primary-foreground'
                        : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {c.rooms.length}
                  </span>
                </button>
              );
            })}
          </div>
        </Section>
      )}

      {shown.map((c) => (
        <Section key={c.type} title={c.label} aside={`${c.rooms.length} photo${c.rooms.length === 1 ? '' : 's'}`}>
          <div className="grid grid-cols-2 gap-2.5">
            {c.rooms.map((r) => (
              <RoomCard key={r.id} room={r} active={r.id === activeId} onSelect={onSelect} />
            ))}
          </div>
        </Section>
      ))}
    </div>
  );
}
