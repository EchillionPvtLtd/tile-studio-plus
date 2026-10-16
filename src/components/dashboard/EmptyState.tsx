import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: ReactNode;
  /** Optional call to action, usually a `ds-btn`. */
  action?: ReactNode;
  className?: string;
}

/** Dashed placeholder shown when a list or chart has no data yet. */
export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-muted px-6 py-10 text-center",
        className,
      )}
    >
      {Icon && (
        <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground">
          <Icon className="h-[18px] w-[18px]" />
        </div>
      )}
      <p className="text-sm font-semibold text-foreground">{title}</p>
      {description && <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
