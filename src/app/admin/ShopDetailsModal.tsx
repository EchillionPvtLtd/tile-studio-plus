"use client";

import { addDaysISO, asBillingDay, asDurationMonths, BILLING_DAY_LABELS, DURATION_MONTHS, durationLabel, expiryAfterMonths, formatLongDate, monthsBetweenISO, normalizePlan, packageChoices, packageName, todayISO, type BillingDay, type PackageChoice } from "@/lib/subscriptionPlans";
import { DEFAULT_SUBSCRIPTION_PLANS, type SubscriptionPlanItem } from "@/lib/subscriptionPlanTypes";
import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { updateShopDetailsByAdmin } from "@/actions/admin";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/dashboard";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Store,
  MapPin,
  Mail,
  Phone,
  Globe,
  Shield,
  Calendar,
  Layers,
  CreditCard,
  Edit3,
  Check,
  X,
  AlertCircle,
  ExternalLink,
  Save,
  Lock,
  FileText,
  User,
  Building2,
  Receipt,
  MessageCircle,
  Sparkles,
  Eye,
  EyeOff,
  Clock,
  Box,
  Hash,
  Info,
  CheckCircle2,
  XCircle
} from "lucide-react";

interface ShopDetailsModalProps {
  shop: any | null;
  isOpen: boolean;
  onClose: () => void;
  onShopUpdated?: (updatedShop: any) => void;
  initialMode?: "view" | "edit";
  /** The packages saved in the admin dashboard, so a package made there can be given to this showroom. */
  plans?: SubscriptionPlanItem[];
}

const SRI_LANKA_PROVINCES = [
  "Western Province",
  "Central Province",
  "Southern Province",
  "North Western Province",
  "Northern Province",
  "Eastern Province",
  "North Central Province",
  "Uva Province",
  "Sabaragamuwa Province",
];

const SRI_LANKA_DISTRICTS = [
  "Colombo", "Gampaha", "Kalutara", "Kandy", "Matale", "Nuwara Eliya",
  "Galle", "Matara", "Hambantota", "Jaffna", "Kilinochchi", "Mannar",
  "Vavuniya", "Mullaitivu", "Batticaloa", "Ampara", "Trincomalee",
  "Kurunegala", "Puttalam", "Anuradhapura", "Polonnaruwa", "Badulla",
  "Monaragala", "Ratnapura", "Kegalle",
];

export function parseShopMetadata(shop: any): Record<string, any> {
  if (!shop) return {};
  let meta: any = {};
  if (shop.details) {
    if (typeof shop.details === "object" && shop.details !== null) {
      meta = { ...shop.details };
    } else if (typeof shop.details === "string") {
      const trimmed = shop.details.trim();
      if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
        try {
          meta = JSON.parse(trimmed);
        } catch {
          meta = { description: shop.details };
        }
      } else {
        meta = { description: shop.details };
      }
    }
  }

  return {
    companyRegName: meta.companyRegName || "",
    ownerName: meta.ownerName || shop.shopName || "",
    contactPerson: meta.contactPerson || meta.ownerName || shop.shopName || "",
    phone: meta.phone || "",
    whatsapp: meta.whatsapp || meta.phone || "",
    shopEmail: meta.shopEmail || shop.email || "",
    website: meta.website || "",
    addressLine1: meta.addressLine1 || "",
    addressLine2: meta.addressLine2 || "",
    city: meta.city || "Colombo",
    district: meta.district || "Colombo",
    province: meta.province || "Western Province",
    postalCode: meta.postalCode || "",
    businessRegNo: meta.businessRegNo || "",
    taxVatNo: meta.taxVatNo || "",
    description: meta.description || (typeof shop.details === "string" && !shop.details.startsWith("{") ? shop.details : "") || "",
    adminName: meta.adminName || meta.ownerName || shop.shopName || "Showroom Administrator",
    username: meta.username || (shop.email ? shop.email.split("@")[0] : ""),
    duration: meta.duration || (shop.subscriptionPackage === "Free Trial" ? "14 Days" : "Monthly"),
    planPrice: typeof meta.planPrice === "number" ? meta.planPrice : (shop.subscriptionPackage === "Free Trial" ? 0 : 5000),
    amountPaid: typeof meta.amountPaid === "number" ? meta.amountPaid : (shop.subscriptionPackage === "Free Trial" ? 0 : 5000),
    balance: typeof meta.balance === "number" ? meta.balance : 0,
    paymentStatus: meta.paymentStatus || (shop.subscriptionPackage === "Free Trial" ? "Waived" : "Paid"),
    paymentDate: meta.paymentDate || (shop.subscriptionStart ? new Date(shop.subscriptionStart).toISOString().split("T")[0] : ""),
    paymentMethod: meta.paymentMethod || "Bank Transfer",
    paymentReference: meta.paymentReference || "",
    notes: meta.notes || "",
  };
}

