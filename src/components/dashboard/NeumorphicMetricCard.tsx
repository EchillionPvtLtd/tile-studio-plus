"use client";

import React from "react";
import { cn } from "@/lib/utils";

export interface NeumorphicCardProps {
  label?: string;
  value?: React.ReactNode;
  suffix?: string;
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

/**
 * Reusable Neumorphic Card Component
 * Based on Uiverse.io by Codewithvinay:
 * border-radius: 50px;
 * background: #ffffff (clean white);
 * box-shadow: 20px 20px 60px #e0e0e0, -20px -20px 60px #ffffff;
 * Clean and minimal without unnecessary clutter.
 */
export function NeumorphicMetricCard({
  label,
  value,
  suffix,
  hint,
  children,
  className,
  onClick,
}: NeumorphicCardProps) {
  const isStringValue = typeof value === "string" && isNaN(Number(value));

  return (
    <div
      onClick={onClick}
      className={cn(
        "card relative flex flex-col justify-between p-4 sm:p-5 md:p-5 lg:p-6 min-h-[155px] sm:min-h-[170px] rounded-2xl sm:rounded-3xl transition-all duration-200 overflow-hidden",
        "bg-white dark:bg-card border border-border text-foreground shadow-xs hover:border-foreground/20 hover:shadow-md",
        onClick && "cursor-pointer group",
        className
      )}
    >
      <div className="min-w-0 flex-1 space-y-2 sm:space-y-2.5">
        {label && (
          <p className="truncate text-[11px] sm:text-xs font-bold uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
        )}
        {value !== undefined && (
          <div className="flex items-baseline gap-1.5 flex-wrap pt-0.5 min-w-0 max-w-full">
            <span
              className={cn(
                "font-black tracking-tight text-foreground group-hover:text-primary transition-colors max-w-full truncate",
                isStringValue
                  ? "text-xl sm:text-2xl md:text-xl lg:text-3xl xl:text-4xl capitalize"
                  : "text-2xl sm:text-3xl md:text-2xl lg:text-4xl xl:text-5xl tabular-nums"
              )}
              title={typeof value === "string" ? value : undefined}
            >
              {value}
            </span>
            {suffix && (
              <span className="text-xs sm:text-sm font-bold text-muted-foreground shrink-0">
                {suffix}
              </span>
            )}
          </div>
        )}
      </div>
      {children}
      {hint != null && (
        <p className="text-xs text-muted-foreground pt-2.5 border-t border-border/40 mt-2 break-words line-clamp-2 leading-relaxed">
          {hint}
        </p>
      )}
    </div>
  );
}

export const NeumorphicCard = NeumorphicMetricCard;

