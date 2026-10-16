"use client";

import { useId, useState } from "react";

export interface RevenueChartPoint {
  label: string;
  collected: number;
  owed: number;
}

const W = 680;
const H = 250;
const PAD = { l: 46, r: 16, t: 18, b: 34 };
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

/**
 * Stacked bar chart used for revenue: one bar per month or week, solid for money collected and
 * hatched for money still to collect. Hover (or touch) a column to read the exact figures.
 */
export function RevenueChart({ data, ariaLabel }: { data: RevenueChartPoint[]; ariaLabel: string }) {
  const hatchId = `revHatch-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const [hovered, setHovered] = useState<number | null>(null);

  const step = niceStep(Math.max(0, ...data.map((d) => d.collected + d.owed)));
  const maxVal = step * 4;
  const levels = [1, 2, 3, 4].map((i) => i * step);
  const yOf = (v: number) => PAD.t + (1 - v / maxVal) * CHART_H;

  const band = CHART_W / Math.max(1, data.length);
  const barW = Math.min(40, band * 0.52);
  const points = data.map((d, i) => ({ ...d, total: d.collected + d.owed, x: PAD.l + band * (i + 0.5), yCollected: yOf(d.collected), yTotal: yOf(d.collected + d.owed) }));
  const empty = points.every((p) => p.total === 0);
  const active = hovered !== null ? points[hovered] : undefined;

  const topRounded = (x: number, yTop: number, yBottom: number) => {
    const rr = Math.min(4, barW / 2, Math.max(0, yBottom - yTop));
    return `M ${x},${yBottom} L ${x},${yTop + rr} Q ${x},${yTop} ${x + rr},${yTop} L ${x + barW - rr},${yTop} Q ${x + barW},${yTop} ${x + barW},${yTop + rr} L ${x + barW},${yBottom} Z`;
  };

  return (
    <div className="relative pt-1">
      <div className="-mx-2 overflow-x-auto px-2">
        <div className="relative min-w-[480px]">
          <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full select-none text-primary" role="img" aria-label={ariaLabel}>
            <defs>
              <pattern id={hatchId} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="6" height="6" fill="currentColor" fillOpacity="0.1" />
                <line x1="0" y1="0" x2="0" y2="6" stroke="currentColor" strokeOpacity="0.55" strokeWidth="2" />
              </pattern>
            </defs>

            {levels.map((level) => (
              <g key={level}>
                <line x1={PAD.l} y1={yOf(level)} x2={W - PAD.r} y2={yOf(level)} className="stroke-border" strokeDasharray="3 5" />
                <text x={PAD.l - 8} y={yOf(level) + 3} textAnchor="end" className="fill-muted-foreground font-mono text-2xs">{fmtAxis(level)}</text>
              </g>
            ))}
            <line x1={PAD.l} y1={BASE_Y} x2={W - PAD.r} y2={BASE_Y} className="stroke-input" />
            <text x={PAD.l - 8} y={BASE_Y + 3} textAnchor="end" className="fill-muted-foreground font-mono text-2xs">0</text>

            {active && <rect x={active.x - band / 2 + 2} y={PAD.t} width={band - 4} height={CHART_H} rx="8" className="fill-foreground/[0.06]" />}

            {points.map((pt, idx) => {
              const hCollected = BASE_Y - pt.yCollected;
              const hOwed = pt.yCollected - pt.yTotal;
              const x0 = pt.x - barW / 2;
              const dim = hovered !== null && hovered !== idx;
              return (
                <g key={idx} opacity={dim ? 0.45 : 1} className="transition-opacity">
                  {hCollected > 0.5 && <path d={topRounded(x0, pt.yCollected, BASE_Y)} className="fill-primary" />}
                  {hOwed > 0.5 && (
                    <path
                      d={topRounded(x0, pt.yTotal, pt.yCollected - (hCollected > 0.5 ? 2 : 0))}
                      fill={`url(#${hatchId})`}
                      stroke="currentColor"
                      strokeOpacity="0.7"
                      strokeWidth="1.5"
                    />
                  )}
                  {pt.total > 0 && (data.length <= 7 || hovered === idx) && (
                    <text x={pt.x} y={pt.yTotal - 7} textAnchor="middle" className="fill-foreground font-mono text-2xs font-bold">{fmtAxis(pt.total)}</text>
                  )}
                </g>
              );
            })}

            {points.map((pt, idx) => (
              <text
                key={idx}
                x={pt.x}
                y={H - 10}
                textAnchor="middle"
                className={`text-2xs ${idx % 2 === 1 && data.length > 8 ? "max-sm:hidden" : ""} ${hovered === idx ? "fill-foreground font-bold" : "fill-muted-foreground font-medium"}`}
              >
                {pt.label}
              </text>
            ))}

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
                top: `calc(${(Math.min(active.yTotal, BASE_Y - 24) / H) * 100}% - 22px)`,
              }}
            >
              <p className="mb-1 text-2xs font-semibold text-muted-foreground">{active.label}</p>
              <p className="flex items-center justify-between gap-5 text-xs">
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px] bg-primary" />Collected</span>
                <span className="font-mono font-bold">{lkr(active.collected)}</span>
              </p>
              <p className="flex items-center justify-between gap-5 text-xs">
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px] border border-primary/70 bg-primary/15" />Still to collect</span>
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

/** The two-item key shown above the chart. */
export function RevenueChartLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted-foreground">
      <span className="flex items-center gap-2">
        <span className="h-3 w-3 rounded-[3px] bg-primary" />
        <span><strong className="font-semibold text-foreground">Collected</strong>: status Received</span>
      </span>
      <span className="flex items-center gap-2">
        <span className="h-3 w-3 rounded-[3px] border border-primary/70 bg-primary/15" />
        <span><strong className="font-semibold text-foreground">Still to collect</strong>: Pending or Failed</span>
      </span>
    </div>
  );
}
