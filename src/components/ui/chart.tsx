"use client"

import * as React from "react"
import * as RechartsPrimitive from "recharts"

import { cn } from "@/lib/utils"

/**
 * shadcn/ui chart building blocks for Recharts: a themed container, a tooltip and a legend.
 * Series colours come from `config`; each one is exposed to the chart as `var(--color-<key>)`.
 */

export type ChartConfig = {
  [key: string]: {
    label?: React.ReactNode
    icon?: React.ComponentType
    color?: string
  }
}

type ChartContextProps = { config: ChartConfig }

const ChartContext = React.createContext<ChartContextProps | null>(null)

function useChart() {
  const context = React.useContext(ChartContext)
  if (!context) throw new Error("useChart must be used within a <ChartContainer />")
  return context
}

const ChartContainer = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div"> & {
    config: ChartConfig
    children: React.ComponentProps<typeof RechartsPrimitive.ResponsiveContainer>["children"]
  }
>(({ id, className, children, config, style, ...props }, ref) => {
  const uniqueId = React.useId().replace(/[^a-zA-Z0-9]/g, "")
  const chartId = `chart-${id || uniqueId}`

  // Turn the config colours into CSS variables on the container
  const vars: Record<string, string> = {}
  for (const [key, item] of Object.entries(config)) {
    if (item.color) vars[`--color-${key}`] = item.color
  }

  return (
    <ChartContext.Provider value={{ config }}>
      <div
        ref={ref}
        data-chart={chartId}
        style={{ ...vars, ...style } as React.CSSProperties}
        className={cn(
          "flex aspect-video justify-center text-xs",
          "[&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground",
          "[&_.recharts-cartesian-grid_line[stroke='#ccc']]:stroke-border/60",
          "[&_.recharts-curve.recharts-tooltip-cursor]:stroke-border",
          "[&_.recharts-dot[stroke='#fff']]:stroke-transparent",
          "[&_.recharts-layer]:outline-none [&_.recharts-surface]:outline-none",
          className
        )}
        {...props}
      >
        <RechartsPrimitive.ResponsiveContainer initialDimension={{ width: 640, height: 260 }}>
          {children}
        </RechartsPrimitive.ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  )
})
ChartContainer.displayName = "Chart"

const ChartTooltip = RechartsPrimitive.Tooltip

type TooltipItem = {
  dataKey?: string | number
  name?: string | number
  value?: number | string
  color?: string
  payload?: Record<string, unknown>
}

const ChartTooltipContent = React.forwardRef<
  HTMLDivElement,
  {
    active?: boolean
    payload?: TooltipItem[]
    label?: string | number
    className?: string
    /** Heading of the tooltip; defaults to the x value. */
    labelFormatter?: (label: React.ReactNode, payload: TooltipItem[]) => React.ReactNode
    /** Text for one value, e.g. "LKR 5,000". */
    valueFormatter?: (value: number, key: string) => string
    /** Extra line under the rows. */
    footer?: (payload: TooltipItem[]) => React.ReactNode
  }
>(({ active, payload, label, className, labelFormatter, valueFormatter, footer }, ref) => {
  const { config } = useChart()
  if (!active || !payload?.length) return null

  return (
    <div
      ref={ref}
      className={cn(
        "grid min-w-[10rem] gap-1.5 rounded-xl border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-elevated",
        className
      )}
    >
      <p className="font-semibold text-muted-foreground">{labelFormatter ? labelFormatter(label, payload) : label}</p>
      <div className="grid gap-1">
        {payload.map((item) => {
          const key = String(item.dataKey ?? item.name)
          const entry = config[key]
          return (
            <div key={key} className="flex items-center justify-between gap-5">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: `var(--color-${key})` }} />
                {entry?.label ?? item.name}
              </span>
              <span className="font-mono font-bold text-foreground">
                {valueFormatter ? valueFormatter(Number(item.value), key) : String(item.value)}
              </span>
            </div>
          )
        })}
      </div>
      {footer?.(payload)}
    </div>
  )
})
ChartTooltipContent.displayName = "ChartTooltipContent"

const ChartLegend = RechartsPrimitive.Legend

const ChartLegendContent = React.forwardRef<
  HTMLDivElement,
  { className?: string; payload?: { dataKey?: string | number; value?: string }[]; verticalAlign?: "top" | "bottom" | "middle" }
>(({ className, payload, verticalAlign = "bottom" }, ref) => {
  const { config } = useChart()
  if (!payload?.length) return null
  return (
    <div ref={ref} className={cn("flex items-center justify-center gap-5", verticalAlign === "top" ? "pb-3" : "pt-3", className)}>
      {payload.map((item) => {
        const key = String(item.dataKey ?? item.value)
        return (
          <div key={key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: `var(--color-${key})` }} />
            {config[key]?.label ?? item.value}
          </div>
        )
      })}
    </div>
  )
})
ChartLegendContent.displayName = "ChartLegendContent"

export { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent }
