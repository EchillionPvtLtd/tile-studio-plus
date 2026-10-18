'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Grid3X3,
  Layers,
  Maximize2,
  Minimize2,
  RotateCcw,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import type { Tile } from '@/types/tile';
import { cn, formatLKR } from '@/lib/utils';

const BASE_MATERIALS = [
  { id: 'all', label: 'All Materials' },
  { id: 'ceramic', label: 'Ceramic' },
  { id: 'porcelain', label: 'Porcelain' },
  { id: 'marble', label: 'Marble' },
  { id: 'wood', label: 'Wood' },
  { id: 'granite', label: 'Granite' },
  { id: 'mosaic', label: 'Mosaic' },
] as const;

const FINISH_OPTIONS = [
  { value: 'all', label: 'All Finishes' },
  { value: 'Matt', label: 'Matt' },
  { value: 'Gloss', label: 'Gloss' },
  { value: 'Polished', label: 'Polished' },
  { value: 'Satin', label: 'Satin' },
] as const;

const SORT_OPTIONS = [
  { value: 'default', label: 'Sort: Featured' },
  { value: 'price-asc', label: 'Price: Low → High' },
  { value: 'price-desc', label: 'Price: High → Low' },
  { value: 'name-asc', label: 'Name (A–Z)' },
] as const;

type SortOption = (typeof SORT_OPTIONS)[number]['value'];

function matchesMaterial(t: Tile, m: string) {
  if (m === 'all') return true;
  const hay = `${t.material ?? ''} ${t.name}`.toLowerCase();
  if (m === 'wood') return hay.includes('wood') || hay.includes('plank') || hay.includes('oak');
  return hay.includes(m.toLowerCase());
}

interface DropdownOption {
  value: string;
  label: string;
}

interface FilterDropdownProps {
  value: string;
  onChange: (value: string) => void;
  options: readonly DropdownOption[] | DropdownOption[];
  defaultLabel: string;
  className?: string;
}