export function ShopDetailsModal({
  shop,
  isOpen,
  onClose,
  onShopUpdated,
  initialMode = "view",
  plans,
}: ShopDetailsModalProps) {
  const router = useRouter();
  const [mode, setMode] = useState<"view" | "edit">(initialMode);
  const [activeTab, setActiveTab] = useState<"all" | "profile" | "location" | "subscription" | "security">("all");

  // Loading & feedback
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  // Editable Form State
  const [formData, setFormData] = useState({
    shopName: "",
    email: "",
    password: "",
    logoUrl: "",
    coverPhotoUrl: "",
    tileQuota: 50,
    subscriptionPackage: "Starter",
    subscriptionActive: true,
    subscriptionStart: "",
    subscriptionEnd: "",
    trialEndsAt: "",
    companyRegName: "",
    ownerName: "",
    contactPerson: "",
    phone: "",
    whatsapp: "",
    shopEmail: "",
    website: "",
    addressLine1: "",
    addressLine2: "",
    city: "",
    district: "",
    province: "",
    postalCode: "",
    businessRegNo: "",
    taxVatNo: "",
    description: "",
    adminName: "",
    username: "",
    duration: "Monthly",
    /** "1" to "12"; "" means the expiry date is set by hand */
    durationMonths: "",
    billingDay: "start" as BillingDay,
    planPrice: 0,
    amountPaid: 0,
    paymentStatus: "Paid",
    paymentDate: "",
    paymentMethod: "Bank Transfer",
    paymentReference: "",
    notes: "",
  });

  // Populate data whenever shop changes or modal opens
  useEffect(() => {
    if (!shop) return;
    setMode(initialMode);
    setSaveError(null);
    setSaveSuccess(null);

    const meta = parseShopMetadata(shop);

    const fmtDate = (val?: string | Date | null) => {
      if (!val) return "";
      try {
        const d = new Date(val);
        return isNaN(d.getTime()) ? "" : d.toISOString().split("T")[0];
      } catch {
        return "";
      }
    };

    setFormData({
      shopName: shop.shopName || "",
      email: shop.email || "",
      password: "",
      logoUrl: shop.logoUrl || "",
      coverPhotoUrl: shop.coverPhotoUrl || "",
      tileQuota: shop.tileQuota || 50,
      subscriptionPackage: normalizePlan(shop.subscriptionPackage || meta.plan) || "Starter",
      subscriptionActive: shop.subscriptionActive ?? true,
      subscriptionStart: fmtDate(shop.subscriptionStart),
      subscriptionEnd: fmtDate(shop.subscriptionEnd),
      trialEndsAt: fmtDate(shop.trialEndsAt),
      companyRegName: meta.companyRegName || "",
      ownerName: meta.ownerName || "",
      contactPerson: meta.contactPerson || meta.ownerName || "",
      phone: meta.phone || "",
      whatsapp: meta.whatsapp || meta.phone || "",
      shopEmail: meta.shopEmail || shop.email || "",
      website: meta.website || "",
      addressLine1: meta.addressLine1 || "",
      addressLine2: meta.addressLine2 || "",
      city: meta.city || "Colombo",
      district: meta.district || "Colombo",
      province: meta.province || "Western Province",
      postalCode: meta.postalCode || "",
      businessRegNo: meta.businessRegNo || "",
      taxVatNo: meta.taxVatNo || "",
      description: meta.description || "",
      adminName: meta.adminName || "",
      username: meta.username || "",
      duration: meta.duration || "Monthly",
      durationMonths: (() => {
        const start = fmtDate(shop.subscriptionStart);
        const end = fmtDate(shop.subscriptionEnd);
        const months = asDurationMonths(meta.durationMonths) ?? monthsBetweenISO(start, end);
        // The saved duration, unless the dates were changed afterwards
        return months !== null && (!end || expiryAfterMonths(start, months) === end) ? String(months) : "";
      })(),
      billingDay: asBillingDay(meta.billingDay),
      planPrice: Number(meta.planPrice) || 0,
      amountPaid: Number(meta.amountPaid) || 0,
      paymentStatus: meta.paymentStatus || (shop.subscriptionPackage === "Free Trial" ? "Waived" : "Paid"),
      paymentDate: meta.paymentDate || "",
      paymentMethod: meta.paymentMethod || "Bank Transfer",
      paymentReference: meta.paymentReference || "",
      notes: meta.notes || "",
    });
  }, [shop, isOpen, initialMode]);

  if (!isOpen || !shop) return null;

  const planList = plans && plans.length > 0 ? plans : DEFAULT_SUBSCRIPTION_PLANS;
  const choices = packageChoices(planList, formData.subscriptionPackage);
  const isTrialPlan = formData.subscriptionPackage === "Free Trial";
  const meta = parseShopMetadata(shop);
  const utilPercent = Math.min(100, Math.round(((shop._count?.tiles || 0) / (shop.tileQuota || 1)) * 100));

  /** Picking a package fills its price and tile allowance and starts it today for the chosen duration (a Free Trial runs 14 days). */
  const handlePlanPresetSelect = (choice: PackageChoice) => {
    const trial = choice.value === "Free Trial";
    setFormData((prev) => {
      const today = todayISO();
      const months = choice.durationMonths;
      return {
        ...prev,
        subscriptionPackage: choice.value,
        planPrice: choice.price,
        tileQuota: choice.tileQuota,
        duration: trial ? "14 Days" : months === 1 ? "Monthly" : `${months} Months`,
        durationMonths: trial ? "" : String(months),
        paymentStatus: trial ? "Waived" : "Paid",
        amountPaid: trial ? 0 : choice.price,
        subscriptionStart: today,
        subscriptionEnd: trial ? "" : expiryAfterMonths(today, months),
        trialEndsAt: trial ? addDaysISO(today, 14) : "",
      };
    });
  };

  /** Choosing a duration (1 to 12 months) works out the expiry date from the start date. */
  const handleDurationSelect = (value: string) => {
    setFormData((prev) => {
      const months = asDurationMonths(value);
      if (months === null) return { ...prev, durationMonths: "", duration: "Custom" };
      const start = prev.subscriptionStart || todayISO();
      return {
        ...prev,
        durationMonths: String(months),
        duration: months === 1 ? "Monthly" : `${months} Months`,
        subscriptionStart: start,
        subscriptionEnd: expiryAfterMonths(start, months),
      };
    });
  };

  /** Moving the start date moves the expiry date with it. */
  const handleStartSelect = (start: string) => {
    setFormData((prev) => {
      if (prev.subscriptionPackage === "Free Trial") return { ...prev, subscriptionStart: start, trialEndsAt: addDaysISO(start, 14) || prev.trialEndsAt };
      const months = asDurationMonths(prev.durationMonths);
      return months !== null ? { ...prev, subscriptionStart: start, subscriptionEnd: expiryAfterMonths(start, months) } : { ...prev, subscriptionStart: start };
    });
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(null);

    try {
      const res = await updateShopDetailsByAdmin({
        shopId: shop.id,
        shopName: formData.shopName,
        email: formData.email,
        password: formData.password || undefined,
        logoUrl: formData.logoUrl,
        coverPhotoUrl: formData.coverPhotoUrl,
        tileQuota: Number(formData.tileQuota),
        subscriptionPackage: formData.subscriptionPackage,
        subscriptionActive: formData.subscriptionActive,
        billingDay: formData.billingDay,
        durationMonths: isTrialPlan ? null : asDurationMonths(formData.durationMonths),
        subscriptionStart: formData.subscriptionStart || null,
        subscriptionEnd: formData.subscriptionEnd || null,
        trialEndsAt: formData.trialEndsAt || null,
        companyRegName: formData.companyRegName,
        ownerName: formData.ownerName,
        contactPerson: formData.contactPerson,
        phone: formData.phone,
        whatsapp: formData.whatsapp,
        shopEmail: formData.shopEmail,
        website: formData.website,
        addressLine1: formData.addressLine1,
        addressLine2: formData.addressLine2,
        city: formData.city,
        district: formData.district,
        province: formData.province,
        postalCode: formData.postalCode,
        businessRegNo: formData.businessRegNo,
        taxVatNo: formData.taxVatNo,
        description: formData.description,
        adminName: formData.adminName,
        username: formData.username,
        duration: formData.duration,
        planPrice: Number(formData.planPrice),
        amountPaid: Number(formData.amountPaid),
        paymentStatus: formData.paymentStatus,
        paymentDate: formData.paymentDate,
        paymentMethod: formData.paymentMethod,
        paymentReference: formData.paymentReference,
        notes: formData.notes,
      });

      if (!res.success) {
        setSaveError(res.message || "Failed to update shop details.");
      } else {
        setSaveSuccess(res.message || "Shop details successfully saved!");
        if (onShopUpdated && res.shop) {
          onShopUpdated(res.shop);
        }
        router.refresh();
        setTimeout(() => {
          setMode("view");
          setSaveSuccess(null);
        }, 1000);
      }
    } catch (err: any) {
      setSaveError(err?.message || "An unexpected error occurred while saving.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        hideClose={true}
        className="max-w-4xl p-0 overflow-hidden flex flex-col max-h-[92dvh] rounded-3xl border-border bg-card shadow-2xl gap-0"
      >
        <DialogTitle className="sr-only">
          {formData.shopName || shop.shopName || "Showroom Details"}
        </DialogTitle>

        {/* ── TOP HEADER ── */}
        <div className="px-6 py-5 border-b border-border flex flex-wrap items-center justify-between gap-4 bg-muted">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-14 h-14 rounded-xl bg-field border border-input flex items-center justify-center text-foreground font-bold text-sm shrink-0 overflow-hidden shadow-xs">
              {formData.logoUrl || shop.logoUrl ? (
                <img
                  src={formData.logoUrl || shop.logoUrl}
                  alt={shop.shopName || "Shop"}
                  className="w-full h-full object-cover"
                />
              ) : (
                shop.shopName?.charAt(0) || "S"
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-lg font-bold text-foreground tracking-tight truncate">
                  {formData.shopName || shop.shopName || "Unnamed Showroom"}
                </h2>
                <Badge
                  variant={formData.subscriptionActive ? "success" : "secondary"}
                  className="gap-1.5 py-0.5 text-2xs font-bold"
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${formData.subscriptionActive ? "bg-success" : "bg-muted-foreground/50"}`} />
                  {formData.subscriptionActive ? "Active License" : "Suspended"}
                </Badge>
                <Badge
                  variant="outline"
                  className="py-0.5 text-2xs font-bold bg-secondary text-foreground/80"
                >
                  {packageName(formData.subscriptionPackage || shop.subscriptionPackage, planList) || "Free Trial"}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground font-mono mt-0.5 truncate">{shop.email}</p>
            </div>
          </div>

          {/* Mode Switcher & Close */}
          <div className="flex items-center gap-2">
            <div className="flex bg-secondary p-1 rounded-xl">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setMode("view")}
                className={`h-7 px-3 rounded-lg text-xs font-bold transition-all ${
                  mode === "view"
                    ? "bg-card text-foreground shadow-xs hover:bg-card"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                View Details
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setMode("edit")}
                className={`h-7 px-3 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                  mode === "edit"
                    ? "bg-card text-foreground shadow-xs hover:bg-card"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Edit & Update</span>
              </Button>
            </div>

            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground hover:bg-accent"
              title="Close modal"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* ── SECTION TABS ── */}
        <div className="px-6 py-2 border-b border-border bg-muted/20">
          <Tabs value={activeTab} onValueChange={(val: any) => setActiveTab(val)}>
            <TabsList className="bg-secondary p-0.5 h-8">
              <TabsTrigger value="all" className="text-xs px-2.5 py-1">All</TabsTrigger>
              <TabsTrigger value="profile" className="text-xs px-2.5 py-1">Profile</TabsTrigger>
              <TabsTrigger value="location" className="text-xs px-2.5 py-1">Location</TabsTrigger>
              <TabsTrigger value="subscription" className="text-xs px-2.5 py-1">Subscription</TabsTrigger>
              <TabsTrigger value="security" className="text-xs px-2.5 py-1">Security</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* ── ALERTS BANNER ── */}
        {saveError && (
          <div className="mx-6 mt-4 p-3.5 rounded-2xl bg-destructive-muted border border-destructive/30 text-destructive text-xs flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{saveError}</span>
          </div>
        )}
        {saveSuccess && (
          <div className="mx-6 mt-4 p-3.5 rounded-2xl bg-success-muted border border-success/30 text-success text-xs flex items-center gap-2.5">
            <Check className="w-4 h-4 shrink-0" />
            <span>{saveSuccess}</span>
          </div>
        )}

        {/* ── MODAL BODY: VIEW MODE ── */}
        {mode === "view" && (
          <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin typeset-docs">
            
            {/* Quick Metrics Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
              <div className="p-4 rounded-2xl bg-muted border border-border space-y-1">
                <p className="text-2xs font-bold text-muted-foreground uppercase tracking-wider">Tile Quota</p>
                <div className="flex items-baseline justify-between">
                  <span className="text-base font-bold text-foreground">
                    {shop._count?.tiles || 0} / {shop.tileQuota || 50}
                  </span>
                  <span className="text-2xs font-bold text-muted-foreground">{utilPercent}%</span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-secondary overflow-hidden">
                  <div className="h-full bg-primary rounded-full" style={{ width: `${utilPercent}%` }} />
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-muted border border-border space-y-1">
                <p className="text-2xs font-bold text-muted-foreground uppercase tracking-wider">Visualizations</p>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-base font-bold text-foreground">
                    {shop._count?.savedDesigns || 0}
                  </span>
                  <span className="text-2xs font-medium text-muted-foreground">saved 3D</span>
                </div>
                <p className="text-2xs text-muted-foreground">Customer designs</p>
              </div>

              <div className="p-4 rounded-2xl bg-muted border border-border space-y-1">
                <p className="text-2xs font-bold text-muted-foreground uppercase tracking-wider">Plan & Terms</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-base font-bold text-foreground">
                    {meta.planPrice ? `LKR ${Number(meta.planPrice).toLocaleString()}` : "Free Trial"}
                  </span>
                </div>
                <p className="text-2xs text-muted-foreground">{meta.duration || "Monthly"} subscription</p>
              </div>

              <div className="p-4 rounded-2xl bg-muted border border-border space-y-1">
                <p className="text-2xs font-bold text-muted-foreground uppercase tracking-wider">License Expiry</p>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-base font-bold text-foreground truncate">
                    {shop.subscriptionEnd ? new Date(shop.subscriptionEnd).toLocaleDateString() : (shop.trialEndsAt ? new Date(shop.trialEndsAt).toLocaleDateString() : "No Expiry")}
                  </span>
                </div>
                <p className="text-2xs text-muted-foreground">
                  {shop.subscriptionActive ? "Active & Authorized" : "Temporarily Suspended"}
                </p>
              </div>
            </div>

            {/* Filter Navigation Tabs */}
            <div className="flex border-b border-border gap-4 sm:gap-6 text-xs font-bold overflow-x-auto pb-1 scrollbar-none">
              <button
                onClick={() => setActiveTab("all")}
                className={`pb-3 transition-colors cursor-pointer shrink-0 flex items-center gap-1.5 ${
                  activeTab === "all"
                    ? "border-b-2 border-primary text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>All Details</span>
              </button>
              <button
                onClick={() => setActiveTab("profile")}
                className={`pb-3 transition-colors cursor-pointer shrink-0 flex items-center gap-1.5 ${
                  activeTab === "profile"
                    ? "border-b-2 border-primary text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Store className="w-3.5 h-3.5" />
                <span>Showroom Profile</span>
              </button>
              <button
                onClick={() => setActiveTab("location")}
                className={`pb-3 transition-colors cursor-pointer shrink-0 flex items-center gap-1.5 ${
                  activeTab === "location"
                    ? "border-b-2 border-primary text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <MapPin className="w-3.5 h-3.5" />
                <span>Address</span>
              </button>
              <button
                onClick={() => setActiveTab("subscription")}
                className={`pb-3 transition-colors cursor-pointer shrink-0 flex items-center gap-1.5 ${
                  activeTab === "subscription"
                    ? "border-b-2 border-primary text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <CreditCard className="w-3.5 h-3.5" />
                <span>Subscription & Billing</span>
              </button>
              <button
                onClick={() => setActiveTab("security")}
                className={`pb-3 transition-colors cursor-pointer shrink-0 flex items-center gap-1.5 ${
                  activeTab === "security"
                    ? "border-b-2 border-primary text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Shield className="w-3.5 h-3.5" />
                <span>Admin Login</span>
              </button>
            </div>

            {/* 1. SHOWROOM & BUSINESS ENTITY */}
            {(activeTab === "all" || activeTab === "profile") && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-primary text-primary-foreground flex items-center justify-center font-bold text-2xs">1</div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
                    <span>Showroom Profile & Business Entity</span>
                  </h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 rounded-2xl bg-muted border border-border space-y-3">
                    <h4 className="text-xs font-bold text-foreground flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-muted-foreground" />
                      <span>Registration & Identity</span>
                    </h4>
                    <div className="space-y-2 text-xs">
                      <div>
                        <span className="text-2xs font-bold uppercase text-muted-foreground block">Showroom Trading Name</span>
                        <p className="font-semibold text-foreground/80">{shop.shopName || "—"}</p>
                      </div>
                      <div>
                        <span className="text-2xs font-bold uppercase text-muted-foreground block">Company Registered Legal Name</span>
                        <p className="font-semibold text-foreground/80">{meta.companyRegName || "—"}</p>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className="text-2xs font-bold uppercase text-muted-foreground block">Business Reg No (BRN)</span>
                          <p className="font-semibold text-foreground/80">{meta.businessRegNo || "—"}</p>
                        </div>
                        <div>
                          <span className="text-2xs font-bold uppercase text-muted-foreground block">Tax / VAT No</span>
                          <p className="font-semibold text-foreground/80">{meta.taxVatNo || "—"}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 rounded-2xl bg-muted border border-border space-y-3">
                    <h4 className="text-xs font-bold text-foreground flex items-center gap-2">
                      <User className="w-4 h-4 text-muted-foreground" />
                      <span>Contact Persons & Comms</span>
                    </h4>
                    <div className="space-y-2 text-xs">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className="text-2xs font-bold uppercase text-muted-foreground block">Owner / Principal</span>
                          <p className="font-semibold text-foreground/80">{meta.ownerName || "—"}</p>
                        </div>
                        <div>
                          <span className="text-2xs font-bold uppercase text-muted-foreground block">Contact Person</span>
                          <p className="font-semibold text-foreground/80">{meta.contactPerson || meta.ownerName || "—"}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className="text-2xs font-bold uppercase text-muted-foreground block">Phone</span>
                          <p className="font-semibold text-foreground/80">
                            {meta.phone ? <a href={`tel:${meta.phone}`} className="font-medium text-foreground underline-offset-2 hover:underline">{meta.phone}</a> : "—"}
                          </p>
                        </div>
                        <div>
                          <span className="text-2xs font-bold uppercase text-muted-foreground block">WhatsApp</span>
                          <p className="font-semibold text-foreground/80">
                            {meta.whatsapp ? <a href={`https://wa.me/${meta.whatsapp.replace(/[^0-9]/g, "")}`} target="_blank" rel="noreferrer" className="font-medium text-foreground underline-offset-2 hover:underline">{meta.whatsapp}</a> : "—"}
                          </p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className="text-2xs font-bold uppercase text-muted-foreground block">Public Showroom Email</span>
                          <p className="font-semibold text-foreground/80 truncate">
                            {meta.shopEmail ? <a href={`mailto:${meta.shopEmail}`} className="hover:underline">{meta.shopEmail}</a> : "—"}
                          </p>
                        </div>
                        <div>
                          <span className="text-2xs font-bold uppercase text-muted-foreground block">Website</span>
                          <p className="font-semibold text-foreground/80 truncate">
                            {meta.website ? (
                              <a href={meta.website.startsWith("http") ? meta.website : `https://${meta.website}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 font-medium text-foreground underline-offset-2 hover:underline">
                                <span>{meta.website}</span>
                                <ExternalLink className="w-2.5 h-2.5 inline" />
                              </a>
                            ) : "—"}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {meta.description && (
                    <div className="col-span-full p-4 rounded-2xl bg-muted border border-border">
                      <span className="text-2xs font-bold uppercase text-muted-foreground block mb-1">Showroom Bio & Description</span>
                      <p className="text-xs text-foreground/80 leading-relaxed">{meta.description}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 2. PHYSICAL ADDRESS & LOCATION */}
            {(activeTab === "all" || activeTab === "location") && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-primary text-primary-foreground flex items-center justify-center font-bold text-2xs">2</div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
                    <span>Physical Address & Location</span>
                  </h3>
                </div>

                <div className="p-5 rounded-2xl bg-muted border border-border">
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-xs">
                    <div>
                      <span className="text-2xs font-bold uppercase text-muted-foreground block">Address Line 1</span>
                      <p className="font-semibold text-foreground/80">{meta.addressLine1 || "—"}</p>
                    </div>
                    <div>
                      <span className="text-2xs font-bold uppercase text-muted-foreground block">Address Line 2</span>
                      <p className="font-semibold text-foreground/80">{meta.addressLine2 || "—"}</p>
                    </div>
                    <div>
                      <span className="text-2xs font-bold uppercase text-muted-foreground block">City</span>
                      <p className="font-semibold text-foreground/80">{meta.city || "—"}</p>
                    </div>
                    <div>
                      <span className="text-2xs font-bold uppercase text-muted-foreground block">District</span>
                      <p className="font-semibold text-foreground/80">{meta.district || "—"}</p>
                    </div>
                    <div>
                      <span className="text-2xs font-bold uppercase text-muted-foreground block">Province</span>
                      <p className="font-semibold text-foreground/80">{meta.province || "—"}</p>
                    </div>
                    <div>
                      <span className="text-2xs font-bold uppercase text-muted-foreground block">Postal Code</span>
                      <p className="font-semibold text-foreground/80">{meta.postalCode || "—"}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 3. SHOWROOM ADMIN ACCOUNT & ACCESS */}
            {(activeTab === "all" || activeTab === "security") && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-primary text-primary-foreground flex items-center justify-center font-bold text-2xs">3</div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
                    <span>Showroom Administrator Account & Access</span>
                  </h3>
                </div>

                <div className="p-5 rounded-2xl bg-muted border border-border">
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-xs">
                    <div>
                      <span className="text-2xs font-bold uppercase text-muted-foreground block">Primary Login Email</span>
                      <p className="font-mono font-bold text-foreground/80">{shop.email}</p>
                    </div>
                    <div>
                      <span className="text-2xs font-bold uppercase text-muted-foreground block">Assigned Admin Name</span>
                      <p className="font-semibold text-foreground/80">{meta.adminName || meta.ownerName || "Showroom Administrator"}</p>
                    </div>
                    <div>
                      <span className="text-2xs font-bold uppercase text-muted-foreground block">Custom Username</span>
                      <p className="font-mono text-foreground/80">{meta.username || "—"}</p>
                    </div>
                    <div>
                      <span className="text-2xs font-bold uppercase text-muted-foreground block">Account Status</span>
                      <p className="font-semibold text-foreground/80 flex items-center gap-1.5">
                        {shop.subscriptionActive ? (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5 text-success" />
                            <span>Active & Authorized</span>
                          </>
                        ) : (
                          <>
                            <XCircle className="w-3.5 h-3.5 text-destructive" />
                            <span>Suspended / Deactivated</span>
                          </>
                        )}
                      </p>
                    </div>
                    <div>
                      <span className="text-2xs font-bold uppercase text-muted-foreground block">Registered Date</span>
                      <p className="font-semibold text-foreground/80">
                        {shop.createdAt ? new Date(shop.createdAt).toLocaleString() : "—"}
                      </p>
                    </div>
                    <div>
                      <span className="text-2xs font-bold uppercase text-muted-foreground block">Last Profile Update</span>
                      <p className="font-semibold text-foreground/80">
                        {shop.updatedAt ? new Date(shop.updatedAt).toLocaleString() : "—"}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 4. SUBSCRIPTION, QUOTA & COMMERCIAL SETTLEMENT */}
            {(activeTab === "all" || activeTab === "subscription") && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-primary text-primary-foreground flex items-center justify-center font-bold text-2xs">4</div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
                    <span>Subscription Plan, Quota & Commercial Settlement</span>
                  </h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Subscription Terms */}
                  <div className="p-4 rounded-2xl bg-muted border border-border space-y-3">
                    <h4 className="text-xs font-bold text-foreground flex items-center gap-2">
                      <Receipt className="w-4 h-4 text-muted-foreground" />
                      <span>Subscription Terms & Quota</span>
                    </h4>
                    <div className="space-y-2 text-xs">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className="text-2xs font-bold uppercase text-muted-foreground block">Package Plan</span>
                          <p className="font-semibold text-foreground/80">{packageName(shop.subscriptionPackage || meta.plan, planList) || "Free Trial"}</p>
                        </div>
                        <div>
                          <span className="text-2xs font-bold uppercase text-muted-foreground block">Billing Period</span>
                          <p className="font-semibold text-foreground/80">{meta.duration || "Monthly"}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className="text-2xs font-bold uppercase text-muted-foreground block">Tile Quota Limit</span>
                          <p className="font-semibold text-foreground/80">{shop.tileQuota || 50} tiles</p>
                        </div>
                        <div>
                          <span className="text-2xs font-bold uppercase text-muted-foreground block">Tiles Uploaded</span>
                          <p className="font-semibold text-foreground/80">{shop._count?.tiles || 0} active</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className="text-2xs font-bold uppercase text-muted-foreground block">Subscription Start</span>
                          <p className="font-semibold text-foreground/80">
                            {shop.subscriptionStart ? new Date(shop.subscriptionStart).toLocaleDateString() : "—"}
                          </p>
                        </div>
                        <div>
                          <span className="text-2xs font-bold uppercase text-muted-foreground block">Expiry / Due Date</span>
                          <p className="font-semibold text-foreground/80">
                            {shop.subscriptionEnd ? new Date(shop.subscriptionEnd).toLocaleDateString() : (shop.trialEndsAt ? new Date(shop.trialEndsAt).toLocaleDateString() : "No Expiry")}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Payment Records */}
                  <div className="p-4 rounded-2xl bg-muted border border-border space-y-3">
                    <h4 className="text-xs font-bold text-foreground flex items-center gap-2">
                      <CreditCard className="w-4 h-4 text-muted-foreground" />
                      <span>Commercial Settlement</span>
                    </h4>
                    <div className="space-y-2 text-xs">
                      <div className="grid grid-cols-3 gap-2 pb-2 border-b border-border">
                        <div>
                          <span className="text-2xs font-bold uppercase text-muted-foreground block">Plan Fee</span>
                          <p className="font-bold text-foreground">LKR {Number(meta.planPrice || 0).toLocaleString()}</p>
                        </div>
                        <div>
                          <span className="text-2xs font-bold uppercase text-muted-foreground block">Amount Paid</span>
                          <p className="font-bold text-success">LKR {Number(meta.amountPaid || 0).toLocaleString()}</p>
                        </div>
                        <div>
                          <span className="text-2xs font-bold uppercase text-muted-foreground block">Balance Due</span>
                          <p className={`font-bold ${(Number(meta.planPrice || 0) - Number(meta.amountPaid || 0)) > 0 ? "text-warning" : "text-muted-foreground"}`}>
                            LKR {Math.max(0, Number(meta.planPrice || 0) - Number(meta.amountPaid || 0)).toLocaleString()}
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className="text-2xs font-bold uppercase text-muted-foreground block">Payment Status</span>
                          <StatusBadge
                            className="mt-1"
                            tone={
                              (meta.paymentStatus || "Paid") === "Paid" ? "success"
                              : meta.paymentStatus === "Pending" ? "warning"
                              : "neutral"
                            }
                          >
                            {meta.paymentStatus || "Paid"}
                          </StatusBadge>
                        </div>
                        <div>
                          <span className="text-2xs font-bold uppercase text-muted-foreground block">Payment Method</span>
                          <p className="font-semibold text-foreground/80">{meta.paymentMethod || "Bank Transfer"}</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className="text-2xs font-bold uppercase text-muted-foreground block">Payment Date</span>
                          <p className="font-semibold text-foreground/80">{meta.paymentDate || "—"}</p>
                        </div>
                        <div>
                          <span className="text-2xs font-bold uppercase text-muted-foreground block">Reference / Receipt</span>
                          <p className="font-mono text-foreground/80 truncate">{meta.paymentReference || "—"}</p>
                        </div>
                      </div>

                      {meta.notes && (
                        <div className="pt-1">
                          <span className="text-2xs font-bold uppercase text-muted-foreground block">Agreement Notes</span>
                          <p className="text-muted-foreground italic text-2xs leading-relaxed">{meta.notes}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

          </div>
        )}

        {/* ── MODAL BODY: EDIT & UPDATE MODE ── */}
        {mode === "edit" && (
          <form onSubmit={handleFormSubmit} className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin typeset-docs">
            
            {/* 1. General & Brand */}
            <div className="space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <Store className="w-4 h-4 text-foreground" />
                <span>Showroom Identity & Branding</span>
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="ds-label">
                    Showroom Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.shopName}
                    onChange={(e) => setFormData({ ...formData, shopName: e.target.value })}
                    className="ds-field"
                  />
                </div>
                <div>
                  <label className="ds-label">
                    Company Registered Legal Name
                  </label>
                  <input
                    type="text"
                    value={formData.companyRegName}
                    onChange={(e) => setFormData({ ...formData, companyRegName: e.target.value })}
                    className="ds-field"
                  />
                </div>
                <div>
                  <label className="ds-label">
                    Showroom Logo Image URL
                  </label>
                  <input
                    type="url"
                    placeholder="https://... or /Logo/..."
                    value={formData.logoUrl}
                    onChange={(e) => setFormData({ ...formData, logoUrl: e.target.value })}
                    className="ds-field"
                  />
                </div>
                <div>
                  <label className="ds-label">
                    Cover Photo Banner URL
                  </label>
                  <input
                    type="url"
                    placeholder="https://..."
                    value={formData.coverPhotoUrl}
                    onChange={(e) => setFormData({ ...formData, coverPhotoUrl: e.target.value })}
                    className="ds-field"
                  />
                </div>
                <div className="col-span-full">
                  <label className="ds-label">
                    Showroom Bio / Description
                  </label>
                  <textarea
                    rows={2}
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="ds-field"
                  />
                </div>
              </div>
            </div>

            {/* 2. Contacts & Registration */}
            <div className="space-y-4 pt-4 border-t border-border">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <User className="w-4 h-4 text-foreground" />
                <span>Contact Persons & Registration</span>
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <label className="ds-label">Owner Name</label>
                  <input
                    type="text"
                    value={formData.ownerName}
                    onChange={(e) => setFormData({ ...formData, ownerName: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl text-xs bg-muted border border-border text-foreground"
                  />
                </div>
                <div>
                  <label className="ds-label">Contact Person</label>
                  <input
                    type="text"
                    value={formData.contactPerson}
                    onChange={(e) => setFormData({ ...formData, contactPerson: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl text-xs bg-muted border border-border text-foreground"
                  />
                </div>
                <div>
                  <label className="ds-label">Phone Number</label>
                  <input
                    type="text"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl text-xs bg-muted border border-border text-foreground"
                  />
                </div>
                <div>
                  <label className="ds-label">WhatsApp</label>
                  <input
                    type="text"
                    value={formData.whatsapp}
                    onChange={(e) => setFormData({ ...formData, whatsapp: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl text-xs bg-muted border border-border text-foreground"
                  />
                </div>
                <div>
                  <label className="ds-label">Public Email</label>
                  <input
                    type="email"
                    value={formData.shopEmail}
                    onChange={(e) => setFormData({ ...formData, shopEmail: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl text-xs bg-muted border border-border text-foreground"
                  />
                </div>
                <div>
                  <label className="ds-label">Website</label>
                  <input
                    type="text"
                    value={formData.website}
                    onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl text-xs bg-muted border border-border text-foreground"
                  />
                </div>
                <div>
                  <label className="ds-label">Business Reg No (BRN)</label>
                  <input
                    type="text"
                    value={formData.businessRegNo}
                    onChange={(e) => setFormData({ ...formData, businessRegNo: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl text-xs bg-muted border border-border text-foreground"
                  />
                </div>
                <div>
                  <label className="ds-label">Tax / VAT No</label>
                  <input
                    type="text"
                    value={formData.taxVatNo}
                    onChange={(e) => setFormData({ ...formData, taxVatNo: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl text-xs bg-muted border border-border text-foreground"
                  />
                </div>
              </div>
            </div>

            {/* 3. Physical Address */}
            <div className="space-y-4 pt-4 border-t border-border">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <MapPin className="w-4 h-4 text-foreground" />
                <span>Physical Address & Location</span>
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <label className="ds-label">Address Line 1</label>
                  <input
                    type="text"
                    value={formData.addressLine1}
                    onChange={(e) => setFormData({ ...formData, addressLine1: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl text-xs bg-muted border border-border text-foreground"
                  />
                </div>
                <div>
                  <label className="ds-label">Address Line 2</label>
                  <input
                    type="text"
                    value={formData.addressLine2}
                    onChange={(e) => setFormData({ ...formData, addressLine2: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl text-xs bg-muted border border-border text-foreground"
                  />
                </div>
                <div>
                  <label className="ds-label">City</label>
                  <input
                    type="text"
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl text-xs bg-muted border border-border text-foreground"
                  />
                </div>
                <div>
                  <label className="ds-label">District</label>
                  <select
                    value={formData.district}
                    onChange={(e) => setFormData({ ...formData, district: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl text-xs bg-muted border border-border text-foreground"
                  >
                    <option value="">Select District</option>
                    {SRI_LANKA_DISTRICTS.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="ds-label">Province</label>
                  <select
                    value={formData.province}
                    onChange={(e) => setFormData({ ...formData, province: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl text-xs bg-muted border border-border text-foreground"
                  >
                    <option value="">Select Province</option>
                    {SRI_LANKA_PROVINCES.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="ds-label">Postal Code</label>
                  <input
                    type="text"
                    value={formData.postalCode}
                    onChange={(e) => setFormData({ ...formData, postalCode: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl text-xs bg-muted border border-border text-foreground"
                  />
                </div>
              </div>
            </div>

            {/* 4. Credentials & Access */}
            <div className="space-y-4 pt-4 border-t border-border">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <Shield className="w-4 h-4 text-foreground" />
                <span>Admin Login & Password</span>
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="ds-label">
                    Login Email *
                  </label>
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl text-xs bg-muted border border-border text-foreground"
                  />
                </div>
                <div>
                  <label className="ds-label">
                    Admin Contact Name
                  </label>
                  <input
                    type="text"
                    value={formData.adminName}
                    onChange={(e) => setFormData({ ...formData, adminName: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl text-xs bg-muted border border-border text-foreground"
                  />
                </div>
                <div>
                  <label className="ds-label">
                    Custom Username (Optional)
                  </label>
                  <input
                    type="text"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl text-xs bg-muted border border-border text-foreground"
                  />
                </div>
                <div>
                  <label className="ds-label">
                    Reset Password (leave empty to keep existing)
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      placeholder="Enter new 6+ char password"
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      className="w-full px-3.5 py-2 pr-10 rounded-xl text-xs bg-muted border border-border text-foreground"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* 5. Subscription & Quota Limits */}
            <div className="space-y-4 pt-4 border-t border-border">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-foreground" />
                  <span>Subscription Plan & Quota Capacity</span>
                </h3>
              </div>

              {/* Plan Presets Quick Select */}
              <div className="flex flex-wrap gap-2">
                {choices.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => handlePlanPresetSelect(c)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      formData.subscriptionPackage === c.value
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "bg-secondary text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {c.value === "Free Trial" ? c.label : c.value === "Custom" ? c.label : `${c.label} (LKR ${c.price.toLocaleString()})`}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="ds-label">
                    Tile Quota Limit *
                  </label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={formData.tileQuota}
                    onChange={(e) => setFormData({ ...formData, tileQuota: Number(e.target.value) })}
                    className="w-full px-3.5 py-2 rounded-xl text-xs bg-muted border border-border text-foreground font-mono"
                  />
                </div>

                <div>
                  <label className="ds-label">
                    Account Status
                  </label>
                  <select
                    value={formData.subscriptionActive ? "active" : "suspended"}
                    onChange={(e) => setFormData({ ...formData, subscriptionActive: e.target.value === "active" })}
                    className="w-full px-3.5 py-2 rounded-xl text-xs bg-muted border border-border text-foreground font-bold"
                  >
                    <option value="active">Active & Authorized</option>
                    <option value="suspended">Suspended / Deactivated</option>
                  </select>
                </div>

                <div>
                  <label className="ds-label">Collect the monthly fee on</label>
                  <select
                    value={formData.billingDay}
                    onChange={(e) => setFormData({ ...formData, billingDay: asBillingDay(e.target.value) })}
                    className="w-full px-3.5 py-2 rounded-xl text-xs bg-muted border border-border text-foreground font-bold cursor-pointer"
                  >
                    {(Object.keys(BILLING_DAY_LABELS) as BillingDay[]).map((k) => (
                      <option key={k} value={k}>{BILLING_DAY_LABELS[k]}</option>
                    ))}
                  </select>
                </div>

                {!isTrialPlan && (
                  <div>
                    <label className="ds-label" htmlFor="details-duration">Duration</label>
                    <select
                      id="details-duration"
                      value={formData.durationMonths}
                      onChange={(e) => handleDurationSelect(e.target.value)}
                      className="w-full px-3.5 py-2 rounded-xl text-xs bg-muted border border-border text-foreground font-bold cursor-pointer"
                    >
                      {DURATION_MONTHS.map((m) => (
                        <option key={m} value={String(m)}>{durationLabel(m)}</option>
                      ))}
                      <option value="">Custom expiry date</option>
                    </select>
                  </div>
                )}

                <div>
                  <label className="ds-label">
                    Subscription Start Date
                  </label>
                  <input
                    type="date"
                    value={formData.subscriptionStart}
                    onChange={(e) => handleStartSelect(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl text-xs bg-muted border border-border text-foreground"
                  />
                </div>

                <div>
                  <label className="ds-label">
                    {isTrialPlan ? "Free Trial Ends" : "Subscription Expiry Date"}
                  </label>
                  <input
                    type="date"
                    value={isTrialPlan ? formData.trialEndsAt : formData.subscriptionEnd}
                    readOnly={isTrialPlan || formData.durationMonths !== ""}
                    onChange={(e) => setFormData({ ...formData, subscriptionEnd: e.target.value })}
                    className={`w-full px-3.5 py-2 rounded-xl text-xs bg-muted border border-border text-foreground ${isTrialPlan || formData.durationMonths !== "" ? "cursor-default" : ""}`}
                  />
                  <p className="mt-1.5 text-2xs leading-relaxed text-muted-foreground">
                    {isTrialPlan
                      ? "Free Trial: 14 days from the start date."
                      : formData.durationMonths !== "" && formData.subscriptionEnd
                      ? `Ends on ${formatLongDate(formData.subscriptionEnd)} (${durationLabel(Number(formData.durationMonths))} from the start date).`
                      : "Custom expiry date: set the date agreed with the showroom."}
                  </p>
                </div>
              </div>
            </div>

            {/* 6. Payment & Billing Records */}
            <div className="space-y-4 pt-4 border-t border-border">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <Receipt className="w-4 h-4 text-foreground" />
                <span>Commercial Terms & Payment Settlement</span>
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="ds-label">Plan Fee (LKR)</label>
                  <input
                    type="number"
                    min={0}
                    value={formData.planPrice}
                    onChange={(e) => setFormData({ ...formData, planPrice: Number(e.target.value) })}
                    className="w-full px-3.5 py-2 rounded-xl text-xs bg-muted border border-border text-foreground font-mono"
                  />
                </div>
                <div>
                  <label className="ds-label">Amount Paid (LKR)</label>
                  <input
                    type="number"
                    min={0}
                    value={formData.amountPaid}
                    onChange={(e) => setFormData({ ...formData, amountPaid: Number(e.target.value) })}
                    className="w-full px-3.5 py-2 rounded-xl text-xs bg-muted border border-border text-foreground font-mono"
                  />
                </div>
                <div>
                  <label className="ds-label">Payment Status</label>
                  <select
                    value={formData.paymentStatus}
                    onChange={(e) => setFormData({ ...formData, paymentStatus: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl text-xs bg-muted border border-border text-foreground font-bold"
                  >
                    <option value="Paid">Paid</option>
                    <option value="Pending">Pending</option>
                    <option value="Waived">Waived</option>
                    <option value="Overdue">Overdue</option>
                  </select>
                </div>
                <div>
                  <label className="ds-label">Payment Method</label>
                  <select
                    value={formData.paymentMethod}
                    onChange={(e) => setFormData({ ...formData, paymentMethod: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl text-xs bg-muted border border-border text-foreground"
                  >
                    <option value="Bank Transfer">Bank Transfer</option>
                    <option value="Credit Card">Credit Card</option>
                    <option value="Cash">Cash</option>
                    <option value="Cheque">Cheque</option>
                    <option value="Online">Online</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="ds-label">Payment Reference</label>
                  <input
                    type="text"
                    placeholder="e.g. SLT-TXN-98421 or Cheque #..."
                    value={formData.paymentReference}
                    onChange={(e) => setFormData({ ...formData, paymentReference: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl text-xs bg-muted border border-border text-foreground font-mono"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="ds-label">Internal Notes</label>
                  <input
                    type="text"
                    placeholder="e.g. Special promotional discount agreed..."
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl text-xs bg-muted border border-border text-foreground"
                  />
                </div>
              </div>
            </div>

            {/* Hidden submit button to allow form submit on enter */}
            <button type="submit" className="hidden" />
          </form>
        )}

        {/* ── FOOTER ACTIONS BAR ── */}
        <div className="px-6 py-4 border-t border-border flex items-center justify-between bg-muted">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.preventDefault();
                const isFs = !!document.fullscreenElement || (typeof window !== "undefined" && sessionStorage.getItem("tileviz_fullscreen") === "true");
                const target = isFs ? `/visualizer?shopId=${shop.id}&fullscreen=true` : `/visualizer?shopId=${shop.id}`;
                if (isFs) sessionStorage.setItem("tileviz_fullscreen", "true");
                router.push(target);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Launch 3D Visualizer</span>
            </Button>
          </div>

          <div className="flex items-center gap-3">
            {mode === "view" ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl text-xs font-bold"
                >
                  Close
                </Button>
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  onClick={() => setMode("edit")}
                  className="inline-flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Edit Shop Details</span>
                </Button>
              </>
            ) : (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setMode("view")}
                  disabled={isSaving}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-accent"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  onClick={handleFormSubmit}
                  disabled={isSaving}
                  className="inline-flex items-center gap-2 px-6 py-2 rounded-xl text-xs font-bold"
                >
                  {isSaving ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      <span>Saving Changes...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-3.5 h-3.5" />
                      <span>Update Shop Details</span>
                    </>
                  )}
                </Button>
              </>
            )}
          </div>
        </div>

      </DialogContent>
    </Dialog>
  );
}
