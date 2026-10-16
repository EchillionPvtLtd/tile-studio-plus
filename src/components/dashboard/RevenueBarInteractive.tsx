"use client"

import { useState, type ReactNode } from "react"
import { Bar, BarChart, CartesianGrid, XAxis, YAxis, type XAxisTickContentProps } from "recharts"

import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { cn } from "@/lib/utils"

export interface RevenueBarPoint {
  label: string
  collected: number
  owed: number
}

type Series = "collected" | "owed"

const chartConfig = {
  collected: { label: "Collected", color: "hsl(var(--primary))" },
  owed: { label: "Still to collect", color: "hsl(var(--primary) / 0.5)" },
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
 * Revenue card in the shadcn "interactive bar chart" style: the two figures in the header are buttons.
 * Pick "Collected" or "Still to collect" and the bars show that series, one bar per month or week.
 * Hover or touch a bar to read its exact amount.
 */
export function RevenueBarInteractive({
  title,
  description,
  data,
  collected,
  owed,
  ariaLabel,
  height = 260,
}: {
  title: ReactNode
  description?: ReactNode
  data: RevenueBarPoint[]
  /** Totals for the whole period (shown on the two header buttons). */
  collected: number
  owed: number
  ariaLabel: string
  height?: number
}) {
  const [active, setActive] = useState<Series>("collected")

  const top = niceMax(Math.max(0, ...data.map((d) => d[active])))
  const empty = data.every((d) => d[active] === 0)
  const sparse = data.length > 8
  const totals: Record<Series, number> = { collected, owed }
  const billed = collected + owed

  return (
    <section className="ds-card overflow-hidden">
      <header className="flex flex-col items-stretch border-b border-border sm:flex-row">
        <div className="flex flex-1 flex-col justify-center gap-1 px-6 pb-3 pt-5 sm:py-0">
          <h3 className="text-base font-bold text-foreground">{title}</h3>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
        <div className="flex" role="group" aria-label="Choose what the chart shows">
          {(["collected", "owed"] as const).map((key) => (
            <button
              key={key}
              type="button"
              aria-pressed={active === key}
              onClick={() => setActive(key)}
              className={cn(
                "relative flex flex-1 cursor-pointer flex-col items-start justify-center gap-1 text-left border-t border-border px-6 py-4 text-left transition-colors even:border-l sm:min-w-[11.5rem] sm:border-l sm:border-t-0 sm:px-7 sm:py-5",
                active === key ? "bg-muted/60" : "hover:bg-muted/30"
              )}
            >
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: chartConfig[key].color }} />
                {chartConfig[key].label}
              </span>
              <span className="truncate font-mono text-lg font-bold leading-none text-foreground sm:text-2xl">{lkr(totals[key])}</span>
              <span className="text-2xs text-muted-foreground">
                {key === "collected" ? "status Received" : "Pending or Failed"}
                {billed > 0 && ` · ${Math.round((totals[key] / billed) * 100)}%`}
              </span>
              {active === key && <span className="absolute inset-x-0 bottom-0 h-0.5 bg-primary sm:inset-x-0" aria-hidden />}
            </button>
          ))}
        </div>
      </header>

      <div className="relative px-2 pb-4 pt-5 sm:p-6" role="img" aria-label={ariaLabel}>
        <ChartContainer config={chartConfig} className="aspect-auto w-full" style={{ height }}>
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="22%">
            <CartesianGrid vertical={false} strokeDasharray="3 5" />
            <XAxis
              dataKey="label"
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
              cursor={{ fill: "hsl(var(--muted) / 0.6)" }}
              content={
                <ChartTooltipContent
                  valueFormatter={(v) => lkr(v)}
                  footer={(items) => {
                    const p = items[0]?.payload as RevenueBarPoint | undefined
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
            <Bar dataKey={active} fill={`var(--color-${active})`} radius={[5, 5, 0, 0]} maxBarSize={44} />
          </BarChart>
        </ChartContainer>

        {empty && (
          <div className="pointer-events-none absolute inset-x-0 top-[38%] flex justify-center px-4">
            <span className="rounded-full border border-border bg-card/90 px-3.5 py-1.5 text-center text-xs font-medium text-muted-foreground shadow-sm backdrop-blur">
              {active === "owed" ? "Nothing outstanding in this period" : "No payments received in this period yet"}
            </span>
          </div>
        )}
      </div>
    </section>
  )
}
