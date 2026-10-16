"use client";

import { AlertTriangle, ArrowUpRight, ChevronRight, Compass, CreditCard, Image as ImageIcon, Layers, Plus } from "lucide-react";
import { EmptyState, NeumorphicMetricCard } from "@/components/dashboard";
import { TileLimitChart } from "@/components/dashboard/TileLimitChart";
import { cn } from "@/lib/utils";

export interface DashboardTile {
  id?: string;
  name: string;
  sku: string;
  category: string;
  widthMm: number;
  heightMm: number;
  finish?: string | null;
  pricePerSqFt?: number | null;
  previewUrl?: string | null;
  textureUrl?: string | null;
}

export interface ShopDashboardProps {
  hasLogo: boolean;
  tilesCount: number;
  tileQuota: number;
  quotaPercent: number;
  isQuotaFull: boolean;
  floorTilesCount: number;
  wallTilesCount: number;
  savedDesignsCount: number;
  /** Designs saved in each month of this year, January first. */
  activity: { month: string; count: number; isCurrent: boolean }[];
  plan: string;
  /** Whole days until the plan or trial ends, or null when there is no end date. */
  daysRemaining: number | null;
  recentTiles: DashboardTile[];
  onUploadTile: () => void;
  onManageTiles: () => void;
  onOpenBranding: () => void;
  onOpenPlan: () => void;
}



