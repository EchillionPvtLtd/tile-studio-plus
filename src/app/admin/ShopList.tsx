"use client";

import React, { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toggleSubscription, updateQuota, deleteShop } from "@/actions/admin";
import { Search, Store, Power, Edit3, X, Check, ShieldCheck, UserPlus, ArrowUpDown, Trash2, AlertTriangle, ExternalLink, Box, Eye, FileText } from "lucide-react";
import { ShopDetailsModal } from "./ShopDetailsModal";
import { EmptyState } from "@/components/dashboard";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { SubscriptionPlanItem } from "@/lib/subscriptionPlanTypes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ShopListProps {
  shops: any[];
  /** The packages saved in the dashboard, offered when a showroom's plan is edited. */
  plans?: SubscriptionPlanItem[];
  onOpenProvisionModal?: () => void;
}

export function ShopList({ shops, plans, onOpenProvisionModal }: ShopListProps) {
  const [localShops, setLocalShops] = useState(shops);

  useEffect(() => {
    setLocalShops(shops);
  }, [shops]);

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "inactive">("all");
  const [sortBy, setSortBy] = useState<"newest" | "name" | "quota" | "tiles">("newest");
  const [loadingId, setLoadingId] = useState<string | null>(null);
  // Shown when the server refuses or fails an action, so the screen never claims a change that did not happen
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 8000);
    return () => clearTimeout(t);
  }, [notice]);
  const router = useRouter();

  // Shop Details (View, Edit & Update) modal state
  const [detailsShop, setDetailsShop] = useState<any | null>(null);
  const [detailsMode, setDetailsMode] = useState<"view" | "edit">("view");

  // Quota edit modal state
  const [editingShop, setEditingShop] = useState<{ id: string; name: string; quota: number } | null>(null);
  const [newQuotaValue, setNewQuotaValue] = useState<number>(50);

  // Delete shop modal state
  const [deletingShop, setDeletingShop] = useState<{ id: string; name: string } | null>(null);

  const filteredShops = useMemo(() => {
    return localShops
      .filter((s) => {
        if (search.trim()) {
          const q = search.toLowerCase();
          const matchName = s.shopName?.toLowerCase().includes(q);
          const matchEmail = s.email?.toLowerCase().includes(q);
          if (!matchName && !matchEmail) return false;
        }
        if (filterStatus === "active" && !s.subscriptionActive) return false;
        if (filterStatus === "inactive" && s.subscriptionActive) return false;
        return true;
      })
      .sort((a, b) => {
        if (sortBy === "name") return (a.shopName || a.email).localeCompare(b.shopName || b.email);
        if (sortBy === "quota") return (b.tileQuota || 0) - (a.tileQuota || 0);
        if (sortBy === "tiles") return (b._count?.tiles || 0) - (a._count?.tiles || 0);
        return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      });
  }, [localShops, search, filterStatus, sortBy]);

  const handleToggleSub = async (shopId: string, currentStatus: boolean) => {
    setLoadingId(shopId);
    try {
      const res = await toggleSubscription(shopId, !currentStatus);
      if (res?.success) {
        setLocalShops((prev) =>
          prev.map((s) => (s.id === shopId ? { ...s, subscriptionActive: !currentStatus } : s))
        );
      } else {
        setNotice(res?.message || "Could not change the showroom status.");
      }
    } catch {
      setNotice("Could not reach the server. Nothing was changed.");
    } finally {
      setLoadingId(null);
    }
  };

  const handleSaveQuota = async () => {
    if (!editingShop) return;
    setLoadingId(editingShop.id);
    try {
      const res = await updateQuota(editingShop.id, newQuotaValue);
      if (res?.success) {
        setLocalShops((prev) =>
          prev.map((s) => (s.id === editingShop.id ? { ...s, tileQuota: newQuotaValue } : s))
        );
        setEditingShop(null);
      } else {
        setNotice(res?.message || "Could not save the quota.");
      }
    } catch {
      setNotice("Could not reach the server. Nothing was changed.");
    } finally {
      setLoadingId(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingShop) return;
    setLoadingId(deletingShop.id);
    try {
      const res = await deleteShop(deletingShop.id);
      if (res?.success) {
        setLocalShops((prev) => prev.filter((s) => s.id !== deletingShop.id));
      } else {
        setNotice(res?.message || "Could not remove the showroom.");
      }
    } catch {
      setNotice("Could not reach the server. Nothing was removed.");
    } finally {
      setLoadingId(null);
      setDeletingShop(null);
    }
  };

  const handleShopUpdated = (updatedShop: any) => {
    setLocalShops((prev) =>
      prev.map((s) => (s.id === updatedShop.id ? { ...s, ...updatedShop } : s))
    );
    setDetailsShop((prev: any) => (prev?.id === updatedShop.id ? { ...prev, ...updatedShop } : prev));
  };

  if (shops.length === 0) {
    return (
      <EmptyState
        icon={Store}
        title="No showroom accounts registered yet"
        description="Start by onboarding your first showroom tenant to give them access to the 3D visualizer platform."
        className="py-16"
        action={
          onOpenProvisionModal && (
            <button type="button" onClick={onOpenProvisionModal} className="ds-btn ds-btn-lg ds-btn-primary">
              <UserPlus className="w-4 h-4" />
              <span>Provision First Tenant</span>
            </button>
          )
        }
      />
    );
  }

  return (
    <div className="space-y-5 text-xs font-sans">
      
      {notice && (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive-muted px-4 py-3 text-xs font-medium text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1">{notice}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss message" className="cursor-pointer opacity-70 hover:opacity-100">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground z-10" />
          <Input 
            type="text"
            placeholder="Search showroom by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full text-xs pl-10 pr-9 py-2.5 rounded-full bg-muted border-border text-foreground placeholder:text-muted-foreground"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground z-10 cursor-pointer">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 overflow-x-auto justify-end">
          {/* Status Filter Pills */}
          <div className="flex gap-1.5 bg-muted p-1 rounded-full border border-border">
            {[
              { id: "all", label: "All" },
              { id: "active", label: "Active" },
              { id: "inactive", label: "Suspended" },
            ].map((st) => (
              <Button
                key={st.id}
                variant={filterStatus === st.id ? "default" : "ghost"}
                size="sm"
                onClick={() => setFilterStatus(st.id as any)}
                className={`px-3.5 py-1.5 h-7 rounded-full text-xs font-bold transition-all shrink-0 ${
                  filterStatus !== st.id ? "text-muted-foreground hover:text-foreground" : ""
                }`}
              >
                {st.label}
              </Button>
            ))}
          </div>

          {/* Sort Selector */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="text-xs px-3.5 py-2 rounded-full bg-muted border border-border text-foreground/80 font-semibold focus:outline-none shrink-0 cursor-pointer"
          >
            <option value="newest">Newest First</option>
            <option value="name">Name (A-Z)</option>
            <option value="quota">Highest Quota</option>
            <option value="tiles">Most Tiles</option>
          </select>

          {/* New Tenant Button */}
          {onOpenProvisionModal && (
            <Button
              onClick={onOpenProvisionModal}
              className="rounded-full text-xs font-bold gap-2 shrink-0"
            >
              <UserPlus className="w-4 h-4" />
              <span>Provision Tenant</span>
            </Button>
          )}
        </div>
      </div>

      {/* Modern Data Table / Card Container */}
      <div className="overflow-hidden border border-border rounded-3xl bg-card shadow-card">
        <div className="overflow-x-auto">
          <Table className="min-w-full text-left">
            <TableHeader>
              <TableRow className="bg-muted text-2xs font-bold uppercase tracking-wider text-muted-foreground hover:bg-transparent">
                <TableHead className="px-5 py-4">Showroom Identity</TableHead>
                <TableHead className="px-5 py-4">License Status</TableHead>
                <TableHead className="px-5 py-4">Tile Quota</TableHead>
                <TableHead className="px-5 py-4">Capacity Utilization</TableHead>
                <TableHead className="px-5 py-4">3D Visualizations</TableHead>
                <TableHead className="px-5 py-4 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-border/60">
              {filteredShops.map((shop, idx) => {
                const utilPercent = Math.min(100, Math.round((shop._count.tiles / (shop.tileQuota || 1)) * 100));
                return (
                  <TableRow 
                    key={shop.id} 
                    className="hover:bg-accent transition-colors"
                  >
                    {/* Shop Identity */}
                    <TableCell className="px-5 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-field border border-input flex items-center justify-center text-foreground font-bold text-xs shrink-0 overflow-hidden shadow-xs">
                          {shop.logoUrl ? (
                            <img src={shop.logoUrl} alt={shop.shopName || "Logo"} className="w-full h-full object-cover" />
                          ) : (
                            shop.shopName?.charAt(0) || "S"
                          )}
                        </div>
                        <div>
                          <p className="font-bold text-foreground leading-tight">{shop.shopName || "Unnamed Showroom"}</p>
                          <p className="text-2xs text-muted-foreground font-mono mt-0.5">{shop.email}</p>
                        </div>
                      </div>
                    </TableCell>

                    {/* Status Pill Badge */}
                    <TableCell className="px-5 py-4 whitespace-nowrap">
                      <Badge 
                        variant={shop.subscriptionActive ? "success" : "outline"} 
                        className="text-2xs font-bold gap-1.5 px-3 py-1"
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${shop.subscriptionActive ? 'bg-success' : 'bg-muted-foreground/50'}`} />
                        <span>{shop.subscriptionActive ? "Active" : "Suspended"}</span>
                      </Badge>
                    </TableCell>

                    {/* Quota Stepper Button */}
                    <TableCell className="px-5 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-foreground font-bold">{shop.tileQuota} slots</span>
                        <Button 
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditingShop({ id: shop.id, name: shop.shopName || shop.email, quota: shop.tileQuota });
                            setNewQuotaValue(shop.tileQuota);
                          }}
                          className="h-7 w-7 p-0 rounded-full text-muted-foreground hover:text-foreground cursor-pointer"
                          title="Adjust Tile Quota"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </TableCell>

                    {/* Capacity Utilization Meter */}
                    <TableCell className="px-5 py-4 whitespace-nowrap">
                      <div className="space-y-1.5 w-32">
                        <div className="flex justify-between text-2xs font-mono">
                          <span className="text-foreground font-bold">{shop._count.tiles} tiles</span>
                          <span className="text-muted-foreground">{utilPercent}%</span>
                        </div>
                        <Progress value={utilPercent} className="h-1.5" />
                      </div>
                    </TableCell>

                    {/* 3D Visualizations Saved */}
                    <TableCell className="px-5 py-4 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-foreground">
                        <Box className="w-3.5 h-3.5 text-muted-foreground" />
                        <span>{shop._count?.savedDesigns || 0} designs</span>
                      </span>
                    </TableCell>

                    {/* Actions */}
                    <TableCell className="px-5 py-4 whitespace-nowrap text-right">
                      <div className="inline-flex items-center justify-end gap-2">
                        {/* Details button: view, edit & update */}
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            setDetailsShop(shop);
                            setDetailsMode("view");
                          }}
                          className="h-8 rounded-full text-xs font-bold gap-1.5"
                          title="View & Edit Showroom Details"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Details</span>
                        </Button>

                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.preventDefault();
                            const isFs = !!document.fullscreenElement || (typeof window !== "undefined" && sessionStorage.getItem("tileviz_fullscreen") === "true");
                            const target = isFs ? `/visualizer?shopId=${shop.id}&fullscreen=true` : `/visualizer?shopId=${shop.id}`;
                            if (isFs) sessionStorage.setItem("tileviz_fullscreen", "true");
                            router.push(target);
                          }}
                          className="h-8 w-8 p-0 rounded-full text-muted-foreground hover:text-foreground"
                          title="Test Showroom 3D Visualizer"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </Button>

                        <Button
                          variant={shop.subscriptionActive ? "outline" : "default"}
                          size="sm"
                          onClick={() => handleToggleSub(shop.id, shop.subscriptionActive)}
                          disabled={loadingId === shop.id}
                          className="h-8 rounded-full text-xs font-bold"
                        >
                          {shop.subscriptionActive ? "Suspend" : "Reactivate"}
                        </Button>

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeletingShop({ id: shop.id, name: shop.shopName || shop.email })}
                          disabled={loadingId === shop.id}
                          className="h-8 w-8 p-0 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive-muted"
                          title="Remove Showroom Tenant"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {filteredShops.length === 0 && (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={6} className="px-5 py-14 text-center text-xs text-muted-foreground">
                    <p className="text-sm font-semibold text-foreground">No showrooms match</p>
                    <p className="mt-1">
                      {search.trim() ? `Nothing found for "${search.trim()}". ` : ""}
                      {filterStatus !== "all" ? `Only ${filterStatus === "active" ? "active" : "suspended"} showrooms are shown. ` : ""}
                      <button type="button" onClick={() => { setSearch(""); setFilterStatus("all"); }} className="cursor-pointer font-semibold text-foreground underline">
                        Clear filters
                      </button>
                    </p>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Quota Edit Modal (shadcn Dialog) */}
      <Dialog open={!!editingShop} onOpenChange={(open) => !open && setEditingShop(null)}>
        <DialogContent className="max-w-sm rounded-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm font-bold">
              <Edit3 className="w-4 h-4 text-foreground" />
              <span>Adjust Tile Quota</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Set max tile upload capacity for <strong className="text-foreground">{editingShop?.name}</strong>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div>
              <label className="ds-label">
                Tile Quota Limit
              </label>
              <Input 
                type="number"
                min={1}
                value={newQuotaValue}
                onChange={(e) => setNewQuotaValue(Number(e.target.value))}
                className="font-mono"
              />
            </div>

            {/* Quick Presets */}
            <div className="flex gap-2">
              {[25, 50, 100, 250].map((preset) => (
                <Button
                  key={preset}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setNewQuotaValue(preset)}
                  className="flex-1 h-7 text-2xs font-mono font-bold"
                >
                  {preset}
                </Button>
              ))}
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t border-border">
            <Button
              variant="secondary"
              onClick={() => setEditingShop(null)}
              className="rounded-xl text-xs font-semibold"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveQuota}
              disabled={loadingId === editingShop?.id}
              className="rounded-xl text-xs font-bold"
            >
              Save Quota
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Showroom Confirmation Modal (shadcn Dialog) */}
      <Dialog open={!!deletingShop} onOpenChange={(open) => !open && setDeletingShop(null)}>
        <DialogContent className="max-w-sm rounded-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm font-bold text-destructive">
              <AlertTriangle className="w-4 h-4 text-destructive" />
              <span>Remove Showroom Tenant</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground leading-relaxed">
              Are you sure you want to permanently remove <strong className="text-foreground">{deletingShop?.name}</strong>? All associated tiles, textures, and saved 3D room designs will be deleted.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t border-border">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setDeletingShop(null)}
              className="rounded-xl text-xs font-semibold"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleConfirmDelete}
              disabled={loadingId === deletingShop?.id}
              className="rounded-xl text-xs font-bold gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{loadingId === deletingShop?.id ? "Removing..." : "Delete Showroom"}</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Showroom Details (View, Edit & Update) Modal */}
      {detailsShop && (
        <ShopDetailsModal
          shop={detailsShop}
          isOpen={!!detailsShop}
          initialMode={detailsMode}
          plans={plans}
          onClose={() => setDetailsShop(null)}
          onShopUpdated={handleShopUpdated}
        />
      )}

    </div>
  );
}
