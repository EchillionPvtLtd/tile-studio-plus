"use client";

import React, { useState, useTransition } from "react";
import {
  Check,
  CreditCard,
  Edit2,
  Layers,
  Loader2,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  X,
  AlertCircle,
  CheckCircle2,
  ArrowUpRight,
} from "lucide-react";
import {
  saveSubscriptionPlanAction,
  deleteSubscriptionPlanAction,
  resetSubscriptionPlansAction,
} from "@/actions/subscriptionPlans";
import { DURATION_MONTHS, durationLabel, planDurationMonths } from "@/lib/subscriptionPlans";
import type { SubscriptionPlanItem } from "@/lib/subscriptionPlanTypes";
import { cn, formatLKR } from "@/lib/utils";

const CAPABILITY_PRESETS = [
  "Full 3D WebGL Engine",
  "2D Surface Visualizer Studio",
  "In-Store QR Kiosk Access",
  "Priority Texture Processing",
  "Custom Showroom Cover Banner",
  "Dedicated Account Manager",
  "Multi-branch Kiosk Sync",
  "Direct ERP / POS API Access",
  "24/7 Priority SLA Support",
  "Custom HDRI Lighting Rig",
  "Unlimited Saved Room Designs",
];

interface SubscriptionPlansPanelProps {
  initialPlans: SubscriptionPlanItem[];
}

