'use client';

import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  BrickWall,
  Check,
  CheckCircle2,
  Grid3X3,
  Layers,
  LayoutGrid,
  Search,
  Sparkles,
  Tag,
  X,
} from 'lucide-react';
import type { Tile } from '@/types/tile';
import type { SurfaceGroup } from '@/lib/viz2d/design';
import { snapshotTile } from '@/lib/viz2d/design';
import { cn, formatLKR } from '@/lib/utils';
import { Section } from '@/components/Visualizer/Section';
import { currentDesign, useViz2D } from '../store';

const MATERIALS = [
  { id: 'all', label: 'All Materials' },
  { id: 'ceramic', label: 'Ceramic' },
  { id: 'porcelain', label: 'Porcelain' },
  { id: 'marble', label: 'Marble' },
  { id: 'wood', label: 'Wood' },
  { id: 'granite', label: 'Granite' },
  { id: 'mosaic', label: 'Mosaic' },
] as const;

type MaterialFilter = (typeof MATERIALS)[number]['id'];

interface CategoryPanelProps {
  tiles: Tile[];
  isLoadingTiles: boolean;
  groups: SurfaceGroup[];
  onGoToDesign?: () => void;
}

export function CategoryPanel({ tiles, isLoadingTiles, groups, onGoToDesign }: CategoryPanelProps) {
  const design = useViz2D(currentDesign);
  const selected = useViz2D((s) => s.selected);
  const selectGroup = useViz2D((s) => s.selectGroup);
  const selectGroups = useViz2D((s) => s.selectGroups);
  const applyTileTo = useViz2D((s) => s.applyTileTo);
  const notify = useViz2D((s) => s.notify);

  // Surface target: either what's selected, or defaults to the first available surface
  const targetGroupIds = useMemo(() => {
    if (selected.length > 0) return selected;
    if (groups.length > 0) return [groups[0].id];
    return [];
  }, [selected, groups]);

  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [activeMaterial, setActiveMaterial] = useState<MaterialFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [lastAppliedTileId, setLastAppliedTileId] = useState<string | null>(null);

  // Collect all unique categories from the tiles
  const dynamicCategories = useMemo(() => {
    const set = new Set<string>();
    tiles.forEach((t) => {
      if (t.category) {
        set.add(t.category.trim());
      }
    });
    return Array.from(set).sort();
  }, [tiles]);

  // Filter tiles
  const filteredTiles = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return tiles.filter((t) => {
      // Category filter
      if (activeCategory !== 'all') {
        const cat = (t.category || '').toLowerCase();
        if (activeCategory === 'floor' && !['floor', 'both'].includes(cat)) return false;
        if (activeCategory === 'wall' && !['wall', 'both'].includes(cat)) return false;
        if (activeCategory === 'both' && cat !== 'both') return false;
        if (!['floor', 'wall', 'both'].includes(activeCategory) && cat !== activeCategory.toLowerCase()) {
          return false;
        }
      }

      // Material filter
      if (activeMaterial !== 'all') {
        const hay = `${t.material ?? ''} ${t.name}`.toLowerCase();
        if (activeMaterial === 'wood') {
          if (!hay.includes('wood') && !hay.includes('plank') && !hay.includes('oak')) return false;
        } else if (!hay.includes(activeMaterial)) {
          return false;
        }
      }

      // Search query
      if (q) {
        const matches = [t.name, t.sku, t.material, t.colorName, t.finish, t.category].some(
          (val) => val?.toLowerCase().includes(q)
        );
        if (!matches) return false;
      }

      return true;
    });
  }, [tiles, activeCategory, activeMaterial, searchQuery]);

  const handleApplyTile = (tile: Tile) => {
    if (groups.length === 0) {
      notify('No surfaces available to tile in this room.', 'info');
      return;
    }

    const targets = targetGroupIds.length > 0 ? targetGroupIds : [groups[0].id];
    applyTileTo(snapshotTile(tile), targets);
    setLastAppliedTileId(tile.id);

    const targetNames = targets
      .map((id) => groups.find((g) => g.id === id)?.name)
      .filter(Boolean)
      .join(', ');

    notify(`Applied ${tile.name} to ${targetNames || 'surface'}.`, 'success');
  };

  const currentTargetName = useMemo(() => {
    if (targetGroupIds.length === 0) return 'None';
    if (targetGroupIds.length === groups.length && groups.length > 1) return 'All Surfaces';
    return targetGroupIds
      .map((id) => groups.find((g) => g.id === id)?.name)
      .filter(Boolean)
      .join(', ');
  }, [targetGroupIds, groups]);

  return (
    <div className="space-y-6">
      {/* ── Surface Target Selector ─────────────────────────────────── */}
      <Section title="Target Surface" aside={currentTargetName}>
        <div className="space-y-2">
          <p className="text-2xs text-muted-foreground">
            Select which surface to apply your chosen tile to:
          </p>
          <div className="flex flex-wrap gap-1.5">
            {groups.map((g) => {
              const isTarget = targetGroupIds.includes(g.id);
              const Icon = g.kind === 'floor' ? LayoutGrid : BrickWall;
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => selectGroup(g.id, 'replace')}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer',
                    isTarget
                      ? 'border-primary bg-primary text-primary-foreground shadow-xs'
                      : 'border-border bg-card text-muted-foreground hover:border-foreground/30 hover:text-foreground'
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{g.name}</span>
                </button>
              );
            })}
            {groups.length > 1 && (
              <button
                type="button"
                onClick={() => selectGroups(groups.map((g) => g.id))}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer',
                  targetGroupIds.length === groups.length
                    ? 'border-primary bg-primary text-primary-foreground shadow-xs'
                    : 'border-border bg-card text-muted-foreground hover:border-foreground/30 hover:text-foreground'
                )}
              >
                <Layers className="h-3.5 w-3.5" />
                <span>All Surfaces</span>
              </button>
            )}
          </div>
        </div>
      </Section>

      {/* ── Search Bar ─────────────────────────────────────────────── */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by tile name, SKU, colour, finish…"
          className="ds-field py-2 pl-9 pr-8"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
            aria-label="Clear search"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* ── Category Tabs ──────────────────────────────────────────── */}
      <Section title="Tile Categories">
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setActiveCategory('all')}
            className={cn('ds-tab h-7 px-3 text-2xs cursor-pointer', activeCategory === 'all' && 'ds-tab-active')}
          >
            All Categories ({tiles.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveCategory('floor')}
            className={cn('ds-tab h-7 px-3 text-2xs cursor-pointer', activeCategory === 'floor' && 'ds-tab-active')}
          >
            Floor Tiles
          </button>
          <button
            type="button"
            onClick={() => setActiveCategory('wall')}
            className={cn('ds-tab h-7 px-3 text-2xs cursor-pointer', activeCategory === 'wall' && 'ds-tab-active')}
          >
            Wall Tiles
          </button>
          {dynamicCategories
            .filter((c) => !['floor', 'wall', 'both'].includes(c.toLowerCase()))
            .map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setActiveCategory(cat)}
                className={cn('ds-tab h-7 px-3 text-2xs cursor-pointer capitalize', activeCategory === cat && 'ds-tab-active')}
              >
                {cat}
              </button>
            ))}
        </div>
      </Section>

      {/* ── Material Filter Chips ───────────────────────────────────── */}
      <div className="space-y-1.5">
        <span className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
          Material Filter
        </span>
        <div className="flex flex-wrap gap-1.5">
          {MATERIALS.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setActiveMaterial(m.id)}
              className={cn('ds-tab h-7 px-3 text-2xs cursor-pointer', activeMaterial === m.id && 'ds-tab-active')}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tiles Grid ─────────────────────────────────────────────── */}
      <Section
        title="Tiles"
        aside={`${filteredTiles.length} ${filteredTiles.length === 1 ? 'tile' : 'tiles'}`}
      >
        {isLoadingTiles ? (
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-44 animate-pulse rounded-2xl bg-muted" />
            ))}
          </div>
        ) : filteredTiles.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border px-4 py-8 text-center">
            <Tag className="mx-auto mb-2 h-6 w-6 text-muted-foreground/60" />
            <p className="text-xs font-semibold text-foreground">No tiles match this category</p>
            <p className="mt-1 text-2xs text-muted-foreground">
              Try switching category or clearing the search query.
            </p>
            <button
              type="button"
              onClick={() => {
                setActiveCategory('all');
                setActiveMaterial('all');
                setSearchQuery('');
              }}
              className="ds-btn ds-btn-sm ds-btn-outline mt-3"
            >
              Reset Filters
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2.5">
            {filteredTiles.map((tile) => {
              const isAppliedToTarget = targetGroupIds.some(
                (gid) => design.surfaces[gid]?.tile?.id === tile.id
              );
              const isLastApplied = lastAppliedTileId === tile.id;

              return (
                <div
                  key={tile.id}
                  onClick={() => handleApplyTile(tile)}
                  className={cn(
                    'group relative flex flex-col overflow-hidden rounded-2xl border bg-card p-2 text-left transition-all cursor-pointer hover:shadow-md',
                    isAppliedToTarget
                      ? 'border-primary ring-2 ring-primary/40 bg-accent/30'
                      : 'border-border hover:border-foreground/30'
                  )}
                >
                  {/* Tile Preview Image */}
                  <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-muted">
                    <img
                      src={tile.previewUrl || tile.textureUrl}
                      alt={tile.name}
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />

                    {/* Applied check badge */}
                    {isAppliedToTarget && (
                      <span className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
                        <Check className="h-3.5 w-3.5" strokeWidth={3} />
                      </span>
                    )}

                    {/* Category pill */}
                    <span className="absolute bottom-1.5 left-1.5 rounded-md bg-black/60 px-1.5 py-0.5 text-[9px] font-semibold text-white capitalize backdrop-blur-xs">
                      {tile.category || 'All surfaces'}
                    </span>
                  </div>

                  {/* Tile Information */}
                  <div className="mt-2 flex-1 space-y-0.5">
                    <p className="line-clamp-1 text-xs font-bold text-foreground">
                      {tile.name}
                    </p>
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                      <span>{tile.widthMm} × {tile.heightMm} mm</span>
                      {tile.finish && (
                        <span className="font-medium text-foreground/80 capitalize">{tile.finish}</span>
                      )}
                    </div>
                    {tile.pricePerSqFt != null && (
                      <p className="text-xs font-semibold text-foreground">
                        {formatLKR(tile.pricePerSqFt)}
                      </p>
                    )}
                  </div>

                  {/* Apply Action CTA */}
                  <div className="mt-2 pt-1 border-t border-border/50">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleApplyTile(tile);
                      }}
                      className={cn(
                        'w-full h-7 rounded-lg text-2xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer',
                        isAppliedToTarget
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-foreground hover:bg-primary hover:text-primary-foreground'
                      )}
                    >
                      {isAppliedToTarget ? (
                        <>
                          <Check className="h-3 w-3" />
                          Applied
                        </>
                      ) : (
                        'Apply to Surface'
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {/* ── Jump to Design Tab Banner ─────────────────────────────── */}
      {onGoToDesign && (
        <div className="rounded-2xl border border-border bg-card p-3 flex items-center justify-between gap-3 shadow-xs">
          <div className="min-w-0">
            <p className="text-xs font-bold text-foreground">Fine-tune your layout?</p>
            <p className="text-2xs text-muted-foreground">Adjust grout color, tile patterns, and rotation in Design.</p>
          </div>
          <button
            type="button"
            onClick={onGoToDesign}
            className="ds-btn ds-btn-sm ds-btn-primary shrink-0 cursor-pointer"
          >
            Design
            <ArrowRight className="h-3.5 w-3.5 ml-1" />
          </button>
        </div>
      )}
    </div>
  );
}
