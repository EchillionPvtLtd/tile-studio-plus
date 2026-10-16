"use client";

import { useId, useState } from "react";
import type { RevenueChartPoint } from "./RevenueChart";

const W = 680;
const H = 260;
const PAD = { l: 46, r: 22, t: 22, b: 34 };
const CHART_W = W - PAD.l - PAD.r;
const CHART_H = H - PAD.t - PAD.b;
const BASE_Y = PAD.t + CHART_H;

/** Four evenly spaced ticks on a 1-2-2.5-5 step, so every axis label is an exact, round number. */
function niceStep(max: number): number {
  if (max <= 0) return 2500;
  const raw = max / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const n = raw / mag;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
}

const fmtAxis = (n: number) => (n >= 1_000_000 ? `${+(n / 1_000_000).toFixed(2)}M` : n >= 1000 ? `${+(n / 1000).toFixed(1)}K` : `${n}`);
const lkr = (n: number) => `LKR ${n.toLocaleString("en-US")}`;

type Pt = { x: number; y: number };

/**
 * A smooth path through the points that never overshoots: between two months the line stays between their values,
 * so it cannot dip below zero or rise above a real figure (monotone cubic, Fritsch-Carlson).
 */
function smoothPath(pts: Pt[]): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M ${pts[0].x},${pts[0].y}`;
  const n = pts.length;
  const dx = pts.slice(1).map((p, i) => p.x - pts[i].x);
  const slope = pts.slice(1).map((p, i) => (p.y - pts[i].y) / dx[i]);
  const m = new Array<number>(n);
  m[0] = slope[0];
  m[n - 1] = slope[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (slope[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i] / slope[i];
    const b = m[i + 1] / slope[i];
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      m[i] = t * a * slope[i];
      m[i + 1] = t * b * slope[i];
    }
  }
  let d = `M ${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += ` C ${pts[i].x + h},${pts[i].y + m[i] * h} ${pts[i + 1].x - h},${pts[i + 1].y - m[i + 1] * h} ${pts[i + 1].x},${pts[i + 1].y}`;
  }
  return d;
}

/**
 * Line chart for revenue: a solid line with a soft fill for money collected and a dashed line for money still to collect.
 * Same props as RevenueChart, so either can be used in its place. Hover (or touch) a month to read the exact figures.
 */
