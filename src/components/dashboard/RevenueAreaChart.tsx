"use client"

import { useId } from "react"
import { Area, AreaChart, CartesianGrid, XAxis, YAxis, type XAxisTickContentProps } from "recharts"

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"

export interface RevenueAreaPoint {
  label: string
  collected: number
  owed: number
}

const chartConfig = {
  collected: { label: "Collected", color: "hsl(var(--primary))" },
  owed: { label: "Still to collect", color: "hsl(var(--primary) / 0.55)" },
} satisfies ChartConfig

const lkr = (n: number) => `LKR ${n.toLocaleString("en-US")}`
const fmtAxis = (n: number) => (n >= 1_000_000 ? `${+(n / 1_000_000).toFixed(2)}M` : n >= 1000 ? `${+(n / 1000).toFixed(1)}K` : `${n}`)

/** A round maximum, so the four gridlines are whole numbers (1, 2, 2.5 or 5 times a power of ten). */
function niceMax(max: number): number {
  if (max <= 0) return 10_000
  const raw = max / 4
  const mag = 10 ** Math.floor(Math.log10(raw))
  const n = raw / mag
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag * 4
}

/**
 * Revenue as a stacked area chart (shadcn/ui + Recharts): the solid line is money collected, the dashed line above it
 * is everything billed (collected plus still to collect), and the band between them is money still to collect. Hover or touch to read a month's figures.
 * Curves are monotone, so a line never dips below zero or past a real value between two months.
 */
export function RevenueAreaChart({ data, ariaLabel, height = 260, legend = true }: { data: RevenueAreaPoint[]; ariaLabel: string; height?: number; /** Show the chart's own key; turn off when a key is already printed above it. */ legend?: boolean }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "")
  const fillCollected = `fillCollected${uid}`
  const fillOwed = `fillOwed${uid}`

  const top = niceMax(Math.max(0, ...data.map((d) => d.collected + d.owed)))
  const empty = data.every((d) => d.collected + d.owed === 0)
  const sparse = data.length > 8

  return (
    <div className="relative" role="img" aria-label={ariaLabel}>
      <ChartContainer config={chartConfig} className="aspect-auto w-full" style={{ height }}>
        <AreaChart data={data} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={fillCollected} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--color-collected)" stopOpacity={0.55} />
              <stop offset="95%" stopColor="var(--color-collected)" stopOpacity={0.06} />
            </linearGradient>
            <linearGradient id={fillOwed} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--color-owed)" stopOpacity={0.4} />
              <stop offset="95%" stopColor="var(--color-owed)" stopOpacity={0.04} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} strokeDasharray="3 5" />
          <XAxis
            dataKey="label"
            padding={{ left: 16, right: 16 }}
            tickLine={false}
            axisLine={false}
            interval={0}
            // every label on wide screens; on a phone every third one, counted back from the latest so it is always shown
            tick={(t: XAxisTickContentProps) => (
              <text
                key={t.index}
                x={t.x}
                y={Number(t.y) + 8}
                textAnchor="middle"
                className={`fill-muted-foreground text-2xs ${sparse && (data.length - 1 - t.index) % 3 !== 0 ? "max-sm:hidden" : ""}`}
              >
                {t.payload.value}
              </text>
            )}
          />
          <YAxis
            width={46}
            tickLine={false}
            axisLine={false}
            tickMargin={4}
            domain={[0, top]}
            ticks={[0, 1, 2, 3, 4].map((i) => (top / 4) * i)}
            tickFormatter={fmtAxis}
          />
          <ChartTooltip
            cursor={{ strokeDasharray: "3 4" }}
            content={
              <ChartTooltipContent
                valueFormatter={(v) => lkr(v)}
                footer={(items) => {
                  const p = items[0]?.payload as RevenueAreaPoint | undefined
                  if (!p) return null
                  const total = p.collected + p.owed
                  return (
                    <p className="border-t border-border pt-1.5 text-2xs text-muted-foreground">
                      {total > 0 ? `${Math.round((p.collected / total) * 100)}% of ${lkr(total)} collected` : "Nothing billed"}
                    </p>
                  )
                }}
              />
            }
          />
          <Area
            dataKey="collected"
            type="monotone"
            fill={`url(#${fillCollected})`}
            stroke="var(--color-collected)"
            strokeWidth={2}
            stackId="revenue"
            // a dot only where there is money, so a single paid month is not lost on a flat line
            dot={(p: { cx?: number; cy?: number; payload?: RevenueAreaPoint; index?: number }) =>
              p.payload && p.payload.collected > 0 ? (
                <circle key={p.index} cx={p.cx} cy={p.cy} r={3.5} fill="var(--color-collected)" stroke="hsl(var(--card))" strokeWidth={2} />
              ) : (
                <g key={p.index} />
              )
            }
            activeDot={{ r: 5, stroke: "hsl(var(--card))", strokeWidth: 2 }}
          />
          {/* Declared after Collected so it stacks on top: its edge is the total billed */}
          <Area dataKey="owed" type="monotone" fill={`url(#${fillOwed})`} stroke="var(--color-owed)" strokeWidth={2} strokeDasharray="5 4" stackId="revenue" />
          {legend && <ChartLegend content={<ChartLegendContent />} />}
        </AreaChart>
      </ChartContainer>

      {empty && (
        <div className="pointer-events-none absolute inset-x-0 top-[34%] flex justify-center px-4">
          <span className="rounded-full border border-border bg-card/90 px-3.5 py-1.5 text-center text-xs font-medium text-muted-foreground shadow-sm backdrop-blur">
            No invoices in this period yet
          </span>
        </div>
      )}
    </div>
  )
}
