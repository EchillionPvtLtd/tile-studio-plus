'use client';

import type { ComponentType } from 'react';
import { Armchair, ArrowLeft, Bath, Bed, Box, Check, Footprints, Trees, Utensils, UtensilsCrossed } from 'lucide-react';
import { useRoomStore } from '@/stores/roomStore';
import { ROOM_CONFIGS } from '@/types/room';
import { ROOM_TEMPLATE_PRESETS } from '@/data/roomTemplates';
import { cn } from '@/lib/utils';
import { Section } from './Section';

const ROOM_ICONS: Record<string, ComponentType<{ className?: string }>> = {
  'living-room': Armchair,
  bedroom: Bed,
  kitchen: UtensilsCrossed,
  bathroom: Bath,
  'dining-room': Utensils,
  outdoor: Trees,
  staircase: Footprints,
};

const toM = (ft: number) => (ft * 0.3048).toFixed(1);

const PRESET_PHOTOS: Record<string, string> = {
  // Living room
  'living-modern-luxury': '/rooms2d/photos/lv-01/photo.webp',
  'living-modern-minimal': '/rooms2d/photos/lv-02/photo.webp',
  'living-scandinavian': '/rooms2d/photos/lv-03/photo.webp',
  'living-contemporary': '/rooms2d/photos/lv-04/photo.webp',
  'living-classic-luxury': '/rooms2d/photos/lv-05/photo.webp',
  'living-industrial': '/rooms2d/photos/lv-06/photo.webp',

  // Bedroom
  'bedroom-modern-master': '/rooms2d/photos/bd-01/photo.webp',
  'bedroom-luxury-hotel': '/rooms2d/photos/bd-02/photo.webp',
  'bedroom-scandinavian': '/rooms2d/photos/bd-03/photo.webp',
  'bedroom-minimal': '/rooms2d/photos/bd-04/photo.webp',

  // Kitchen
  'kitchen-modern-white': '/rooms2d/photos/kn-01/photo.webp',
  'kitchen-scandinavian': '/rooms2d/photos/kn-02/photo.webp',
  'kitchen-industrial': '/rooms2d/photos/kn-03/photo.webp',
  'kitchen-luxury-marble': '/rooms2d/photos/kn-04/photo.webp',

  // Bathroom
  'bathroom-luxury-marble': '/rooms2d/photos/by-01/photo.webp',
  'bathroom-modern-minimal': '/rooms2d/photos/by-02/photo.webp',
  'bathroom-spa': '/rooms2d/photos/by-03/photo.webp',
  'bathroom-contemporary': '/rooms2d/photos/by-04/photo.webp',

  // Dining Room
  'dining-modern': '/rooms2d/photos/dr-01/photo.webp',
  'dining-luxury': '/rooms2d/photos/dr-02/photo.webp',
  'dining-scandinavian': '/rooms2d/photos/dr-03/photo.webp',

  // Outdoor
  'balcony-modern': '/rooms2d/photos/oe-01/photo.webp',
  'outdoor-modern-patio': '/rooms2d/photos/oe-01/photo.webp',
  'outdoor-balcony': '/rooms2d/photos/oe-02/photo.webp',
  'outdoor-terrace': '/rooms2d/photos/oe-03/photo.webp',

  // Staircase
  'staircase-grand-marble': '/presets/staircase-grand-marble.jpg',
  'staircase-modern-floating': '/presets/staircase-modern-floating.jpg',
};

function getPresetPhoto(tpl: { id: string; roomType: string }) {
  if (PRESET_PHOTOS[tpl.id]) return PRESET_PHOTOS[tpl.id];
  if (tpl.roomType === 'living-room') return '/rooms2d/photos/lv-01/photo.webp';
  if (tpl.roomType === 'bedroom') return '/rooms2d/photos/bd-01/photo.webp';
  if (tpl.roomType === 'kitchen') return '/rooms2d/photos/kn-01/photo.webp';
  if (tpl.roomType === 'bathroom') return '/rooms2d/photos/by-01/photo.webp';
  if (tpl.roomType === 'dining-room') return '/rooms2d/photos/dr-01/photo.webp';
  if (tpl.roomType === 'outdoor') return '/rooms2d/photos/oe-01/photo.webp';
  if (tpl.roomType === 'staircase') return '/presets/staircase-grand-marble.jpg';
  return '/rooms2d/photos/lv-01/photo.webp';
}

function SizeSlider({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-semibold tabular-nums text-foreground">
          {value} ft <span className="font-normal text-muted-foreground">· {toM(value)} m</span>
        </span>
      </span>
      <div className="relative flex h-6 items-center">
        {/* Solid track line: Black in light mode, zinc-700 in dark mode */}
        <div className="absolute inset-x-0 h-1.5 rounded-full bg-black dark:bg-zinc-700 pointer-events-none z-0" />
        <input
          type="range"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="range-slider-thumb relative z-10 h-6 w-full cursor-pointer appearance-none bg-transparent"
        />
      </div>
    </label>
  );
}

