'use client';

import type { ReactNode } from 'react';
import { Grid2X2, Square } from 'lucide-react';
import { useRoomStore } from '@/stores/roomStore';
import { GROUT_COLORS, GROUT_WIDTHS, TILE_LAYOUT_OPTIONS, type Tile, type TileLayout } from '@/types/tile';
import { cn } from '@/lib/utils';
import { Section } from './Section';
import { TileCatalog } from './TileCatalog';

export function PatternIcon({ layout, className = 'h-5 w-5' }: { layout: TileLayout; className?: string }) {
  const svg = (children: ReactNode) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
  switch (layout) {
    case 'diagonal':
      return <Square className={cn(className, 'scale-75 rotate-45')} />;
    case 'brick':
      return svg(
        <>
          <rect x="2" y="4" width="20" height="7" rx="1" />
          <path d="M12 4v7" />
          <rect x="2" y="13" width="20" height="7" rx="1" />
          <path d="M7 13v7M17 13v7" />
        </>,
      );
    case 'offset':
      return svg(
        <>
          <rect x="2" y="4" width="20" height="7" rx="1" />
          <path d="M9 4v7M17 4v7" />
          <rect x="2" y="13" width="20" height="7" rx="1" />
          <path d="M6 13v7M14 13v7" />
        </>,
      );
    case 'herringbone':
      return svg(
        <>
          <path d="M4 18l8-8 8 8" />
          <path d="M4 12l8-8 8 8" />
        </>,
      );
    default:
      return <Grid2X2 className={className} />;
  }
}

export function FloorPanel({ tiles, isLoading }: { tiles: Tile[]; isLoading: boolean }) {
  const floorTile = useRoomStore((s) => s.floorTile);
  const setTileForSurface = useRoomStore((s) => s.setTileForSurface);
  const layout = useRoomStore((s) => s.layout);
  const setLayout = useRoomStore((s) => s.setLayout);
  const groutWidthMm = useRoomStore((s) => s.groutWidthMm);
  const setGroutWidthMm = useRoomStore((s) => s.setGroutWidthMm);
  const groutColor = useRoomStore((s) => s.groutColor);
  const setGroutColor = useRoomStore((s) => s.setGroutColor);

  const groutName = GROUT_COLORS.find((g) => g.hex.toLowerCase() === groutColor.toLowerCase())?.name ?? 'Custom colour';

  return (
    <div className="space-y-7">
      <Section title="Floor tile" aside={floorTile ? floorTile.name : 'Browse catalogue'}>
        <TileCatalog
          tiles={tiles}
          isLoading={isLoading}
          use="floor"
          selectedSku={floorTile?.sku}
          onSelect={(t) => setTileForSurface('floor', t)}
        />
      </Section>

      <Section title="Laying pattern" aside={TILE_LAYOUT_OPTIONS.find((l) => l.key === layout)?.description}>
        <div className="grid grid-cols-5 gap-1.5">
          {TILE_LAYOUT_OPTIONS.map((l) => {
            const selected = layout === l.key;
            return (
              <button
                key={l.key}
                type="button"
                onClick={() => setLayout(l.key)}
                aria-pressed={selected}
                title={l.description}
                className={cn(
                  'flex flex-col items-center justify-between rounded-xl border p-1.5 h-[68px] transition-all cursor-pointer select-none text-center shadow-2xs group',
                  selected
                    ? 'border-foreground bg-foreground text-background font-bold shadow-xs ring-1 ring-foreground/20'
                    : 'border-border bg-card text-foreground hover:border-foreground/40 hover:bg-muted/60',
                )}
              >
                <div className={cn(
                  'flex h-6 w-6 items-center justify-center rounded-md transition-colors',
                  selected ? 'text-background' : 'text-foreground/80 group-hover:text-foreground'
                )}>
                  <PatternIcon layout={l.key} className="h-4.5 w-4.5" />
                </div>
                <div className="w-full text-center text-[9.5px] font-semibold leading-[1.15] tracking-tight">
                  {l.key === 'offset' ? (
                    <>
                      <span className="block">1/3</span>
                      <span className="block">Offset</span>
                    </>
                  ) : l.key === 'herringbone' ? (
                    <>
                      <span className="block">Herring-</span>
                      <span className="block">bone</span>
                    </>
                  ) : (
                    <>
                      <span className="block">&nbsp;</span>
                      <span className="block truncate">{l.label}</span>
                    </>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </Section>

      <Section title="Grout" aside={`${groutWidthMm} mm · ${groutName}`}>
        <div className="grid grid-cols-5 gap-1.5">
          {GROUT_WIDTHS.map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => setGroutWidthMm(w)}
              aria-pressed={groutWidthMm === w}
              className={cn(
                'h-9 rounded-xl border text-xs font-semibold tabular-nums transition-all flex items-center justify-center cursor-pointer shadow-2xs',
                groutWidthMm === w
                  ? 'border-foreground bg-foreground text-background font-bold shadow-xs'
                  : 'border-border bg-card text-foreground hover:border-foreground/30 hover:bg-muted/60',
              )}
            >
              {w} mm
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {GROUT_COLORS.map((g) => {
            const selected = groutColor.toLowerCase() === g.hex.toLowerCase();
            return (
              <button
                key={g.hex}
                type="button"
                onClick={() => setGroutColor(g.hex)}
                aria-label={g.name}
                aria-pressed={selected}
                title={g.name}
                className={cn(
                  'h-7 w-7 rounded-full border border-black/10 transition-shadow',
                  selected ? 'ring-2 ring-foreground ring-offset-2 ring-offset-background' : 'hover:ring-2 hover:ring-border hover:ring-offset-1 hover:ring-offset-background',
                )}
                style={{ backgroundColor: g.hex }}
              />
            );
          })}
        </div>
      </Section>
    </div>
  );
}
