"use client";

import React from "react";
import { ArrowRight } from "lucide-react";
import { UiverseRadarIcon, FeatureMarqueeShowcase } from "./Visualizer2DHub";

interface Visualizer3DHubProps {
  shopId: string;
  tilesCount: number;
  onLaunch: (e?: React.MouseEvent) => void;
  onLaunch2D?: (e?: React.MouseEvent) => void;
}

/** The dashboard's 3D Visualizer tab: clean, professional architectural presentation. */
export function Visualizer3DHub({
  shopId,
  tilesCount,
  onLaunch,
  onLaunch2D,
}: Visualizer3DHubProps) {
  return (
    <div className="space-y-6">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Poppins:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;1,400&display=swap');
        .font-poppins {
          font-family: 'Poppins', sans-serif;
        }
      `}</style>

      {/* 1. 3D Studio Banner (with 3D Studio Button on Right) */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-6 sm:p-8 lg:p-10 shadow-sm font-poppins">
        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          {/* Left Column: 3D Specific Content */}
          <section className="lg:col-span-8 flex flex-col items-start justify-center">
            {/* Heading */}
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-semibold text-foreground tracking-tight leading-tight">
              Real-Time 3D Space Visualizer
            </h1>

            {/* Subtitle */}
            <p className="max-w-2xl text-left text-muted-foreground mt-3 text-sm sm:text-base leading-relaxed">
              Immerse clients in interactive 3D architectural spaces with real-time lighting physics, authentic specular reflections, custom joint grouting, and seamless multi-surface tile mapping.
            </p>

            {/* Feature Badges */}
            <div className="flex flex-wrap items-center gap-2.5 mt-6">
              <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-muted/60 border border-border/70 text-xs font-semibold text-foreground shadow-2xs">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span>Interactive 360° Camera</span>
              </div>
              <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-muted/60 border border-border/70 text-xs font-semibold text-foreground shadow-2xs">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span>Physics-Based Lighting & Gloss</span>
              </div>
              <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-muted/60 border border-border/70 text-xs font-semibold text-foreground shadow-2xs">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span>Multi-Surface Wall & Floor Tiling</span>
              </div>
            </div>
          </section>

          {/* Right Column: Dedicated 3D Studio Metallic Button */}
          <div className="lg:col-span-4 flex flex-col items-center justify-center">
            <div className="relative rounded-2xl border border-zinc-800 bg-gradient-to-b from-zinc-900/95 via-zinc-950 to-zinc-950 p-6 shadow-2xl overflow-visible flex flex-col items-center space-y-4">
              <span className="text-2xs font-mono uppercase tracking-widest text-zinc-400 bg-zinc-900 px-2.5 py-0.5 rounded border border-zinc-800">
                3D Engine
              </span>

              {/* 3D Metallic Uiverse Dial */}
              <div
                onClick={onLaunch}
                className="flex flex-col items-center space-y-3 cursor-pointer group/btn"
              >
                <div className="uiverse-btn-container" style={{ fontSize: "20px" }}>
                  <input
                    id="uiverse-banner-3d"
                    type="checkbox"
                    checked={true}
                    readOnly
                  />
                  <label
                    htmlFor="uiverse-banner-3d"
                    className="uiverse-btn active"
                    onClick={(e) => {
                      e.stopPropagation();
                      onLaunch(e);
                    }}
                    title="Launch Fullscreen 3D Studio"
                  >
                    <span className="uiverse-icon">
                      <UiverseRadarIcon />
                      <span className="uiverse-text font-black text-xl tracking-wider -mt-1">3D</span>
                    </span>
                  </label>
                </div>

                <div className="text-center space-y-1">
                  <div className="text-xs font-bold uppercase tracking-wider text-zinc-200 group-hover/btn:text-white transition-colors flex items-center justify-center gap-1">
                    <span>3D Studio</span>
                    <ArrowRight className="w-3.5 h-3.5 group-hover/btn:translate-x-0.5 transition-transform" />
                  </div>
                  <div className="text-[11px] text-zinc-400">
                    Launch Interactive Studio
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Continuous Marquee Feature Showcase (3D Features Only) */}
      <FeatureMarqueeShowcase mode="3d" onLaunch2D={onLaunch2D || onLaunch} onLaunch3D={onLaunch} />
    </div>
  );
}