/** One headline figure: label, big value and a line of context. */
function Metric({ label, value, suffix, hint, children, className }: {
  label: string;
  value: React.ReactNode;
  suffix?: string;
  hint?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("ds-card flex flex-col justify-between gap-3 p-5 sm:p-6", className)}>
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-muted-foreground">{label}</p>
        <p className="mt-1 truncate text-2xl font-semibold leading-tight tabular-nums tracking-tight text-foreground">
          {value}
          {suffix && <span className="ml-1.5 text-sm font-medium text-muted-foreground">{suffix}</span>}
        </p>
      </div>
      {children}
      {hint != null && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function SectionHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="ds-section-title">{title}</h2>
        {subtitle && <p className="ds-subtitle">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

/** The shop dashboard: what the showroom has, how customers are using it, and what to do next. */
export function ShopDashboard(p: ShopDashboardProps) {
  const slotsFree = Math.max(0, p.tileQuota - p.tilesCount);
  const nearLimit = p.quotaPercent >= 80;
  const planSoon = p.daysRemaining !== null && p.daysRemaining <= 14;

  const todo = [
    p.tilesCount === 0 && { key: "tile", label: "Upload your first tile", hint: "So customers have something to try on", action: p.onUploadTile },
    !p.hasLogo && { key: "logo", label: "Add your showroom logo", hint: "Shown on quotes and in the 3D room", action: p.onOpenBranding },
  ].filter(Boolean) as { key: string; label: string; hint: string; action: () => void }[];

  return (
    <div className="space-y-6">
      {/* Only shown when it matters */}
      {nearLimit && (
        <div
          role="status"
          className={cn(
            "flex flex-col gap-3 rounded-2xl border px-5 py-4 sm:flex-row sm:items-center sm:justify-between",
            p.isQuotaFull ? "border-destructive/30 bg-destructive-muted text-destructive" : "border-warning/30 bg-warning-muted text-warning"
          )}
        >
          <p className="flex items-start gap-2.5 text-sm font-semibold">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              {p.isQuotaFull ? "Your tile storage is full." : `You have used ${p.quotaPercent}% of your tile storage.`}{" "}
              <span className="font-medium opacity-80">{p.tilesCount} of {p.tileQuota} slots used.</span>
            </span>
          </p>
          <button type="button" onClick={p.onOpenPlan} className="inline-flex cursor-pointer items-center gap-1 self-start text-xs font-bold underline-offset-2 hover:underline sm:self-auto">
            See plans <ArrowUpRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Headline numbers: Reusable Neumorphic Cards (Uiverse.io by Codewithvinay) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 py-2">
        <NeumorphicMetricCard
          label="Hosted tiles"
          value={p.tilesCount}
          suffix={`of ${p.tileQuota}`}
          hint={
            <>
              {slotsFree} slot{slotsFree === 1 ? "" : "s"} free · {p.floorTilesCount} floor, {p.wallTilesCount} wall
            </>
          }
          onClick={p.onManageTiles}
        />

        <NeumorphicMetricCard
          label="Saved designs"
          value={p.savedDesignsCount}
          hint={p.savedDesignsCount === 0 ? "Rooms customers design will appear here" : "Rooms customers designed with your tiles"}
        />

        <NeumorphicMetricCard
          label="Your plan"
          value={p.plan}
          hint={
            p.daysRemaining === null
              ? "Ongoing subscription"
              : p.daysRemaining === 0
                ? "Ends today"
                : `${p.daysRemaining} days remaining`
          }
          onClick={p.onOpenPlan}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              p.onOpenPlan();
            }}
            className="self-start text-xs font-semibold text-primary underline-offset-2 hover:underline cursor-pointer"
          >
            Change plan
          </button>
        </NeumorphicMetricCard>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-12">
        {/* Recent tiles */}
        <section className="ds-card flex flex-col justify-between space-y-5 p-5 sm:p-6 lg:p-7 md:col-span-7 lg:col-span-8">
          <SectionHeader
            title="Recent tiles"
            subtitle="The latest tiles active in your visualizer studio"
            action={
              p.tilesCount > 0 ? (
                <button
                  type="button"
                  onClick={p.onManageTiles}
                  className="shrink-0 cursor-pointer text-xs font-semibold text-primary hover:underline inline-flex items-center gap-1"
                >
                  View all ({p.tilesCount}) →
                </button>
              ) : undefined
            }
          />
          {p.tilesCount === 0 ? (
            <EmptyState
              icon={Layers}
              title="No tiles uploaded yet"
              description="Upload your showroom tiles so customers can apply them to floors and walls in 3D."
              action={
                <button type="button" onClick={p.onUploadTile} className="ds-btn ds-btn-lg ds-btn-primary mt-2">
                  <Plus className="h-4 w-4" />
                  <span>Upload first tile</span>
                </button>
              }
            />
          ) : (
            <div className="flex flex-col gap-2.5">
              {p.recentTiles.slice(0, 4).map((tile, i) => (
                <div
                  key={tile.id ?? i}
                  onClick={p.onManageTiles}
                  className="group relative flex items-center justify-between gap-4 p-3 rounded-xl border border-border/70 bg-muted/20 hover:bg-muted/60 hover:border-primary/40 transition-all duration-200 cursor-pointer"
                >
                  <div className="flex items-center gap-3.5 min-w-0 flex-1">
                    <div className="h-12 w-12 sm:h-13 sm:w-13 shrink-0 overflow-hidden rounded-xl border border-border bg-background shadow-2xs">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={tile.previewUrl || tile.textureUrl || ""}
                        alt={tile.name}
                        className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="truncate text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                          {tile.name}
                        </p>
                        {tile.category && (
                          <span className="text-2xs font-medium px-2 py-0.5 rounded-md bg-background border border-border/60 text-muted-foreground">
                            {tile.category.toLowerCase() === "both" ? "Both" : tile.category.toLowerCase() === "floor" ? "Floor" : "Wall"}
                          </span>
                        )}
                      </div>
                      <p className="truncate font-mono text-2xs text-muted-foreground mt-0.5">
                        {tile.sku} · {tile.widthMm} × {tile.heightMm} mm
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    {tile.finish && (
                      <span className="text-2xs font-medium px-2 py-0.5 rounded-md bg-muted border border-border/70 text-foreground/80 capitalize">
                        {tile.finish}
                      </span>
                    )}
                    {tile.pricePerSqFt ? (
                      <span className="font-mono text-xs sm:text-sm font-bold text-foreground">
                        LKR {tile.pricePerSqFt.toLocaleString()}
                      </span>
                    ) : (
                      <span className="text-2xs text-muted-foreground">-</span>
                    )}
                    <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Tile limit: how much of the plan's storage is used and how much is left */}
        <section className="ds-card space-y-5 p-5 sm:p-6 lg:p-7 md:col-span-5 lg:col-span-4">
          <SectionHeader
            title="Tile storage"
            subtitle="How much of your plan's tile limit is in use"
            action={
              <span
                className={cn(
                  "shrink-0 rounded-full border px-2.5 py-0.5 font-mono text-2xs font-bold",
                  p.isQuotaFull ? "border-destructive/30 bg-destructive-muted text-destructive" : nearLimit ? "border-warning/30 bg-warning-muted text-warning" : "border-input bg-secondary text-foreground/80"
                )}
              >
                {p.quotaPercent}% used
              </span>
            }
          />
          <TileLimitChart used={p.tilesCount} quota={p.tileQuota} />
          <dl className="grid grid-cols-2 gap-3">
            <div className="ds-inset px-4 py-3">
              <dt className="flex items-center gap-2 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                <span className={cn("h-2.5 w-2.5 rounded-[3px]", p.isQuotaFull ? "bg-destructive" : nearLimit ? "bg-warning" : "bg-primary")} />
                Used
              </dt>
              <dd className="mt-1 font-mono text-xl font-bold text-foreground">{p.tilesCount}</dd>
            </div>
            <div className="ds-inset px-4 py-3">
              <dt className="flex items-center gap-2 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                <span className="h-2.5 w-2.5 rounded-[3px] border border-input bg-secondary" />
                Left
              </dt>
              <dd className="mt-1 font-mono text-xl font-bold text-foreground">{slotsFree}</dd>
            </div>
          </dl>
          {p.isQuotaFull ? (
            <button type="button" onClick={p.onOpenPlan} className="ds-btn ds-btn-outline w-full">
              See plans for more slots
            </button>
          ) : (
            <button type="button" onClick={p.onUploadTile} className="ds-btn ds-btn-outline w-full">
              <Plus className="h-4 w-4" />
              <span>Upload a tile</span>
            </button>
          )}
        </section>

        {/* Next steps: only the ones still to do */}
        {todo.length > 0 && (
          <section className="ds-card space-y-4 p-6 sm:p-7 md:col-span-12">
            <SectionHeader title="Getting started" subtitle={`${todo.length} step${todo.length === 1 ? "" : "s"} left`} />
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {todo.map((t) => (
                <li key={t.key}>
                  <button
                    type="button"
                    onClick={t.action}
                    className="group flex w-full cursor-pointer items-center gap-3 rounded-2xl border border-border bg-muted px-4 py-3 text-left transition-colors hover:border-input hover:bg-secondary"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground">
                      {t.key === "logo" ? <ImageIcon className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-bold text-foreground">{t.label}</span>
                      <span className="block text-2xs text-muted-foreground">{t.hint}</span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