export function RoomPanel() {
  const roomType = useRoomStore((s) => s.roomType);
  const lengthFt = useRoomStore((s) => s.lengthFt);
  const widthFt = useRoomStore((s) => s.widthFt);
  const heightFt = useRoomStore((s) => s.heightFt);
  const activeTemplateId = useRoomStore((s) => s.activeTemplateId);
  const setRoomType = useRoomStore((s) => s.setRoomType);
  const setDimensions = useRoomStore((s) => s.setDimensions);
  const applyTemplate = useRoomStore((s) => s.applyTemplate);

  const presets = ROOM_TEMPLATE_PRESETS.filter((t) => t.roomType === roomType);

  return (
    <div className="space-y-7">
      <Section
        title="Room type"
        aside={
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
        }
      >
        <div className="grid grid-cols-2 gap-2">
          {ROOM_CONFIGS.map((r) => {
            const Icon = ROOM_ICONS[r.type] || Box;
            const selected = roomType === r.type;
            return (
              <button
                key={r.type}
                type="button"
                onClick={() => setRoomType(r.type)}
                aria-pressed={selected}
                className={cn(
                  'flex h-11 items-center gap-2.5 rounded-xl border px-3 text-left text-xs font-medium transition-colors',
                  selected
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-card text-foreground hover:bg-accent',
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{r.label}</span>
              </button>
            );
          })}
        </div>
      </Section>

      <Section title="Room size" aside={`${lengthFt * widthFt} sq.ft floor`}>
        <div className="ds-inset space-y-4 p-4">
          <SizeSlider label="Length" value={lengthFt} min={8} max={35} onChange={(v) => setDimensions(v, widthFt, heightFt)} />
          <SizeSlider label="Width" value={widthFt} min={8} max={35} onChange={(v) => setDimensions(lengthFt, v, heightFt)} />
          <SizeSlider label="Ceiling height" value={heightFt} min={8} max={16} onChange={(v) => setDimensions(lengthFt, widthFt, v)} />
        </div>
      </Section>

      {presets.length > 0 && (
        <Section title="Design presets" aside={`${presets.length} curated design${presets.length === 1 ? '' : 's'}`}>
          <div className="space-y-3">
            {presets.map((tpl) => {
              const active = activeTemplateId === tpl.id;
              const photo = getPresetPhoto(tpl);
              return (
                <div
                  key={tpl.id}
                  className={cn(
                    'group overflow-hidden rounded-2xl border transition-all duration-200 bg-card shadow-2xs hover:shadow-md',
                    active
                      ? 'border-foreground ring-2 ring-foreground/20'
                      : 'border-border hover:border-foreground/40',
                  )}
                >
                  {/* Preset Photo Header */}
                  <div className="relative h-28 w-full overflow-hidden bg-muted">
                    <img
                      src={photo}
                      alt={tpl.name}
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-black/10" />

                    {/* Top Badges */}
                    <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between">
                      <span className="rounded-md bg-black/60 backdrop-blur-xs px-2 py-0.5 text-[10px] font-semibold text-white capitalize shadow-xs">
                        {tpl.style.replace('-', ' ')}
                      </span>
                      {active && (
                        <span className="flex items-center gap-1 rounded-full bg-white text-black dark:bg-white dark:text-black px-2 py-0.5 text-[10px] font-black shadow-md">
                          <Check className="h-3 w-3 stroke-[3]" /> Active
                        </span>
                      )}
                    </div>

                    {/* Bottom Dimension tag on Photo */}
                    <div className="absolute bottom-2 left-2.5 text-[11px] font-medium text-white/90 drop-shadow-xs">
                      {tpl.dimensions.lengthFt}×{tpl.dimensions.widthFt} ft · {toM(tpl.dimensions.lengthFt)}×{toM(tpl.dimensions.widthFt)} m
                    </div>
                  </div>

                  {/* Preset Details & Apply */}
                  <div className="p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs font-bold text-foreground leading-snug">{tpl.name}</p>
                    </div>
                    <p className="text-2xs leading-relaxed text-muted-foreground line-clamp-2">{tpl.description}</p>
                    <button
                      type="button"
                      onClick={() => applyTemplate(tpl.id, true)}
                      className={cn(
                        'w-full py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-2xs',
                        active
                          ? 'border border-border bg-muted text-foreground hover:bg-muted/80'
                          : 'bg-foreground text-background hover:opacity-90',
                      )}
                      title={active ? 'Restore this preset’s original finishes' : undefined}
                    >
                      {active ? (
                        <>
                          <Check className="h-3.5 w-3.5 stroke-[2.5]" /> Re-apply Preset
                        </>
                      ) : (
                        'Apply Preset'
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </Section>
      )}
    </div>
  );
}
