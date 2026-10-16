import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type StatusTone = "neutral" | "success" | "warning" | "destructive";

const TONES: Record<StatusTone, string> = {
  neutral: "border-border bg-secondary text-muted-foreground",
  success: "border-success/20 bg-success-muted text-success",
  warning: "border-warning/20 bg-warning-muted text-warning",
  destructive: "border-destructive/20 bg-destructive-muted text-destructive",
};

// Translucent variants for use on the always-black `bg-inverse` hero cards.
const INVERSE_TONES: Record<StatusTone, string> = {
  neutral: "border-inverse-foreground/15 bg-inverse-foreground/10 text-inverse-foreground/80",
  success: "border-success/30 bg-success/15 text-success",
  warning: "border-warning/30 bg-warning/15 text-warning",
  destructive: "border-destructive/30 bg-destructive/15 text-destructive",
};

interface StatusBadgeProps {
  tone?: StatusTone;
  /** Render for a dark `bg-inverse` surface. */
  inverse?: boolean;
  /** Leading status dot. */
  dot?: boolean;
  className?: string;
  children: ReactNode;
}

/** The one pill used for every status (paid, active, expiring, failed …). */
export function StatusBadge({ tone = "neutral", inverse, dot, className, children }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-2xs font-semibold",
        (inverse ? INVERSE_TONES : TONES)[tone],
        className,
      )}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}
