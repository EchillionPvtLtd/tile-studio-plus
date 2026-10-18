"use client";

import React from "react";
import {
  LayoutDashboard,
  Store,
  CreditCard,
  WalletCards,
  Layers3,
  ChartNoAxesCombined,
  Bell,
  Box,
  GalleryHorizontal,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronDown,
  ChevronsUpDown,
  LogOut,
  X,
  Plus,
} from "lucide-react";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type AdminTab =
  | "dashboard"
  | "shops"
  | "subscriptions"
  | "payments"
  | "tile-usage"
  | "visualizer-access"
  | "reports"
  | "login-posters"
  | "notifications"
  | "settings";

export type ShopSubTab = "add" | "all";
export type SubscriptionSubTab = "active" | "expiring" | "expired" | "plans";
export type PaymentSubTab = "overview" | "pending" | "history";

export interface AdminSidebarProps {
  activeTab: AdminTab;
  setActiveTab: React.Dispatch<React.SetStateAction<AdminTab>>;
  shopSubTab: ShopSubTab;
  setShopSubTab: React.Dispatch<React.SetStateAction<ShopSubTab>>;
  subSubTab: SubscriptionSubTab;
  setSubSubTab: React.Dispatch<React.SetStateAction<SubscriptionSubTab>>;
  paymentSubTab: PaymentSubTab;
  setPaymentSubTab: React.Dispatch<React.SetStateAction<PaymentSubTab>>;
  sidebarOpenSections: Record<string, boolean>;
  toggleSidebarSection: (section: string) => void;
  shopsCount: number;
  activeSubs: number;
  expiringSubsCount: number;
  expiredSubsCount: number;
  activeSubsCount: number;
  pendingPaymentsCount: number;
  globalUtilization: number;
  activeNotificationsCount: number;
  profile: {
    name: string;
    email: string;
    logoUrl?: string;
  };
  logoutAction: () => Promise<void>;
  isSidebarCollapsed: boolean;
  setIsSidebarCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  isMobileOpen: boolean;
  setIsMobileOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

export function AdminSidebar({
  activeTab,
  setActiveTab,
  shopSubTab,
  setShopSubTab,
  subSubTab,
  setSubSubTab,
  paymentSubTab,
  setPaymentSubTab,
  sidebarOpenSections,
  toggleSidebarSection,
  shopsCount,
  activeSubs,
  expiringSubsCount,
  expiredSubsCount,
  activeSubsCount,
  pendingPaymentsCount,
  globalUtilization,
  activeNotificationsCount,
  profile,
  logoutAction,
  isSidebarCollapsed,
  setIsSidebarCollapsed,
  isMobileOpen,
  setIsMobileOpen,
}: AdminSidebarProps) {
  const handleNavClick = (tabId: AdminTab) => {
    setActiveTab(tabId);
    if (isMobileOpen) {
      setIsMobileOpen(false);
    }
  };

  return (
    <TooltipProvider delayDuration={120}>
      {/* ── MOBILE BACKDROP OVERLAY (< lg) ────────────────────────── */}
      {isMobileOpen && (
        <div
          role="button"
          tabIndex={-1}
          aria-label="Close navigation sidebar"
          onClick={() => setIsMobileOpen(false)}
          onKeyDown={(e) => {
            if (e.key === "Escape" || e.key === "Enter") setIsMobileOpen(false);
          }}
          className="fixed inset-0 z-40 bg-black/75 backdrop-blur-xs transition-opacity xl:hidden"
        />
      )}

      {/* ── SIDEBAR CONTAINER ────────────────────────────────────── */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex flex-col bg-sidebar border-r border-sidebar-foreground/[0.07] text-sidebar-foreground select-none transition-all duration-200 ease-in-out",
          // Mobile responsive slide-over drawer
          isMobileOpen ? "translate-x-0" : "-translate-x-full xl:translate-x-0",
          // Desktop width: 272px standard or 72px icon-rail collapsed
          isSidebarCollapsed ? "xl:w-[72px]" : "xl:w-[272px] w-[272px]"
        )}
      >
        {/* ── 1. HEADER & BRAND AREA ──────────────────────────────── */}
        <div className="relative px-4 py-4 flex flex-col items-center justify-center text-center border-b border-sidebar-foreground/[0.06] shrink-0 min-h-[82px]">
          {!isSidebarCollapsed ? (
            <>
              {/* Desktop collapse toggle */}
              <button
                type="button"
                onClick={() => setIsSidebarCollapsed(true)}
                className="absolute top-3 right-3 hidden xl:flex p-1.5 rounded-lg text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-foreground/[0.06] transition-colors cursor-pointer z-10"
                title="Collapse sidebar"
              >
                <PanelLeftClose className="h-4 w-4" />
              </button>

              {/* Mobile close toggle */}
              <button
                type="button"
                onClick={() => setIsMobileOpen(false)}
                className="absolute top-3 right-3 flex xl:hidden p-1.5 rounded-lg text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-foreground/[0.06] transition-colors cursor-pointer z-10"
                title="Close drawer"
              >
                <X className="h-4 w-4" />
              </button>

              {/* Centered Brand Logo & Subtitle */}
              <div className="flex flex-col items-center justify-center text-center gap-1.5 w-full">
                {/* White logo for dark sidebars, black logo for light-sidebar themes (swapped in CSS) */}
                <img
                  src="/Logo/TS+.BG.png"
                  alt="Tile Studio Plus+"
                  className="logo-on-dark h-14 w-auto max-w-[220px] object-contain select-none"
                />
                <img
                  src="/Logo/TS+.BK.png"
                  alt="Tile Studio Plus+"
                  className="logo-on-light h-14 w-auto max-w-[220px] object-contain select-none"
                />
                <span className="text-2xs font-bold tracking-[0.14em] text-sidebar-muted uppercase text-center select-none">
                  SUPER ADMIN DASHBOARD
                </span>
              </div>
            </>
          ) : (
            <div className="w-full flex items-center justify-center py-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => setIsSidebarCollapsed(false)}
                    className="p-2 rounded-xl text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-foreground/[0.06] transition-colors cursor-pointer"
                    title="Expand sidebar"
                  >
                    <PanelLeftOpen className="h-[19px] w-[19px]" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="bg-sidebar-accent border-sidebar-foreground/10 text-xs font-semibold text-sidebar-foreground px-2.5 py-1.5">
                  Expand Sidebar
                </TooltipContent>
              </Tooltip>
            </div>
          )}
        </div>

        {/* ── 2. SCROLLABLE NAVIGATION LIST ────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-3.5 pt-5 pb-4 space-y-6 sidebar-scrollbar">
          
          {/* ════════════ GROUP 1: MAIN ════════════ */}
          <div className="space-y-1.5">
            {!isSidebarCollapsed && (
              <div className="text-2xs font-bold tracking-[0.08em] text-sidebar-faint px-3 mb-2 uppercase">
                MAIN
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
                      "w-12 h-12 mx-auto rounded-xl flex items-center justify-center transition-all duration-150 cursor-pointer",
                      activeTab === "dashboard"
                        ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-xs"
                        : "text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-foreground/[0.05]"
                    )}
                  >
                    <LayoutDashboard
                      className={cn(
                        "h-[19px] w-[19px] shrink-0",
                        activeTab === "dashboard" ? "stroke-[2.2px] text-sidebar-primary-foreground" : ""
                      )}
                    />
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
                  "w-full h-[48px] min-h-[48px] px-3 rounded-xl flex items-center justify-between text-left transition-all duration-150 cursor-pointer group",
                  activeTab === "dashboard"
                    ? "bg-sidebar-primary text-sidebar-primary-foreground font-semibold shadow-xs"
                    : "text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-foreground/[0.05] font-medium"
                )}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <LayoutDashboard
                    className={cn(
                      "h-[19px] w-[19px] shrink-0 transition-colors",
                      activeTab === "dashboard" ? "stroke-[2.2px] text-sidebar-primary-foreground" : "text-sidebar-muted group-hover:text-sidebar-foreground"
                    )}
                  />
                  <span className="text-xs truncate">Dashboard</span>
                </div>
              </button>
            )}
          </div>

          {/* ════════════ GROUP 2: MANAGEMENT ════════════ */}
          <div className="space-y-1.5">
            {!isSidebarCollapsed && (
              <div className="text-2xs font-bold tracking-[0.08em] text-sidebar-faint px-3 mb-2 uppercase">
                MANAGEMENT
              </div>
            )}

            {/* 1. Shops */}
            {isSidebarCollapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => handleNavClick("shops")}
                    className={cn(
                      "w-12 h-12 mx-auto rounded-xl flex items-center justify-center transition-all duration-150 cursor-pointer relative",
                      activeTab === "shops"
                        ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-xs"
                        : "text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-foreground/[0.05]"
                    )}
                  >
                    <Store
                      className={cn(
                        "h-[19px] w-[19px] shrink-0",
                        activeTab === "shops" ? "stroke-[2.2px] text-sidebar-primary-foreground" : ""
                      )}
                    />
                    {shopsCount > 0 && activeTab !== "shops" && (
                      <span className="absolute top-2.5 right-2.5 h-1.5 w-1.5 rounded-full bg-sidebar-foreground/40" />
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="bg-sidebar-accent border-sidebar-foreground/10 text-xs font-semibold text-sidebar-foreground px-2.5 py-1.5">
                  Shops ({shopsCount})
                </TooltipContent>
              </Tooltip>
            ) : (
              <div>
                <button
                  type="button"
                  onClick={() => {
                    handleNavClick("shops");
                    toggleSidebarSection("shops");
                  }}
                  className={cn(
                    "w-full h-[48px] min-h-[48px] px-3 rounded-xl flex items-center justify-between text-left transition-all duration-150 cursor-pointer group",
                    activeTab === "shops"
                      ? "bg-sidebar-primary text-sidebar-primary-foreground font-semibold shadow-xs"
                      : "text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-foreground/[0.05] font-medium"
                  )}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Store
                      className={cn(
                        "h-[19px] w-[19px] shrink-0 transition-colors",
                        activeTab === "shops" ? "stroke-[2.2px] text-sidebar-primary-foreground" : "text-sidebar-muted group-hover:text-sidebar-foreground"
                      )}
                    />
                    <span className="text-xs truncate">Shops</span>
                  </div>
                  <div className="ml-auto flex items-center gap-1.5 shrink-0">
                    <span
                      className={cn(
                        "px-2 py-0.5 rounded-full text-2xs font-semibold transition-colors",
                        activeTab === "shops"
                          ? "bg-black/10 text-sidebar-primary-foreground"
                          : "bg-sidebar-foreground/[0.08] text-sidebar-muted group-hover:text-sidebar-foreground"
                      )}
                    >
                      {shopsCount}
                    </span>
                    <ChevronDown
                      className={cn(
                        "h-3.5 w-3.5 transition-transform duration-200",
                        activeTab === "shops" ? "text-sidebar-primary-foreground" : "text-sidebar-faint group-hover:text-sidebar-muted",
                        sidebarOpenSections.shops ? "rotate-180" : ""
                      )}
                    />
                  </div>
                </button>

                {/* Shops Sub-navigation */}
                {sidebarOpenSections.shops && (
                  <div className="pl-9 pr-2 py-1 space-y-1 mt-1 border-l border-sidebar-foreground/[0.08] ml-5">
                    <button
                      type="button"
                      onClick={() => {
                        handleNavClick("shops");
                        setShopSubTab("all");
                      }}
                      className={cn(
                        "w-full text-left py-1.5 px-2.5 rounded-lg text-xs transition-colors cursor-pointer",
                        activeTab === "shops" && shopSubTab === "all"
                          ? "text-sidebar-foreground font-semibold bg-sidebar-foreground/[0.08]"
                          : "text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-foreground/[0.03]"
                      )}
                    >
                      All Shops ({shopsCount})
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        handleNavClick("shops");
                        setShopSubTab("add");
                      }}
                      className={cn(
                        "w-full text-left py-1.5 px-2.5 rounded-lg text-xs transition-colors flex items-center gap-1.5 cursor-pointer",
                        activeTab === "shops" && shopSubTab === "add"
                          ? "text-sidebar-foreground font-semibold bg-sidebar-foreground/[0.08]"
                          : "text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-foreground/[0.03]"
                      )}
                    >
                      <Plus className="h-3 w-3" />
                      <span>Add Shop</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* 2. Subscriptions */}
            {isSidebarCollapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => handleNavClick("subscriptions")}
                    className={cn(
                      "w-12 h-12 mx-auto rounded-xl flex items-center justify-center transition-all duration-150 cursor-pointer relative",
                      activeTab === "subscriptions"
                        ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-xs"
                        : "text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-foreground/[0.05]"
                    )}
                  >
                    <CreditCard
                      className={cn(
                        "h-[19px] w-[19px] shrink-0",
                        activeTab === "subscriptions" ? "stroke-[2.2px] text-sidebar-primary-foreground" : ""
                      )}
                    />
                    {expiringSubsCount > 0 ? (
                      <span className="absolute top-2.5 right-2.5 h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
                    ) : activeSubs > 0 && activeTab !== "subscriptions" ? (
                      <span className="absolute top-2.5 right-2.5 h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    ) : null}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="bg-sidebar-accent border-sidebar-foreground/10 text-xs font-semibold text-sidebar-foreground px-2.5 py-1.5">
                  Subscriptions ({activeSubs} active)
                </TooltipContent>
              </Tooltip>
            ) : (
              <div>
                <button
                  type="button"
                  onClick={() => {
                    handleNavClick("subscriptions");
                    toggleSidebarSection("subscriptions");
                  }}
                  className={cn(
                    "w-full h-[48px] min-h-[48px] px-3 rounded-xl flex items-center justify-between text-left transition-all duration-150 cursor-pointer group",
                    activeTab === "subscriptions"
                      ? "bg-sidebar-primary text-sidebar-primary-foreground font-semibold shadow-xs"
                      : "text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-foreground/[0.05] font-medium"
                  )}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <CreditCard
                      className={cn(
                        "h-[19px] w-[19px] shrink-0 transition-colors",
                        activeTab === "subscriptions" ? "stroke-[2.2px] text-sidebar-primary-foreground" : "text-sidebar-muted group-hover:text-sidebar-foreground"
                      )}
                    />
                    <span className="text-xs truncate">Subscriptions</span>
                  </div>
                  <div className="ml-auto flex items-center gap-1.5 shrink-0">
                    {expiringSubsCount > 0 && (
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0 animate-pulse" title={`${expiringSubsCount} expiring soon`} />
                    )}
                    <span
                      className={cn(
                        "px-2 py-0.5 rounded-full text-2xs font-semibold transition-colors",
                        activeTab === "subscriptions"
                          ? "bg-black/10 text-sidebar-primary-foreground"
                          : "bg-emerald-500/15 text-emerald-400"
                      )}
                    >
                      {activeSubs}
                    </span>
                    <ChevronDown
                      className={cn(
                        "h-3.5 w-3.5 transition-transform duration-200",
                        activeTab === "subscriptions" ? "text-sidebar-primary-foreground" : "text-sidebar-faint group-hover:text-sidebar-muted",
                        sidebarOpenSections.subscriptions ? "rotate-180" : ""
                      )}
                    />
                  </div>
                </button>

                {/* Subscriptions Sub-navigation */}
                {sidebarOpenSections.subscriptions && (
                  <div className="pl-9 pr-2 py-1 space-y-1 mt-1 border-l border-sidebar-foreground/[0.08] ml-5">
                    <button
                      type="button"
                      onClick={() => {
                        handleNavClick("subscriptions");
                        setSubSubTab("active");
                      }}
                      className={cn(
                        "w-full text-left py-1.5 px-2.5 rounded-lg text-xs transition-colors flex items-center justify-between cursor-pointer",
                        activeTab === "subscriptions" && subSubTab === "active"
                          ? "text-sidebar-foreground font-semibold bg-sidebar-foreground/[0.08]"
                          : "text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-foreground/[0.03]"
                      )}
                    >
                      <span>Active</span>
                      <span className="text-2xs font-mono">{activeSubsCount}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        handleNavClick("subscriptions");
                        setSubSubTab("expiring");
                      }}
                      className={cn(
                        "w-full text-left py-1.5 px-2.5 rounded-lg text-xs transition-colors flex items-center justify-between cursor-pointer",
                        activeTab === "subscriptions" && subSubTab === "expiring"
                          ? "text-sidebar-foreground font-semibold bg-sidebar-foreground/[0.08]"
                          : "text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-foreground/[0.03]"
                      )}
                    >
                      <span>Expiring Soon</span>
                      {expiringSubsCount > 0 && (
                        <span className="text-2xs px-1.5 py-0.2 rounded-full font-bold bg-amber-500/20 text-amber-300">
                          {expiringSubsCount}
                        </span>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        handleNavClick("subscriptions");
                        setSubSubTab("expired");
                      }}
                      className={cn(
                        "w-full text-left py-1.5 px-2.5 rounded-lg text-xs transition-colors flex items-center justify-between cursor-pointer",
                        activeTab === "subscriptions" && subSubTab === "expired"
                          ? "text-sidebar-foreground font-semibold bg-sidebar-foreground/[0.08]"
                          : "text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-foreground/[0.03]"
                      )}
                    >
                      <span>Expired</span>
                      {expiredSubsCount > 0 && (
                        <span className="text-2xs px-1.5 py-0.2 rounded-full font-mono text-sidebar-muted">
                          {expiredSubsCount}
                        </span>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        handleNavClick("subscriptions");
                        setSubSubTab("plans");
                      }}
                      className={cn(
                        "w-full text-left py-1.5 px-2.5 rounded-lg text-xs transition-colors flex items-center justify-between cursor-pointer",
                        activeTab === "subscriptions" && subSubTab === "plans"
                          ? "text-sidebar-foreground font-semibold bg-sidebar-foreground/[0.08]"
                          : "text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-foreground/[0.03]"
                      )}
                    >
                      <span>Plan Packages</span>
                      <span className="text-2xs font-semibold px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-400">
                        Pricing
                      </span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* 3. Payments / Income */}
            {isSidebarCollapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => handleNavClick("payments")}
                    className={cn(
                      "w-12 h-12 mx-auto rounded-xl flex items-center justify-center transition-all duration-150 cursor-pointer relative",
                      activeTab === "payments"
                        ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-xs"
                        : "text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-foreground/[0.05]"
                    )}
                  >
                    <WalletCards
                      className={cn(
                        "h-[19px] w-[19px] shrink-0",
                        activeTab === "payments" ? "stroke-[2.2px] text-sidebar-primary-foreground" : ""
                      )}
                    />
                    {pendingPaymentsCount > 0 && (
                      <span className="absolute top-2.5 right-2.5 h-2 w-2 rounded-full bg-red-500" />
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="bg-sidebar-accent border-sidebar-foreground/10 text-xs font-semibold text-sidebar-foreground px-2.5 py-1.5">
                  Payments / Income
                </TooltipContent>
              </Tooltip>
            ) : (
              <div>
                <button
                  type="button"
                  onClick={() => {
                    handleNavClick("payments");
                    toggleSidebarSection("payments");
                  }}
                  className={cn(
                    "w-full h-[48px] min-h-[48px] px-3 rounded-xl flex items-center justify-between text-left transition-all duration-150 cursor-pointer group",
                    activeTab === "payments"
                      ? "bg-sidebar-primary text-sidebar-primary-foreground font-semibold shadow-xs"
                      : "text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-foreground/[0.05] font-medium"
                  )}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <WalletCards
                      className={cn(
                        "h-[19px] w-[19px] shrink-0 transition-colors",
                        activeTab === "payments" ? "stroke-[2.2px] text-sidebar-primary-foreground" : "text-sidebar-muted group-hover:text-sidebar-foreground"
                      )}
                    />
                    <span className="text-xs truncate">Payments / Income</span>
                  </div>
                  <div className="ml-auto flex items-center gap-1.5 shrink-0">
                    {pendingPaymentsCount > 0 && (
                      <span
                        className={cn(
                          "px-2 py-0.5 rounded-full text-2xs font-semibold transition-colors",
                          activeTab === "payments"
                            ? "bg-black/10 text-sidebar-primary-foreground"
                            : "bg-red-500/15 text-red-400"
                        )}
                      >
                        {pendingPaymentsCount}
                      </span>
                    )}
                    <ChevronDown
                      className={cn(
                        "h-3.5 w-3.5 transition-transform duration-200",
                        activeTab === "payments" ? "text-sidebar-primary-foreground" : "text-sidebar-faint group-hover:text-sidebar-muted",
                        sidebarOpenSections.payments ? "rotate-180" : ""
                      )}
                    />
                  </div>
                </button>

                {/* Payments Sub-navigation */}
                {sidebarOpenSections.payments && (
                  <div className="pl-9 pr-2 py-1 space-y-1 mt-1 border-l border-sidebar-foreground/[0.08] ml-5">
                    <button
                      type="button"
                      onClick={() => {
                        handleNavClick("payments");
                        setPaymentSubTab("overview");
                      }}
                      className={cn(
                        "w-full text-left py-1.5 px-2.5 rounded-lg text-xs transition-colors cursor-pointer",
                        activeTab === "payments" && paymentSubTab === "overview"
                          ? "text-sidebar-foreground font-semibold bg-sidebar-foreground/[0.08]"
                          : "text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-foreground/[0.03]"
                      )}
                    >
                      Overview
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        handleNavClick("payments");
                        setPaymentSubTab("pending");
                      }}
                      className={cn(
                        "w-full text-left py-1.5 px-2.5 rounded-lg text-xs transition-colors flex items-center justify-between cursor-pointer",
                        activeTab === "payments" && paymentSubTab === "pending"
                          ? "text-sidebar-foreground font-semibold bg-sidebar-foreground/[0.08]"
                          : "text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-foreground/[0.03]"
                      )}
                    >
                      <span>Pending Payments</span>
                      {pendingPaymentsCount > 0 && (
                        <span className="text-2xs px-1.5 py-0.2 rounded-full font-bold bg-red-500/20 text-red-400">
                          {pendingPaymentsCount}
                        </span>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        handleNavClick("payments");
                        setPaymentSubTab("history");
                      }}
                      className={cn(
                        "w-full text-left py-1.5 px-2.5 rounded-lg text-xs transition-colors cursor-pointer",
                        activeTab === "payments" && paymentSubTab === "history"
                          ? "text-sidebar-foreground font-semibold bg-sidebar-foreground/[0.08]"
                          : "text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-foreground/[0.03]"
                      )}
                    >
                      Payment History
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* 4. Tile Usage */}
            {isSidebarCollapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => handleNavClick("tile-usage")}
                    className={cn(
                      "w-12 h-12 mx-auto rounded-xl flex items-center justify-center transition-all duration-150 cursor-pointer",
                      activeTab === "tile-usage"
                        ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-xs"
                        : "text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-foreground/[0.05]"
                    )}
                  >
                    <Layers3
                      className={cn(
                        "h-[19px] w-[19px] shrink-0",
                        activeTab === "tile-usage" ? "stroke-[2.2px] text-sidebar-primary-foreground" : ""
                      )}
                    />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="bg-sidebar-accent border-sidebar-foreground/10 text-xs font-semibold text-sidebar-foreground px-2.5 py-1.5">
                  Tile Usage ({globalUtilization}%)
                </TooltipContent>
              </Tooltip>
            ) : (
              <button
                type="button"
                onClick={() => handleNavClick("tile-usage")}
                className={cn(
                  "w-full h-[48px] min-h-[48px] px-3 rounded-xl flex items-center justify-between text-left transition-all duration-150 cursor-pointer group",
                  activeTab === "tile-usage"
                    ? "bg-sidebar-primary text-sidebar-primary-foreground font-semibold shadow-xs"
                    : "text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-foreground/[0.05] font-medium"
                )}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Layers3
                    className={cn(
                      "h-[19px] w-[19px] shrink-0 transition-colors",
                      activeTab === "tile-usage" ? "stroke-[2.2px] text-sidebar-primary-foreground" : "text-sidebar-muted group-hover:text-sidebar-foreground"
                    )}
                  />
                  <span className="text-xs truncate">Tile Usage</span>
                </div>
                <div className="ml-auto shrink-0">
                  <span
                    className={cn(
                      "px-2 py-0.5 rounded-full text-2xs font-medium transition-colors",
                      activeTab === "tile-usage"
                        ? "bg-black/10 text-sidebar-primary-foreground"
                        : "bg-sidebar-foreground/[0.06] text-sidebar-muted group-hover:text-sidebar-foreground"
                    )}
                  >
                    {globalUtilization}%
                  </span>
                </div>
              </button>
            )}

            {/* Visualizer Access */}
            {isSidebarCollapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => handleNavClick("visualizer-access")}
                    className={cn(
                      "w-12 h-12 mx-auto rounded-xl flex items-center justify-center transition-all duration-150 cursor-pointer",
                      activeTab === "visualizer-access"
                        ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-xs"
                        : "text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-foreground/[0.05]"
                    )}
                  >
                    <Box
                      className={cn(
                        "h-[19px] w-[19px] shrink-0",
                        activeTab === "visualizer-access" ? "stroke-[2.2px] text-sidebar-primary-foreground" : ""
                      )}
                    />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="bg-sidebar-accent border-sidebar-foreground/10 text-xs font-semibold text-sidebar-foreground px-2.5 py-1.5">
                  Visualizer Access
                </TooltipContent>
              </Tooltip>
            ) : (
              <button
                type="button"
                onClick={() => handleNavClick("visualizer-access")}
                className={cn(
                  "w-full h-[48px] min-h-[48px] px-3 rounded-xl flex items-center justify-between text-left transition-all duration-150 cursor-pointer group",
                  activeTab === "visualizer-access"
                    ? "bg-sidebar-primary text-sidebar-primary-foreground font-semibold shadow-xs"
                    : "text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-foreground/[0.05] font-medium"
                )}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Box
                    className={cn(
                      "h-[19px] w-[19px] shrink-0 transition-colors",
                      activeTab === "visualizer-access" ? "stroke-[2.2px] text-sidebar-primary-foreground" : "text-sidebar-muted group-hover:text-sidebar-foreground"
                    )}
                  />
                  <span className="text-xs truncate">Visualizer Access</span>
                </div>
              </button>
            )}
          </div>

          {/* ════════════ GROUP 3: ANALYTICS ════════════ */}
          <div className="space-y-1.5">
            {!isSidebarCollapsed && (
              <div className="text-2xs font-bold tracking-[0.08em] text-sidebar-faint px-3 mb-2 uppercase">
                ANALYTICS
              </div>
            )}

            {/* Reports */}
            {isSidebarCollapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => handleNavClick("reports")}
                    className={cn(
                      "w-12 h-12 mx-auto rounded-xl flex items-center justify-center transition-all duration-150 cursor-pointer",
                      activeTab === "reports"
                        ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-xs"
                        : "text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-foreground/[0.05]"
                    )}
                  >
                    <ChartNoAxesCombined
                      className={cn(
                        "h-[19px] w-[19px] shrink-0",
                        activeTab === "reports" ? "stroke-[2.2px] text-sidebar-primary-foreground" : ""
                      )}
                    />
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
                  "w-full h-[48px] min-h-[48px] px-3 rounded-xl flex items-center justify-between text-left transition-all duration-150 cursor-pointer group",
                  activeTab === "reports"
                    ? "bg-sidebar-primary text-sidebar-primary-foreground font-semibold shadow-xs"
                    : "text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-foreground/[0.05] font-medium"
                )}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <ChartNoAxesCombined
                    className={cn(
                      "h-[19px] w-[19px] shrink-0 transition-colors",
                      activeTab === "reports" ? "stroke-[2.2px] text-sidebar-primary-foreground" : "text-sidebar-muted group-hover:text-sidebar-foreground"
                    )}
                  />
                  <span className="text-xs truncate">Reports</span>
                </div>
              </button>
            )}
          </div>

          {/* ════════════ GROUP 4: SYSTEM ════════════ */}
          <div className="space-y-1.5">
            {!isSidebarCollapsed && (
              <div className="text-2xs font-bold tracking-[0.08em] text-sidebar-faint px-3 mb-2 uppercase">
                SYSTEM
              </div>
            )}

            {/* Login Posters */}
            {isSidebarCollapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => handleNavClick("login-posters")}
                    className={cn(
                      "w-12 h-12 mx-auto rounded-xl flex items-center justify-center transition-all duration-150 cursor-pointer",
                      activeTab === "login-posters"
                        ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-xs"
                        : "text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-foreground/[0.05]"
                    )}
                  >
                    <GalleryHorizontal
                      className={cn(
                        "h-[19px] w-[19px] shrink-0",
                        activeTab === "login-posters" ? "stroke-[2.2px] text-sidebar-primary-foreground" : ""
                      )}
                    />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="bg-sidebar-accent border-sidebar-foreground/10 text-xs font-semibold text-sidebar-foreground px-2.5 py-1.5">
                  Login Posters
                </TooltipContent>
              </Tooltip>
            ) : (
              <button
                type="button"
                onClick={() => handleNavClick("login-posters")}
                className={cn(
                  "w-full h-[48px] min-h-[48px] px-3 rounded-xl flex items-center justify-between text-left transition-all duration-150 cursor-pointer group",
                  activeTab === "login-posters"
                    ? "bg-sidebar-primary text-sidebar-primary-foreground font-semibold shadow-xs"
                    : "text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-foreground/[0.05] font-medium"
                )}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <GalleryHorizontal
                    className={cn(
                      "h-[19px] w-[19px] shrink-0 transition-colors",
                      activeTab === "login-posters" ? "stroke-[2.2px] text-sidebar-primary-foreground" : "text-sidebar-muted group-hover:text-sidebar-foreground"
                    )}
                  />
                  <span className="text-xs truncate">Login Posters</span>
                </div>
              </button>
            )}

            {/* Notifications */}
            {isSidebarCollapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => handleNavClick("notifications")}
                    className={cn(
                      "w-12 h-12 mx-auto rounded-xl flex items-center justify-center transition-all duration-150 cursor-pointer relative",
                      activeTab === "notifications"
                        ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-xs"
                        : "text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-foreground/[0.05]"
                    )}
                  >
                    <Bell
                      className={cn(
                        "h-[19px] w-[19px] shrink-0",
                        activeTab === "notifications" ? "stroke-[2.2px] text-sidebar-primary-foreground" : ""
                      )}
                    />
                    {activeNotificationsCount > 0 && (
                      <span className="absolute top-2 right-2 flex h-4 min-w-[16px] px-1 items-center justify-center rounded-full bg-white text-black text-2xs font-bold">
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
                  "w-full h-[48px] min-h-[48px] px-3 rounded-xl flex items-center justify-between text-left transition-all duration-150 cursor-pointer group",
                  activeTab === "notifications"
                    ? "bg-sidebar-primary text-sidebar-primary-foreground font-semibold shadow-xs"
                    : "text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-foreground/[0.05] font-medium"
                )}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Bell
                    className={cn(
                      "h-[19px] w-[19px] shrink-0 transition-colors",
                      activeTab === "notifications" ? "stroke-[2.2px] text-sidebar-primary-foreground" : "text-sidebar-muted group-hover:text-sidebar-foreground"
                    )}
                  />
                  <span className="text-xs truncate">Notifications</span>
                </div>
                {activeNotificationsCount > 0 && (
                  <div className="ml-auto shrink-0">
                    <span
                      className={cn(
                        "flex h-5 min-w-[20px] px-1.5 items-center justify-center rounded-full text-2xs font-bold transition-colors",
                        activeTab === "notifications"
                          ? "bg-sidebar-accent text-sidebar-foreground"
                          : "bg-sidebar-foreground/[0.12] text-sidebar-foreground group-hover:bg-sidebar-foreground/[0.18]"
                      )}
                    >
                      {activeNotificationsCount}
                    </span>
                  </div>
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
                      "w-12 h-12 mx-auto rounded-xl flex items-center justify-center transition-all duration-150 cursor-pointer",
                      activeTab === "settings"
                        ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-xs"
                        : "text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-foreground/[0.05]"
                    )}
                  >
                    <Settings
                      className={cn(
                        "h-[19px] w-[19px] shrink-0",
                        activeTab === "settings" ? "stroke-[2.2px] text-sidebar-primary-foreground" : ""
                      )}
                    />
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
                  "w-full h-[48px] min-h-[48px] px-3 rounded-xl flex items-center justify-between text-left transition-all duration-150 cursor-pointer group",
                  activeTab === "settings"
                    ? "bg-sidebar-primary text-sidebar-primary-foreground font-semibold shadow-xs"
                    : "text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-foreground/[0.05] font-medium"
                )}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Settings
                    className={cn(
                      "h-[19px] w-[19px] shrink-0 transition-colors",
                      activeTab === "settings" ? "stroke-[2.2px] text-sidebar-primary-foreground" : "text-sidebar-muted group-hover:text-sidebar-foreground"
                    )}
                  />
                  <span className="text-xs truncate">Settings</span>
                </div>
              </button>
            )}
          </div>

        </div>

        {/* ── 3. PINNED BOTTOM ADMIN ACCOUNT SECTION ────────────────── */}
        <div className="mt-auto border-t border-sidebar-foreground/[0.06] p-3 bg-sidebar shrink-0">
          {!isSidebarCollapsed ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-sidebar-foreground/[0.05] transition-colors cursor-pointer group text-left outline-none"
                >
                  <div className={cn(
                    "h-12 w-12 rounded-2xl overflow-hidden ring-1 ring-sidebar-foreground/10 shadow-md text-sidebar-foreground flex items-center justify-center font-black text-base shrink-0",
                    profile.logoUrl ? "bg-white" : "bg-sidebar-accent"
                  )}>
                    {profile.logoUrl ? (
                      <img src={profile.logoUrl} alt={profile.name} className="h-full w-full select-none object-cover" />
                    ) : (
                      <span>{profile.name?.charAt(0)?.toUpperCase() || "A"}</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold tracking-tight text-sidebar-foreground truncate group-hover:text-sidebar-foreground transition-colors">
                      {profile.name || "Admin"}
                    </div>
                    <div className="text-[11px] text-sidebar-muted truncate font-medium">
                      Super Admin
                    </div>
                  </div>
                  <ChevronsUpDown className="h-4 w-4 text-sidebar-faint group-hover:text-sidebar-muted shrink-0 transition-colors" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                side="top"
                className="w-60 bg-sidebar-accent border border-sidebar-foreground/[0.1] text-sidebar-foreground p-1.5 shadow-2xl rounded-xl z-50 mb-2"
              >
                <div className="px-2.5 py-2 border-b border-sidebar-foreground/[0.06] mb-1">
                  <p className="text-xs font-semibold text-sidebar-foreground">{profile.name || "Administrator"}</p>
                  <p className="text-2xs text-sidebar-muted font-mono truncate">{profile.email}</p>
                </div>
                <DropdownMenuItem
                  onClick={() => handleNavClick("settings")}
                  className="text-xs cursor-pointer rounded-lg px-2.5 py-2 text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-foreground/[0.06] focus:bg-sidebar-foreground/[0.06] focus:text-sidebar-foreground flex items-center gap-2"
                >
                  <Settings className="h-3.5 w-3.5" />
                  <span>Account & Settings</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-sidebar-foreground/[0.06] my-1" />
                <form action={logoutAction} className="w-full">
                  <button
                    type="submit"
                    className="w-full flex items-center gap-2 px-2.5 py-2 text-xs font-semibold text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors cursor-pointer text-left"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    <span>Log Out</span>
                  </button>
                </form>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <div className="flex items-center justify-center py-1">
              <DropdownMenu>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className={cn(
                          "h-10 w-10 rounded-xl overflow-hidden ring-1 ring-sidebar-foreground/10 text-sidebar-foreground flex items-center justify-center font-bold text-xs hover:ring-sidebar-foreground/30 transition-colors cursor-pointer outline-none",
                          profile.logoUrl ? "bg-white" : "bg-sidebar-accent"
                        )}
                      >
                        {profile.logoUrl ? (
                          <img src={profile.logoUrl} alt={profile.name} className="h-full w-full select-none object-cover" />
                        ) : (
                          <span>{profile.name?.charAt(0)?.toUpperCase() || "A"}</span>
                        )}
                      </button>
                    </DropdownMenuTrigger>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="bg-sidebar-accent border-sidebar-foreground/10 text-xs font-semibold text-sidebar-foreground px-2.5 py-1.5">
                    {profile.name || "Admin"} (Super Admin)
                  </TooltipContent>
                </Tooltip>
                <DropdownMenuContent
                  align="start"
                  side="right"
                  className="w-56 bg-sidebar-accent border border-sidebar-foreground/[0.1] text-sidebar-foreground p-1.5 shadow-2xl rounded-xl z-50 ml-2"
                >
                  <div className="px-2.5 py-2 border-b border-sidebar-foreground/[0.06] mb-1">
                    <p className="text-xs font-semibold text-sidebar-foreground">{profile.name || "Administrator"}</p>
                    <p className="text-2xs text-sidebar-muted font-mono truncate">{profile.email}</p>
                  </div>
                  <DropdownMenuItem
                    onClick={() => handleNavClick("settings")}
                    className="text-xs cursor-pointer rounded-lg px-2.5 py-2 text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-foreground/[0.06] focus:bg-sidebar-foreground/[0.06] focus:text-sidebar-foreground flex items-center gap-2"
                  >
                    <Settings className="h-3.5 w-3.5" />
                    <span>Account & Settings</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="bg-sidebar-foreground/[0.06] my-1" />
                  <form action={logoutAction} className="w-full">
                    <button
                      type="submit"
                      className="w-full flex items-center gap-2 px-2.5 py-2 text-xs font-semibold text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors cursor-pointer text-left"
                    >
                      <LogOut className="h-3.5 w-3.5" />
                      <span>Log Out</span>
                    </button>
                  </form>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>
      </aside>
    </TooltipProvider>
  );
}