export function RevenueLineChart({ data, ariaLabel }: { data: RevenueChartPoint[]; ariaLabel: string }) {
  const gradId = `revFill-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const [hovered, setHovered] = useState<number | null>(null);

  const step = niceStep(Math.max(0, ...data.map((d) => Math.max(d.collected, d.owed))));
  const maxVal = step * 4;
  const yOf = (v: number) => PAD.t + (1 - v / maxVal) * CHART_H;

  const band = CHART_W / Math.max(1, data.length);
  const points = data.map((d, i) => ({
    ...d,
    total: d.collected + d.owed,
    x: PAD.l + band * (i + 0.5),
    yCollected: yOf(d.collected),
    yOwed: yOf(d.owed),
  }));
  const empty = points.every((p) => p.total === 0);
  const hasOwed = points.some((p) => p.owed > 0);
  const active = hovered !== null ? points[hovered] : undefined;

  const collectedLine = smoothPath(points.map((p) => ({ x: p.x, y: p.yCollected })));
  const owedLine = smoothPath(points.map((p) => ({ x: p.x, y: p.yOwed })));
  const area = points.length > 1 ? `${collectedLine} L ${points[points.length - 1].x},${BASE_Y} L ${points[0].x},${BASE_Y} Z` : "";
  // Label only the months that have money in them, and only when nothing is hovered (the tooltip says it then)
  const labelled = (i: number) => points[i].collected > 0 && hovered === null && data.length <= 7;

  return (
    <div className="relative pt-1">
      <div className="-mx-2 overflow-x-auto px-2">
        <div className="relative min-w-[480px]">
          <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full select-none text-primary" role="img" aria-label={ariaLabel}>
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="currentColor" stopOpacity="0.22" />
                <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
              </linearGradient>
            </defs>

            {[1, 2, 3, 4].map((i) => (
              <g key={i}>
                <line x1={PAD.l} y1={yOf(i * step)} x2={W - PAD.r} y2={yOf(i * step)} className="stroke-border" strokeDasharray="3 5" />
                <text x={PAD.l - 8} y={yOf(i * step) + 3} textAnchor="end" className="fill-muted-foreground font-mono text-2xs">{fmtAxis(i * step)}</text>
              </g>
            ))}
            <line x1={PAD.l} y1={BASE_Y} x2={W - PAD.r} y2={BASE_Y} className="stroke-input" />
            <text x={PAD.l - 8} y={BASE_Y + 3} textAnchor="end" className="fill-muted-foreground font-mono text-2xs">0</text>

            {active && <line x1={active.x} y1={PAD.t} x2={active.x} y2={BASE_Y} className="stroke-foreground/25" strokeDasharray="2 4" />}

            {area && <path d={area} fill={`url(#${gradId})`} />}
            {hasOwed && <path d={owedLine} fill="none" stroke="currentColor" strokeOpacity="0.7" strokeWidth="2" strokeDasharray="6 5" strokeLinecap="round" strokeLinejoin="round" />}
            <path d={collectedLine} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

            {points.map((p, i) => {
              const on = hovered === i;
              return (
                <g key={i}>
                  {hasOwed && p.owed > 0 && (
                    <circle cx={p.x} cy={p.yOwed} r={on ? 5 : 4} className="fill-card" stroke="currentColor" strokeOpacity="0.75" strokeWidth="2" />
                  )}
                  <circle cx={p.x} cy={p.yCollected} r={on ? 6 : 4.5} className="fill-card" stroke="currentColor" strokeWidth="2.5" />
                  {labelled(i) && (
                    <text x={p.x} y={p.yCollected - 12} textAnchor="middle" className="fill-foreground font-mono text-2xs font-bold">{fmtAxis(p.collected)}</text>
                  )}
                  <text
                    x={p.x}
                    y={H - 10}
                    textAnchor="middle"
                    className={`text-2xs ${i % 2 === 1 && data.length > 8 ? "max-sm:hidden" : ""} ${on ? "fill-foreground font-bold" : "fill-muted-foreground font-medium"}`}
                  >
                    {p.label}
                  </text>
                </g>
              );
            })}

            <rect
              x={PAD.l}
              y={0}
              width={CHART_W}
              height={H - PAD.b + 10}
              fill="transparent"
              className="cursor-crosshair"
              onPointerMove={(e) => {
                const box = e.currentTarget.getBoundingClientRect();
                const idx = Math.floor(((e.clientX - box.left) / box.width) * points.length);
                setHovered(Math.max(0, Math.min(points.length - 1, idx)));
              }}
              onPointerLeave={() => setHovered(null)}
            />
          </svg>

          {active && (
            <div
              className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-xl border border-border bg-popover px-3 py-2 text-popover-foreground shadow-elevated"
              style={{
                left: `${Math.min(86, Math.max(14, (active.x / W) * 100))}%`,
                top: `calc(${(Math.min(Math.min(active.yCollected, active.yOwed), BASE_Y - 24) / H) * 100}% - 20px)`,
              }}
            >
              <p className="mb-1 text-2xs font-semibold text-muted-foreground">{active.label}</p>
              <p className="flex items-center justify-between gap-5 text-xs">
                <span className="flex items-center gap-1.5"><span className="h-0.5 w-3.5 rounded bg-primary" />Collected</span>
                <span className="font-mono font-bold">{lkr(active.collected)}</span>
              </p>
              <p className="flex items-center justify-between gap-5 text-xs">
                <span className="flex items-center gap-1.5"><span className="h-0 w-3.5 border-t-2 border-dashed border-primary/70" />Still to collect</span>
                <span className="font-mono font-bold">{lkr(active.owed)}</span>
              </p>
              {active.total > 0 && <p className="mt-1 text-2xs text-muted-foreground">{Math.round((active.collected / active.total) * 100)}% of {lkr(active.total)} collected</p>}
            </div>
          )}
        </div>
      </div>

      {empty && (
        <div className="pointer-events-none absolute inset-x-0 top-[26%] flex justify-center px-4">
          <span className="rounded-full border border-border bg-card/90 px-3.5 py-1.5 text-center text-xs font-medium text-muted-foreground shadow-sm backdrop-blur">
            No invoices in this period yet
          </span>
        </div>
      )}
    </div>
  );
}

/** The key for the line chart: a solid line for collected money, a dashed one for money still to come. */
export function RevenueLineChartLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted-foreground">
      <span className="flex items-center gap-2">
        <span className="h-0.5 w-5 rounded bg-primary" />
        <span><strong className="font-semibold text-foreground">Collected</strong>: status Received</span>
      </span>
      <span className="flex items-center gap-2">
        <span className="h-0 w-5 border-t-2 border-dashed border-primary/70" />
        <span><strong className="font-semibold text-foreground">Still to collect</strong>: Pending or Failed</span>
      </span>
    </div>
  );
}
