"use client";

import React, { useState, useMemo, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { deleteTile } from "@/actions/shop";
import { formatLKR, cn } from "@/lib/utils";
import { Search, Trash2, Grid, List, X, Plus, ExternalLink, Sparkles, Pencil, SlidersHorizontal, Check, ChevronDown, Layers, CheckSquare } from "lucide-react";
import { EmptyState } from "@/components/dashboard";
import { EditTileDrawer, type EditableTile } from "./EditTileDrawer";

interface ShopTileCatalogProps {
  tiles: any[];
  userId?: string;
  onOpenAddModal?: () => void;
  canAddTile?: boolean;
  /** False when the main administrator has not given this showroom the 3D visualizer. */
  canOpen3D?: boolean;
  /** False when the main administrator has not given this showroom the 2D visualizer. */
  canOpen2D?: boolean;
  collections?: { id: string; name: string; tileIds?: string[] }[];
  selectingForCollection?: { id: string; name: string } | null;
  selectedCollectionTileIds?: string[];
  onToggleCollectionTile?: (tileId: string) => void;
  onSaveCollectionSelection?: () => void;
  onCancelCollectionSelection?: () => void;
  onAssignTilesToCollection?: (tileIds: string[], collectionId: string) => void;
}

interface DropdownOption {
  value: string;
  label: string;
}

function FilterDropdown({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label: string;
  value: string;
  options: DropdownOption[];
  onChange: (val: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const selectedOption = options.find((o) => o.value === value) || options[0];
  const isFiltered = value !== options[0]?.value;

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          "h-10 pl-3.5 pr-8 rounded-xl border text-xs font-semibold transition-all cursor-pointer shadow-2xs flex items-center justify-between gap-2 select-none relative",
          "focus:outline-none focus:ring-1 focus:ring-zinc-900/30 dark:focus:ring-white/30",
          isFiltered
            ? "bg-black text-white border-black dark:bg-white dark:text-black dark:border-white font-bold"
            : "bg-field text-foreground border-border hover:bg-muted/70",
          className
        )}
      >
        <span className="truncate">{selectedOption?.label || label}</span>
        <ChevronDown
          className={cn(
            "w-3.5 h-3.5 transition-transform duration-200 pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2",
            open && "rotate-180",
            isFiltered ? "text-white/80 dark:text-black/80" : "text-muted-foreground"
          )}
        />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1.5 min-w-[170px] w-max rounded-xl border border-border bg-card dark:bg-[#18181b] text-card-foreground shadow-2xl p-1.5 z-50 animate-in fade-in-0 zoom-in-95 duration-100">
          <div className="space-y-0.5">
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
                    "w-full flex items-center justify-between gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-left transition-colors cursor-pointer",
                    isSelected
                      ? "bg-black text-white dark:bg-white dark:text-black font-bold"
                      : "text-foreground hover:bg-muted dark:hover:bg-zinc-800"
                  )}
                >
                  <span>{option.label}</span>
                  {isSelected && <Check className="w-3.5 h-3.5 stroke-[2.5]" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export function ShopTileCatalog({
  tiles,
  userId,
  onOpenAddModal,
  canAddTile = true,
  canOpen3D = true,
  canOpen2D = true,
  collections = [],
  selectingForCollection = null,
  selectedCollectionTileIds = [],
  onToggleCollectionTile,
  onSaveCollectionSelection,
  onCancelCollectionSelection,
  onAssignTilesToCollection,
}: ShopTileCatalogProps) {
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedFinish, setSelectedFinish] = useState("all");
  const [sortBy, setSortBy] = useState<"newest" | "name" | "price-asc" | "price-desc">("newest");
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditableTile | null>(null);
  const router = useRouter();

  const isSelectionMode = !!selectingForCollection;
  const effectiveSelectedIds = selectedCollectionTileIds;

  const toggleSelectTile = (tileId: string) => {
    if (selectingForCollection) {
      onToggleCollectionTile?.(tileId);
    }
  };

  const activeFilterCount =
    (selectedCategory !== "all" ? 1 : 0) +
    (selectedFinish !== "all" ? 1 : 0) +
    (sortBy !== "newest" ? 1 : 0);

  const handleOpen3D = (e: React.MouseEvent) => {
    e.preventDefault();
    const isFs = !!document.fullscreenElement || (typeof window !== "undefined" && sessionStorage.getItem("tileviz_fullscreen") === "true");
    const base = userId ? `/visualizer?shopId=${userId}` : "/visualizer";
    const target = isFs ? `${base}${base.includes("?") ? "&" : "?"}fullscreen=true` : base;
    if (isFs) {
      sessionStorage.setItem("tileviz_fullscreen", "true");
    }
    if (typeof window !== "undefined") {
      window.location.href = target;
    }
  };

  const handleOpen2D = (e: React.MouseEvent) => {
    e.preventDefault();
    const isFs = !!document.fullscreenElement || (typeof window !== "undefined" && sessionStorage.getItem("tileviz_fullscreen") === "true");
    const base = userId ? `/visualizer-2d?shopId=${userId}` : "/visualizer-2d";
    const target = isFs ? `${base}${base.includes("?") ? "&" : "?"}fullscreen=true` : base;
    if (typeof window !== "undefined") {
      window.location.href = target;
    }
  };

  const filtered = useMemo(() => {
    return tiles
      .filter((tile) => {
        if (search.trim()) {
          const q = search.toLowerCase();
          const matchName = tile.name.toLowerCase().includes(q);
          const matchSku = tile.sku.toLowerCase().includes(q);
          if (!matchName && !matchSku) return false;
        }
        if (selectedCategory !== "all") {
          if (selectedCategory === "both") {
            if (tile.category !== "both") return false;
          } else if (tile.category !== selectedCategory && tile.category !== "both") {
            return false;
          }
        }
        if (selectedFinish !== "all" && (tile.finish || "Matt") !== selectedFinish) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === "name") return a.name.localeCompare(b.name);
        if (sortBy === "price-asc") return (a.pricePerSqFt || 0) - (b.pricePerSqFt || 0);
        if (sortBy === "price-desc") return (b.pricePerSqFt || 0) - (a.pricePerSqFt || 0);
        return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      });
  }, [tiles, search, selectedCategory, selectedFinish, sortBy]);

  const handleDelete = async (tileId: string) => {
    if (!confirm("Are you sure you want to remove this tile from your showroom?")) return;
    setDeletingId(tileId);
    await deleteTile(tileId);
    setDeletingId(null);
  };

  return (
    <div className="space-y-4">
      {/* ── SELECTION MODE BANNER (when choosing tiles for a collection) ── */}
      {selectingForCollection && (
        <div className="p-4 sm:p-5 rounded-2xl bg-zinc-950 text-white dark:bg-zinc-900 dark:text-zinc-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xl border border-zinc-800">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-white/10 backdrop-blur-sm flex items-center justify-center shrink-0 border border-white/10">
              <Layers className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-2xs uppercase tracking-wider font-bold text-white/70">
                  Selecting Tiles For Collection
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-2xs font-bold bg-white/20 text-white border border-white/20">
                  {effectiveSelectedIds.length} {effectiveSelectedIds.length === 1 ? "tile" : "tiles"} selected
                </span>
              </div>
              <h2 className="text-base font-bold tracking-tight text-white mt-0.5">
                {selectingForCollection.name}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onCancelCollectionSelection}
              className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold text-white transition-colors cursor-pointer border border-white/10"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onSaveCollectionSelection}
              className="px-5 py-2 rounded-xl bg-white text-zinc-950 hover:bg-zinc-100 text-xs font-bold transition-all shadow-md cursor-pointer flex items-center gap-1.5"
            >
              <Check className="w-3.5 h-3.5 text-zinc-950" />
              <span>Done & Save ({effectiveSelectedIds.length})</span>
            </button>
          </div>
        </div>
      )}

      {/* ── CATALOG ACTION BAR ────────────────────────────────────── */}
      <div className="flex flex-col gap-3 pb-1">
        {/* Row 1: Search + Inline Dropdowns */}
        <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center">
          {/* Search Box */}
          <div className="relative flex-1 min-w-0 max-w-md">
            <Search className="w-3.5 h-3.5 absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <input 
              type="text"
              placeholder="Search tiles by name, SKU..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full text-xs pl-9 pr-8 py-2.5 rounded-xl bg-field border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-zinc-900/40 dark:focus:ring-white/40 focus:border-zinc-900 dark:focus:border-white transition-all shadow-2xs"
            />
            {search && (
              <button 
                type="button"
                onClick={() => setSearch("")} 
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Inline Filter Dropdowns — theme-matching black/white custom dropdowns */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Category Dropdown */}
            <FilterDropdown
              label="All Surfaces"
              value={selectedCategory}
              onChange={setSelectedCategory}
              options={[
                { value: "all", label: "All Surfaces" },
                { value: "floor", label: "Floor Only" },
                { value: "wall", label: "Wall Only" },
                { value: "both", label: "Both" },
              ]}
            />

            {/* Finish Dropdown */}
            <FilterDropdown
              label="All Finishes"
              value={selectedFinish}
              onChange={setSelectedFinish}
              options={[
                { value: "all", label: "All Finishes" },
                { value: "Matt", label: "Matt" },
                { value: "Gloss", label: "Glossy" },
                { value: "Polished", label: "Polished" },
                { value: "Satin", label: "Satin" },
              ]}
            />

            {/* Sort Dropdown */}
            <FilterDropdown
              label="Newest First"
              value={sortBy}
              onChange={(val) => setSortBy(val as any)}
              options={[
                { value: "newest", label: "Newest First" },
                { value: "name", label: "Name (A–Z)" },
                { value: "price-asc", label: "Price: Low → High" },
                { value: "price-desc", label: "Price: High → Low" },
              ]}
            />

            {/* Reset Filters (only when filters are active) */}
            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={() => {
                  setSelectedCategory("all");
                  setSelectedFinish("all");
                  setSortBy("newest");
                }}
                className="h-10 px-3 rounded-xl border border-border text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <X className="w-3 h-3" />
                Reset
              </button>
            )}
          </div>

          {/* Right Side: View Mode + Select (conditional) + Add Tile */}
          <div className="flex items-center gap-2 ml-auto shrink-0">
            {/* Grid / Table Toggle */}
            <div className="flex border border-border rounded-xl bg-muted p-0.5 shrink-0">
              <button
                type="button"
                onClick={() => setViewMode("grid")}
                className={`p-2 rounded-lg transition-colors cursor-pointer ${
                  viewMode === "grid" 
                    ? "bg-primary text-primary-foreground shadow-xs font-bold" 
                    : "text-muted-foreground hover:text-foreground"
                }`}
                title="Grid View"
              >
                <Grid className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode("table")}
                className={`p-2 rounded-lg transition-colors cursor-pointer ${
                  viewMode === "table" 
                    ? "bg-primary text-primary-foreground shadow-xs font-bold" 
                    : "text-muted-foreground hover:text-foreground"
                }`}
                title="Table View"
              >
                <List className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Selection Mode indicator — ONLY visible when selecting for a collection */}
            {selectingForCollection && (
              <span className="h-10 px-3 rounded-xl border border-primary/30 bg-primary/5 text-xs font-semibold flex items-center gap-1.5 text-primary">
                <CheckSquare className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Selecting</span>
              </span>
            )}

          </div>
        </div>

        {/* Active filter summary strip */}
        <div className="flex items-center justify-between text-2xs text-muted-foreground">
          <span>
            Showing <span className="font-bold text-foreground">{filtered.length}</span> tile{filtered.length === 1 ? "" : "s"}
            {activeFilterCount > 0 && (
              <span> with {activeFilterCount} filter{activeFilterCount === 1 ? "" : "s"} applied</span>
            )}
          </span>
        </div>
      </div>

      {/* ── VIEW MODE: GRID ───────────────────────────────────────── */}
      {viewMode === "grid" && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {filtered.map((tile) => {
            const isSelected = effectiveSelectedIds.includes(tile.id);
            return (
              <div 
                key={tile.id}
                onClick={() => {
                  if (isSelectionMode) toggleSelectTile(tile.id);
                }}
                className={cn(
                  "group relative rounded-2xl overflow-hidden border bg-card shadow-elevated flex flex-col transition-all duration-200",
                  isSelected
                    ? "border-primary ring-2 ring-primary bg-primary/5"
                    : "border-border hover:border-foreground/30",
                  isSelectionMode && "cursor-pointer"
                )}
              >
                {/* Texture Image Container */}
                <div className="h-36 w-full relative overflow-hidden bg-muted">
                  <img 
                    src={tile.previewUrl || tile.textureUrl} 
                    alt={tile.name} 
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  
                  {/* Select Checkbox (ONLY visible when selecting for collection) */}
                  {isSelectionMode && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleSelectTile(tile.id);
                      }}
                      className={cn(
                        "absolute top-2.5 left-2.5 w-7 h-7 rounded-lg flex items-center justify-center transition-all cursor-pointer z-10",
                        isSelected
                          ? "bg-primary text-primary-foreground shadow-sm ring-2 ring-primary"
                          : "bg-black/70 hover:bg-black text-white border border-white/50"
                      )}
                      title={isSelected ? "Deselect tile" : "Select tile"}
                    >
                      {isSelected ? (
                        <Check className="w-4 h-4 stroke-[3]" />
                      ) : (
                        <div className="w-3.5 h-3.5 rounded border border-white/70" />
                      )}
                    </button>
                  )}

                  {/* SKU Monogram */}
                  <span className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-lg bg-black/80 backdrop-blur-xs text-2xs font-mono font-bold text-white border border-white/20">
                    {tile.sku}
                  </span>

                {/* Quick 2D & 3D Preview Links */}
                <div className="absolute bottom-2 left-2.5 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  {canOpen2D && (
                    <button
                      type="button"
                      onClick={handleOpen2D}
                      className="px-2 py-0.5 rounded-lg bg-black/80 hover:bg-black backdrop-blur-xs text-2xs font-bold text-white border border-white/20 flex items-center gap-1 cursor-pointer"
                      title="Test tile in 2D Visualizer"
                    >
                      <span>2D View</span>
                      <ExternalLink className="w-2.5 h-2.5" />
                    </button>
                  )}
                  {canOpen3D && (
                    <button
                      type="button"
                      onClick={handleOpen3D}
                      className="px-2 py-0.5 rounded-lg bg-black/80 hover:bg-black backdrop-blur-xs text-2xs font-bold text-white border border-white/20 flex items-center gap-1 cursor-pointer"
                      title="Test tile in 3D Visualizer"
                    >
                      <span>3D View</span>
                      <ExternalLink className="w-2.5 h-2.5" />
                    </button>
                  )}
                </div>
                
                {/* Edit Button */}
                <button
                  type="button"
                  onClick={() => setEditing(tile)}
                  className="absolute top-2.5 right-12 w-7 h-7 rounded-lg bg-card/90 hover:bg-accent border border-input text-foreground/80 hover:text-foreground flex items-center justify-center transition-opacity sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100"
                  title="Edit Tile"
                  aria-label={`Edit ${tile.name}`}
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>

                {/* Delete Button */}
                <button
                  onClick={() => handleDelete(tile.id)}
                  disabled={deletingId === tile.id}
                  className="absolute top-2.5 right-2.5 w-7 h-7 rounded-lg bg-card/90 hover:bg-accent border border-input text-foreground/80 hover:text-destructive flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50"
                  title="Remove Tile"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Information */}
              <div className="p-3.5 space-y-2 bg-card flex-1 flex flex-col justify-between">
                <div>
                  <p className="text-xs font-bold text-foreground truncate leading-tight">{tile.name}</p>
                  <div className="flex items-center justify-between text-2xs mt-1">
                    <span className="text-muted-foreground font-mono">
                      {tile.widthMm}×{tile.heightMm}mm
                    </span>
                    <span className="text-2xs font-semibold px-1.5 py-0.5 rounded-md bg-muted text-foreground/80 border border-border/70 shrink-0 capitalize">
                      {tile.finish || "Matt"}
                    </span>
                  </div>
                </div>

                <div className="pt-2 border-t border-border flex items-center justify-between text-2xs">
                  <span className="text-muted-foreground capitalize text-2xs px-1.5 py-0.5 rounded bg-muted border border-border">
                    {tile.category === "both" ? "Both" : tile.category}
                  </span>
                  <span className="text-foreground font-bold font-mono">
                    {tile.pricePerSqFt ? formatLKR(tile.pricePerSqFt) : "Custom"}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
        </div>
      )}

      {/* ── VIEW MODE: TABLE ──────────────────────────────────────── */}
      {viewMode === "table" && (
        <div className="overflow-x-auto border border-border rounded-2xl bg-card shadow-xs">
          <table className="min-w-full divide-y divide-border text-xs">
            <thead>
              <tr className="bg-muted text-2xs font-bold uppercase tracking-wider text-muted-foreground">
                {isSelectionMode && (
                  <th className="px-3 py-3 w-10 text-center">
                    <CheckSquare className="w-3.5 h-3.5 mx-auto" />
                  </th>
                )}
                <th className="px-4 py-3 text-left">Texture</th>
                <th className="px-4 py-3 text-left">SKU</th>
                <th className="px-4 py-3 text-left">Tile Name</th>
                <th className="px-4 py-3 text-left">Dimensions</th>
                <th className="px-4 py-3 text-left">Application</th>
                <th className="px-4 py-3 text-left">Finish</th>
                <th className="px-4 py-3 text-left">Price</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((tile) => {
                const isSelected = effectiveSelectedIds.includes(tile.id);
                return (
                  <tr
                    key={tile.id}
                    onClick={() => {
                      if (isSelectionMode) toggleSelectTile(tile.id);
                    }}
                    className={cn(
                      "transition-colors",
                      isSelected ? "bg-primary/10 hover:bg-primary/15" : "hover:bg-accent/60",
                      isSelectionMode && "cursor-pointer"
                    )}
                  >
                    {isSelectionMode && (
                      <td className="px-3 py-2.5 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => {
                            e.stopPropagation();
                            toggleSelectTile(tile.id);
                          }}
                          className="rounded border-border text-primary focus:ring-primary cursor-pointer w-4 h-4"
                        />
                      </td>
                    )}
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <img 
                      src={tile.previewUrl || tile.textureUrl} 
                      alt={tile.name} 
                      className="w-10 h-10 rounded-lg object-cover border border-border"
                    />
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap font-mono font-bold text-foreground">
                    {tile.sku}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap font-semibold text-foreground">
                    {tile.name}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap font-mono text-muted-foreground">
                    {tile.widthMm} × {tile.heightMm} mm
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap capitalize text-muted-foreground">
                    {tile.category === "both" ? "Both" : tile.category}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">
                    {tile.finish || "Matt"}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap font-mono font-bold text-foreground">
                    {tile.pricePerSqFt ? `${formatLKR(tile.pricePerSqFt)}` : "—"}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-right space-x-1.5">
                    {canOpen2D && (
                      <button
                        type="button"
                        onClick={handleOpen2D}
                        className="px-2.5 py-1 rounded-lg border border-input bg-muted hover:bg-accent text-2xs font-semibold text-foreground/80 hover:text-foreground transition-colors inline-flex items-center gap-1 cursor-pointer"
                        title="Open in 2D Studio"
                      >
                        <span>2D View</span>
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    )}
                    {canOpen3D && (
                      <button
                        type="button"
                        onClick={handleOpen3D}
                        className="px-2.5 py-1 rounded-lg border border-input bg-muted hover:bg-accent text-2xs font-semibold text-foreground/80 hover:text-foreground transition-colors inline-flex items-center gap-1 cursor-pointer"
                        title="Open in 3D Studio"
                      >
                        <span>3D View</span>
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setEditing(tile)}
                      className="px-2.5 py-1 rounded-lg border border-input bg-muted hover:bg-accent text-2xs font-semibold text-foreground/80 hover:text-foreground transition-colors inline-flex items-center gap-1 cursor-pointer"
                      title="Edit Tile"
                      aria-label={`Edit ${tile.name}`}
                    >
                      <Pencil className="w-3 h-3" />
                      <span>Edit</span>
                    </button>
                    <button
                      onClick={() => handleDelete(tile.id)}
                      disabled={deletingId === tile.id}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-accent transition-colors"
                      title="Delete Tile"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              );
            })}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <EditTileDrawer
          key={editing.id}
          tile={editing}
          onClose={() => setEditing(null)}
          collections={collections}
          initialCollectionId={collections.find((c) => c.tileIds?.includes(editing.id))?.id || ""}
          onCollectionChange={(tileId, colId) => onAssignTilesToCollection?.([tileId], colId)}
        />
      )}

      {/* Empty State */}
      {filtered.length === 0 && (
        <EmptyState
          icon={Sparkles}
          title="No tiles match your current filter"
          description="Try adjusting your search keywords, surface finish, or add your first tile texture to your showroom."
          className="py-16"
          action={
            onOpenAddModal && canAddTile && (
              <button type="button" onClick={onOpenAddModal} className="ds-btn ds-btn-lg ds-btn-primary">
                <Plus className="w-4 h-4" />
                <span>Add Your First Tile</span>
              </button>
            )
          }
        />
      )}

    </div>
  );
}
