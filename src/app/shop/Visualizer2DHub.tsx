"use client";

import React from "react";
import { ArrowUpRight, ArrowRight } from "lucide-react";

interface Visualizer2DHubProps {
  shopId: string;
  tilesCount: number;
  ownRooms: number;
  onLaunch: (e?: React.MouseEvent) => void;
  onLaunch3D?: (e?: React.MouseEvent) => void;
}

export const UiverseRadarIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 sm:w-9 sm:h-9">
    <g id="SVGRepo_bgCarrier" strokeWidth="0"></g>
    <g id="SVGRepo_tracerCarrier" strokeLinecap="round" strokeLinejoin="round"></g>
    <g id="SVGRepo_iconCarrier">
      <path d="M17.35 12.7901C17.1686 12.7907 16.9935 12.7229 16.86 12.6001C15.5322 11.411 13.8124 10.7534 12.03 10.7534C10.2476 10.7534 8.52779 11.411 7.19999 12.6001C7.12649 12.6658 7.04075 12.7164 6.94767 12.749C6.85459 12.7816 6.756 12.7955 6.65755 12.7899C6.55909 12.7843 6.4627 12.7594 6.37389 12.7165C6.28508 12.6736 6.2056 12.6137 6.13999 12.5401C6.0109 12.3892 5.94595 12.1939 5.95904 11.9958C5.97212 11.7977 6.06219 11.6126 6.20999 11.4801C7.80752 10.0423 9.88072 9.2467 12.03 9.2467C14.1793 9.2467 16.2525 10.0423 17.85 11.4801C17.9978 11.6126 18.0879 11.7977 18.1009 11.9958C18.114 12.1939 18.0491 12.3892 17.92 12.5401C17.8469 12.6181 17.7586 12.6806 17.6606 12.7236C17.5627 12.7665 17.457 12.7892 17.35 12.7901Z"></path>
      <path d="M20 10C19.811 9.99907 19.6292 9.92777 19.49 9.80002C17.4685 7.87306 14.7828 6.79812 11.99 6.79812C9.19719 6.79812 6.51153 7.87306 4.48999 9.80002C4.42116 9.88186 4.33563 9.94804 4.23912 9.99411C4.14262 10.0402 4.03738 10.0651 3.93046 10.0672C3.82354 10.0692 3.71742 10.0484 3.61921 10.0061C3.521 9.96375 3.43298 9.90092 3.36105 9.82179C3.28911 9.74267 3.23493 9.64907 3.20214 9.54729C3.16934 9.4455 3.15869 9.33788 3.17091 9.23164C3.18312 9.1254 3.21791 9.023 3.27294 8.93131C3.32798 8.83962 3.40198 8.76076 3.48999 8.70002C5.78577 6.52533 8.82774 5.31329 11.99 5.31329C15.1522 5.31329 18.1942 6.52533 20.49 8.70002C20.5994 8.80134 20.6761 8.93298 20.7103 9.07811C20.7446 9.22324 20.7348 9.37527 20.6822 9.5148C20.6296 9.65433 20.5366 9.77502 20.4151 9.86145C20.2936 9.94787 20.1491 9.99612 20 10Z"></path>
      <path d="M9.38 15.64C9.26356 15.64 9.14873 15.6129 9.04459 15.5608C8.94044 15.5088 8.84986 15.4332 8.78 15.34C8.7196 15.2617 8.67551 15.1721 8.65032 15.0765C8.62513 14.9809 8.61936 14.8812 8.63334 14.7834C8.64732 14.6855 8.68078 14.5914 8.73173 14.5067C8.78268 14.4219 8.8501 14.3483 8.93 14.29C9.81277 13.6145 10.8934 13.2485 12.005 13.2485C13.1166 13.2485 14.1972 13.6145 15.08 14.29C15.1588 14.3491 15.2252 14.4232 15.2754 14.5079C15.3255 14.5926 15.3585 14.6865 15.3725 14.784C15.3864 14.8815 15.381 14.9807 15.3565 15.0762C15.3321 15.1716 15.2891 15.2612 15.23 15.34C15.1091 15.497 14.9316 15.6005 14.7355 15.6285C14.5394 15.6565 14.34 15.6068 14.18 15.49C13.5548 15.014 12.7908 14.7561 12.005 14.7561C11.2192 14.7561 10.4551 15.014 9.83 15.49C9.69921 15.5855 9.54193 15.6379 9.38 15.64Z"></path>
      <path d="M12 18.75C11.8011 18.75 11.6103 18.671 11.4697 18.5303C11.329 18.3897 11.25 18.1989 11.25 18C11.25 17.8011 11.329 17.6103 11.4697 17.4697C11.6103 17.329 11.8011 17.25 12 17.25C12.1989 17.25 12.3897 17.329 12.5303 17.4697C12.671 17.6103 12.75 17.8011 12.75 18C12.75 18.1989 12.671 18.3897 12.5303 18.5303C12.3897 18.671 12.1989 18.75 12 18.75Z"></path>
    </g>
  </svg>
);