function FilterDropdown({ value, onChange, options, defaultLabel, className }: FilterDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const selectedOption = options.find((o) => o.value === value);
  const isFiltered = value !== 'all' && value !== 'default';

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          'h-8 pl-3 pr-7 rounded-xl border text-2xs font-semibold transition-all cursor-pointer shadow-2xs flex items-center justify-between gap-1.5 select-none relative',
          'focus:outline-none focus:ring-1 focus:ring-zinc-900/30 dark:focus:ring-white/30',
          isFiltered
            ? 'bg-black text-white border-black dark:bg-white dark:text-black dark:border-white font-bold'
            : 'bg-card text-foreground border-border hover:bg-muted/70',
          className,
        )}
      >
        <span className="truncate max-w-[120px]">{selectedOption?.label || defaultLabel}</span>
        <ChevronDown
          className={cn(
            'w-3 h-3 transition-transform duration-200 pointer-events-none absolute right-2 top-1/2 -translate-y-1/2',
            open && 'rotate-180',
            isFiltered ? 'text-white/80 dark:text-black/80' : 'text-muted-foreground',
          )}
        />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1.5 min-w-[155px] w-max rounded-xl border border-border bg-card dark:bg-[#18181b] text-card-foreground shadow-2xl p-1 z-50 animate-in fade-in-0 zoom-in-95 duration-100">
          <div className="space-y-0.5 max-h-56 overflow-y-auto custom-scrollbar">
            {options.map((option) => {
              const isSelected = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  className={cn(
                    'w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-2xs font-medium text-left transition-colors cursor-pointer',
                    isSelected
                      ? 'bg-black text-white dark:bg-white dark:text-black font-bold'
                      : 'text-foreground hover:bg-muted dark:hover:bg-zinc-800',
                  )}
                >
                  <span className="truncate">{option.label}</span>
                  {isSelected && <Check className="w-3 h-3 stroke-[2.5]" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

const CATEGORY_OPTIONS = [
  { value: 'all', label: 'All Categories' },
  { value: 'floor', label: 'Floor' },
  { value: 'wall', label: 'Wall' },
  { value: 'both', label: 'Floor & Wall' },
] as const;

function matchesCategory(t: Tile, cat: string) {
  if (cat === 'all') return true;
  const c = (t.category || 'both').toLowerCase();
  if (cat === 'floor') return c === 'floor' || c === 'both';
  if (cat === 'wall') return c === 'wall' || c === 'both';
  if (cat === 'both') return c === 'both';
  return c === cat.toLowerCase();
}

interface CatalogCollection {
  id: string;
  name: string;
  desc: string;
  image?: string;
  tileIds?: string[];
  count?: number;
}

interface TileCatalogProps {
  tiles: Tile[];
  isLoading: boolean;
  /** Surface preference: 'floor', 'wall', or 'all'. Defaults to 'all'. */
  use?: 'floor' | 'wall' | 'all';
  selectedSku: string | null | undefined;
  onSelect: (tile: Tile) => void;
}

export function TileCatalog({ tiles, isLoading, use = 'all', selectedSku, onSelect }: TileCatalogProps) {
  const [catalogTab, setCatalogTab] = useState<'all' | 'collections'>('all');
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);
  const [collections, setCollections] = useState<CatalogCollection[]>([]);

  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string>(() => (use && use !== 'all' ? use : 'all'));
  const [material, setMaterial] = useState<string>('all');
  const [finish, setFinish] = useState<string>('all');
  const [sortBy, setSortBy] = useState<SortOption>('default');
  const [showFilters, setShowFilters] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isModalOpen) {
        setIsModalOpen(false);
      }
    };
    if (isModalOpen) {
      window.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isModalOpen]);

  const scrollLeft = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: -scrollContainerRef.current.clientWidth * 0.85, behavior: 'smooth' });
    }
  };

  const scrollRight = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: scrollContainerRef.current.clientWidth * 0.85, behavior: 'smooth' });
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (scrollContainerRef.current) {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && e.deltaY !== 0) {
        scrollContainerRef.current.scrollLeft += e.deltaY;
      }
    }
  };

  useEffect(() => {
    if (use && use !== 'all') {
      setCategory(use);
    }
  }, [use]);

  // Load collections from localStorage (showroom data) or defaults
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const shopId = urlParams.get('shopId');

      let loaded: CatalogCollection[] = [];
      if (shopId) {
        const raw = localStorage.getItem(`shop_collections_${shopId}`);
        if (raw) loaded = JSON.parse(raw);
      }

      if (!loaded || loaded.length === 0) {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith('shop_collections_')) {
            const raw = localStorage.getItem(key);
            if (raw) {
              const parsed = JSON.parse(raw);
              if (Array.isArray(parsed) && parsed.length > 0) {
                loaded = parsed;
                break;
              }
            }
          }
        }
      }

      if (!loaded || loaded.length === 0) {
        loaded = [
          {
            id: 'col-1',
            name: 'Luxury Italian Marble Suite',
            desc: 'Refined Carrara, Calacatta, and Nero Marquina finishes with mirror-polished reflectivity.',
            image: '',
            tileIds: [],
          },
          {
            id: 'col-2',
            name: 'Nordic Architectural Wood Planks',
            desc: 'Natural oak, walnut, and smoked timber grain textures with realistic matte tactile feel.',
            image: '',
            tileIds: [],
          },
          {
            id: 'col-3',
            name: 'Urban Concrete & Industrial Stone',
            desc: 'Subtle micro-cement, brushed slate, and raw industrial surfaces ideal for modern open lofts.',
            image: '',
            tileIds: [],
          },
          {
            id: 'col-4',
            name: 'Warm Travertine & Desert Sand',
            desc: 'Earthy Mediterranean textures with soft porous character and warm ambient warmth.',
            image: '',
            tileIds: [],
          },
        ];
      }

      setCollections(loaded);
    } catch (e) {
      console.error('Error reading saved collections:', e);
    }
  }, []);

  const getTilesForCol = (col: CatalogCollection): Tile[] => {
    if (col.tileIds && col.tileIds.length > 0) {
      const matched = tiles.filter((t) => col.tileIds!.includes(t.id) || col.tileIds!.includes(t.sku));
      if (matched.length > 0) return matched;
    }

    const n = (col.name || '').toLowerCase();
    if (n.includes('marble')) {
      const res = tiles.filter((t) => `${t.name} ${t.material ?? ''}`.toLowerCase().includes('marble'));
      if (res.length > 0) return res;
    }
    if (n.includes('wood') || n.includes('plank')) {
      const res = tiles.filter((t) => {
        const hay = `${t.name} ${t.material ?? ''}`.toLowerCase();
        return hay.includes('wood') || hay.includes('plank') || hay.includes('oak');
      });
      if (res.length > 0) return res;
    }
    if (n.includes('concrete') || n.includes('stone') || n.includes('industrial')) {
      const res = tiles.filter((t) => {
        const hay = `${t.name} ${t.material ?? ''}`.toLowerCase();
        return hay.includes('concrete') || hay.includes('stone') || hay.includes('slate') || hay.includes('granite');
      });
      if (res.length > 0) return res;
    }
    if (n.includes('travertine') || n.includes('sand')) {
      const res = tiles.filter((t) => {
        const hay = `${t.name} ${t.material ?? ''} ${t.colorName ?? ''}`.toLowerCase();
        return hay.includes('travertine') || hay.includes('sand') || hay.includes('beige') || hay.includes('cream');
      });
      if (res.length > 0) return res;
    }

    // Default distribution: divide tiles across collections
    const colIdx = collections.findIndex((c) => c.id === col.id);
    if (colIdx >= 0 && tiles.length > 0) {
      const chunkSize = Math.max(2, Math.ceil(tiles.length / Math.max(1, collections.length)));
      const start = (colIdx * chunkSize) % tiles.length;
      return tiles.slice(start, start + chunkSize).concat(tiles.slice(0, Math.max(0, start + chunkSize - tiles.length)));
    }

    return tiles;
  };

  const pool = useMemo(() => {
    if (catalogTab === 'collections' && selectedCollectionId) {
      const col = collections.find((c) => c.id === selectedCollectionId);
      if (col) {
        return getTilesForCol(col);
      }
    }
    return tiles;
  }, [tiles, catalogTab, selectedCollectionId, collections]);

  const selectedCollection = useMemo(() => {
    return collections.find((c) => c.id === selectedCollectionId) || null;
  }, [collections, selectedCollectionId]);

  // Dynamic categories list for dropdown
  const categoryOptions = useMemo(() => {
    const dynamicSet = new Set<string>();
    tiles.forEach((t) => {
      if (t.category && t.category.trim()) {
        const cat = t.category.trim().toLowerCase();
        if (!['floor', 'wall', 'both', 'all'].includes(cat)) {
          dynamicSet.add(cat);
        }
      }
    });

    const extra = Array.from(dynamicSet).map((c) => ({
      value: c,
      label: c.charAt(0).toUpperCase() + c.slice(1),
    }));

    return [
      { value: 'all', label: 'All Categories' },
      { value: 'floor', label: 'Floor' },
      { value: 'wall', label: 'Wall' },
      { value: 'both', label: 'Floor & Wall' },
      ...extra,
    ];
  }, [tiles]);

  // Dynamic materials list for dropdown
  const materialOptions = useMemo(() => {
    const dynamicSet = new Set<string>();
    pool.forEach((t) => {
      if (t.material && t.material.trim()) {
        dynamicSet.add(t.material.trim().toLowerCase());
      }
    });

    const knownIds = new Set(BASE_MATERIALS.map((m) => m.id));
    const extra = Array.from(dynamicSet)
      .filter((m) => !knownIds.has(m as any))
      .map((m) => ({ value: m, label: m.charAt(0).toUpperCase() + m.slice(1) }));

    return [
      ...BASE_MATERIALS.map((m) => ({ value: m.id, label: m.label })),
      ...extra,
    ];
  }, [pool]);

  // Compute price bounds from the pool
  const { absMinPrice, absMaxPrice } = useMemo(() => {
    if (pool.length === 0) return { absMinPrice: 0, absMaxPrice: 1000 };
    const validPrices = pool
      .map((t) => t.pricePerSqFt)
      .filter((p): p is number => typeof p === 'number' && !isNaN(p) && p >= 0);

    if (validPrices.length === 0) return { absMinPrice: 0, absMaxPrice: 1000 };
    const min = Math.min(...validPrices);
    const max = Math.max(...validPrices);
    const roundedMin = Math.floor(min / 25) * 25;
    const roundedMax = Math.ceil(max / 25) * 25;

    return {
      absMinPrice: roundedMin,
      absMaxPrice: roundedMax === roundedMin ? roundedMin + 500 : roundedMax,
    };
  }, [pool]);

  // Price range state: null means no custom price filter active
  const [priceRange, setPriceRange] = useState<[number, number] | null>(null);

  const currentMinPrice = priceRange ? priceRange[0] : absMinPrice;
  const currentMaxPrice = priceRange ? priceRange[1] : absMaxPrice;
  const isPriceFiltered = priceRange !== null && (priceRange[0] > absMinPrice || priceRange[1] < absMaxPrice);
  const isCategoryFiltered = category !== 'all';

  // Dynamic price preset chips
  const pricePresets = useMemo(() => {
    const range = absMaxPrice - absMinPrice;
    if (range <= 50) return [];
    const p1 = Math.round((absMinPrice + range * 0.33) / 25) * 25;
    const p2 = Math.round((absMinPrice + range * 0.66) / 25) * 25;
    return [
      { label: 'All', min: absMinPrice, max: absMaxPrice },
      { label: `< ${formatLKR(p1)}`, min: absMinPrice, max: p1 },
      { label: `${formatLKR(p1)} – ${formatLKR(p2)}`, min: p1, max: p2 },
      { label: `${formatLKR(p2)}+`, min: p2, max: absMaxPrice },
    ];
  }, [absMinPrice, absMaxPrice]);

  // Active filter count
  const activeFilterCount =
    (isCategoryFiltered ? 1 : 0) +
    (isPriceFiltered ? 1 : 0) +
    (finish !== 'all' ? 1 : 0) +
    (material !== 'all' ? 1 : 0) +
    (sortBy !== 'default' ? 1 : 0);

  const handleResetAll = () => {
    setQuery('');
    setCategory('all');
    setMaterial('all');
    setFinish('all');
    setPriceRange(null);
    setSortBy('default');
  };

  // Filter tiles
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();

    const filtered = pool.filter((t) => {
      // Category filter
      if (!matchesCategory(t, category)) return false;

      // Material filter
      if (!matchesMaterial(t, material)) return false;

      // Finish filter
      if (finish !== 'all' && (t.finish || '').toLowerCase() !== finish.toLowerCase()) {
        return false;
      }

      // Price filter
      if (isPriceFiltered) {
        const p = t.pricePerSqFt ?? 0;
        if (p < currentMinPrice || p > currentMaxPrice) return false;
      }

      // Search query
      if (q) {
        const hay = [t.name, t.sku, t.material, t.colorName, t.finish, t.brand, t.category].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }

      return true;
    });

    // Sort tiles
    if (sortBy === 'price-asc') {
      filtered.sort((a, b) => (a.pricePerSqFt || 0) - (b.pricePerSqFt || 0));
    } else if (sortBy === 'price-desc') {
      filtered.sort((a, b) => (b.pricePerSqFt || 0) - (a.pricePerSqFt || 0));
    } else if (sortBy === 'name-asc') {
      filtered.sort((a, b) => a.name.localeCompare(b.name));
    }

    return filtered;
  }, [pool, category, material, finish, isPriceFiltered, currentMinPrice, currentMaxPrice, query, sortBy]);

  // Slider progress bar percentages
  const step = absMaxPrice - absMinPrice > 1000 ? 50 : 25;
  const pctMin = Math.max(0, Math.min(100, ((currentMinPrice - absMinPrice) / (absMaxPrice - absMinPrice)) * 100));
  const pctMax = Math.max(0, Math.min(100, ((currentMaxPrice - absMinPrice) / (absMaxPrice - absMinPrice)) * 100));

  return (
    <div className="space-y-2.5">
      {/* 0. Full-width All vs Collections Segmented Control */}
      <div className="grid grid-cols-2 p-1 rounded-xl bg-muted/60 dark:bg-zinc-900 border border-border/70 select-none">
        <button
          type="button"
          onClick={() => {
            setCatalogTab('all');
            setSelectedCollectionId(null);
          }}
          className={cn(
            'h-8 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center justify-center gap-1.5',
            catalogTab === 'all'
              ? 'bg-black text-white dark:bg-white dark:text-black shadow-xs font-bold'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <Grid3X3 className="w-3.5 h-3.5" />
          <span>All</span>
        </button>
        <button
          type="button"
          onClick={() => {
            setCatalogTab('collections');
          }}
          className={cn(
            'h-8 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center justify-center gap-1.5',
            catalogTab === 'collections'
              ? 'bg-black text-white dark:bg-white dark:text-black shadow-xs font-bold'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Collections</span>
        </button>
      </div>

      {catalogTab === 'collections' && !selectedCollectionId ? (
        <div className="space-y-3 pt-1">
          <div className="flex items-center justify-between text-2xs text-muted-foreground px-0.5">
            <span>Showroom Collections ({collections.length})</span>
            <span>Click any box to open</span>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            {collections.map((col) => {
              const colTiles = getTilesForCol(col);
              const coverImg = col.image || (colTiles[0]?.previewUrl || colTiles[0]?.textureUrl) || '';
              return (
                <button
                  key={col.id}
                  type="button"
                  onClick={() => setSelectedCollectionId(col.id)}
                  className="group overflow-hidden rounded-2xl border border-border bg-card hover:border-foreground/40 hover:shadow-xs transition-all text-left flex flex-col cursor-pointer"
                >
                  <div className="relative h-24 overflow-hidden bg-muted">
                    {coverImg ? (
                      <img
                        src={coverImg}
                        alt={col.name}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center bg-muted/60 text-muted-foreground">
                        <Layers className="h-5 w-5 opacity-40" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex items-end p-2 justify-between">
                      <span className="text-[10px] font-bold text-white px-1.5 py-0.5 rounded-md bg-black/60 backdrop-blur-xs">
                        {colTiles.length} tiles
                      </span>
                      <ChevronRight className="w-3.5 h-3.5 text-white/90 group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  </div>
                  <div className="p-2.5 space-y-0.5">
                    <p className="truncate text-xs font-bold text-foreground group-hover:text-primary transition-colors">
                      {col.name}
                    </p>
                    <p className="text-[10px] text-muted-foreground line-clamp-2 leading-tight">
                      {col.desc || 'Curated design collection'}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="space-y-2.5">
          {/* Active Collection Header */}
          {catalogTab === 'collections' && selectedCollection && (
            <div className="p-2.5 rounded-xl bg-card border border-border flex items-center justify-between gap-2 shadow-2xs">
              <button
                type="button"
                onClick={() => setSelectedCollectionId(null)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted border border-border transition-all cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Collections</span>
              </button>
              <div className="text-right truncate min-w-0">
                <p className="text-xs font-bold text-foreground truncate">{selectedCollection.name}</p>
                <p className="text-[10px] text-muted-foreground">{pool.length} tiles in suite</p>
              </div>
            </div>
          )}

          {/* 1. Search Bar & Filter Toggle Row */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tiles by name, colour, finish…"
            className="w-full text-xs pl-9 pr-8 py-2 rounded-xl bg-card border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-foreground/40 focus:border-foreground/50 transition-all shadow-2xs"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer p-0.5"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Filter Toggle Button with Badge */}
        <button
          type="button"
          onClick={() => setShowFilters((prev) => !prev)}
          className={cn(
            'h-9 px-3 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shrink-0 shadow-2xs select-none',
            showFilters || activeFilterCount > 0
              ? 'bg-foreground text-background border-foreground font-bold shadow-xs'
              : 'bg-card text-foreground border-border hover:bg-muted/70'
          )}
          title={showFilters ? 'Close filters' : 'Open filters'}
          aria-expanded={showFilters}
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          <span>Filters</span>
          {activeFilterCount > 0 && (
            <span
              className={cn(
                'flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-black',
                showFilters || activeFilterCount > 0
                  ? 'bg-background text-foreground'
                  : 'bg-foreground text-background'
              )}
            >
              {activeFilterCount}
            </span>
          )}
          <ChevronDown
            className={cn('w-3.5 h-3.5 transition-transform duration-200', showFilters && 'rotate-180')}
          />
        </button>
      </div>

      {/* 2. Active Filter Tags (Quick dismiss chips when filters are applied) */}
      {activeFilterCount > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5 px-0.5">
          {isCategoryFiltered && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-muted border border-border text-foreground text-2xs font-medium">
              <span>{categoryOptions.find((o) => o.value === category)?.label || category}</span>
              <button
                type="button"
                onClick={() => setCategory('all')}
                className="hover:text-foreground cursor-pointer text-muted-foreground"
                aria-label="Remove category filter"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
          {material !== 'all' && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-muted border border-border text-foreground text-2xs font-medium">
              <span>{materialOptions.find((o) => o.value === material)?.label || material}</span>
              <button
                type="button"
                onClick={() => setMaterial('all')}
                className="hover:text-foreground cursor-pointer text-muted-foreground"
                aria-label="Remove material filter"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
          {finish !== 'all' && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-muted border border-border text-foreground text-2xs font-medium">
              <span>{finish}</span>
              <button
                type="button"
                onClick={() => setFinish('all')}
                className="hover:text-foreground cursor-pointer text-muted-foreground"
                aria-label="Remove finish filter"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
          {isPriceFiltered && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-muted border border-border text-foreground text-2xs font-medium">
              <span>{formatLKR(currentMinPrice)} – {formatLKR(currentMaxPrice)}</span>
              <button
                type="button"
                onClick={() => setPriceRange(null)}
                className="hover:text-foreground cursor-pointer text-muted-foreground"
                aria-label="Remove price filter"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
          {sortBy !== 'default' && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-muted border border-border text-foreground text-2xs font-medium">
              <span>{SORT_OPTIONS.find((o) => o.value === sortBy)?.label}</span>
              <button
                type="button"
                onClick={() => setSortBy('default')}
                className="hover:text-foreground cursor-pointer text-muted-foreground"
                aria-label="Remove sort"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
          <button
            type="button"
            onClick={handleResetAll}
            className="text-2xs font-semibold text-muted-foreground hover:text-foreground underline underline-offset-2 ml-1 cursor-pointer transition-colors"
          >
            Clear all
          </button>
        </div>
      )}

      {/* 3. Filter Dropdown Drawer / Popover Panel */}
      {showFilters && (
        <div className="rounded-2xl border border-border bg-card p-3.5 space-y-3.5 shadow-md animate-in fade-in-0 zoom-in-98 duration-150">
          <div className="flex items-center justify-between border-b border-border/60 pb-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
              <SlidersHorizontal className="w-3.5 h-3.5 text-foreground" />
              <span>Filter Tiles</span>
              {activeFilterCount > 0 && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-2xs font-semibold text-foreground">
                  {activeFilterCount} active
                </span>
              )}
            </div>
            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={handleResetAll}
                className="flex items-center gap-1 text-2xs font-semibold text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset all</span>
              </button>
            )}
          </div>

          {/* Specifications Dropdowns: Category, Material, Finish, Sort */}
          <div className="space-y-1.5">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Specifications</span>
            <div className="flex flex-wrap items-center gap-2">
              <FilterDropdown
                value={category}
                onChange={setCategory}
                options={categoryOptions}
                defaultLabel="All Categories"
              />
              <FilterDropdown
                value={material}
                onChange={setMaterial}
                options={materialOptions}
                defaultLabel="All Materials"
              />
              <FilterDropdown
                value={finish}
                onChange={setFinish}
                options={FINISH_OPTIONS}
                defaultLabel="All Finishes"
              />
              <FilterDropdown
                value={sortBy}
                onChange={(v) => setSortBy(v as SortOption)}
                options={SORT_OPTIONS}
                defaultLabel="Sort By"
              />
            </div>
          </div>

          {/* Premium Price Range Slider */}
          <div className="space-y-2 pt-1 border-t border-border/50">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Price Range</span>
              <div className="flex items-center gap-1 font-mono text-2xs font-bold px-2 py-0.5 rounded-md bg-muted border border-border/60 text-foreground">
                <span>{formatLKR(currentMinPrice)}</span>
                <span className="text-muted-foreground">–</span>
                <span>{formatLKR(currentMaxPrice)}</span>
              </div>
            </div>

            {/* Dual Slider Track with Modern Thumbs */}
            <div className="relative my-3 flex h-6 items-center">
              {/* Base track */}
              <div className="absolute h-1.5 w-full rounded-full bg-muted dark:bg-zinc-800 pointer-events-none z-0" />

              {/* Progress track */}
              <div
                className="absolute h-1.5 rounded-full bg-foreground transition-all duration-75 pointer-events-none z-10"
                style={{
                  left: `${pctMin}%`,
                  width: `${Math.max(0, pctMax - pctMin)}%`,
                }}
              />

              {/* Min Slider Thumb */}
              <input
                type="range"
                min={absMinPrice}
                max={absMaxPrice}
                step={step}
                value={currentMinPrice}
                onChange={(e) => {
                  const val = Math.min(Number(e.target.value), currentMaxPrice - step);
                  setPriceRange([val, currentMaxPrice]);
                }}
                className={cn(
                  'range-slider-thumb pointer-events-none absolute w-full appearance-none bg-transparent z-20',
                  '[&::-webkit-slider-thumb]:pointer-events-auto [&::-moz-range-thumb]:pointer-events-auto'
                )}
                aria-label="Minimum price"
              />

              {/* Max Slider Thumb */}
              <input
                type="range"
                min={absMinPrice}
                max={absMaxPrice}
                step={step}
                value={currentMaxPrice}
                onChange={(e) => {
                  const val = Math.max(Number(e.target.value), currentMinPrice + step);
                  setPriceRange([currentMinPrice, val]);
                }}
                className={cn(
                  'range-slider-thumb pointer-events-none absolute w-full appearance-none bg-transparent z-30',
                  '[&::-webkit-slider-thumb]:pointer-events-auto [&::-moz-range-thumb]:pointer-events-auto'
                )}
                aria-label="Maximum price"
              />
            </div>

            {/* Min & Max labels */}
            <div className="flex items-center justify-between text-[10px] text-muted-foreground font-mono px-0.5">
              <span>{formatLKR(absMinPrice)}</span>
              <span>{formatLKR(absMaxPrice)}</span>
            </div>

            {/* Quick Price Preset Chips */}
            {pricePresets.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                {pricePresets.map((p, idx) => {
                  const isActive =
                    (p.label === 'All' && !isPriceFiltered) ||
                    (p.label !== 'All' && currentMinPrice === p.min && currentMaxPrice === p.max);
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        if (p.label === 'All') {
                          setPriceRange(null);
                        } else {
                          setPriceRange([p.min, p.max]);
                        }
                      }}
                      className={cn(
                        'rounded-lg px-2.5 py-1 text-2xs font-semibold transition-all cursor-pointer',
                        isActive
                          ? 'bg-foreground text-background shadow-xs font-bold'
                          : 'border border-border bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground',
                      )}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Close / Apply button */}
          <div className="pt-1 border-t border-border/50">
            <button
              type="button"
              onClick={() => setShowFilters(false)}
              className="w-full py-2 rounded-xl bg-foreground text-background text-xs font-bold hover:opacity-90 transition-opacity cursor-pointer shadow-xs"
            >
              Apply & Close
            </button>
          </div>
        </div>
      )}

      {/* 4. Active Filter Summary & Expand/Scroll Controls */}
      <div className="flex items-center justify-between text-2xs text-muted-foreground px-0.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="truncate">
            Showing <strong className="text-foreground">{visible.length}</strong> of{' '}
            <strong className="text-foreground">{pool.length}</strong> tiles
          </span>
          {visible.length > 6 && (
            <span className="text-[10px] text-muted-foreground/70 hidden sm:inline">(Scroll →)</span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {/* Horizontal Scroll Arrows (compact mode with > 6 tiles) */}
          {visible.length > 6 && (
            <div className="flex items-center gap-0.5 bg-muted/70 rounded-lg p-0.5 border border-border/60 shadow-2xs">
              <button
                type="button"
                onClick={scrollLeft}
                className="h-6 w-6 rounded flex items-center justify-center hover:bg-card text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                title="Scroll tiles left"
                aria-label="Scroll tiles left"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={scrollRight}
                className="h-6 w-6 rounded flex items-center justify-center hover:bg-card text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                title="Scroll tiles right"
                aria-label="Scroll tiles right"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* Expand All Modal Pop-up Button */}
          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-2xs font-bold transition-all cursor-pointer border shadow-2xs bg-card text-foreground border-border hover:border-primary/60 hover:bg-accent active:scale-95"
            title="Expand to view all tiles in a popup"
            aria-label="Expand all tiles popup"
          >
            <Maximize2 className="h-3 w-3 stroke-[2.5]" />
            <span>Expand All</span>
          </button>
        </div>
      </div>

      {/* 5. Tiles Grid (Compact 3 rows in side panel) */}
      {isLoading ? (
        <div className="grid grid-rows-3 grid-flow-col auto-cols-[calc((100%-10px)/2)] gap-2.5 overflow-hidden">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-[125px] animate-pulse rounded-2xl bg-muted" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border px-4 py-8 text-center space-y-2">
          <Grid3X3 className="mx-auto h-6 w-6 text-muted-foreground/60" />
          <p className="text-xs font-semibold text-foreground">No matching tiles found</p>
          <p className="text-2xs text-muted-foreground">Try adjusting your filters or price range.</p>
          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={handleResetAll}
              className="mt-1 ds-btn ds-btn-sm ds-btn-outline mx-auto"
            >
              Reset all filters
            </button>
          )}
        </div>
      ) : (
        <div
          ref={scrollContainerRef}
          onWheel={handleWheel}
          className="grid grid-rows-3 grid-flow-col auto-cols-[calc((100%-10px)/2)] gap-2.5 overflow-x-auto pb-2.5 pt-0.5 scrollbar-thin scroll-smooth"
        >
          {visible.map((t) => {
            const selected = selectedSku === t.sku;
            return (
              <button
                key={t.sku}
                type="button"
                onClick={() => onSelect(t)}
                title={`${t.name} · ${t.sku} · ${t.finish}`}
                aria-pressed={selected}
                className={cn(
                  'group overflow-hidden rounded-2xl border bg-card text-left transition-all cursor-pointer flex flex-col snap-start',
                  selected
                    ? 'border-primary ring-2 ring-primary shadow-sm'
                    : 'border-border hover:border-foreground/30 hover:shadow-xs',
                )}
              >
                <div className="relative overflow-hidden bg-muted shrink-0 h-18 sm:h-20 md:h-22">
                  <img
                    src={t.previewUrl || t.textureUrl}
                    alt={t.name}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                  {selected && (
                    <span className="absolute right-1.5 top-1.5 flex h-5 w-5 sm:h-6 sm:w-6 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
                      <Check className="h-3 w-3 sm:h-3.5 sm:w-3.5" strokeWidth={3} />
                    </span>
                  )}
                  {t.finish && (
                    <span className="absolute right-1.5 bottom-1.5 rounded-md bg-black/60 backdrop-blur-xs px-1.5 py-0.5 text-[9px] font-medium text-white capitalize">
                      {t.finish}
                    </span>
                  )}
                </div>
                <div className="space-y-0.5 p-1.5 sm:p-2 flex-1 min-w-0 flex flex-col justify-between">
                  <p className="truncate text-[11px] sm:text-xs font-semibold text-foreground group-hover:text-primary transition-colors">
                    {t.name}
                  </p>
                  <p className="flex items-center justify-between gap-1 text-[10px] sm:text-2xs text-muted-foreground">
                    <span className="truncate">
                      {t.widthMm}×{t.heightMm}
                    </span>
                    <span className="shrink-0 font-bold text-foreground font-mono">
                      {t.pricePerSqFt ? formatLKR(t.pricePerSqFt) : '—'}
                    </span>
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* 6. Expand All Modal Popup (Full Catalog with Close button) */}
      {isModalOpen && mounted && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-md p-3 sm:p-6 animate-in fade-in duration-200"
          onClick={() => setIsModalOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="tile-catalog-modal-title"
        >
          <div
            className="relative flex flex-col w-full max-w-5xl h-[88vh] max-h-[850px] rounded-3xl border border-border bg-card text-card-foreground shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-border px-5 py-4 sm:px-6 bg-card/90 backdrop-blur-sm sticky top-0 z-10 shrink-0">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary shrink-0">
                  <Grid3X3 className="h-5 w-5" />
                </div>
                <div>
                  <h3 id="tile-catalog-modal-title" className="text-base sm:text-lg font-bold text-foreground leading-tight">
                    All Tiles Catalog
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {visible.length} {visible.length === 1 ? 'tile' : 'tiles'} available · Click any tile to select
                  </p>
                </div>
              </div>

              {/* Search input on desktop & Close Button */}
              <div className="flex items-center gap-2.5">
                <div className="relative hidden md:block w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search by name or SKU..."
                    className="w-full h-9 rounded-xl border border-input bg-muted/50 pl-8 pr-7 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                  />
                  {query && (
                    <button
                      type="button"
                      onClick={() => setQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>

                {/* Close Button ("cloas button") */}
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-border bg-muted/60 hover:bg-destructive hover:text-white hover:border-destructive text-foreground transition-all cursor-pointer shadow-xs text-xs font-bold shrink-0"
                  title="Close tile catalog popup"
                  aria-label="Close"
                >
                  <X className="h-4 w-4 stroke-[2.5]" />
                  <span>Close</span>
                </button>
              </div>
            </div>

            {/* Mobile search bar if on small screen */}
            <div className="md:hidden px-4 py-2 border-b border-border bg-muted/20 shrink-0">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by name or SKU..."
                  className="w-full h-8.5 rounded-xl border border-input bg-card pl-8 pr-7 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>

            {/* Modal Filter chips */}
            <div className="flex items-center gap-2 px-5 py-2.5 sm:px-6 border-b border-border/60 bg-muted/15 overflow-x-auto scrollbar-none text-2xs shrink-0">
              <button
                type="button"
                onClick={() => { setCategory('all'); setSelectedCollectionId(null); }}
                className={cn(
                  'px-3 py-1 rounded-full font-bold whitespace-nowrap transition-colors border shadow-2xs',
                  category === 'all' && !selectedCollectionId ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-muted-foreground border-border hover:text-foreground'
                )}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setCategory('floor')}
                className={cn(
                  'px-3 py-1 rounded-full font-bold whitespace-nowrap transition-colors border shadow-2xs',
                  category === 'floor' ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-muted-foreground border-border hover:text-foreground'
                )}
              >
                Floor Tiles
              </button>
              <button
                type="button"
                onClick={() => setCategory('wall')}
                className={cn(
                  'px-3 py-1 rounded-full font-bold whitespace-nowrap transition-colors border shadow-2xs',
                  category === 'wall' ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-muted-foreground border-border hover:text-foreground'
                )}
              >
                Wall Tiles
              </button>
              {collections.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedCollectionId(selectedCollectionId === c.id ? null : c.id)}
                  className={cn(
                    'px-3 py-1 rounded-full font-bold whitespace-nowrap transition-colors border shadow-2xs',
                    selectedCollectionId === c.id ? 'bg-amber-500 text-black border-amber-500 font-extrabold' : 'bg-card text-muted-foreground border-border hover:text-foreground'
                  )}
                >
                  {c.name}
                </button>
              ))}
            </div>

            {/* Modal Body: Spacious Tiles Grid */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 scrollbar-thin">
              {visible.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border px-6 py-16 text-center space-y-3">
                  <Grid3X3 className="mx-auto h-8 w-8 text-muted-foreground/60" />
                  <p className="text-sm font-semibold text-foreground">No matching tiles found</p>
                  <p className="text-xs text-muted-foreground">Try clearing your search query or filters.</p>
                  <button
                    type="button"
                    onClick={handleResetAll}
                    className="ds-btn ds-btn-sm ds-btn-outline mx-auto"
                  >
                    Reset all filters
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3.5">
                  {visible.map((t) => {
                    const selected = selectedSku === t.sku;
                    return (
                      <button
                        key={`modal-${t.sku}`}
                        type="button"
                        onClick={() => onSelect(t)}
                        title={`${t.name} · ${t.sku} · ${t.finish}`}
                        aria-pressed={selected}
                        className={cn(
                          'group relative overflow-hidden rounded-2xl border bg-card text-left transition-all cursor-pointer flex flex-col',
                          selected
                            ? 'border-primary ring-2 ring-primary shadow-md bg-primary/5'
                            : 'border-border hover:border-foreground/30 hover:shadow-md hover:-translate-y-0.5'
                        )}
                      >
                        <div className="relative aspect-square w-full overflow-hidden bg-muted shrink-0">
                          <img
                            src={t.previewUrl || t.textureUrl}
                            alt={t.name}
                            loading="lazy"
                            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                          />
                          {selected && (
                            <span className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md ring-2 ring-white/20">
                              <Check className="h-4 w-4 stroke-[3]" />
                            </span>
                          )}
                          {t.finish && (
                            <span className="absolute left-2 bottom-2 rounded-md bg-black/65 backdrop-blur-xs px-2 py-0.5 text-[10px] font-medium text-white capitalize">
                              {t.finish}
                            </span>
                          )}
                        </div>
                        <div className="space-y-1 p-3 flex-1 min-w-0 flex flex-col justify-between">
                          <div>
                            <p className="truncate text-xs font-bold text-foreground group-hover:text-primary transition-colors">
                              {t.name}
                            </p>
                            <p className="text-2xs text-muted-foreground font-mono truncate">
                              SKU: {t.sku}
                            </p>
                          </div>
                          <div className="flex items-center justify-between gap-1 pt-1.5 border-t border-border/50 text-2xs">
                            <span className="text-muted-foreground">
                              {t.widthMm}×{t.heightMm} mm
                            </span>
                            <span className="font-bold text-foreground font-mono">
                              {t.pricePerSqFt ? formatLKR(t.pricePerSqFt) : '—'}
                            </span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between border-t border-border px-5 py-3 sm:px-6 bg-card/90 backdrop-blur-sm shrink-0">
              <p className="text-xs text-muted-foreground">
                {selectedSku ? (
                  <span>Selected: <strong className="text-foreground">{selectedSku}</strong></span>
                ) : (
                  'Click any tile to select and apply'
                )}
              </p>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="ds-btn ds-btn-sm ds-btn-primary px-5"
              >
                Done
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
        </div>
      )}
    </div>
  );
}

