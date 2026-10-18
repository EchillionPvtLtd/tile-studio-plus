"use client";

import React, { useRef, useState } from "react";
import {
  LayoutDashboard,
  Layers,
  Box,
  Images,
  Lock,
  HardDrive,
  CreditCard,
  Bell,
  ChartNoAxesCombined,
  Settings,
  ChevronLeft,
  ChevronRight,
  LogOut,
  X,
} from "lucide-react";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { planLabel } from "@/lib/subscriptionPlans";
import { BannerImage } from "@/components/ShopBanner";
import { ShopTab } from "./ShopWorkspace";
import type { VisualizerAccess } from "@/lib/visualizerAccess";
import type { PlatformSocialLinks } from "@/lib/platformLinksTypes";

/** Initials for the no-logo fallback: first letters of the first two words. */
function shopInitials(name?: string | null) {
  const words = (name || "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "S";
  return (words.length === 1 ? words[0].slice(0, 2) : words[0][0] + words[1][0]).toUpperCase();
}

/** Stable colour per shop so the fallback tile feels intentional, not generic. */
function shopHue(name?: string | null) {
  let h = 0;
  for (const ch of name || "Showroom") h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

/**
 * Brand tile. The logo fills the whole tile edge to edge.
 */
function ShopBrandMark({
  logoUrl,
  name,
  size = "sm",
}: {
  logoUrl?: string | null;
  name?: string | null;
  size?: "lg" | "sm";
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showLogo = !!logoUrl && failedUrl !== logoUrl;
  const dims =
    size === "lg"
      ? "h-14 w-14 rounded-2xl ring-2 ring-sidebar shadow-md"
      : "h-9 w-9 rounded-xl ring-1 ring-sidebar-foreground/10";

  if (showLogo) {
    return (
      <div className={cn("flex shrink-0 items-center justify-center overflow-hidden bg-white shadow-xs", dims)}>
        <img
          src={logoUrl!}
          alt={name || "Showroom logo"}
          onError={() => setFailedUrl(logoUrl!)}
          className="h-full w-full select-none object-cover"
        />
      </div>
    );
  }

  return (
    <div
      aria-label={name || "Showroom"}
      style={{ backgroundColor: `hsl(${shopHue(name)} 42% 36%)` }}
      className={cn(
        "flex shrink-0 select-none items-center justify-center font-bold tracking-tight text-white shadow-xs",
        dims,
        size === "lg" ? "text-base font-black" : "text-xs font-bold"
      )}
    >
      {shopInitials(name)}
    </div>
  );
}

export interface ShopSidebarProps {
  user: any;
  activeTab: ShopTab;
  setActiveTab: React.Dispatch<React.SetStateAction<ShopTab>>;
  tilesSubTab: "all" | "add" | "categories" | "collections";
  setTilesSubTab: React.Dispatch<React.SetStateAction<"all" | "add" | "categories" | "collections">>;
  usageSubTab: "overview" | "history";
  setUsageSubTab: React.Dispatch<React.SetStateAction<"overview" | "history">>;
  subSubTab: "plan" | "limit" | "expiry";
  setSubSubTab: React.Dispatch<React.SetStateAction<"plan" | "limit" | "expiry">>;
  reportSubTab: "tiles" | "activity";
  setReportSubTab: React.Dispatch<React.SetStateAction<"tiles" | "activity">>;
  settingsSubTab: "profile" | "branding" | "visualizer" | "appearance" | "account" | "security";
  setSettingsSubTab: React.Dispatch<React.SetStateAction<"profile" | "branding" | "visualizer" | "appearance" | "account" | "security">>;
  visualizerAccess: VisualizerAccess;
  sidebarOpenSections: Record<string, boolean>;
  toggleSidebarSection: (section: string) => void;
  tilesCount: number;
  quotaPercent: number;
  /** The showroom's package as named in the admin dashboard now. */
  planName?: string;
  activeNotificationsCount: number;
  logoutAction: () => Promise<void>;
  platformLinks?: PlatformSocialLinks;
  isSidebarCollapsed: boolean;
  setIsSidebarCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  isMobileOpen: boolean;
  setIsMobileOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

export function ShopSidebar({
  user,
  activeTab,
  setActiveTab,
  visualizerAccess,
  tilesCount,
  quotaPercent,
  planName,
  activeNotificationsCount,
  logoutAction,
  platformLinks,
  isSidebarCollapsed,
  setIsSidebarCollapsed,
  isMobileOpen,
  setIsMobileOpen,
}: ShopSidebarProps) {
  // Showroom cover banner: fallback cleanly if image cannot load
  const [failedBanner, setFailedBanner] = useState<string | null>(null);
  const bannerUrl: string | null = user.coverPhotoUrl && failedBanner !== user.coverPhotoUrl ? user.coverPhotoUrl : null;

  // Drag tracking state for edge arrow handle
  const dragRef = useRef<{ startX: number; moved: boolean } | null>(null);

  const onPointerDownHandle = (e: React.PointerEvent) => {
    dragRef.current = { startX: e.clientX, moved: false };
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch (_) {}
  };

  const onPointerMoveHandle = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const diff = Math.abs(e.clientX - dragRef.current.startX);
    if (diff > 5) {
      dragRef.current.moved = true;
    }
  };

  const onPointerUpHandle = (e: React.PointerEvent, isPanelOpen: boolean) => {
    if (!dragRef.current) return;
    const deltaX = e.clientX - dragRef.current.startX;
    const wasMoved = dragRef.current.moved;
    dragRef.current = null;

    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch (_) {}

    const isSmallScreen = typeof window !== "undefined" && window.innerWidth < 1280;

    if (wasMoved && Math.abs(deltaX) > 20) {
      if (deltaX > 20) {
        // Dragged right -> expand
        if (isSmallScreen) setIsMobileOpen(true);
        else setIsSidebarCollapsed(false);
      } else {
        // Dragged left -> collapse
        if (isSmallScreen) setIsMobileOpen(false);
        else setIsSidebarCollapsed(true);
      }
    } else {
      // Tap / Click toggle
      if (isSmallScreen) {
        setIsMobileOpen(!isMobileOpen);
      } else {
        setIsSidebarCollapsed(!isSidebarCollapsed);
      }
    }
  };

  const handleNavClick = (tabId: ShopTab) => {
    setActiveTab(tabId);
    if (isMobileOpen && typeof window !== "undefined" && window.innerWidth < 1280) {
      setIsMobileOpen(false);
    }
  };

  const isDesktopExpanded = !isSidebarCollapsed;

  return (
    <TooltipProvider delayDuration={120}>
      {/* ── MOBILE / TABLET BACKDROP OVERLAY (< lg) ────────────────── */}
      {isMobileOpen && (
        <div
          role="button"
          tabIndex={-1}
          aria-label="Close navigation sidebar"
          onClick={() => setIsMobileOpen(false)}
          onKeyDown={(e) => {
            if (e.key === "Escape" || e.key === "Enter") setIsMobileOpen(false);
          }}
          className="fixed inset-0 z-40 bg-black/70 backdrop-blur-xs transition-opacity xl:hidden"
        />
      )}

      {/* ── SIDEBAR CONTAINER (Single-Column, No Scrolling) ───────── */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex flex-col h-full max-h-screen overflow-visible bg-sidebar border-r border-sidebar-foreground/[0.08] text-sidebar-foreground select-none transition-all duration-200 ease-in-out",
          // Mobile & Tablet responsive slide
          isMobileOpen ? "translate-x-0 w-[238px] shadow-2xl" : "-translate-x-full xl:translate-x-0",
          // Desktop width: 238px expanded or 68px collapsed icon rail
          isSidebarCollapsed ? "xl:w-[68px]" : "xl:w-[238px]"
        )}
      >
        {/* ── FLOATING EDGE ARROW HANDLE (Mounted on Sidebar Outer Edge) ── */}
        <div
          role="button"
          tabIndex={0}
          aria-label={
            isMobileOpen || isDesktopExpanded
              ? "Click or drag to collapse sidebar"
              : "Click or drag to expand sidebar"
          }
          onPointerDown={onPointerDownHandle}
          onPointerMove={onPointerMoveHandle}
          onPointerUp={(e) => onPointerUpHandle(e, isMobileOpen || isDesktopExpanded)}
          className={cn(
            "absolute left-[calc(100%-1px)] top-20 z-50 flex h-12 w-6 items-center justify-center rounded-r-lg border border-l-0 border-sidebar-foreground/20 bg-sidebar text-sidebar-foreground/70 shadow-sm hover:w-7 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-all duration-150 cursor-pointer select-none",
            // Visible on mobile when open, always visible on desktop
            !isMobileOpen ? "hidden xl:flex" : "flex"
          )}
          title={
            isMobileOpen || isDesktopExpanded
              ? "Click or drag to hide sidebar"
              : "Click or drag to expand sidebar"
          }
        >
          {isMobileOpen || isDesktopExpanded ? (
            <ChevronLeft className="h-4 w-4 pointer-events-none" />
          ) : (
            <ChevronRight className="h-4 w-4 pointer-events-none" />
          )}
        </div>

        {/* ── 1. BRAND HEADER & COVER BANNER AREA ─────────────────────── */}
        <div
          className={cn(
            "relative flex flex-col items-center justify-center text-center border-b border-sidebar-foreground/[0.06] shrink-0",
            !isSidebarCollapsed ? "p-3 pb-3.5" : "px-2 py-3"
          )}
        >
          {!isSidebarCollapsed ? (
            <>
              {/* Showroom Cover Banner Card */}
              <div className="relative h-[64px] w-full shrink-0 overflow-hidden rounded-xl bg-sidebar-foreground/[0.06] ring-1 ring-sidebar-foreground/10 shadow-xs">
                {bannerUrl ? (
                  <BannerImage
                    src={bannerUrl}
                    href={user.coverLinkUrl}
                    alt={`${user.shopName || "Showroom"} banner`}
                    onFail={() => setFailedBanner(bannerUrl)}
                  />
                ) : (
                  <div className="h-full w-full bg-gradient-to-br from-zinc-700 via-zinc-800 to-zinc-950 flex flex-col items-center justify-center relative overflow-hidden">
                    <div className="absolute inset-0 opacity-20 bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:12px_12px]" />
                    <div className="relative flex items-center gap-1.5 text-white/50">
                      <span className="text-[10px] font-bold tracking-widest uppercase">Showroom Cover</span>
                    </div>
                  </div>
                )}

                {/* Close Button on Small Screens over banner */}
                <button
                  type="button"
                  onClick={() => setIsMobileOpen(false)}
                  className="absolute top-2 right-2 flex xl:hidden p-1 rounded-md bg-black/40 text-white backdrop-blur-xs hover:bg-black/60 transition-colors cursor-pointer z-20"
                  title="Close sidebar"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Brand Avatar & Info overlapping the bottom of the cover banner */}
              <div className="relative z-10 flex w-full items-center gap-3 px-1.5 -mt-4">
                <ShopBrandMark logoUrl={user.logoUrl} name={user.shopName} size="lg" />
                <div className="min-w-0 flex-1 text-left pt-5">
                  <span className="block truncate text-xs sm:text-sm font-bold leading-tight tracking-tight text-sidebar-foreground">
                    {user.shopName || "Showroom"}
                  </span>
                  <span className="block truncate text-[10px] sm:text-[11px] font-medium text-sidebar-muted">
                    Showroom Studio
                  </span>
                </div>
              </div>
            </>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => setIsSidebarCollapsed(false)}
                  className="cursor-pointer rounded-lg focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sidebar-foreground/30"
                  aria-label="Expand sidebar"
                >
                  <ShopBrandMark logoUrl={user.logoUrl} name={user.shopName} size="sm" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="bg-sidebar-accent border-sidebar-foreground/10 text-xs font-semibold text-sidebar-foreground px-2.5 py-1.5">
                {user.shopName || "Showroom"} · Click to expand
              </TooltipContent>
            </Tooltip>
          )}
        </div>

        {/* ── 2. NAVIGATION LIST (Comfortably Sized Tabs, No Unwanted Gaps) ── */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden px-2 py-2.5 space-y-3 sidebar-scrollbar">
          
          {/* ════════════ GROUP 1: CORE / STUDIO ════════════ */}
          <div className="space-y-1">
            {!isSidebarCollapsed && (
              <div className="text-[10px] font-bold tracking-[0.08em] text-sidebar-faint px-3 pt-1 pb-0.5 uppercase select-none">
                CORE
              </div>
            )}

            {/* Dashboard */}
            {isSidebarCollapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => handleNavClick("dashboard")}
                    className={cn(
                      "w-11 h-11 mx-auto rounded-xl flex items-center justify-center transition-all cursor-pointer",
                      activeTab === "dashboard"
                        ? "bg-sidebar-active text-sidebar-active-foreground shadow-xs"
                        : "text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-foreground/[0.05]"
                    )}
                  >
                    <LayoutDashboard className="h-[19px] w-[19px] shrink-0" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="bg-sidebar-accent border-sidebar-foreground/10 text-xs font-semibold text-sidebar-foreground px-2.5 py-1.5">
                  Dashboard
                </TooltipContent>
              </Tooltip>
            ) : (
              <button
                type="button"
                onClick={() => handleNavClick("dashboard")}
                className={cn(
                  "w-full h-[42px] min-h-[42px] px-3 rounded-xl flex items-center justify-between text-left transition-all cursor-pointer group",
                  activeTab === "dashboard"
                    ? "bg-sidebar-active text-sidebar-active-foreground font-semibold shadow-xs"
                    : "text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-foreground/[0.05] font-medium"
                )}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <LayoutDashboard className="h-[18px] w-[18px] shrink-0" />
                  <span className="text-[13px] truncate">Dashboard</span>
                </div>
              </button>
            )}

            {/* 3D Visualizer */}
            {isSidebarCollapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => handleNavClick("visualizer")}
                    className={cn(
                      "w-11 h-11 mx-auto rounded-xl flex items-center justify-center transition-all cursor-pointer relative",
                      activeTab === "visualizer"
                        ? "bg-sidebar-active text-sidebar-active-foreground shadow-xs"
                        : "text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-foreground/[0.05]"
                    )}
                  >
                    <Box className="h-[19px] w-[19px] shrink-0" />
                    {visualizerAccess.viz3d ? (
                      <span className="absolute top-2 right-2 h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    ) : (
                      <Lock className="absolute right-1.5 top-1.5 h-3 w-3 text-sidebar-faint" />
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="bg-sidebar-accent border-sidebar-foreground/10 text-xs font-semibold text-sidebar-foreground px-2.5 py-1.5">
                  3D Visualizer{visualizerAccess.viz3d ? "" : " (restricted)"}
                </TooltipContent>
              </Tooltip>
            ) : (
              <button
                type="button"
                onClick={() => handleNavClick("visualizer")}
                className={cn(
                  "w-full h-[42px] min-h-[42px] px-3 rounded-xl flex items-center justify-between text-left transition-all cursor-pointer group",
                  activeTab === "visualizer"
                    ? "bg-sidebar-active text-sidebar-active-foreground font-semibold shadow-xs"
                    : "text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-foreground/[0.05] font-medium"
                )}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Box className="h-[18px] w-[18px] shrink-0" />
                  <span className="text-[13px] truncate">3D Visualizer</span>
                </div>
                <div className="ml-auto shrink-0 flex items-center">
                  {visualizerAccess.viz3d ? (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400">
                      3D
                    </span>
                  ) : (
                    <Lock className="h-3 w-3 text-sidebar-faint" />
                  )}
                </div>
              </button>
            )}

            {/* 2D Visualizer */}
            {isSidebarCollapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => handleNavClick("visualizer-2d")}
                    className={cn(
                      "w-11 h-11 mx-auto rounded-xl flex items-center justify-center transition-all cursor-pointer relative",
                      activeTab === "visualizer-2d"
                        ? "bg-sidebar-active text-sidebar-active-foreground shadow-xs"
                        : "text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-foreground/[0.05]"
                    )}
                  >
                    <Images className="h-[19px] w-[19px] shrink-0" />
                    {visualizerAccess.viz2d ? (
                      <span className="absolute top-2 right-2 h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    ) : (
                      <Lock className="absolute right-1.5 top-1.5 h-3 w-3 text-sidebar-faint" />
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="bg-sidebar-accent border-sidebar-foreground/10 text-xs font-semibold text-sidebar-foreground px-2.5 py-1.5">
                  2D Visualizer{visualizerAccess.viz2d ? "" : " (restricted)"}
                </TooltipContent>
              </Tooltip>
            ) : (
              <button
                type="button"
                onClick={() => handleNavClick("visualizer-2d")}
                className={cn(
                  "w-full h-[42px] min-h-[42px] px-3 rounded-xl flex items-center justify-between text-left transition-all cursor-pointer group",
                  activeTab === "visualizer-2d"
                    ? "bg-sidebar-active text-sidebar-active-foreground font-semibold shadow-xs"
                    : "text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-foreground/[0.05] font-medium"
                )}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Images className="h-[18px] w-[18px] shrink-0" />
                  <span className="text-[13px] truncate">2D Visualizer</span>
                </div>
                <div className="ml-auto shrink-0 flex items-center">
                  {visualizerAccess.viz2d ? (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                      2D
                    </span>
                  ) : (
                    <Lock className="h-3 w-3 text-sidebar-faint" />
                  )}
                </div>
              </button>
            )}
          </div>

          {/* ════════════ GROUP 2: INVENTORY & BUSINESS ════════════ */}
          <div className="space-y-1">
            {!isSidebarCollapsed && (
              <div className="text-[10px] font-bold tracking-[0.08em] text-sidebar-faint px-3 pt-1 pb-0.5 uppercase select-none">
                MANAGE
              </div>
            )}

            {/* Tiles */}
            {isSidebarCollapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => handleNavClick("tiles")}
                    className={cn(
                      "w-11 h-11 mx-auto rounded-xl flex items-center justify-center transition-all cursor-pointer relative",
                      activeTab === "tiles"
                        ? "bg-sidebar-active text-sidebar-active-foreground shadow-xs"
                        : "text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-foreground/[0.05]"
                    )}
                  >
                    <Layers className="h-[19px] w-[19px] shrink-0" />
                    {tilesCount > 0 && activeTab !== "tiles" && (
                      <span className="absolute top-2 right-2 h-1.5 w-1.5 rounded-full bg-sidebar-foreground/40" />
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="bg-sidebar-accent border-sidebar-foreground/10 text-xs font-semibold text-sidebar-foreground px-2.5 py-1.5">
                  Tiles ({tilesCount})
                </TooltipContent>
              </Tooltip>
            ) : (
              <button
                type="button"
                onClick={() => handleNavClick("tiles")}
                className={cn(
                  "w-full h-[42px] min-h-[42px] px-3 rounded-xl flex items-center justify-between text-left transition-all cursor-pointer group",
                  activeTab === "tiles"
                    ? "bg-sidebar-active text-sidebar-active-foreground font-semibold shadow-xs"
                    : "text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-foreground/[0.05] font-medium"
                )}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Layers className="h-[18px] w-[18px] shrink-0" />
                  <span className="text-[13px] truncate">Tiles</span>
                </div>
                <span
                  className={cn(
                    "px-2 py-0.5 rounded-full text-[10px] font-semibold transition-colors shrink-0",
                    activeTab === "tiles"
                      ? "bg-black/10 text-sidebar-active-foreground"
                      : "bg-sidebar-foreground/[0.08] text-sidebar-muted group-hover:text-sidebar-foreground"
                  )}
                >
                  {tilesCount}
                </span>
              </button>
            )}

            {/* Texture Quota / Tile Usage */}
            {isSidebarCollapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => handleNavClick("tile-usage")}
                    className={cn(
                      "w-11 h-11 mx-auto rounded-xl flex items-center justify-center transition-all cursor-pointer",
                      activeTab === "tile-usage"
                        ? "bg-sidebar-active text-sidebar-active-foreground shadow-xs"
                        : "text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-foreground/[0.05]"
                    )}
                  >
                    <HardDrive className="h-[19px] w-[19px] shrink-0" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="bg-sidebar-accent border-sidebar-foreground/10 text-xs font-semibold text-sidebar-foreground px-2.5 py-1.5">
                  Texture Quota ({quotaPercent}%)
                </TooltipContent>
              </Tooltip>
            ) : (
              <button
                type="button"
                onClick={() => handleNavClick("tile-usage")}
                className={cn(
                  "w-full h-[42px] min-h-[42px] px-3 rounded-xl flex items-center justify-between text-left transition-all cursor-pointer group",
                  activeTab === "tile-usage"
                    ? "bg-sidebar-active text-sidebar-active-foreground font-semibold shadow-xs"
                    : "text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-foreground/[0.05] font-medium"
                )}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <HardDrive className="h-[18px] w-[18px] shrink-0" />
                  <span className="text-[13px] truncate">Texture Quota</span>
                </div>
                <span
                  className={cn(
                    "px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors shrink-0",
                    activeTab === "tile-usage"
                      ? "bg-black/10 text-sidebar-active-foreground"
                      : "bg-sidebar-foreground/[0.06] text-sidebar-muted group-hover:text-sidebar-foreground"
                  )}
                >
                  {quotaPercent}%
                </span>
              </button>
            )}

            {/* Subscription */}
            {isSidebarCollapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => handleNavClick("subscription")}
                    className={cn(
                      "w-11 h-11 mx-auto rounded-xl flex items-center justify-center transition-all cursor-pointer",
                      activeTab === "subscription"
                        ? "bg-sidebar-active text-sidebar-active-foreground shadow-xs"
                        : "text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-foreground/[0.05]"
                    )}
                  >
                    <CreditCard className="h-[19px] w-[19px] shrink-0" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="bg-sidebar-accent border-sidebar-foreground/10 text-xs font-semibold text-sidebar-foreground px-2.5 py-1.5">
                  Subscription ({planName || planLabel(user.subscriptionPackage) || "Free Trial"})
                </TooltipContent>
              </Tooltip>
            ) : (
              <button
                type="button"
                onClick={() => handleNavClick("subscription")}
                className={cn(
                  "w-full h-[42px] min-h-[42px] px-3 rounded-xl flex items-center justify-between text-left transition-all cursor-pointer group",
                  activeTab === "subscription"
                    ? "bg-sidebar-active text-sidebar-active-foreground font-semibold shadow-xs"
                    : "text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-foreground/[0.05] font-medium"
                )}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <CreditCard className="h-[18px] w-[18px] shrink-0" />
                  <span className="text-[13px] truncate">Subscription</span>
                </div>
                <span className="text-[10px] font-semibold text-sidebar-muted truncate max-w-[80px]">
                  {planName || planLabel(user.subscriptionPackage) || "Trial"}
                </span>
              </button>
            )}

            {/* Reports */}
            {isSidebarCollapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => handleNavClick("reports")}
                    className={cn(
                      "w-11 h-11 mx-auto rounded-xl flex items-center justify-center transition-all cursor-pointer",
                      activeTab === "reports"
                        ? "bg-sidebar-active text-sidebar-active-foreground shadow-xs"
                        : "text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-foreground/[0.05]"
                    )}
                  >
                    <ChartNoAxesCombined className="h-[19px] w-[19px] shrink-0" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="bg-sidebar-accent border-sidebar-foreground/10 text-xs font-semibold text-sidebar-foreground px-2.5 py-1.5">
                  Reports
                </TooltipContent>
              </Tooltip>
            ) : (
              <button
                type="button"
                onClick={() => handleNavClick("reports")}
                className={cn(
                  "w-full h-[42px] min-h-[42px] px-3 rounded-xl flex items-center gap-3 text-left transition-all cursor-pointer group",
                  activeTab === "reports"
                    ? "bg-sidebar-active text-sidebar-active-foreground font-semibold shadow-xs"
                    : "text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-foreground/[0.05] font-medium"
                )}
              >
                <ChartNoAxesCombined className="h-[18px] w-[18px] shrink-0" />
                <span className="text-[13px] truncate">Reports</span>
              </button>
            )}
          </div>

          {/* ════════════ GROUP 3: SYSTEM ════════════ */}
          <div className="space-y-1">
            {!isSidebarCollapsed && (
              <div className="text-[10px] font-bold tracking-[0.08em] text-sidebar-faint px-3 pt-1 pb-0.5 uppercase select-none">
                PREFERENCES
              </div>
            )}

            {/* Notifications */}
            {isSidebarCollapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => handleNavClick("notifications")}
                    className={cn(
                      "w-11 h-11 mx-auto rounded-xl flex items-center justify-center transition-all cursor-pointer relative",
                      activeTab === "notifications"
                        ? "bg-sidebar-active text-sidebar-active-foreground shadow-xs"
                        : "text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-foreground/[0.05]"
                    )}
                  >
                    <Bell className="h-[19px] w-[19px] shrink-0" />
                    {activeNotificationsCount > 0 && (
                      <span className="absolute top-2 right-2 flex h-3.5 min-w-[14px] px-0.5 items-center justify-center rounded-full bg-red-500 text-sidebar-foreground text-[9px] font-bold">
                        {activeNotificationsCount}
                      </span>
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="bg-sidebar-accent border-sidebar-foreground/10 text-xs font-semibold text-sidebar-foreground px-2.5 py-1.5">
                  Notifications ({activeNotificationsCount})
                </TooltipContent>
              </Tooltip>
            ) : (
              <button
                type="button"
                onClick={() => handleNavClick("notifications")}
                className={cn(
                  "w-full h-[42px] min-h-[42px] px-3 rounded-xl flex items-center justify-between text-left transition-all cursor-pointer group",
                  activeTab === "notifications"
                    ? "bg-sidebar-active text-sidebar-active-foreground font-semibold shadow-xs"
                    : "text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-foreground/[0.05] font-medium"
                )}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Bell className="h-[18px] w-[18px] shrink-0" />
                  <span className="text-[13px] truncate">Notifications</span>
                </div>
                {activeNotificationsCount > 0 && (
                  <span
                    className={cn(
                      "flex h-4 min-w-[18px] px-1.5 items-center justify-center rounded-full text-[10px] font-bold transition-colors shrink-0",
                      activeTab === "notifications"
                        ? "bg-red-500 text-sidebar-foreground"
                        : "bg-red-500/20 text-red-400 group-hover:bg-red-500/30"
                    )}
                  >
                    {activeNotificationsCount}
                  </span>
                )}
              </button>
            )}

            {/* Settings */}
            {isSidebarCollapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => handleNavClick("settings")}
                    className={cn(
                      "w-11 h-11 mx-auto rounded-xl flex items-center justify-center transition-all cursor-pointer",
                      activeTab === "settings"
                        ? "bg-sidebar-active text-sidebar-active-foreground shadow-xs"
                        : "text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-foreground/[0.05]"
                    )}
                  >
                    <Settings className="h-[19px] w-[19px] shrink-0" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="bg-sidebar-accent border-sidebar-foreground/10 text-xs font-semibold text-sidebar-foreground px-2.5 py-1.5">
                  Settings
                </TooltipContent>
              </Tooltip>
            ) : (
              <button
                type="button"
                onClick={() => handleNavClick("settings")}
                className={cn(
                  "w-full h-[42px] min-h-[42px] px-3 rounded-xl flex items-center gap-3 text-left transition-all cursor-pointer group",
                  activeTab === "settings"
                    ? "bg-sidebar-active text-sidebar-active-foreground font-semibold shadow-xs"
                    : "text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-foreground/[0.05] font-medium"
                )}
              >
                <Settings className="h-[18px] w-[18px] shrink-0" />
                <span className="text-[13px] truncate">Settings</span>
              </button>
            )}
          </div>

        </div>

        {/* ── 3. PINNED BOTTOM LOGOUT & ECHILION BRANDING ───────────── */}
        <div className="mt-auto border-t border-sidebar-foreground/[0.06] px-2 pt-2.5 pb-0 bg-sidebar space-y-2 shrink-0">
          {!isSidebarCollapsed ? (
            <>
              {/* Logout Button */}
              <form action={logoutAction} className="w-full">
                <button
                  type="submit"
                  className="w-full h-[42px] min-h-[42px] px-3 rounded-xl flex items-center gap-3 text-left text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors cursor-pointer group"
                  title="Sign out of showroom"
                >
                  <LogOut className="h-[18px] w-[18px] shrink-0" />
                  <span className="text-[13px] font-medium truncate">Logout</span>
                  <span className="text-[10px] text-sidebar-faint font-mono ml-auto group-hover:text-red-300/80 transition-colors">Exit</span>
                </button>
              </form>

              {/* Attribution without background image or social icons, featuring enlarged Echilion logo */}
              <div className="flex flex-col items-center text-center -mt-3.5">
                <span className="text-[13px] font-extrabold uppercase tracking-wide text-sidebar-foreground select-none leading-none">
                  Designed & Developed by
                </span>
                <a
                  href={platformLinks?.websiteUrl || "https://echilion.com"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full flex items-center justify-center hover:opacity-90 transition-opacity cursor-pointer group"
                  title="Visit Echilion"
                >
                  <img
                    src="/Logo/logo_echilion_tight.png"
                    alt="Echilion"
                    className="logo-on-dark h-auto w-[66px] max-w-full mt-1.5 mb-3.5 select-none object-contain drop-shadow-md group-hover:scale-105 transition-transform duration-200"
                    draggable={false}
                  />
                  <img
                    src="/Logo/logo_echilion_wh_tight.png"
                    alt="Echilion"
                    className="logo-on-light h-auto w-[66px] max-w-full mt-1.5 mb-3.5 select-none object-contain mix-blend-multiply group-hover:scale-105 transition-transform duration-200"
                    draggable={false}
                  />
                </a>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-1 gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <form action={logoutAction}>
                    <button
                      type="submit"
                      className="w-11 h-11 mx-auto rounded-xl flex items-center justify-center text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors cursor-pointer"
                      title="Log Out"
                    >
                      <LogOut className="h-[19px] w-[19px]" />
                    </button>
                  </form>
                </TooltipTrigger>
                <TooltipContent side="right" className="bg-sidebar-accent border-sidebar-foreground/10 text-xs font-semibold text-sidebar-foreground px-2.5 py-1.5">
                  Logout
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <a
                    href={platformLinks?.websiteUrl || "https://echilion.com"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-11 h-11 rounded-xl flex items-center justify-center border border-sidebar-foreground/[0.08] bg-sidebar-foreground/[0.03] hover:opacity-90 transition-opacity p-1.5 overflow-hidden"
                  >
                    <img src="/Logo/logo_echilion_tight.png" alt="Echilion" className="logo-on-dark h-auto w-[26px] max-w-none shrink-0 object-contain select-none" />
                    <img src="/Logo/logo_echilion_wh_tight.png" alt="Echilion" className="logo-on-light h-auto w-[26px] max-w-none shrink-0 object-contain mix-blend-multiply select-none" />
                  </a>
                </TooltipTrigger>
                <TooltipContent side="right" className="bg-sidebar-accent border-sidebar-foreground/10 text-xs font-semibold text-sidebar-foreground px-2.5 py-1.5">
                  Designed & Developed by Echilion
                </TooltipContent>
              </Tooltip>
            </div>
          )}
        </div>
      </aside>
    </TooltipProvider>
  );
}