export function SubscriptionPlansPanel({ initialPlans }: SubscriptionPlansPanelProps) {
  const [plans, setPlans] = useState<SubscriptionPlanItem[]>(initialPlans);
  const [editingPlan, setEditingPlan] = useState<SubscriptionPlanItem | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  // Modal form state
  const [formData, setFormData] = useState<SubscriptionPlanItem>({
    id: "",
    name: "",
    price: 5000,
    currency: "LKR",
    billingCycle: "monthly",
    tileQuota: 50,
    quotaLabel: "50 Tiles",
    features: [""],
    isPopular: false,
    isCustomPrice: false,
    customPriceLabel: "",
    active: true,
    sortOrder: 1,
  });

  const openEditModal = (plan: SubscriptionPlanItem) => {
    setEditingPlan(plan);
    setIsCreating(false);
    setFormData({
      ...plan,
      features: [...plan.features],
    });
  };

  const openCreateModal = () => {
    setEditingPlan(null);
    setIsCreating(true);
    const newId = `plan-${Date.now().toString(36)}`;
    setFormData({
      id: newId,
      name: "",
      price: 15000,
      currency: "LKR",
      billingCycle: "monthly",
      tileQuota: 150,
      quotaLabel: "150 Tiles",
      features: ["Full 3D WebGL Engine", "In-Store QR Kiosk", "150 Tile Storage Slots"],
      isPopular: false,
      isCustomPrice: false,
      customPriceLabel: "",
      active: true,
      sortOrder: plans.length + 1,
    });
  };

  const closeModal = () => {
    setEditingPlan(null);
    setIsCreating(false);
  };

  const handleAddFeature = () => {
    setFormData((prev) => ({
      ...prev,
      features: [...prev.features, ""],
    }));
  };

  const handleRemoveFeature = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      features: prev.features.filter((_, i) => i !== index),
    }));
  };

  const handleFeatureChange = (index: number, val: string) => {
    setFormData((prev) => {
      const next = [...prev.features];
      next[index] = val;
      return { ...prev, features: next };
    });
  };

  const handleAddPresetFeature = (preset: string) => {
    if (!formData.features.includes(preset)) {
      setFormData((prev) => ({
        ...prev,
        features: prev.features.filter(Boolean).concat(preset),
      }));
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanFeatures = formData.features.map((f) => f.trim()).filter(Boolean);
    if (cleanFeatures.length === 0) {
      setNotice({ type: "error", text: "Please provide at least one included capability." });
      return;
    }

    const payload: SubscriptionPlanItem = {
      ...formData,
      features: cleanFeatures,
      quotaLabel: formData.quotaLabel.trim() || `${formData.tileQuota} Tiles`,
    };

    startTransition(async () => {
      const res = await saveSubscriptionPlanAction(payload);
      if (res.success && res.plans) {
        setPlans(res.plans);
        setNotice({ type: "success", text: res.message || "Plan saved successfully." });
        closeModal();
      } else {
        setNotice({ type: "error", text: res.message || "Failed to save plan." });
      }
    });
  };

  const handleDelete = (plan: SubscriptionPlanItem) => {
    if (!confirm(`Are you sure you want to delete the plan "${plan.name}"?`)) return;

    startTransition(async () => {
      const res = await deleteSubscriptionPlanAction(plan.id);
      if (res.success && res.plans) {
        setPlans(res.plans);
        setNotice({ type: "success", text: res.message || "Plan deleted." });
      } else {
        setNotice({ type: "error", text: res.message || "Failed to delete plan." });
      }
    });
  };

  const handleResetDefaults = () => {
    if (!confirm("Reset all subscription plans back to system defaults (Starter, Pro Studio, Custom Plan)? Any customizations will be overwritten.")) return;

    startTransition(async () => {
      const res = await resetSubscriptionPlansAction();
      if (res.success && res.plans) {
        setPlans(res.plans);
        setNotice({ type: "success", text: res.message || "Reset to defaults." });
      } else {
        setNotice({ type: "error", text: res.message || "Failed to reset." });
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* ── Top Header & Actions ───────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
            Subscription Plans & Pricing
          </h2>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Configure the subscription packages, pricing, billing cycles, and included capabilities visible to showrooms.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
          <button
            type="button"
            onClick={handleResetDefaults}
            disabled={isPending}
            className="ds-btn ds-btn-outline text-xs h-9"
            title="Reset plans to platform defaults"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Reset Defaults</span>
          </button>

          <button
            type="button"
            onClick={openCreateModal}
            disabled={isPending}
            className="ds-btn ds-btn-primary text-xs h-9"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Create Plan</span>
          </button>
        </div>
      </div>

      {/* ── Status Feedback Banner ─────────────────────────────────── */}
      {notice && (
        <div
          className={cn(
            "flex items-center justify-between gap-3 px-4 py-3 rounded-xl text-xs font-semibold border transition-all animate-in fade-in-0",
            notice.type === "success"
              ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400"
              : "bg-destructive/10 border-destructive/20 text-destructive"
          )}
        >
          <div className="flex items-center gap-2">
            {notice.type === "success" ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0" />
            )}
            <span>{notice.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="cursor-pointer opacity-70 hover:opacity-100 p-0.5"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* ── Plans Display Grid ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {plans.map((tier) => {
          const displayPrice = tier.isCustomPrice
            ? tier.customPriceLabel || "LKR XX,XXX"
            : `${tier.currency} ${tier.price.toLocaleString()}`;
          const periodLabel = tier.billingCycle === "yearly" ? "/year" : "/month";

          return (
            <div
              key={tier.id}
              className={cn(
                "relative rounded-3xl p-6 sm:p-7 bg-black text-white border transition-all duration-300 flex flex-col justify-between group shadow-xl",
                tier.isPopular
                  ? "border-2 border-emerald-500/80 ring-4 ring-emerald-500/10 shadow-emerald-500/10"
                  : "border-zinc-800 hover:border-zinc-700"
              )}
            >
              {/* Top Header */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-lg text-white tracking-wide">
                      {tier.name}
                    </h3>
                    {!tier.active && (
                      <span className="bg-zinc-800 text-zinc-400 font-bold px-2 py-0.5 rounded-full text-[10px] tracking-wider uppercase">
                        Hidden
                      </span>
                    )}
                  </div>
                  {tier.isPopular && (
                    <span className="bg-emerald-500 text-black font-extrabold px-2.5 py-0.5 rounded-full text-[10px] tracking-wider uppercase flex items-center gap-1 shadow-xs">
                      <Sparkles className="w-3 h-3 stroke-[3]" /> Popular
                    </span>
                  )}
                </div>

                {/* Price Display */}
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="text-3xl sm:text-4xl font-light tracking-tight text-white font-mono leading-none">
                    {displayPrice}
                  </span>
                  <span className="text-xs text-zinc-400 font-normal ml-1">
                    {periodLabel}{tier.durationMonths ? ` · ${durationLabel(tier.durationMonths)}` : ""}
                  </span>
                </div>

                <div className="flex items-center gap-2 mt-2">
                  <span className="text-2xs font-mono text-zinc-300 bg-zinc-900 border border-zinc-800 px-2 py-0.5 rounded-md">
                    {tier.quotaLabel || `${tier.tileQuota} Tiles`}
                  </span>
                  <span className="text-2xs text-zinc-400">
                    ({tier.tileQuota} storage slots)
                  </span>
                </div>

                {/* Edit & Delete Action Buttons */}
                <div className="mt-5 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => openEditModal(tier)}
                    className="w-full rounded-xl border border-zinc-700 bg-zinc-900/90 hover:bg-zinc-800 text-white py-2 px-3 text-xs font-semibold text-center transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-xs"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    <span>Edit Plan</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDelete(tier)}
                    disabled={plans.length <= 1}
                    className="w-full rounded-xl border border-zinc-800 bg-transparent hover:bg-red-950/40 hover:border-red-800/60 text-zinc-400 hover:text-red-400 py-2 px-3 text-xs font-semibold text-center transition-all cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-30 disabled:cursor-not-allowed"
                    title={plans.length <= 1 ? "Cannot delete the only remaining plan" : "Delete plan"}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete</span>
                  </button>
                </div>
              </div>

              {/* Features / Capabilities List */}
              <div className="mt-6 pt-5 border-t border-zinc-800/80">
                <span className="text-2xs font-bold uppercase tracking-wider text-zinc-400 block mb-3">
                  Included Capabilities ({tier.features.length})
                </span>
                <ul className="flex flex-col gap-2.5 font-normal text-xs text-white">
                  {tier.features.map((f, i) => (
                    <li key={i} className="flex items-start">
                      <Check className="h-3.5 w-3.5 mt-0.5 shrink-0 text-emerald-400 stroke-[3]" />
                      <span className="ml-2.5 text-zinc-300 font-medium leading-tight">
                        {f}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Plan Editor / Creator Modal ────────────────────────────── */}
      {(editingPlan || isCreating) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs overflow-y-auto animate-in fade-in-0">
          <div
            className="fixed inset-0 cursor-default"
            onClick={closeModal}
          />
          <div
            className="relative w-full max-w-2xl bg-card border border-border text-foreground rounded-3xl shadow-2xl overflow-hidden z-10 my-8 p-6 sm:p-8 space-y-6 animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div>
                <h3 className="text-lg font-bold text-foreground">
                  {isCreating ? "Create Subscription Plan" : `Edit Plan: ${formData.name}`}
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Set pricing, billing frequency, storage quota, and capabilities list.
                </p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="rounded-full p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-5">
              {/* Row 1: Name & Duration */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-foreground uppercase tracking-wider">
                    Plan Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g. Starter, Pro Studio, Custom Plan"
                    className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-border bg-field text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-foreground font-semibold"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-foreground uppercase tracking-wider" htmlFor="plan-duration">
                    Duration
                  </label>
                  <select
                    id="plan-duration"
                    value={planDurationMonths(formData)}
                    onChange={(e) => setFormData({ ...formData, durationMonths: Number(e.target.value), billingCycle: "monthly" })}
                    className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-border bg-field text-foreground focus:outline-none focus:ring-1 focus:ring-foreground font-medium cursor-pointer"
                  >
                    {DURATION_MONTHS.map((m) => (
                      <option key={m} value={m}>{durationLabel(m)}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Row 2: Price & Custom Price Toggle */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center justify-between">
                    <span>Price Amount ({formData.currency})</span>
                    <span className="text-2xs font-normal text-muted-foreground">Numeric value</span>
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={100}
                    disabled={formData.isCustomPrice}
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: Number(e.target.value) || 0 })}
                    className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-border bg-field text-foreground font-mono font-bold focus:outline-none focus:ring-1 focus:ring-foreground disabled:opacity-40"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-foreground uppercase tracking-wider">
                    Custom Plan Label
                  </label>
                  <input
                    type="text"
                    disabled={!formData.isCustomPrice}
                    value={formData.customPriceLabel || ""}
                    onChange={(e) => setFormData({ ...formData, customPriceLabel: e.target.value })}
                    placeholder="e.g. LKR XX,XXX or Contact Sales"
                    className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-border bg-field text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-foreground disabled:opacity-40"
                  />
                </div>
              </div>

              {/* Checkbox for custom price */}
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="customPriceCheck"
                  checked={formData.isCustomPrice}
                  onChange={(e) => setFormData({ ...formData, isCustomPrice: e.target.checked })}
                  className="rounded border-border text-foreground focus:ring-foreground h-4 w-4 cursor-pointer"
                />
                <label htmlFor="customPriceCheck" className="text-xs font-medium text-foreground cursor-pointer select-none">
                  Display as Custom Plan Quote (hides fixed numeric price)
                </label>
              </div>

              {/* Row 3: Quota Slots & Quota Display Label */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-foreground uppercase tracking-wider">
                    Tile Storage Limit (Quota) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    required
                    min={1}
                    value={formData.tileQuota}
                    onChange={(e) => setFormData({ ...formData, tileQuota: Number(e.target.value) || 1 })}
                    className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-border bg-field text-foreground font-mono font-bold focus:outline-none focus:ring-1 focus:ring-foreground"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-foreground uppercase tracking-wider">
                    Quota Badge Text
                  </label>
                  <input
                    type="text"
                    value={formData.quotaLabel}
                    onChange={(e) => setFormData({ ...formData, quotaLabel: e.target.value })}
                    placeholder="e.g. 50 Tiles, 100 Tiles, 500+ Tiles"
                    className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-border bg-field text-foreground font-medium focus:outline-none focus:ring-1 focus:ring-foreground"
                  />
                </div>
              </div>

              {/* Checkboxes: Popular & Active */}
              <div className="flex flex-wrap items-center gap-6 pt-1">
                <label className="inline-flex items-center gap-2 text-xs font-medium text-foreground cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={formData.isPopular}
                    onChange={(e) => setFormData({ ...formData, isPopular: e.target.checked })}
                    className="rounded border-border text-foreground focus:ring-foreground h-4 w-4 cursor-pointer"
                  />
                  <span>Highlight as &quot;Popular / Recommended&quot;</span>
                </label>

                <label className="inline-flex items-center gap-2 text-xs font-medium text-foreground cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={formData.active}
                    onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                    className="rounded border-border text-foreground focus:ring-foreground h-4 w-4 cursor-pointer"
                  />
                  <span>Active (Visible in Showroom Dashboard)</span>
                </label>
              </div>

              {/* Included Capabilities (Features) Section */}
              <div className="space-y-2.5 pt-2 border-t border-border/70">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-foreground uppercase tracking-wider">
                    Included Capabilities ({formData.features.length})
                  </label>
                  <button
                    type="button"
                    onClick={handleAddFeature}
                    className="inline-flex items-center gap-1 text-2xs font-bold text-primary hover:underline cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Add Item</span>
                  </button>
                </div>

                {/* Capability Inputs */}
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {formData.features.map((feature, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <span className="text-2xs font-mono text-muted-foreground w-4 text-center">
                        {idx + 1}.
                      </span>
                      <input
                        type="text"
                        value={feature}
                        onChange={(e) => handleFeatureChange(idx, e.target.value)}
                        placeholder="e.g. In-Store QR Kiosk, 50 Tile Storage Slots"
                        className="flex-1 text-xs px-3 py-2 rounded-xl border border-border bg-field text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-foreground"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveFeature(idx)}
                        disabled={formData.features.length <= 1}
                        className="p-2 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-20 cursor-pointer"
                        title="Remove capability"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>

                {/* Quick Presets */}
                <div className="pt-2">
                  <span className="text-[11px] font-semibold text-muted-foreground block mb-1.5">
                    Quick suggestions (click to add):
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {CAPABILITY_PRESETS.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => handleAddPresetFeature(preset)}
                        className="text-[10px] font-medium px-2 py-0.5 rounded-lg bg-muted border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer"
                      >
                        + {preset}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={isPending}
                  className="ds-btn ds-btn-outline text-xs h-9"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="ds-btn ds-btn-primary text-xs h-9 min-w-[120px]"
                >
                  {isPending ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <span>Save Plan</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
