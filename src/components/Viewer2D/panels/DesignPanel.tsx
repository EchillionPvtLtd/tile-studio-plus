'use client';

import React, { useMemo } from 'react';
import { BrickWall, Check, Info, LayoutGrid, RotateCw, Square, Trash2, X } from 'lucide-react';
import type { SurfaceGroup } from '@/lib/viz2d/design';
import { snapshotTile } from '@/lib/viz2d/design';
import { TILE_SETTING_LIMITS, type SurfaceSettings } from '@/lib/viz2d/types';
import { GROUT_COLORS, TILE_LAYOUT_OPTIONS, type Tile } from '@/types/tile';
import { cn } from '@/lib/utils';
import { PatternIcon } from '@/components/Visualizer/FloorPanel';
import { Section } from '@/components/Visualizer/Section';
import { TileCatalog } from '@/components/Visualizer/TileCatalog';
import { currentDesign, useViz2D } from '../store';
import { ChipRow, NumberField, RangeRow } from './controls';

const SIZE_PRESETS: [number, number][] = [
  [100, 100],
  [200, 200],
  [300, 300],
  [300, 600],
  [400, 400],
  [450, 450],
  [600, 600],
  [600, 1200],
  [800, 800],
  [1200, 1200],
  [200, 1200],
  [150, 900],
];
const GROUT_WIDTHS = [0, 1, 2, 3, 5, 8];

function Thumb({ tile, kind }: { tile: SurfaceSettings['tile'] | undefined; kind: SurfaceGroup['kind'] }) {
  if (tile) {
    return <img src={tile.previewUrl || tile.textureUrl} alt="" className="h-10 w-10 shrink-0 rounded-lg border border-border object-cover" loading="lazy" />;
  }
  const Icon = kind === 'floor' ? LayoutGrid : BrickWall;
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-dashed border-border text-muted-foreground">
      <Icon className="h-4 w-4" />
    </span>
  );
}

