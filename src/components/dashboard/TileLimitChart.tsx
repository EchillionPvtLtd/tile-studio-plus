"use client"

import { Label, PolarAngleAxis, PolarRadiusAxis, RadialBar, RadialBarChart } from "recharts"

import { ChartContainer, type ChartConfig } from "@/components/ui/chart"

/** Colour follows how close the showroom is to its limit: normal, nearly full (80%+), full. */
function toneColor(used: number, quota: number): string {
  if (quota > 0 && used >= quota) return "hsl(var(--destructive))"
  if (quota > 0 && used / quota >= 0.8) return "hsl(var(--warning))"
  return "hsl(var(--primary))"
}

/**
 * Tile storage as a radial gauge (shadcn/ui "radial chart with text"): the ring fills as slots are used and the
 * centre shows the number of tiles used out of the limit.
 */
export function TileLimitChart({ used, quota, size = 176 }: { used: number; quota: number; size?: number }) {
  const config = { used: { label: "Tiles used", color: toneColor(used, quota) } } satisfies ChartConfig
  const left = Math.max(0, quota - used)
  const data = [{ name: "used", value: Math.min(used, quota), fill: "var(--color-used)" }]

  return (
    <ChartContainer
      config={config}
      className="mx-auto aspect-square shrink-0"
      style={{ height: size, width: size }}
      role="img"
      aria-label={`${used} of ${quota} tile slots used, ${left} left`}
    >
      <RadialBarChart data={data} startAngle={90} endAngle={-270} innerRadius="80%" outerRadius="100%">
        <PolarAngleAxis type="number" domain={[0, Math.max(quota, 1)]} tick={false} axisLine={false} />
        <RadialBar dataKey="value" background={{ fill: "hsl(var(--muted))" }} cornerRadius={10} />
        <PolarRadiusAxis tick={false} tickLine={false} axisLine={false}>
          <Label
            content={({ viewBox }) => {
              if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                const cx = viewBox.cx ?? 0
                const cy = viewBox.cy ?? 0
                return (
                  <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle">
                    <tspan x={cx} y={cy - 4} className="fill-foreground text-3xl font-bold">
                      {used.toLocaleString()}
                    </tspan>
                    <tspan x={cx} y={cy + 20} className="fill-muted-foreground text-xs">
                      of {quota.toLocaleString()} tiles
                    </tspan>
                  </text>
                )
              }
              return null
            }}
          />
        </PolarRadiusAxis>
      </RadialBarChart>
    </ChartContainer>
  )
}