/** The dashboard's 2D Visualizer tab: clean, professional architectural presentation. */
export function Visualizer2DHub({ tilesCount, ownRooms, onLaunch, onLaunch3D }: Visualizer2DHubProps) {
  return (
    <div className="space-y-6">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Poppins:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;1,400&display=swap');
        .font-poppins {
          font-family: 'Poppins', sans-serif;
        }
      `}</style>

      {/* 1. 2D Studio Banner (with 2D Studio Button on Right) */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-6 sm:p-8 lg:p-10 shadow-sm font-poppins">
        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          {/* Left Column: 2D Specific Content */}
          <section className="lg:col-span-8 flex flex-col items-start justify-center">
            {/* Heading */}
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-semibold text-foreground tracking-tight leading-tight">
              Precision 2D Room Surface Staging
            </h1>

            {/* Subtitle */}
            <p className="max-w-2xl text-left text-muted-foreground mt-3 text-sm sm:text-base leading-relaxed">
              Transform real room photography instantly. Stage multiple floor and wall tile zones with realistic perspective warping, natural daylight shadows, and interactive before & after split comparisons.
            </p>

            {/* Feature Badges */}
            <div className="flex flex-wrap items-center gap-2.5 mt-6">
              <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-muted/60 border border-border/70 text-xs font-semibold text-foreground shadow-2xs">
                <span className="w-2 h-2 rounded-full bg-sky-500" />
                <span>Real Room Photo Staging</span>
              </div>
              <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-muted/60 border border-border/70 text-xs font-semibold text-foreground shadow-2xs">
                <span className="w-2 h-2 rounded-full bg-sky-500" />
                <span>Perspective Distortion Alignment</span>
              </div>
              <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-muted/60 border border-border/70 text-xs font-semibold text-foreground shadow-2xs">
                <span className="w-2 h-2 rounded-full bg-sky-500" />
                <span>Before & After Split Comparison</span>
              </div>
            </div>
          </section>

          {/* Right Column: Dedicated 2D Studio Metallic Button */}
          <div className="lg:col-span-4 flex flex-col items-center justify-center">
            <div className="relative rounded-2xl border border-zinc-800 bg-gradient-to-b from-zinc-900/95 via-zinc-950 to-zinc-950 p-6 shadow-2xl overflow-visible flex flex-col items-center space-y-4">
              <span className="text-2xs font-mono uppercase tracking-widest text-zinc-400 bg-zinc-900 px-2.5 py-0.5 rounded border border-zinc-800">
                2D Photo Engine
              </span>

              {/* 2D Metallic Uiverse Dial */}
              <div
                onClick={onLaunch}
                className="flex flex-col items-center space-y-3 cursor-pointer group/btn"
              >
                <div className="uiverse-btn-container" style={{ fontSize: "20px" }}>
                  <input
                    id="uiverse-banner-2d"
                    type="checkbox"
                    checked={true}
                    readOnly
                  />
                  <label
                    htmlFor="uiverse-banner-2d"
                    className="uiverse-btn active"
                    onClick={(e) => {
                      e.stopPropagation();
                      onLaunch(e);
                    }}
                    title="Launch Fullscreen 2D Studio"
                  >
                    <span className="uiverse-icon">
                      <UiverseRadarIcon />
                      <span className="uiverse-text font-black text-xl tracking-wider -mt-1">2D</span>
                    </span>
                  </label>
                </div>

                <div className="text-center space-y-1">
                  <div className="text-xs font-bold uppercase tracking-wider text-zinc-200 group-hover/btn:text-white transition-colors flex items-center justify-center gap-1">
                    <span>2D Studio</span>
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

      {/* 2. Continuous Marquee Feature Showcase (2D Features Only) */}
      <FeatureMarqueeShowcase mode="2d" onLaunch2D={onLaunch} onLaunch3D={onLaunch3D || onLaunch} />
    </div>
  );
}

export const features2D = [
  {
    title: "Multi-Surface Room Zoning",
    desc: "Assign distinct tiles to floors, feature walls & kitchen backsplashes independently.",
    image: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200&auto=format&fit=crop&q=80",
    action: "Launch 2D Studio",
  },
  {
    title: "Before & After Interactive Split",
    desc: "Real-time draggable divider lets clients compare renovations against original photography.",
    image: "https://images.unsplash.com/photo-1600566753376-12c8ab7fb75b?w=1200&auto=format&fit=crop&q=80",
    action: "Test Split View",
  },
  {
    title: "Realistic Sunlight & Depth Shading",
    desc: "Preserves natural window illumination, wall shadows, and furniture boundary contours.",
    image: "https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?w=1200&auto=format&fit=crop&q=80",
    action: "Explore Lighting",
  },
  {
    title: "Perspective Distortion Correction",
    desc: "Warp and align joint lines perfectly across receding walls and wide-angle floor angles.",
    image: "https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?w=1200&auto=format&fit=crop&q=80",
    action: "Check Geometry",
  },
  {
    title: "Instant PDF Estimations",
    desc: "Compute exact surface areas, box quantities, and wastage allowance with branded PDF downloads.",
    image: "https://images.unsplash.com/photo-1513694203232-719a280e022f?w=1200&auto=format&fit=crop&q=80",
    action: "View Quotes",
  },
];

export const features3D = [
  {
    title: "360° Free Orbit Navigation",
    desc: "Smooth WebGL camera controls with dynamic zoom, tilt, and multi-angle walkthroughs.",
    image: "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?w=1200&auto=format&fit=crop&q=80",
    action: "Launch 3D Orbit",
  },
  {
    title: "Dynamic Laying Patterns & Offsets",
    desc: "Switch between Straight Grid, Running Bond (Brick), 45° Diagonal, and Herringbone.",
    image: "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=1200&auto=format&fit=crop&q=80",
    action: "Test Patterns",
  },
  {
    title: "Procedural Grout & Joint Math",
    desc: "Tune grout line width from 1mm to 10mm with custom grout colors and realistic bevels.",
    image: "https://images.unsplash.com/photo-1600585154526-990dced4db0d?w=1200&auto=format&fit=crop&q=80",
    action: "Configure Grout",
  },
  {
    title: "PBR Material Physics & Reflections",
    desc: "Hardware-accelerated gloss, polished, and matte finish reflections responding to light.",
    image: "https://images.unsplash.com/photo-1600573472550-8090b5e0745e?w=1200&auto=format&fit=crop&q=80",
    action: "View Reflections",
  },
  {
    title: "Instant Quotation Sheets",
    desc: "Calculate exact tile surface areas, carton quantities, and waste allowance with client-ready PDFs.",
    image: "https://images.unsplash.com/photo-1600566752355-35792bedcfea?w=1200&auto=format&fit=crop&q=80",
    action: "Generate Quotes",
  },
];

export function FeatureMarqueeShowcase({
  mode = "2d",
  onLaunch2D,
  onLaunch3D,
}: {
  mode?: "2d" | "3d";
  onLaunch2D: (e?: React.MouseEvent) => void;
  onLaunch3D: (e?: React.MouseEvent) => void;
}) {
  const [stopScroll, setStopScroll] = React.useState(false);

  const activeCards = mode === "3d" ? features3D : features2D;

  const headingTitle =
    mode === "3d"
      ? "3D Studio Capabilities & Real-Time Engine Features"
      : "2D Studio Capabilities & Photo Engine Features";

  const headingSubtitle =
    mode === "3d"
      ? "Hover any card to inspect real-time 3D capabilities or click to launch 3D Studio"
      : "Hover any card to inspect photo-realistic capabilities or click to launch 2D Studio";

  return (
    <div className="space-y-4 pt-2">
      <style>{`
        .marquee-inner {
          animation: marqueeScroll linear infinite;
        }
        @keyframes marqueeScroll {
          0% {
            transform: translateX(0%);
          }
          100% {
            transform: translateX(-50%);
          }
        }
      `}</style>

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-border/60 pb-3">
        <div>
          <h3 className="text-base sm:text-lg font-bold tracking-tight text-foreground flex items-center gap-2">
            <span>{headingTitle}</span>
            <span className="text-2xs font-mono px-2 py-0.5 rounded-full bg-primary/10 text-primary font-semibold">
              Live Showcase
            </span>
          </h3>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            {headingSubtitle}
          </p>
        </div>
      </div>

      {/* Marquee Container */}
      <div
        className="overflow-hidden w-full relative rounded-2xl border border-border/80 bg-card/60 backdrop-blur-xs py-4"
        onMouseEnter={() => setStopScroll(true)}
        onMouseLeave={() => setStopScroll(false)}
      >
        {/* Left & Right Subtle Edge Fades (Zero white glare / reduced brightness) */}
        <div className="absolute left-0 top-0 h-full w-8 sm:w-12 z-10 pointer-events-none bg-gradient-to-r from-black/20 to-transparent" />
        <div className="absolute right-0 top-0 h-full w-8 sm:w-12 z-10 pointer-events-none bg-gradient-to-l from-black/20 to-transparent" />

        <div
          className="marquee-inner flex w-fit"
          style={{
            animationPlayState: stopScroll ? "paused" : "running",
            animationDuration: activeCards.length * 4500 + "ms",
          }}
        >
          <div className="flex">
            {[...activeCards, ...activeCards].map((card, index) => {
              const is2D = mode === "2d";
              return (
                <div
                  key={index}
                  onClick={(e) => {
                    if (is2D) onLaunch2D(e);
                    else onLaunch3D(e);
                  }}
                  className="w-80 sm:w-96 mx-3.5 h-[23rem] sm:h-[25rem] relative isolate rounded-2xl overflow-hidden group cursor-pointer border border-border/70 hover:border-foreground/30 transition-all duration-300 hover:scale-[0.99] shadow-md hover:shadow-xl shrink-0 [transform:translateZ(0)]"
                >
                  {/* Background Image */}
                  <img
                    src={card.image}
                    alt={card.title}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />

                  {/* Bottom Always-Visible Overlay Title (Bigger typography, zero tags) */}
                  <div className="absolute bottom-0 left-0 w-full p-5 sm:p-6 bg-gradient-to-t from-black/95 via-black/80 to-transparent text-white transition-opacity duration-300 group-hover:opacity-0">
                    <p className="text-lg sm:text-xl font-bold tracking-tight text-white leading-snug drop-shadow-sm">
                      {card.title}
                    </p>
                    <p className="text-sm sm:text-base text-zinc-200 line-clamp-2 mt-1.5 leading-relaxed">
                      {card.desc}
                    </p>
                  </div>

                  {/* Hover Backdrop Glassmorphism Card (Big bold typography, zero tags) */}
                  <div className="flex flex-col justify-end p-6 sm:p-7 opacity-0 group-hover:opacity-100 transition-all duration-300 absolute inset-0 rounded-[inherit] bg-gradient-to-t from-black/90 via-black/65 to-black/30 text-white">
                    <div className="space-y-3">
                      <h4 className="text-2xl sm:text-3xl font-black text-white leading-tight drop-shadow-md">
                        {card.title}
                      </h4>
                      <p className="text-base sm:text-lg text-white/90 leading-relaxed drop-shadow">
                        {card.desc}
                      </p>
                      <div className="pt-3 border-t border-white/25 flex items-center gap-2 text-base sm:text-lg font-bold text-white">
                        <span>{card.action}</span>
                        <ArrowUpRight className="w-5 h-5" />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