export function DesignPanel({ groups, tiles, isLoadingTiles, leftOut = [] }: { groups: SurfaceGroup[]; tiles: Tile[]; isLoadingTiles: boolean; leftOut?: string[] }) {
  const design = useViz2D(currentDesign);
  const selected = useViz2D((s) => s.selected);
  const selectGroup = useViz2D((s) => s.selectGroup);
  const selectGroups = useViz2D((s) => s.selectGroups);
  const applyTileTo = useViz2D((s) => s.applyTileTo);
  const patch = useViz2D((s) => s.patch);
  const removeTile = useViz2D((s) => s.removeTile);
  const copyTo = useViz2D((s) => s.copyTo);

  const selectedGroups = useMemo(() => groups.filter((g) => selected.includes(g.id)), [groups, selected]);
  // The controls show the first selected surface that has a tile; a change goes to every selected tiled surface
  const lead = selectedGroups.find((g) => design.surfaces[g.id]);
  const s = lead ? design.surfaces[lead.id] : undefined;
  const walls = groups.filter((g) => g.kind !== 'floor');
  // The surfaces this tile could be copied to (a photo that offers only its floor has none)
  const others = groups.filter((g) => lead && g.id !== lead.id);
  const catalogUse = selectedGroups.every((g) => g.kind === 'floor') ? 'floor' : 'wall';
  const set = (p: Partial<SurfaceSettings>, key: string) => patch(p, key);
  const L = TILE_SETTING_LIMITS;

  const tile = s?.tile ?? null;
  const sizeOptions = useMemo(() => {
    const own = tile ? ([tile.widthMm, tile.heightMm] as [number, number]) : null;
    const list = SIZE_PRESETS.filter((p) => !own || p[0] !== own[0] || p[1] !== own[1]);
    return own ? [own, ...list] : list;
  }, [tile]);
  const sizeValue = s ? `${s.tileWidthMm}x${s.tileHeightMm}` : null;
  const groutName = s ? GROUT_COLORS.find((g) => g.hex.toLowerCase() === s.groutColor.toLowerCase())?.name ?? 'Custom colour' : '';

  // Auto-select the floor surface on room load if none is selected
  const hasAutoSelectedRef = React.useRef(false);
  React.useEffect(() => {
    if (!hasAutoSelectedRef.current && groups.length > 0 && selected.length === 0) {
      hasAutoSelectedRef.current = true;
      const floor = groups.find((g) => g.kind === 'floor') ?? groups[0];
      selectGroup(floor.id, 'replace');
    }
  }, [groups, selected.length, selectGroup]);

  // A photo whose floor and walls could not be outlined accurately offers nothing to tile: say so instead of showing empty controls
  if (groups.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border px-4 py-8 text-center">
        <Square className="mx-auto mb-2 h-6 w-6 text-muted-foreground/70" />
        <p className="text-xs font-medium text-foreground">Nothing to tile in this photo</p>
        <p className="mt-0.5 text-2xs text-muted-foreground">Its floor and walls could not be outlined accurately, so it is shown exactly as photographed. Choose another room.</p>
      </div>
    );
  }

  return (
    <div className="space-y-7">
      <Section title="Surfaces">
        <div className="flex flex-wrap gap-1.5">
          <button type="button" className="ds-tab h-7 px-3 text-2xs" onClick={() => selectGroups(groups.map((g) => g.id))}>
            Select all
          </button>
          {walls.length > 1 && (
            <button type="button" className="ds-tab h-7 px-3 text-2xs" onClick={() => selectGroups(walls.map((g) => g.id))}>
              All walls
            </button>
          )}
          {selected.length > 0 && (
            <button type="button" className="ds-tab h-7 px-3 text-2xs" onClick={() => selectGroups([])}>
              <X className="h-3 w-3" /> Clear
            </button>
          )}
        </div>
        <ul className="space-y-1.5">
          {groups.map((g) => {
            const t = design.surfaces[g.id]?.tile;
            const active = selected.includes(g.id);
            return (
              <li key={g.id}>
                <button
                  type="button"
                  aria-pressed={active}
                  onClick={(e) => selectGroup(g.id, e.shiftKey || e.metaKey || e.ctrlKey ? 'toggle' : 'replace')}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-2xl border p-2 text-left transition-colors',
                    active ? 'border-foreground bg-accent ring-1 ring-foreground' : 'border-border bg-card hover:bg-accent',
                  )}
                >
                  <Thumb tile={t} kind={g.kind} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold text-foreground">{g.name}</span>
                    <span className="block truncate text-2xs text-muted-foreground">
                      {t ? t.name : 'Not tiled'}
                    </span>
                  </span>
                  {active && <Check className="h-4 w-4 shrink-0 text-foreground" strokeWidth={3} />}
                </button>
              </li>
            );
          })}
        </ul>
      </Section>

      {selectedGroups.length === 0 ? (
        <div className="space-y-6">
          <Section title="Tile" aside="Choose a tile to apply">
            <TileCatalog
              tiles={tiles}
              isLoading={isLoadingTiles}
              use="floor"
              selectedSku={null}
              onSelect={(t) => {
                const defaultGroup = groups.find((g) => g.kind === 'floor') ?? groups[0];
                selectGroup(defaultGroup.id, 'replace');
                applyTileTo(snapshotTile(t as Tile), [defaultGroup.id]);
              }}
            />
          </Section>
        </div>
      ) : (
        <>
          <Section title="Tile" aside={s?.tile ? s.tile.name : selectedGroups.map((g) => g.name).join(', ')}>
            <TileCatalog
              tiles={tiles}
              isLoading={isLoadingTiles}
              use={catalogUse}
              selectedSku={s?.tile?.sku}
              onSelect={(t) => applyTileTo(snapshotTile(t as Tile))}
            />
          </Section>

          {s && (
            <>
              <Section title="Laying pattern" aside={TILE_LAYOUT_OPTIONS.find((l) => l.key === s.layout)?.description}>
                <div className="grid grid-cols-5 gap-1.5">
                  {TILE_LAYOUT_OPTIONS.map((l) => {
                    const on = s.layout === l.key;
                    return (
                      <button
                        key={l.key}
                        type="button"
                        onClick={() => set({ layout: l.key }, 'layout')}
                        aria-pressed={on}
                        title={l.description}
                        className={cn(
                          'flex flex-col items-center gap-1.5 rounded-xl border px-1 py-2.5 text-2xs font-medium transition-colors',
                          on ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-foreground hover:bg-accent',
                        )}
                      >
                        <PatternIcon layout={l.key} />
                        <span className="truncate">{l.label}</span>
                      </button>
                    );
                  })}
                </div>
              </Section>

              <Section title="Tile size" aside={`${s.tileWidthMm} × ${s.tileHeightMm} mm`}>
                <ChipRow
                  value={sizeValue}
                  options={sizeOptions.map(([w, h], i) => ({
                    value: `${w}x${h}`,
                    label: i === 0 && s.tile && w === s.tile.widthMm && h === s.tile.heightMm ? `${w}×${h} · catalogue` : `${w}×${h}`,
                  }))}
                  onChange={(v) => {
                    const [w, h] = v.split('x').map(Number);
                    set({ tileWidthMm: w, tileHeightMm: h }, 'size');
                  }}
                />
                <div className="flex items-center gap-2">
                  <NumberField label="Tile width in millimetres" value={s.tileWidthMm} min={L.tileMm[0]} max={L.tileMm[1]} suffix="mm" onCommit={(v) => set({ tileWidthMm: v }, 'size')} />
                  <span className="text-xs text-muted-foreground">×</span>
                  <NumberField label="Tile height in millimetres" value={s.tileHeightMm} min={L.tileMm[0]} max={L.tileMm[1]} suffix="mm" onCommit={(v) => set({ tileHeightMm: v }, 'size')} />
                  <button
                    type="button"
                    className="ds-btn ds-btn-outline w-9 px-0"
                    title="Turn the tile 90°: swap width and height"
                    aria-label="Swap width and height"
                    onClick={() => set({ tileWidthMm: s.tileHeightMm, tileHeightMm: s.tileWidthMm }, 'size')}
                  >
                    <RotateCw className="h-4 w-4" />
                  </button>
                </div>
              </Section>

              <Section title="Rotation" aside={`${s.rotationDeg}°`}>
                <RangeRow label="Turn the whole pattern" value={s.rotationDeg} min={L.rotationDeg[0]} max={L.rotationDeg[1]} format={(v) => `${v}°`} onChange={(v) => set({ rotationDeg: v }, 'rotation')} />
                <ChipRow
                  value={s.rotationDeg}
                  options={[0, 15, 30, 45, 90].map((d) => ({ value: d, label: `${d}°` }))}
                  onChange={(v) => set({ rotationDeg: v }, 'rotation')}
                />
              </Section>

              <Section title="Grout" aside={`${s.groutMm} mm · ${groutName}`}>
                <ChipRow value={s.groutMm} options={GROUT_WIDTHS.map((w) => ({ value: w, label: w === 0 ? 'None' : `${w} mm` }))} onChange={(v) => set({ groutMm: v }, 'grout')} />
                <RangeRow label="Joint width" value={s.groutMm} min={0} max={L.groutMm[1]} step={0.5} format={(v) => `${v} mm`} onChange={(v) => set({ groutMm: v }, 'grout')} />
                <div className="flex flex-wrap items-center gap-2">
                  {GROUT_COLORS.map((g) => {
                    const on = s.groutColor.toLowerCase() === g.hex.toLowerCase();
                    return (
                      <button
                        key={g.hex}
                        type="button"
                        aria-label={g.name}
                        aria-pressed={on}
                        title={g.name}
                        onClick={() => set({ groutColor: g.hex }, 'groutColor')}
                        className={cn('h-7 w-7 rounded-full border border-black/10 transition-shadow', on ? 'ring-2 ring-foreground ring-offset-2 ring-offset-background' : 'hover:ring-2 hover:ring-border hover:ring-offset-1 hover:ring-offset-background')}
                        style={{ backgroundColor: g.hex }}
                      />
                    );
                  })}
                  <label className="relative h-7 w-7 cursor-pointer overflow-hidden rounded-full border border-dashed border-border" title="Any colour">
                    <span className="sr-only">Custom grout colour</span>
                    <input type="color" value={s.groutColor} onChange={(e) => set({ groutColor: e.target.value.toUpperCase() }, 'groutColor')} className="absolute -inset-2 h-12 w-12 cursor-pointer opacity-0" />
                    <span className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">+</span>
                  </label>
                </div>
              </Section>

              <Section title="Where the tiles start" aside="Slide the pattern across the surface">
                <RangeRow label="Left / right" value={s.offsetX} min={-600} max={600} step={5} format={(v) => `${v} mm`} onChange={(v) => set({ offsetX: v }, 'offsetX')} />
                <RangeRow label="Up / down" value={s.offsetY} min={-600} max={600} step={5} format={(v) => `${v} mm`} onChange={(v) => set({ offsetY: v }, 'offsetY')} />
                {(s.offsetX !== 0 || s.offsetY !== 0) && (
                  <button type="button" className="ds-btn ds-btn-sm ds-btn-ghost" onClick={() => set({ offsetX: 0, offsetY: 0 }, 'offset')}>
                    Reset position
                  </button>
                )}
              </Section>

              <Section title="Realism">
                <RangeRow label="Light and shadow from the photo" value={s.lighting} min={0} max={L.lighting[1]} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set({ lighting: v }, 'lighting')} />
                <RangeRow label="Shade variation between tiles" value={s.variation} min={0} max={1} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set({ variation: v }, 'variation')} />
              </Section>

              <Section title={others.length ? 'Use this tile elsewhere' : 'Remove'}>
                {others.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {others.map((g) => (
                      <button key={g.id} type="button" className="ds-tab h-7 px-3 text-2xs" onClick={() => copyTo(lead!.id, [g.id])}>
                        <Square className="h-3 w-3" /> {g.name}
                      </button>
                    ))}
                    {walls.filter((g) => lead && g.id !== lead.id).length > 1 && (
                      <button
                        type="button"
                        className="ds-tab ds-tab-active h-7 px-3 text-2xs"
                        onClick={() =>
                          copyTo(
                            lead!.id,
                            walls.map((g) => g.id),
                          )
                        }
                      >
                        All walls
                      </button>
                    )}
                  </div>
                )}
                <button type="button" className="ds-btn ds-btn-outline w-full text-destructive" onClick={() => removeTile()}>
                  <Trash2 className="h-4 w-4" />
                  Remove the tile from {selectedGroups.length > 1 ? 'these surfaces' : lead?.name.toLowerCase() ?? 'this surface'}
                </button>
              </Section>
            </>
          )}
        </>
      )}
    </div>
  );
}
