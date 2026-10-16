import React from 'react';
import { Lock } from 'lucide-react';
import { RESTRICTED_MESSAGE, VISUALIZER_LABEL, type VisualizerKind } from '@/lib/visualizerAccess';
import { cn } from '@/lib/utils';

/**
 * Premium locked visualizer studio view.
 * Uses ONLY the available text (visualizer name and restricted message) with rich visual design.
 */
export function VisualizerLocked({
  kind,
  compact = false,
  className,
}: {
  kind?: VisualizerKind | null;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      role="status"
      className={cn(
        'relative overflow-hidden flex flex-col items-center justify-center text-center select-none',
        compact
          ? 'min-h-[540px] sm:min-h-[580px] w-full rounded-3xl sm:rounded-[2.5rem] border border-border bg-card/60 backdrop-blur-xl p-8 sm:p-14 shadow-sm'
          : 'min-h-dvh w-full bg-background p-6 sm:p-12',
        className
      )}
    >
      {/* ── Background Subtle Architectural Grid Canvas (Pure visual pattern, no text) ── */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden opacity-[0.035] dark:opacity-[0.06]">
        <svg className="h-full w-full" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
          <defs>
            <pattern id="locked-grid" width="48" height="48" patternUnits="userSpaceOnUse">
              <path d="M 48 0 L 0 0 0 48" fill="none" stroke="currentColor" strokeWidth="1.2" />
              <circle cx="24" cy="24" r="1.5" fill="currentColor" opacity="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#locked-grid)" />
        </svg>
      </div>

      {/* ── Soft Ambient Glows ── */}
      <div className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 h-72 w-72 rounded-full bg-foreground/[0.03] blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 left-1/2 -translate-x-1/2 h-72 w-72 rounded-full bg-foreground/[0.02] blur-3xl" />

      {/* ── Main Content Container ── */}
      <div className="relative z-10 flex flex-col items-center max-w-lg space-y-6 sm:space-y-7">
        
        {/* Layered Concentric Lock Badge */}
        <div className="relative flex items-center justify-center">
          {/* Outer diffuse halo */}
          <div className="absolute h-32 w-32 sm:h-36 sm:w-36 rounded-full bg-foreground/[0.02] border border-border/40 animate-pulse" />
          
          {/* Middle geometric ring */}
          <div className="relative flex h-24 w-24 sm:h-28 sm:w-28 items-center justify-center rounded-[2rem] border border-border/80 bg-gradient-to-b from-card via-card/90 to-muted/60 p-1 shadow-md shadow-black/[0.03]">
            {/* Inner icon container */}
            <div className="flex h-full w-full items-center justify-center rounded-[1.6rem] bg-muted/40 border border-border/40 text-foreground transition-transform duration-300 hover:scale-105">
              <Lock className="h-8 w-8 sm:h-10 sm:w-10 stroke-[1.8] text-foreground/80" aria-hidden="true" />
            </div>
          </div>
        </div>

        {/* Available Text Only: Title & Restricted Notice */}
        <div className="space-y-3">
          {kind && (
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground font-sans">
              {VISUALIZER_LABEL[kind]}
            </h2>
          )}
          <p className="max-w-md text-sm sm:text-base font-normal leading-relaxed text-muted-foreground mx-auto">
            {RESTRICTED_MESSAGE}
          </p>
        </div>

      </div>
    </div>
  );
}
