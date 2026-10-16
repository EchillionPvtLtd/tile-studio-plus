'use client';

import { useEffect, useState } from 'react';
import { Check, Lightbulb, Star } from 'lucide-react';
import { useRoomStore, type PaintableWall } from '@/stores/roomStore';
import type { SurfaceKey } from '@/types/room';
import type { Tile } from '@/types/tile';
import { PAINT_COLORS, PANEL_TONES, PANEL_TREATMENTS, colourName } from '@/data/wallFinishes';
import { cn } from '@/lib/utils';
import { Section } from './Section';
import { TileCatalog } from './TileCatalog';

type Finish = 'paint' | 'tile' | 'panel';

const WALL_NAMES: Partial<Record<SurfaceKey, string>> = {
  'wall-n': 'North wall',
  'wall-s': 'South wall',
  'wall-e': 'East wall',
  'wall-w': 'West wall',
  backsplash: 'Backsplash',
  'shower-wall': 'Shower walls',
};

const isPaintable = (s: SurfaceKey): s is PaintableWall => s === 'wall-n' || s === 'wall-s' || s === 'wall-e' || s === 'wall-w';

/** The wall the Walls tab is editing; the legacy 'feature-wall' key is the north wall. */
export function normaliseWall(s: SurfaceKey): SurfaceKey {
  if (s === 'feature-wall') return 'wall-n';
  return s === 'floor' ? 'wall-n' : s;
}

function Swatch({ hex, selected, label, onClick }: { hex: string; selected: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={selected}
      title={label}
      className={cn(
        'relative aspect-square w-full rounded-xl border border-black/10 transition-shadow',
        selected ? 'ring-2 ring-foreground ring-offset-2 ring-offset-background' : 'hover:ring-2 hover:ring-border hover:ring-offset-1 hover:ring-offset-background',
      )}
      style={{ backgroundColor: hex }}
    >
      {selected && (
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm">
            <Check className="h-3 w-3" strokeWidth={3} />
          </span>
        </span>
      )}
    </button>
  );
}

