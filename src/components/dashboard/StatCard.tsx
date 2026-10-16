import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  /** Small neutral pill in the top-right corner (e.g. "MRR", "≤ 14d"). */
  tag?: ReactNode;
  /** One line of supporting text under the value. */
  hint?: ReactNode;
  className?: string;
}

/** KPI tile shared by the shop and admin dashboards. */
export function StatCard({ icon: Icon, label, value, tag, hint, className }: StatCardProps) {
  return (
    <div className={cn("ds-card flex min-w-0 flex-col justify-between p-4 sm:p-5", className)}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-muted text-foreground">
          <Icon className="h-[18px] w-[18px]" />
        </div>
        {tag != null && (
          <span className="min-w-0 truncate rounded-full border border-border bg-secondary px-2 py-0.5 text-2xs font-semibold text-muted-foreground">
            {tag}
          </span>
        )}
      </div>
      {/* Labels and amounts wrap rather than end in an ellipsis, so a narrow card never hides what it shows */}
      <div className="mt-4 min-w-0 sm:mt-5">
        <p className="text-xs font-medium leading-snug text-muted-foreground">{label}</p>
        <p className="mt-1 break-words text-xl font-semibold leading-tight tabular-nums tracking-tight text-foreground sm:text-2xl">{value}</p>
        {hint != null && <p className="mt-1 text-xs leading-snug text-muted-foreground">{hint}</p>}
      </div>
    </div>
  );
}
