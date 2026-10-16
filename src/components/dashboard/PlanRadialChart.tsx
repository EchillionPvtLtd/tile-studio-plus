"use client"

import { PolarAngleAxis, PolarGrid, RadialBar, RadialBarChart } from "recharts"

import { ChartContainer, type ChartConfig } from "@/components/ui/chart"

export interface PlanSlice {
  plan: string
  count: number
  /** How strongly the ring is drawn (1 = solid), so each plan reads as its own shade. */
  opacity: number
}

const chartConfig = {
  count: { label: "Showrooms", color: "hsl(var(--primary))" },
} satisfies ChartConfig

/**
 * Showrooms per plan as concentric rings (shadcn/ui radial chart with a circular grid): one ring per plan,
 * and a ring fills in proportion to that plan's share of all showrooms. The first plan is the outer ring.
 * The ring under the pointer (or the matching list row) is highlighted and read out in the centre.
 */
export function PlanRadialChart({
  slices,
  total,
  hovered,
  onHover,
  ariaLabel,
}: {
  slices: PlanSlice[]
  total: number
  hovered: string | null
  onHover: (plan: string | null) => void
  ariaLabel: string
}) {
  // Recharts draws the first datum innermost, so reverse to put the first plan on the outside
  const data = [...slices].reverse().map((s) => ({
    plan: s.plan,
    count: s.count,
    fill: "var(--color-count)",
    fillOpacity: hovered !== null && hovered !== s.plan ? s.opacity * 0.35 : s.opacity,
  }))
  const active = hovered ? slices.find((s) => s.plan === hovered) : null
  const shown = active ? active.count : total

  return (
    <div className="relative mx-auto aspect-square h-44 w-44 shrink-0" role="img" aria-label={ariaLabel}>
      <ChartContainer config={chartConfig} className="aspect-square h-full w-full">
        <RadialBarChart data={data} innerRadius="34%" outerRadius="100%" barSize={8} startAngle={90} endAngle={-270}>
          <PolarGrid gridType="circle" radialLines={false} className="stroke-border/70" />
          <PolarAngleAxis type="number" domain={[0, Math.max(total, 1)]} tick={false} axisLine={false} />
          <RadialBar
            dataKey="count"
            cornerRadius={5}
            background={{ fill: "hsl(var(--muted))" }}
            className="cursor-pointer"
            onMouseEnter={(d) => onHover((d as unknown as { plan?: string }).plan ?? null)}
            onMouseLeave={() => onHover(null)}
          />
        </RadialBarChart>
      </ChartContainer>

      {/* Centre readout */}
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="max-w-[72px] truncate text-2xs font-semibold text-muted-foreground">{active ? active.plan : "Showrooms"}</span>
        <span className="font-mono text-3xl font-bold leading-none text-foreground">{shown}</span>
        <span className="mt-0.5 text-2xs font-medium text-muted-foreground">
          {active ? `${total > 0 ? Math.round((active.count / total) * 100) : 0}% of all` : "all plans"}
        </span>
      </div>
    </div>
  )
}