export function WallsPanel({ tiles, isLoading }: { tiles: Tile[]; isLoading: boolean }) {
  const store = useRoomStore();
  const { roomType, lengthFt, widthFt, featureWallTreatment, featureWallColor, featureWallBacklight, wallColor, wallPaints } = store;

  const wall = normaliseWall(store.activeSurface);
  const tile = store.getTileForSurface(wall);
  const paint = isPaintable(wall) ? wallPaints[wall] || wallColor : null;
  const isFeature = wall === 'wall-n';
  const tileOnly = !isPaintable(wall);

  // Each wall opens on the finish it currently has.
  const derived: Finish = tileOnly ? 'tile' : isFeature && featureWallTreatment !== 'none' ? 'panel' : tile ? 'tile' : 'paint';
  const [finish, setFinish] = useState<Finish>(derived);
  useEffect(() => setFinish(derived), [wall, derived]);

  // Keep the editor on a real wall when arriving from the floor.
  const activeSurface = store.activeSurface;
  const setActiveSurface = store.setActiveSurface;
  useEffect(() => {
    if (activeSurface !== wall) setActiveSurface(wall);
  }, [activeSurface, setActiveSurface, wall]);

  const chooseFinish = (f: Finish) => {
    setFinish(f);
    if (f === 'paint' && isPaintable(wall) && (tile || (isFeature && featureWallTreatment !== 'none'))) {
      store.setWallPaint(wall, paint!);
    }
    if (f === 'panel' && featureWallTreatment === 'none') store.setFeatureWallTreatment('wood-slats');
  };

  // Mini floor plan: proportional rectangle whose edges are the walls.
  const aspect = Math.min(1.9, Math.max(1.1, lengthFt / widthFt));
  const hasSouth = roomType !== 'outdoor';
  const edgeColor = (s: PaintableWall) => {
    const t = store.getTileForSurface(s);
    if (s === 'wall-n' && featureWallTreatment !== 'none') return featureWallColor;
    if (t) return null;
    return wallPaints[s] || wallColor;
  };
  const Edge = ({ s, className }: { s: PaintableWall; className: string }) => {
    const selected = wall === s;
    const t = store.getTileForSurface(s);
    const c = edgeColor(s);
    return (
      <button
        type="button"
        onClick={() => store.setActiveSurface(s)}
        aria-pressed={selected}
        aria-label={WALL_NAMES[s]}
        title={WALL_NAMES[s]}
        className={cn(
          'absolute overflow-hidden rounded-md border transition-all',
          selected ? 'z-10 border-foreground ring-2 ring-foreground' : 'border-border hover:border-foreground/40',
          className,
        )}
        style={c ? { backgroundColor: c } : undefined}
      >
        {!c && t && <img src={t.previewUrl || t.textureUrl} alt="" className="h-full w-full object-cover" />}
      </button>
    );
  };
  const extras: SurfaceKey[] = [
    ...(roomType === 'kitchen' ? (['backsplash'] as SurfaceKey[]) : []),
    ...(roomType === 'bathroom' ? (['shower-wall'] as SurfaceKey[]) : []),
  ];

  const allWallsLabel = finish === 'paint' ? `Paint all walls ${colourName(paint ?? wallColor)}` : 'Use this tile on all walls';

  return (
    <div className="space-y-7">
      <Section title="Choose a wall" aside="Tap a side of the plan">
        <div className="ds-inset flex flex-col items-center gap-3 px-4 py-5">
          <span className="ds-eyebrow flex items-center gap-1">
            <Star className="h-3 w-3" /> North · feature wall
          </span>
          <div className="relative w-[200px]" style={{ height: 200 / aspect }}>
            <div className="absolute inset-3 rounded-sm border border-dashed border-border bg-card/60" />
            <Edge s="wall-n" className="inset-x-3 top-0 h-3" />
            {hasSouth && <Edge s="wall-s" className="inset-x-3 bottom-0 h-3" />}
            <Edge s="wall-w" className="inset-y-3 left-0 w-3" />
            <Edge s="wall-e" className="inset-y-3 right-0 w-3" />
            <span className="absolute inset-0 flex items-center justify-center text-2xs text-muted-foreground">
              {lengthFt}×{widthFt} ft
            </span>
          </div>
          <div className="grid w-full grid-cols-4 gap-1.5 text-center">
            {(['wall-n', 'wall-s', 'wall-e', 'wall-w'] as PaintableWall[])
              .filter((s) => hasSouth || s !== 'wall-s')
              .map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => store.setActiveSurface(s)}
                  className={cn('ds-tab h-7 justify-center px-0 text-2xs', wall === s && 'ds-tab-active')}
                >
                  {WALL_NAMES[s]!.replace(' wall', '')}
                </button>
              ))}
          </div>
          {extras.length > 0 && (
            <div className="flex w-full gap-1.5">
              {extras.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => store.setActiveSurface(s)}
                  className={cn('ds-tab h-7 flex-1 justify-center text-2xs', wall === s && 'ds-tab-active')}
                >
                  {WALL_NAMES[s]}
                </button>
              ))}
            </div>
          )}
        </div>
      </Section>

      <Section
        title={WALL_NAMES[wall] ?? 'Wall'}
        aside={
          finish === 'panel'
            ? PANEL_TREATMENTS.find((p) => p.id === featureWallTreatment)?.name
            : finish === 'tile'
              ? tile?.name ?? 'No tile yet'
              : paint && colourName(paint)
        }
      >
        {!tileOnly && (
          <div className={cn('grid gap-1 rounded-xl border border-border bg-muted p-1', isFeature ? 'grid-cols-3' : 'grid-cols-2')} role="tablist">
            {(['paint', 'tile', ...(isFeature ? ['panel'] : [])] as Finish[]).map((f) => (
              <button
                key={f}
                type="button"
                role="tab"
                aria-selected={finish === f}
                onClick={() => chooseFinish(f)}
                className={cn(
                  'h-8 rounded-lg text-xs font-medium capitalize transition-colors',
                  finish === f ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {f}
              </button>
            ))}
          </div>
        )}

        {finish === 'paint' && isPaintable(wall) && (
          <div className="space-y-3">
            <div className="grid grid-cols-6 gap-2">
              {PAINT_COLORS.map((c) => (
                <Swatch
                  key={c.hex}
                  hex={c.hex}
                  label={c.name}
                  selected={paint?.toLowerCase() === c.hex.toLowerCase()}
                  onClick={() => store.setWallPaint(wall, c.hex)}
                />
              ))}
            </div>
            <label className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-3 py-2">
              <span className="text-xs text-muted-foreground">Custom colour</span>
              <span className="flex items-center gap-2">
                <span className="font-mono text-2xs uppercase text-foreground">{paint}</span>
                <input
                  type="color"
                  value={paint ?? '#ffffff'}
                  onChange={(e) => store.setWallPaint(wall, e.target.value)}
                  className="h-7 w-9 cursor-pointer rounded-md border border-border bg-transparent p-0.5"
                />
              </span>
            </label>
          </div>
        )}

        {finish === 'tile' && (
          <TileCatalog
            tiles={tiles}
            isLoading={isLoading}
            use="wall"
            selectedSku={tile?.sku}
            onSelect={(t) => store.setTileForSurface(wall, t)}
          />
        )}

        {finish === 'panel' && isFeature && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              {PANEL_TREATMENTS.map((p) => {
                const selected = featureWallTreatment === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => store.setFeatureWallTreatment(p.id)}
                    aria-pressed={selected}
                    className={cn(
                      'rounded-xl border p-3 text-left transition-colors',
                      selected ? 'border-foreground bg-accent' : 'border-border bg-card hover:bg-accent',
                    )}
                  >
                    <p className="text-xs font-semibold text-foreground">{p.name}</p>
                    <p className="mt-0.5 text-2xs leading-snug text-muted-foreground">{p.desc}</p>
                  </button>
                );
              })}
            </div>
            <div className="space-y-2">
              <p className="text-2xs text-muted-foreground">Tone · {colourName(featureWallColor)}</p>
              <div className="grid grid-cols-8 gap-1.5">
                {PANEL_TONES.map((t) => (
                  <Swatch
                    key={t.hex}
                    hex={t.hex}
                    label={t.name}
                    selected={featureWallColor.toLowerCase() === t.hex.toLowerCase()}
                    onClick={() => store.setFeatureWallColor(t.hex)}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {isFeature && (
          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-border bg-card px-3 py-2.5">
            <span className="flex items-center gap-2.5">
              <Lightbulb className="h-4 w-4 text-muted-foreground" />
              <span>
                <span className="block text-xs font-medium text-foreground">Cove LED light</span>
                <span className="block text-2xs text-muted-foreground">Warm wash along the feature wall</span>
              </span>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={featureWallBacklight}
              onClick={() => store.setFeatureWallBacklight(!featureWallBacklight)}
              className={cn(
                'relative h-5 w-9 shrink-0 rounded-full transition-colors',
                featureWallBacklight ? 'bg-primary' : 'bg-input',
              )}
            >
              <span
                className={cn(
                  'absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-background shadow-sm transition-transform',
                  featureWallBacklight && 'translate-x-4',
                )}
              />
            </button>
          </label>
        )}

        {isPaintable(wall) && finish !== 'panel' && (
          <button
            type="button"
            disabled={finish === 'tile' && !tile}
            onClick={() => (finish === 'paint' ? store.paintAllWalls(paint ?? wallColor) : tile && store.applyTileToAllWalls(tile))}
            className="ds-btn ds-btn-outline w-full"
          >
            {allWallsLabel}
          </button>
        )}
      </Section>
    </div>
  );
}
