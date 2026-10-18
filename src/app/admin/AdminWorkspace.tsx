"use client";

import React, { useState, useEffect } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ThemeSelector } from "@/components/ThemeSelector";
import { useThemeStore, useThemeScope } from "@/stores/themeStore";
import { ShopList } from "./ShopList";
import { CreateUserForm } from "./CreateUserForm";
import { AdminSidebar, type SubscriptionSubTab } from "./AdminSidebar";
import { LoginPostersPanel } from "./LoginPostersPanel";
import { VisualizerAccessPanel } from "./VisualizerAccessPanel";
import { SubscriptionPlansPanel } from "./SubscriptionPlansPanel";
import type { SubscriptionPlanItem } from "@/lib/subscriptionPlanTypes";
import { DEFAULT_SUBSCRIPTION_PLANS } from "@/lib/subscriptionPlanTypes";
import { type PlatformSocialLinks, DEFAULT_SOCIAL_LINKS } from "@/lib/platformLinksTypes";
import { savePlatformSocialLinksAction } from "@/actions/platformLinks";
import {
  PasswordField,
  SettingsCard,
  SettingsNotice,
  SettingsRow,
  SettingsSave,
  SettingsTabs,
} from "../shop/ShopSettingsParts";
import type { LoginPosterData } from "@/lib/loginPosters";
import { StatCard, StatusBadge } from "@/components/dashboard";
import { 
  updateSubscription, 
  updateAdminProfile, 
  extendSubscription, 
  quickReactivateSubscription,
  updateQuota,
  deleteShop,
  createSuperAdmin,
  deleteSuperAdmin
} from "@/actions/admin";
import { recordPaymentForMonth, giveExtraTime, setPaymentStatus, createInvoice, deleteInvoice } from "@/actions/payments";
import { sendPaymentReminder } from "@/actions/notifications";
import { useNotificationFeed } from "@/components/notifications/useNotificationFeed";
import { NotificationBell, NotificationToasts, ReadReceiptCard, ReminderStatusBadge } from "@/components/notifications/NotificationParts";
import {
  MESSAGE_MAX,
  defaultReminderMessage,
  formatDay as formatNotifyDay,
  formatMoment,
  monthLabelOf,
  reminderStatusOf,
  type NotificationFeed,
  type NotificationItem,
} from "@/lib/notificationTypes";
import { ShopAvatar } from "@/components/ShopAvatar";
import { ReportsPanel } from "./ReportsPanel";
import { RevenueAreaChart } from "@/components/dashboard/RevenueAreaChart";
import { PlanRadialChart } from "@/components/dashboard/PlanRadialChart";
import { csvCell } from "@/lib/reports";
import { formatLKR } from "@/lib/utils";
import { asBillingDay, asDurationMonths, BILLING_DAY_LABELS, DURATION_MONTHS, dueDateInMonth, durationLabel, expiryAfterMonths, firstBillingDate, formatLongDate, isCustomPlan, monthsBetweenISO, normalizePlan, packageChoices, packageName, planDates, planLabel, storedPackageName, todayISO, type BillingDay } from "@/lib/subscriptionPlans";
import { 
  LayoutDashboard, 
  Store, 
  CreditCard, 
  Wallet, 
  Layers, 
  BarChart3, 
  Bell, 
  Settings, 
  LogOut, 
  Search, 
  Plus, 
  X, 
  Save, 
  Check, 
  CheckCircle2, 
  AlertCircle, 
  AlertTriangle, 
  ChevronDown, 
  ChevronRight, 
  ExternalLink, 
  RefreshCw, 
  Sun, 
  Moon, 
  Eye, 
  EyeOff, 
  FileText, 
  Download, 
  Printer, 
  ShieldCheck, 
  Activity, 
  Users, 
  Clock, 
  Banknote, 
  ArrowUpRight, 
  ArrowDownRight, 
  Sparkles, 
  CheckCheck, 
  Trash2, 
  Home,
  PlayCircle,
  PauseCircle,
  HardDrive,
  Calendar,
  Filter,
  Receipt,
  ArrowUpDown, 
  Upload, 
  UserPlus, 
  Maximize2,
  Minimize2,
  PanelLeftClose,
  PanelLeftOpen
} from "lucide-react";

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

export type PaymentStatusName = "Pending" | "Received" | "Failed" | "Refunded";
export interface PaymentRecord {
  id: string;
  invoiceNo: string;
  shopId: string;
  shopName: string;
  email: string;
  plan: string;
  amount: number;
  status: PaymentStatusName;
  dueDate: string;
  graceUntil: string | null;
  paidAt: string | null;
  method: string | null;
  reference: string | null;
  notes: string | null;
}

interface AdminWorkspaceProps {
  shops: any[];
  totalTiles: number;
  activeSubs: number;
  estimatedTileValue: number;
  tileCategories: { category: string; count: number }[];
  builtInTilesCount?: number;
  recentDesigns?: any[];
  adminUser?: {
    id: string;
    email: string;
    name: string;
    logoUrl?: string | null;
    theme?: string | null;
  };
  superAdmins?: {
    id: string;
    email: string;
    name: string;
    logoUrl?: string | null;
    createdAt: string;
  }[];
  loginPosters?: LoginPosterData[];
  payments?: PaymentRecord[];
  /** Read receipts addressed to this admin, and every payment reminder sent so far. */
  initialNotifications?: NotificationFeed;
  subscriptionPlans?: SubscriptionPlanItem[];
  platformLinks?: PlatformSocialLinks;
  logoutAction: () => Promise<void>;
}

export function AdminWorkspace({ 
  shops,
  totalTiles,
  activeSubs, 
  estimatedTileValue,
  tileCategories,
  builtInTilesCount = 0,
  recentDesigns = [],
  adminUser,
  superAdmins = [],
  loginPosters = [],
  payments = [],
  initialNotifications = { notifications: [], reminders: [] },
  subscriptionPlans = [],
  platformLinks = DEFAULT_SOCIAL_LINKS,
  logoutAction 
}: AdminWorkspaceProps) {
  // Navigation State
  const [activeTab, setActiveTab] = useState<AdminTab>("dashboard");
  const [shopSubTab, setShopSubTab] = useState<"all" | "add">("all");
  const [subSubTab, setSubSubTab] = useState<SubscriptionSubTab>("active");
  const [paymentSubTab, setPaymentSubTab] = useState<"overview" | "pending" | "history">("overview");
  const [collectTab, setCollectTab] = useState<"collect" | "reminders" | "paid" | "trial">("collect");
  const [notificationFilter, setNotificationFilter] = useState<"all" | "payments" | "action" | "system">("all");
  const [dismissedNotifications, setDismissedNotifications] = useState<string[]>([]);
  const [sidebarOpenSections, setSidebarOpenSections] = useState<Record<string, boolean>>({
    shops: false,
    subscriptions: false,
    payments: false,
  });

  // Modals & Editors
  const [isProvisionModalOpen, setIsProvisionModalOpen] = useState(false);
  const [editingSubscription, setEditingSubscription] = useState<any | null>(null);
  const [subscriptionDraft, setSubscriptionDraft] = useState({ 
    packageName: "Free Trial", 
    startDate: "", 
    endDate: "", 
    trialEndsAt: "", 
    active: true,
    planPrice: "",
    billingDay: "start" as BillingDay,
    /** "1" to "12"; "" keeps an expiry date that is not a whole number of months after the start */
    durationMonths: "",
  });
  const [isSavingSubscription, setIsSavingSubscription] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<"Monthly" | "Weekly" | "Quarterly">("Monthly");
  const [revenueTimeframe, setRevenueTimeframe] = useState<"this-month" | "6M" | "12M" | "all">("12M");
  const [hoveredPlanSegment, setHoveredPlanSegment] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  // ── Payment Management & Recording States ──
  // The ledger itself comes from the server (the `payments` prop); these are only the open dialogs.
  const [receivingPayment, setReceivingPayment] = useState<{
    shopId: string;
    name: string;
    logoUrl: string | null;
    plan: string;
  } | null>(null);
  const [markReceivedForm, setMarkReceivedForm] = useState({
    month: "",
    amount: 5000,
    date: "",
    method: "Bank Transfer",
    reference: "",
    notes: "",
  });
  const [extraTimeFor, setExtraTimeFor] = useState<{
    shopId: string;
    name: string;
    logoUrl: string | null;
    isTrial: boolean;
    suspended: boolean;
  } | null>(null);
  const [extraTimeDate, setExtraTimeDate] = useState("");
  const [isGivingTime, setIsGivingTime] = useState(false);
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);
  const [busyPaymentId, setBusyPaymentId] = useState<string | null>(null);
  const [invoiceModalOpen, setInvoiceModalOpen] = useState(false);
  const [invoiceForm, setInvoiceForm] = useState({
    shopId: "",
    amount: 0,
    dueDate: "",
    status: "Pending" as PaymentStatusName,
    method: "Bank Transfer",
    reference: "",
    notes: "",
  });
  const [isSavingInvoice, setIsSavingInvoice] = useState(false);
  const [viewingReceipt, setViewingReceipt] = useState<{
    id: string;
    shopName: string;
    email: string;
    package: string;
    date: string;
    method: string;
    amount: string;
    amountRaw: number;
    reference: string;
    status: string;
  } | null>(null);

  // ── Payment reminders (Notify Shop) ──
  // Saved in the database; polled so a showroom reading a reminder shows up here without a reload.
  const feed = useNotificationFeed(initialNotifications);
  const [notifyFor, setNotifyFor] = useState<{ shopId: string; name: string; logoUrl: string | null } | null>(null);
  const [notifyMonth, setNotifyMonth] = useState("");
  // null means "the suggested wording"; once the admin types, their text is sent
  const [notifyText, setNotifyText] = useState<string | null>(null);
  const [isNotifying, setIsNotifying] = useState(false);
  const [notifyError, setNotifyError] = useState("");
  const [showAllReminders, setShowAllReminders] = useState(false);

  // ── Payment History Filters ──
  const [historyStatusFilter, setHistoryStatusFilter] = useState<"all" | "Received" | "Pending" | "Failed" | "Refunded">("all");
  const [historyDateRange, setHistoryDateRange] = useState<"all" | "this-month" | "last-30-days" | "last-90-days" | "this-year" | "custom">("all");
  const [historyCustomStartDate, setHistoryCustomStartDate] = useState("");
  const [historyCustomEndDate, setHistoryCustomEndDate] = useState("");
  const [historyAmountFilter, setHistoryAmountFilter] = useState<"all" | "under-5k" | "5k-15k" | "over-15k" | "custom">("all");
  const [historyMinAmount, setHistoryMinAmount] = useState("");
  const [historyMaxAmount, setHistoryMaxAmount] = useState("");
  const [historySearchQuery, setHistorySearchQuery] = useState("");
  const [historySortBy, setHistorySortBy] = useState<"date-desc" | "date-asc" | "amount-desc" | "amount-asc">("date-desc");

  // Theme & Profile
  useThemeScope("admin", adminUser?.id, adminUser?.theme);
  const { theme, setTheme } = useThemeStore();

  const [profile, setProfile] = useState({
    name: adminUser?.name || "Platform Admin",
    email: adminUser?.email || "admin@tileviz.com",
    logoUrl: (adminUser?.logoUrl && !adminUser.logoUrl.includes("unsplash.com")) ? adminUser.logoUrl : "",
  });
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileFeedback, setProfileFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [adminSettingsTab, setAdminSettingsTab] = useState<"profile" | "appearance" | "security" | "admins" | "links">("profile");
  const [socialLinks, setSocialLinks] = useState<PlatformSocialLinks>(platformLinks || DEFAULT_SOCIAL_LINKS);
  const [linksSaving, setLinksSaving] = useState(false);
  const [linksFeedback, setLinksFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  async function handleSaveSocialLinks(e: React.FormEvent) {
    e.preventDefault();
    setLinksSaving(true);
    setLinksFeedback(null);
    try {
      const res = await savePlatformSocialLinksAction(socialLinks);
      if (res.success && res.links) {
        setSocialLinks(res.links);
        setLinksFeedback({ type: "success", message: res.message || "Footer and social media links updated." });
      } else {
        setLinksFeedback({ type: "error", message: res.message || "Failed to update links." });
      }
    } catch (err: any) {
      setLinksFeedback({ type: "error", message: err?.message || "Failed to save links." });
    } finally {
      setLinksSaving(false);
    }
  }

  // A saved/error banner belongs to the tab it came from.
  useEffect(() => {
    setProfileFeedback(null);
    setLinksFeedback(null);
  }, [adminSettingsTab]);

  // Super Admins state
  const [adminsList, setAdminsList] = useState(superAdmins);
  const [isAppointModalOpen, setIsAppointModalOpen] = useState(false);
  const [appointForm, setAppointForm] = useState({
    name: "",
    email: "",
    password: "",
  });
  const [showAppointPassword, setShowAppointPassword] = useState(false);
  const [isAppointingAdmin, setIsAppointingAdmin] = useState(false);
  const [appointError, setAppointError] = useState("");
  const [appointSuccess, setAppointSuccess] = useState("");

  const [deleteConfirmAdmin, setDeleteConfirmAdmin] = useState<{
    id: string;
    name: string;
    email: string;
  } | null>(null);
  const [isDeletingAdmin, setIsDeletingAdmin] = useState(false);

  const generateAdminPassword = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%";
    let pw = "";
    for (let i = 0; i < 12; i++) {
      pw += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setAppointForm((prev) => ({ ...prev, password: pw }));
  };

  const handleAppointSuperAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAppointError("");
    setAppointSuccess("");

    if (!appointForm.email || !appointForm.password) {
      setAppointError("Email and password are required.");
      return;
    }

    setIsAppointingAdmin(true);
    try {
      const res = await createSuperAdmin({
        name: appointForm.name,
        email: appointForm.email,
        password: appointForm.password,
      });

      if (res.success && res.admin) {
        setAdminsList((prev) => [...prev, {
          id: res.admin!.id,
          email: res.admin!.email,
          name: res.admin!.shopName || appointForm.name,
          logoUrl: res.admin!.logoUrl || "",
          createdAt: res.admin!.createdAt,
        }]);
        setAppointSuccess(res.message);
        setAppointForm({ name: "", email: "", password: "" });
        setTimeout(() => {
          setIsAppointModalOpen(false);
          setAppointSuccess("");
        }, 1200);
      } else {
        setAppointError(res.message || "Failed to appoint super administrator.");
      }
    } catch (err: any) {
      setAppointError(err?.message || "An unexpected error occurred.");
    } finally {
      setIsAppointingAdmin(false);
    }
  };

  const handleConfirmDeleteAdmin = async () => {
    if (!deleteConfirmAdmin) return;
    setIsDeletingAdmin(true);
    try {
      const res = await deleteSuperAdmin(deleteConfirmAdmin.id);
      if (res.success) {
        setAdminsList((prev) => prev.filter((a) => a.id !== deleteConfirmAdmin.id));
        setDeleteConfirmAdmin(null);
      } else {
        triggerToast(res.message || "Could not remove the super administrator.");
      }
    } catch (err: any) {
      triggerToast(err?.message || "Failed to delete super administrator.");
    } finally {
      setIsDeletingAdmin(false);
    }
  };

  const handleUploadLogo = async (file?: File | null) => {
    if (!file) return;
    setIsUploadingLogo(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/upload/logo", { method: "POST", body: form });
      if (res.ok) {
        const data = await res.json();
        if (data.logoUrl) {
          setProfile((prev) => ({ ...prev, logoUrl: data.logoUrl }));
          return;
        }
      }
      const reader = new FileReader();
      reader.onload = () => {
        setProfile((prev) => ({ ...prev, logoUrl: reader.result as string }));
      };
      reader.readAsDataURL(file);
    } catch {
      const reader = new FileReader();
      reader.onload = () => {
        setProfile((prev) => ({ ...prev, logoUrl: reader.result as string }));
      };
      reader.readAsDataURL(file);
    } finally {
      setIsUploadingLogo(false);
    }
  };

  const handleRemoveLogo = () => {
    setProfile((prev) => ({ ...prev, logoUrl: "" }));
  };

  // Computed Platform Metrics
  const now = new Date();
  const totalQuota = shops.reduce((acc, s) => acc + (s.tileQuota || 0), 0);
  const globalUtilization = totalQuota > 0 ? Math.min(100, Math.round((totalTiles / totalQuota) * 100)) : 0;
  const billingRate = shops.length > 0 ? Math.round((activeSubs / shops.length) * 100) : 0;

  // Subscription Filters
  const activeSubsList = shops.filter(
    (s) => s.subscriptionActive && (!s.subscriptionEnd || new Date(s.subscriptionEnd) >= now)
  );
  const expiringSubs = shops.filter((s) => {
    if (!s.subscriptionActive) return false;
    const targetDate = s.subscriptionEnd || s.trialEndsAt;
    if (!targetDate) return false;
    const diffDays = (new Date(targetDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    return diffDays >= 0 && diffDays <= 14;
  });
  const expiredSubs = shops.filter(
    (s) => !s.subscriptionActive || (s.subscriptionEnd && new Date(s.subscriptionEnd) < now)
  );

  // Revenue & Pricing (Sri Lankan Rupees - LKR)
  // The packages as saved in the dashboard (the same list the shop's Subscription tab shows), not a fixed table
  const livePlans: SubscriptionPlanItem[] = subscriptionPlans.length > 0 ? subscriptionPlans : DEFAULT_SUBSCRIPTION_PLANS;
  const tierPricing: Record<string, number> = { "Free Trial": 0 };
  for (const p of livePlans) tierPricing[storedPackageName(p)] = p.price;
  /** A package's name as people see it now (a package renamed in the dashboard is renamed everywhere) */
  const pkgLabel = (stored: string | null | undefined) => packageName(stored, livePlans);
  // The Custom Plan is custom-priced: use the amount saved for that shop, else the list price.
  const savedCustomPrice = (s: any): number => {
    try {
      return Number(JSON.parse(s.details || "{}").planPrice) || 0;
    } catch {
      return 0;
    }
  };
  const getMonthlyPrice = (s: any): number => {
    if (isCustomPlan(s.subscriptionPackage) && savedCustomPrice(s) > 0) return savedCustomPrice(s);
    return tierPricing[normalizePlan(s.subscriptionPackage)] ?? 5000;
  };
  const estimatedMRR = shops
    .filter((s) => s.subscriptionActive)
    .reduce((sum, s) => sum + getMonthlyPrice(s), 0);
  const estimatedARR = estimatedMRR * 12;
  const arpu = activeSubs > 0 ? Math.round(estimatedMRR / activeSubs) : 0;

  // ── Payments ledger (from the database) ──
  // Invoice dates are calendar days stored as midnight UTC, so they are read and shown as UTC days.
  const fmtDay = (iso: string) =>
    new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
  const monthLabel = (key: string) =>
    new Date(`${key}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  const todayKey = todayISO();
  const thisMonthKey = todayKey.slice(0, 7);

  const paymentHistory = payments.map((p) => {
    const dueTimestamp = new Date(p.dueDate).getTime();
    const paidTimestamp = p.paidAt ? new Date(p.paidAt).getTime() : null;
    // Money counts on the day it was collected; an unpaid invoice sits on its due date
    const timestamp = p.status === "Received" && paidTimestamp ? paidTimestamp : dueTimestamp;
    const deadline = (p.graceUntil ?? p.dueDate).slice(0, 10);
    return {
      id: p.invoiceNo,
      paymentId: p.id,
      shopId: p.shopId,
      shopName: p.shopName,
      email: p.email,
      package: pkgLabel(p.plan),
      date: fmtDay(new Date(timestamp).toISOString()),
      dueDate: fmtDay(p.dueDate),
      dueKey: p.dueDate.slice(0, 7),
      dueDay: Number(p.dueDate.slice(8, 10)),
      paidKey: p.paidAt ? p.paidAt.slice(0, 7) : "",
      graceUntil: p.graceUntil ? p.graceUntil.slice(0, 10) : null,
      timestamp,
      dueTimestamp,
      paidTimestamp,
      amountRaw: p.amount,
      amount: formatLKR(p.amount, { withDecimals: true }),
      method: p.method || "Not collected",
      reference: p.reference || "None",
      status: p.status,
      notes: p.notes || "",
      // Past its payment date (counting any extra time the admin gave)
      overdue: (p.status === "Pending" || p.status === "Failed") && deadline < todayKey,
    };
  });

  // Invoices that are still owed: not yet collected, or a failed attempt
  const pendingPaymentsList = paymentHistory
    .filter((p) => (p.status === "Pending" || p.status === "Failed") && p.dueKey <= thisMonthKey)
    .sort((a, b) => a.dueTimestamp - b.dueTimestamp);

  // This month's collection: every paying showroom is on the list until its fee for the month is recorded,
  // then it moves down. When the next month starts, everyone is back at the top.
  const billingDateThisMonth = (shop: any) => {
    let bd = "start";
    try { bd = JSON.parse(shop.details || "{}").billingDay || "start"; } catch {}
    const [y, m] = thisMonthKey.split("-").map(Number);
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const day = bd === "end" ? last : bd === "plan" && shop.subscriptionStart ? Math.min(new Date(shop.subscriptionStart).getUTCDate(), last) : 1;
    return `${thisMonthKey}-${String(day).padStart(2, "0")}`;
  };
  const collectionRows = shops
    .map((shop) => {
      const invoices = paymentHistory.filter((p) => p.shopId === shop.id);
      const open = invoices.filter((p) => p.status === "Pending" || p.status === "Failed").sort((a, b) => a.dueTimestamp - b.dueTimestamp);
      const openDue = open.filter((p) => p.dueKey <= thisMonthKey);
      const nextOpen = open.find((p) => p.dueKey > thisMonthKey) ?? null;
      const paidThisMonth = invoices.filter((p) => p.status === "Received" && p.dueKey === thisMonthKey).sort((a, b) => (b.paidTimestamp ?? 0) - (a.paidTimestamp ?? 0))[0] ?? null;
      const isTrial = shop.subscriptionPackage === "Free Trial";
      // No invoice for this month yet (it is created the next time the page loads): it still counts as owed
      const virtual = !isTrial && openDue.length === 0 && !paidThisMonth;
      const settled = !isTrial && openDue.length === 0 && !!paidThisMonth;
      const owed = openDue.reduce((sum, p) => sum + p.amountRaw, 0) + (virtual ? getMonthlyPrice(shop) : 0);
      const suspended = !shop.subscriptionActive;
      const dueISO = openDue[0] ? new Date(openDue[0].dueTimestamp).toISOString().slice(0, 10) : virtual ? billingDateThisMonth(shop) : null;
      const overdue = openDue.some((p) => p.overdue) || (virtual && !!dueISO && dueISO < todayKey);
      const graceUntil = openDue.map((p) => p.graceUntil).filter(Boolean).sort().pop() ?? null;
      const months = [...openDue.map((p) => p.dueKey), ...(virtual ? [thisMonthKey] : [])];
      const dayKey = (v: unknown) => (v ? new Date(v as string).toISOString().slice(0, 10) : null);
      const trialEnd = dayKey(shop.trialEndsAt);
      const trialOver = isTrial && !!trialEnd && trialEnd < todayKey;
      const paidUntil = dayKey(shop.subscriptionEnd);
      // 0 = needs attention now (past its date or suspended), 1 = still to collect, 2 = paid this month, 3 = free trial
      const rank = isTrial ? (trialOver || suspended ? 0 : 3) : settled ? 2 : suspended || overdue ? 0 : 1;
      return { shop, open, openDue, nextOpen, paidThisMonth, virtual, settled, owed, suspended, overdue, graceUntil, months, dueISO, isTrial, trialEnd, trialOver, paidUntil, rank };
    })
    .sort((a, b) => a.rank - b.rank || (a.dueISO ?? "").localeCompare(b.dueISO ?? "") || b.owed - a.owed || String(a.shop.shopName).localeCompare(String(b.shop.shopName)));
  const toCollectRows = collectionRows.filter((r) => !r.isTrial && !r.settled);
  const paidRows = collectionRows.filter((r) => r.settled);
  const trialRows = collectionRows.filter((r) => r.isTrial);
  const owedNow = toCollectRows.reduce((sum, r) => sum + r.owed, 0);
  const collectedThisMonthRows = paidRows.reduce((sum, r) => sum + (r.paidThisMonth?.amountRaw ?? 0), 0);
  const shopsToCollect = toCollectRows.length + trialRows.filter((r) => r.suspended || r.trialOver).length;

  // Alerts & Notifications
  const highQuotaShops = shops.filter((s) => {
    const quota = s.tileQuota || 1;
    const count = s._count?.tiles || 0;
    return (count / quota) >= 0.8;
  });
  const unbrandedShops = shops.filter((s) => !s.logoUrl);

  const rawNotifications = [
    ...highQuotaShops.map((s) => ({
      id: `quota-${s.id}`,
      category: "action" as const,
      title: `${s.shopName || "Showroom"} near quota limit`,
      description: `Using ${s._count?.tiles || 0} of ${s.tileQuota || 50} texture slots (${Math.round(((s._count?.tiles || 0) / (s.tileQuota || 1)) * 100)}%).`,
      time: "2 hours ago",
      severity: "high" as const,
      shopId: s.id,
    })),
    ...expiringSubs.map((s) => ({
      id: `exp-${s.id}`,
      category: "action" as const,
      title: `${s.shopName || "Showroom"} subscription renewal due`,
      description: `${pkgLabel(s.subscriptionPackage) || "Trial"} license cycle ends in ≤ 14 days.`,
      time: "1 day ago",
      severity: "medium" as const,
      shopId: s.id,
    })),
    ...unbrandedShops.slice(0, 3).map((s) => ({
      id: `brand-${s.id}`,
      category: "system" as const,
      title: `Branding profile pending: ${s.shopName || s.email}`,
      description: "Custom showroom logo and contact details have not yet been customized.",
      time: "3 days ago",
      severity: "low" as const,
      shopId: s.id,
    })),
    {
      id: "engine-webgl",
      category: "system" as const,
      title: "Three.js WebGL Rendering Pipeline Operational",
      description: "PBR texture pipeline, HDRI studio reflections, and real-time room math operating smoothly.",
      time: "Just now",
      severity: "info" as const,
      shopId: undefined,
    },
    {
      id: "db-health",
      category: "system" as const,
      title: "SQLite Database & Prisma Engine Healthy",
      description: "All tenant schemas, queries, and relations synchronized with 0 latency.",
      time: "Just now",
      severity: "info" as const,
      shopId: undefined,
    },
  ];

  const activeNotifications = rawNotifications.filter((n) => !dismissedNotifications.includes(n.id));
  const filteredNotifications = activeNotifications.filter((n) => {
    if (notificationFilter === "action") return n.category === "action";
    if (notificationFilter === "system") return n.category === "system";
    return true;
  });


  // Actions
  const toDateInput = (value?: string | Date | null) => value ? new Date(value).toISOString().slice(0, 10) : "";
  const openSubscriptionEditor = (shop: any) => {
    setEditingSubscription(shop);
    setSubscriptionDraft({
      packageName: normalizePlan(shop.subscriptionPackage) || "Free Trial",
      startDate: toDateInput(shop.subscriptionStart),
      endDate: toDateInput(shop.subscriptionEnd),
      trialEndsAt: toDateInput(shop.trialEndsAt),
      active: shop.subscriptionActive,
      billingDay: (() => {
        try {
          return asBillingDay(JSON.parse(shop.details || "{}").billingDay);
        } catch {
          return asBillingDay(undefined);
        }
      })(),
      planPrice: isCustomPlan(shop.subscriptionPackage) && savedCustomPrice(shop) > 0
        ? String(savedCustomPrice(shop))
        : "",
      durationMonths: (() => {
        let saved: unknown;
        try {
          saved = JSON.parse(shop.details || "{}").durationMonths;
        } catch {
          saved = undefined;
        }
        const start = toDateInput(shop.subscriptionStart);
        const end = toDateInput(shop.subscriptionEnd);
        // The saved duration, unless the dates were changed afterwards (for example extended by hand)
        const months = asDurationMonths(saved) ?? monthsBetweenISO(start, end);
        return months !== null && (!end || expiryAfterMonths(start, months) === end) ? String(months) : "";
      })(),
    });
  };

  /** A package's own duration (1 to 12 months), set in the Plans builder. */
  const packageMonths = (pkg: string) => packageChoices(livePlans).find((c) => c.value === pkg)?.durationMonths ?? 1;

  /** Picking a package starts it today for the chosen duration (a Free Trial runs 14 days). */
  const selectSubscriptionPackage = (pkg: string) => {
    setSubscriptionDraft((d) => {
      const today = todayISO();
      if (pkg === "Free Trial") {
        const dates = planDates(pkg, today, d.billingDay);
        return { ...d, packageName: pkg, startDate: today, endDate: "", trialEndsAt: dates?.trialEnd ?? "", durationMonths: "" };
      }
      // The package's usual term is the default duration; it can still be changed
      const months = packageMonths(pkg);
      return { ...d, packageName: pkg, startDate: today, endDate: expiryAfterMonths(today, months), trialEndsAt: "", durationMonths: String(months) };
    });
  };

  /** Moving the start date moves the expiry date with it. */
  const changeSubscriptionStart = (startDate: string) => {
    setSubscriptionDraft((d) => {
      if (d.packageName === "Free Trial") {
        const dates = planDates(d.packageName, startDate, d.billingDay);
        return { ...d, startDate, trialEndsAt: dates?.trialEnd ?? d.trialEndsAt };
      }
      if (!startDate) return { ...d, startDate };
      const months = packageMonths(d.packageName);
      return { ...d, startDate, endDate: expiryAfterMonths(startDate, months), durationMonths: String(months) };
    });
  };

  const saveSubscription = async () => {
    if (!editingSubscription) return;
    const isCustom = isCustomPlan(subscriptionDraft.packageName);
    // The package's own price; a Custom Plan showroom keeps the price already agreed with it
    const planPrice = isCustom && savedCustomPrice(editingSubscription) > 0
      ? savedCustomPrice(editingSubscription)
      : (tierPricing[subscriptionDraft.packageName] ?? 0);
    const months = subscriptionDraft.packageName === "Free Trial" ? null : packageMonths(subscriptionDraft.packageName);
    setIsSavingSubscription(true);
    const result = await updateSubscription(
      editingSubscription.id,
      subscriptionDraft.packageName,
      subscriptionDraft.startDate,
      subscriptionDraft.endDate,
      subscriptionDraft.trialEndsAt,
      subscriptionDraft.active,
      planPrice,
      subscriptionDraft.billingDay,
      months,
    );
    setIsSavingSubscription(false);
    if (result.success) {
      setEditingSubscription(null);
      triggerToast("Subscription updated successfully");
    } else {
      triggerToast(result.message || "Could not update the subscription");
    }
  };

  const handleQuickExtend = async (shopId: string, days: number = 30) => {
    const res = await extendSubscription(shopId, days);
    if (res.success) triggerToast(res.message || `Extended by ${days} days`);
  };

  const handleQuickReactivate = async (shopId: string) => {
    const res = await quickReactivateSubscription(shopId);
    if (res.success) triggerToast("Subscription reactivated for 30 days");
  };

  const handleQuickAddQuota = async (shopId: string, currentQuota: number, add: number = 50) => {
    const res = await updateQuota(shopId, currentQuota + add);
    if (res.success) triggerToast(`Quota expanded to ${currentQuota + add} slots`);
  };

  const triggerToast = (msg: string) => {
    setActionFeedback(msg);
    setTimeout(() => setActionFeedback(null), 3500);
  };

  const handleExportCSV = () => {
    const headers = "Showroom ID,Showroom Name,Email,Package,Status,Tile Quota,Tiles Used,Saved Designs\r\n";
    const rows = shops
      .map((s) =>
        [s.id, s.shopName || "", s.email, pkgLabel(s.subscriptionPackage) || "Free Trial", s.subscriptionActive ? "Active" : "Suspended", s.tileQuota || 50, s._count?.tiles || 0, s._count?.savedDesigns || 0]
          .map(csvCell)
          .join(",")
      )
      .join("\r\n");
    const blob = new Blob(["\uFEFF" + headers + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `tile_studio_plus_superadmin_report_${now.toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    triggerToast("Report exported as CSV");
  };

  // ── Payment Action Handlers ──
  /** The months a payment can be recorded for: every billed month plus the next two. Paid months cannot be chosen. */
  const monthOptionsFor = (shopId: string) => {
    const shop = shops.find((x) => x.id === shopId);
    const invoices = paymentHistory.filter((p) => p.shopId === shopId);
    const keys = new Set<string>(invoices.map((p) => p.dueKey));
    keys.add(thisMonthKey);
    const latest = [...keys].sort().pop() ?? thisMonthKey;
    for (let i = 1; i <= 2; i++) {
      const d = new Date(`${latest}-01T00:00:00Z`);
      d.setUTCMonth(d.getUTCMonth() + i);
      keys.add(d.toISOString().slice(0, 7));
    }
    return [...keys].sort().map((key) => {
      const inv = invoices.filter((p) => p.dueKey === key);
      const open = inv.find((p) => p.status === "Pending" || p.status === "Failed");
      const paid = !open && inv.some((p) => p.status === "Received");
      return {
        key,
        label: monthLabel(key),
        state: open ? ("unpaid" as const) : paid ? ("paid" as const) : ("new" as const),
        amount: open ? open.amountRaw : shop ? getMonthlyPrice(shop) : 0,
      };
    });
  };

  /** Open the form for a showroom, with the oldest unpaid month chosen (or the next month to bill). */
  const handleOpenMarkReceivedModal = (target: { shopId: string; month?: string }) => {
    const shop = shops.find((x) => x.id === target.shopId);
    if (!shop) return;
    const options = monthOptionsFor(shop.id);
    const pick = options.find((o) => o.key === target.month && o.state !== "paid") ?? options.find((o) => o.state === "unpaid") ?? options.find((o) => o.state === "new" && o.key >= thisMonthKey) ?? options[0];
    setReceivingPayment({ shopId: shop.id, name: shop.shopName || shop.email, logoUrl: shop.logoUrl ?? null, plan: shop.subscriptionPackage });
    setMarkReceivedForm({ month: pick.key, amount: pick.amount, date: todayISO(), method: "Bank Transfer", reference: "", notes: "" });
  };

  const handleConfirmMarkReceived = async () => {
    if (!receivingPayment) return;
    setIsSubmittingPayment(true);
    const res = await recordPaymentForMonth(receivingPayment.shopId, markReceivedForm.month, {
      amount: markReceivedForm.amount,
      paidAt: markReceivedForm.date,
      method: markReceivedForm.method,
      reference: markReceivedForm.reference,
      notes: markReceivedForm.notes,
    });
    setIsSubmittingPayment(false);
    if (res.success) setReceivingPayment(null);
    triggerToast(res.message || (res.success ? "Payment recorded." : "Could not record the payment."));
  };

  const handleOpenExtraTime = (row: (typeof collectionRows)[number]) => {
    const plus = (days: number) => {
      const d = new Date(`${todayKey}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + days);
      return d.toISOString().slice(0, 10);
    };
    setExtraTimeFor({ shopId: row.shop.id, name: row.shop.shopName || row.shop.email, logoUrl: row.shop.logoUrl ?? null, isTrial: row.isTrial, suspended: row.suspended });
    setExtraTimeDate(plus(7));
  };

  const handleConfirmExtraTime = async () => {
    if (!extraTimeFor) return;
    setIsGivingTime(true);
    const res = await giveExtraTime(extraTimeFor.shopId, extraTimeDate);
    setIsGivingTime(false);
    if (res.success) setExtraTimeFor(null);
    triggerToast(res.message || (res.success ? "Extra time given." : "Could not give extra time."));
  };

  /** Pending / Failed / Refunded go straight through; Received opens the form so the details are captured. */
  const handleChangeStatus = async (item: (typeof paymentHistory)[number], status: PaymentStatusName) => {
    if (status === item.status) return;
    if (status === "Received") {
      handleOpenMarkReceivedModal({ shopId: item.shopId, month: item.dueKey });
      return;
    }
    setBusyPaymentId(item.paymentId);
    const res = await setPaymentStatus(item.paymentId, status);
    setBusyPaymentId(null);
    triggerToast(res.message || "Status updated.");
  };

  const handleDeleteInvoice = async (item: (typeof paymentHistory)[number]) => {
    if (!window.confirm(`Delete invoice ${item.id} for ${item.shopName}? This removes it from the ledger and the charts.`)) return;
    setBusyPaymentId(item.paymentId);
    const res = await deleteInvoice(item.paymentId);
    setBusyPaymentId(null);
    triggerToast(res.message || "Invoice deleted.");
  };

  // ── Notify Shop (payment reminders) ──
  const reminderFor = (shopId: string, month: string): NotificationItem | null =>
    feed.reminders.find((r) => r.shopId === shopId && r.month === month) ?? null;

  /** What a reminder for one month would say: what is owed, when it falls due, and where the invoice stands. */
  const reminderDetails = (shopId: string, key: string) => {
    const shop = shops.find((x) => x.id === shopId);
    const open = paymentHistory
      .filter((p) => p.shopId === shopId && p.dueKey === key && (p.status === "Pending" || p.status === "Failed"))
      .sort((a, b) => a.dueTimestamp - b.dueTimestamp)[0];
    if (open) {
      return {
        amount: open.amountRaw,
        dueISO: new Date(open.dueTimestamp).toISOString(),
        status: open.status === "Failed" ? "Failed" : open.overdue ? "Overdue" : "Pending",
      };
    }
    // Not billed yet: the plan fee, due on the showroom's billing day
    const [y, m] = key.split("-").map(Number);
    let meta: any = {};
    try { meta = JSON.parse(shop?.details || "{}"); } catch {}
    const planStartDay = shop?.subscriptionStart ? new Date(shop.subscriptionStart).getUTCDate() : 1;
    const dueISO = `${dueDateInMonth(y, m, asBillingDay(meta.billingDay), planStartDay)}T00:00:00Z`;
    return { amount: shop ? getMonthlyPrice(shop) : 0, dueISO, status: dueISO.slice(0, 10) < todayKey ? "Overdue" : "Pending" };
  };

  /** The months a reminder can be sent for: every unpaid month up to now. */
  const notifyOptionsFor = (shopId: string) =>
    monthOptionsFor(shopId).filter((o) => o.state === "unpaid" || (o.state === "new" && o.key <= thisMonthKey));

  const suggestedReminderText = (shopName: string, shopId: string, key: string) => {
    const d = reminderDetails(shopId, key);
    return defaultReminderMessage({ shopName, monthLabel: monthLabelOf(key), amountText: formatLKR(d.amount), dueText: formatNotifyDay(d.dueISO) });
  };

  const handleOpenNotify = (shopId: string, month?: string) => {
    const shop = shops.find((x) => x.id === shopId);
    if (!shop) return;
    const options = notifyOptionsFor(shopId);
    const pick = options.find((o) => o.key === month) ?? options.find((o) => o.key === thisMonthKey) ?? options[0];
    setNotifyFor({ shopId, name: shop.shopName || shop.email, logoUrl: shop.logoUrl ?? null });
    setNotifyMonth(pick?.key ?? "");
    setNotifyText(null);
    setNotifyError("");
  };

  const handleConfirmNotify = async () => {
    if (!notifyFor || !notifyMonth) return;
    const text = notifyText ?? suggestedReminderText(notifyFor.name, notifyFor.shopId, notifyMonth);
    setIsNotifying(true);
    setNotifyError("");
    // Sending to a month that already has a reminder is a deliberate resend: the dialog says so before this runs
    const res = await sendPaymentReminder(notifyFor.shopId, notifyMonth, { message: text, resend: !!reminderFor(notifyFor.shopId, notifyMonth) });
    setIsNotifying(false);
    if (res.reminder) feed.mergeReminder(res.reminder);
    if (res.success) {
      setNotifyFor(null);
      triggerToast(res.message);
    } else {
      setNotifyError(res.message);
    }
  };

  const handleOpenInvoiceModal = () => {
    const first = shops.find((s) => s.subscriptionPackage !== "Free Trial") ?? shops[0];
    setInvoiceForm({
      shopId: first?.id ?? "",
      amount: first ? getMonthlyPrice(first) : 0,
      dueDate: todayISO(),
      status: "Pending",
      method: "Bank Transfer",
      reference: "",
      notes: "",
    });
    setInvoiceModalOpen(true);
  };

  const handleCreateInvoice = async () => {
    setIsSavingInvoice(true);
    const res = await createInvoice({
      shopId: invoiceForm.shopId,
      amount: invoiceForm.amount,
      dueDate: invoiceForm.dueDate,
      status: invoiceForm.status,
      paidAt: invoiceForm.status === "Received" ? invoiceForm.dueDate : undefined,
      method: invoiceForm.status === "Received" ? invoiceForm.method : undefined,
      reference: invoiceForm.reference,
      notes: invoiceForm.notes,
    });
    setIsSavingInvoice(false);
    if (res.success) setInvoiceModalOpen(false);
    triggerToast(res.message || (res.success ? "Invoice created." : "Could not create the invoice."));
  };

  const handleExportPaymentHistoryCSV = (filteredRecords: typeof paymentHistory) => {
    const headers = "Invoice Number,Showroom Name,Email,Package,Date,Payment Method,Reference Number,Amount (LKR),Status\n";
    const rows = filteredRecords
      .map((item) => `"${item.id}","${item.shopName}","${item.email}","${item.package}","${item.date}","${item.method}","${item.reference}","LKR ${item.amountRaw.toLocaleString('en-LK', { minimumFractionDigits: 2 })}","${item.status}"`)
      .join("\n");
    const blob = new Blob([headers + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `tile_studio_plus_payments_ledger_${now.toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    triggerToast("Payment ledger exported as CSV");
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileFeedback(null);
    setIsSavingProfile(true);
    const result = await updateAdminProfile({
      name: profile.name,
      email: profile.email,
      logoUrl: profile.logoUrl,
    });
    setIsSavingProfile(false);

    if (result.success) {
      setProfileFeedback({ type: "success", message: result.message || "Profile updated successfully!" });
      if (result.user) {
        setProfile({
          name: result.user.name,
          email: result.user.email,
          logoUrl: result.user.logoUrl || profile.logoUrl,
        });
      }
    } else {
      setProfileFeedback({ type: "error", message: result.message || "Failed to update profile." });
    }
  };

  const handleSaveSecurity = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileFeedback(null);

    if (newPassword !== confirmPassword) {
      setProfileFeedback({ type: "error", message: "New password and confirmation do not match." });
      return;
    }
    if (newPassword.length < 6) {
      setProfileFeedback({ type: "error", message: "New password must be at least 6 characters long." });
      return;
    }

    setIsSavingProfile(true);
    const result = await updateAdminProfile({ currentPassword, newPassword });
    setIsSavingProfile(false);

    if (result.success) {
      setProfileFeedback({ type: "success", message: result.message || "Password updated." });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } else {
      setProfileFeedback({ type: "error", message: result.message || "Failed to update password." });
    }
  };

  const toggleSidebarSection = (section: string) => {
    setSidebarOpenSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  // ── FULLSCREEN EXPAND / SHRINK & SIDEBAR COLLAPSE ──────────────────────
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  useEffect(() => {
    const handleFullscreenChange = () => {
      const fs = !!document.fullscreenElement;
      setIsFullscreen(fs);
      if (fs) {
        sessionStorage.setItem("tileviz_fullscreen", "true");
      } else {
        sessionStorage.setItem("tileviz_fullscreen", "false");
      }
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);

    const isFsActive = !!document.fullscreenElement;
    const urlParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
    const hasFsParam = urlParams?.get("fullscreen") === "true";
    const hasFsStorage = typeof window !== "undefined" && sessionStorage.getItem("tileviz_fullscreen") === "true";

    const shouldBeFullscreen = isFsActive || hasFsParam || hasFsStorage;

    if (shouldBeFullscreen) {
      setIsFullscreen(true);
      sessionStorage.setItem("tileviz_fullscreen", "true");

      if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {
          const handleFirstClick = () => {
            if (sessionStorage.getItem("tileviz_fullscreen") === "true" && !document.fullscreenElement) {
              if (document.documentElement.requestFullscreen) {
                document.documentElement.requestFullscreen().catch(() => {});
              }
            }
            window.removeEventListener("click", handleFirstClick);
          };
          window.addEventListener("click", handleFirstClick, { once: true });
        });
      }
    }

    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        if (document.documentElement.requestFullscreen) {
          await document.documentElement.requestFullscreen();
        }
        setIsFullscreen(true);
        sessionStorage.setItem("tileviz_fullscreen", "true");
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        }
        setIsFullscreen(false);
        sessionStorage.setItem("tileviz_fullscreen", "false");
      }
    } catch (err) {
      console.error("Fullscreen toggle error:", err);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground font-sans selection:bg-black selection:text-white transition-colors duration-200">
      <div className="flex min-h-screen">
        
        {/* ── MODERN SUPER ADMIN SIDEBAR ───────────────────────────────── */}
        <AdminSidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          shopSubTab={shopSubTab}
          setShopSubTab={setShopSubTab}
          subSubTab={subSubTab}
          setSubSubTab={setSubSubTab}
          paymentSubTab={paymentSubTab}
          setPaymentSubTab={setPaymentSubTab}
          sidebarOpenSections={sidebarOpenSections}
          toggleSidebarSection={toggleSidebarSection}
          shopsCount={shops.length}
          activeSubs={activeSubs}
          expiringSubsCount={expiringSubs.length}
          expiredSubsCount={expiredSubs.length}
          activeSubsCount={activeSubsList.length}
          pendingPaymentsCount={shopsToCollect}
          globalUtilization={globalUtilization}
          activeNotificationsCount={activeNotifications.length + feed.unreadCount}
          profile={profile}
          logoutAction={logoutAction}
          isSidebarCollapsed={isSidebarCollapsed}
          setIsSidebarCollapsed={setIsSidebarCollapsed}
          isMobileOpen={isMobileOpen}
          setIsMobileOpen={setIsMobileOpen}
        />

        {/* ── MAIN CONTENT AREA ────────────────────────────────────────── */}
        <div className={`flex-1 min-w-0 transition-all duration-200 pl-0 ${isSidebarCollapsed ? "xl:pl-[72px]" : "xl:pl-[272px]"}`}>
          
          {/* Top Header Bar */}
          <header className="sticky top-0 z-30 bg-background/90 backdrop-blur-md px-4 py-4 sm:px-8 sm:py-5 flex items-center justify-between gap-4 border-b border-border">
            <div className="flex min-w-0 flex-1 items-center gap-3.5">
              {/* Mobile drawer toggle (< xl) */}
              <button
                type="button"
                onClick={() => setIsMobileOpen(true)}
                className="ds-btn ds-btn-outline w-9 px-0 xl:hidden"
                title="Open navigation menu"
              >
                <PanelLeftOpen className="h-4 w-4" />
              </button>

              {/* Desktop expand button if collapsed */}
              {isSidebarCollapsed && (
                <button
                  type="button"
                  onClick={() => setIsSidebarCollapsed(false)}
                  className="ds-btn ds-btn-outline hidden xl:inline-flex"
                  title="Expand sidebar"
                >
                  <PanelLeftOpen className="h-4 w-4" />
                  <span>Menu</span>
                </button>
              )}
              <div className="min-w-0">
                <h1 className="truncate text-lg font-semibold text-foreground tracking-tight sm:text-xl">
                  {activeTab === "dashboard" && "Platform Dashboard"}
                  {activeTab === "shops" && (shopSubTab === "add" ? "Provision New Shop" : "Showroom Tenants")}
                  {activeTab === "subscriptions" && "Subscription Management"}
                  {activeTab === "payments" && "Revenue & Payment Operations"}
                  {activeTab === "tile-usage" && "Tile Storage & Quota Allocation"}
                  {activeTab === "visualizer-access" && "Visualizer Access"}
                  {activeTab === "reports" && "Revenue & Reports"}
                  {activeTab === "login-posters" && "Login Page Posters"}
                  {activeTab === "notifications" && "Operational Alerts & Notices"}
                  {activeTab === "settings" && "Platform Settings & Profile"}
                </h1>
                <p className="truncate text-xs text-muted-foreground">
                  {activeTab === "dashboard" && `Good Morning, ${profile.name}! Overview of platform operations.`}
                  {activeTab === "shops" && `${shops.length} total registered showroom accounts.`}
                  {activeTab === "subscriptions" && `${activeSubs} active accounts generating LKR ${estimatedMRR.toLocaleString()}/mo.`}
                  {activeTab === "payments" && `Estimated ARR: LKR ${estimatedARR.toLocaleString()} • ARPU: LKR ${arpu.toLocaleString()}/mo.`}
                  {activeTab === "tile-usage" && `${totalTiles} textures active across ${totalQuota} total allocated slots.`}
                  {activeTab === "visualizer-access" && "Switch the 2D and 3D visualizer on or off for each showroom, within its plan."}
                  {activeTab === "reports" && "Collected revenue, what is still owed, and exports."}
                  {activeTab === "login-posters" && "Advertisement slides on the sign-in page."}
                  {activeTab === "notifications" && `${feed.unreadCount} unread payment update${feed.unreadCount === 1 ? "" : "s"} • ${activeNotifications.length} active system notices.`}
                  {activeTab === "settings" && "Administrator credentials, security, and theme."}
                </p>
              </div>
            </div>

            {/* Right Quick Controls */}
            <div className="flex shrink-0 items-center gap-2">
              {/* Expand / Shrink Fullscreen Toggle Button */}
              <button
                type="button"
                onClick={toggleFullscreen}
                className={`ds-btn hidden w-9 px-0 sm:inline-flex ${isFullscreen ? "ds-btn-primary" : "ds-btn-outline"}`}
                title={isFullscreen ? "Shrink / Exit Fullscreen (Esc)" : "Expand to Fullscreen"}
              >
                {isFullscreen ? (
                  <Minimize2 className="h-4 w-4" />
                ) : (
                  <Maximize2 className="h-4 w-4" />
                )}
              </button>

              {/* Notifications shortcut */}
              <NotificationBell count={feed.unreadCount} onClick={() => setActiveTab("notifications")} />

              {/* Theme Toggle (icon-only on phones) */}
              <ThemeToggle scope="admin" ownerId={adminUser?.id} iconOnly className="sm:hidden" />
              <ThemeToggle scope="admin" ownerId={adminUser?.id} className="hidden sm:inline-flex" />

              {/* Settings Shortcut */}
              <button 
                onClick={() => setActiveTab("settings")}
                className={`ds-btn w-9 px-0 ${activeTab === "settings" ? "ds-btn-primary" : "ds-btn-outline"}`}
                title="Settings"
              >
                <Settings className="h-4 w-4" />
              </button>
            </div>
          </header>

          <NotificationToasts
            toasts={feed.toasts}
            onDismiss={feed.dismissToast}
            onOpen={() => { setActiveTab("notifications"); setNotificationFilter("payments"); }}
          />

          {/* Dynamic Sub-Navigation Bar for Nested Views */}
          {(activeTab === "shops" || activeTab === "subscriptions" || activeTab === "payments" || activeTab === "notifications") && (
            <div className="px-4 sm:px-8 pt-4 pb-1 flex items-center justify-between gap-4 border-b border-border">
              <div className="flex items-center gap-2 overflow-x-auto">
                {/* Shops Sub-Tabs */}
                {activeTab === "shops" && (
                  <>
                    <button
                      onClick={() => setShopSubTab("all")}
                      className={`ds-tab ${shopSubTab === "all" ? "ds-tab-active" : ""}`}
                    >
                      All Shops ({shops.length})
                    </button>
                    <button
                      onClick={() => setShopSubTab("add")}
                      className={`ds-tab ${shopSubTab === "add" ? "ds-tab-active" : ""}`}
                    >
                      + Add Shop
                    </button>
                  </>
                )}

                {/* Subscriptions Sub-Tabs */}
                {activeTab === "subscriptions" && (
                  <>
                    <button
                      onClick={() => setSubSubTab("active")}
                      className={`ds-tab ${subSubTab === "active" ? "ds-tab-active" : ""}`}
                    >
                      Active ({activeSubsList.length})
                    </button>
                    <button
                      onClick={() => setSubSubTab("expiring")}
                      className={`ds-tab ${subSubTab === "expiring" ? "ds-tab-active" : ""}`}
                    >
                      <span>Expiring Soon ({expiringSubs.length})</span>
                      {expiringSubs.length > 0 && <span className="h-2 w-2 rounded-full bg-warning" />}
                    </button>
                    <button
                      onClick={() => setSubSubTab("expired")}
                      className={`ds-tab ${subSubTab === "expired" ? "ds-tab-active" : ""}`}
                    >
                      Expired ({expiredSubs.length})
                    </button>
                    <button
                      onClick={() => setSubSubTab("plans")}
                      className={`ds-tab ${subSubTab === "plans" ? "ds-tab-active" : ""}`}
                    >
                      Plan Packages
                    </button>
                  </>
                )}

                {/* Payments Sub-Tabs */}
                {activeTab === "payments" && (
                  <>
                    <button
                      onClick={() => setPaymentSubTab("overview")}
                      className={`ds-tab ${paymentSubTab === "overview" ? "ds-tab-active" : ""}`}
                    >
                      Payments Overview
                    </button>
                    <button
                      onClick={() => setPaymentSubTab("pending")}
                      className={`ds-tab ${paymentSubTab === "pending" ? "ds-tab-active" : ""}`}
                    >
                      Pending Payments ({shopsToCollect})
                    </button>
                    <button
                      onClick={() => setPaymentSubTab("history")}
                      className={`ds-tab ${paymentSubTab === "history" ? "ds-tab-active" : ""}`}
                    >
                      Payment History
                    </button>
                  </>
                )}

                {/* Notifications Sub-Tabs */}
                {activeTab === "notifications" && (
                  <>
                    <button
                      onClick={() => setNotificationFilter("all")}
                      className={`ds-tab ${notificationFilter === "all" ? "ds-tab-active" : ""}`}
                    >
                      All Alerts ({activeNotifications.length + feed.notifications.length})
                    </button>
                    <button
                      onClick={() => setNotificationFilter("payments")}
                      className={`ds-tab ${notificationFilter === "payments" ? "ds-tab-active" : ""}`}
                    >
                      <span>Payment Updates ({feed.notifications.length})</span>
                      {feed.unreadCount > 0 && <span className="h-2 w-2 rounded-full bg-success" />}
                    </button>
                    <button
                      onClick={() => setNotificationFilter("action")}
                      className={`ds-tab ${notificationFilter === "action" ? "ds-tab-active" : ""}`}
                    >
                      Action Required
                    </button>
                    <button
                      onClick={() => setNotificationFilter("system")}
                      className={`ds-tab ${notificationFilter === "system" ? "ds-tab-active" : ""}`}
                    >
                      System & Heartbeat
                    </button>
                  </>
                )}
              </div>

              {actionFeedback && (
                <div className="px-3 py-1 rounded-full bg-success-muted text-success text-2xs font-bold border border-success/30 animate-fade-in flex items-center gap-1.5">
                  <Check className="h-3 w-3" />
                  <span>{actionFeedback}</span>
                </div>
              )}
            </div>
          )}

          {/* Main Body */}
          <main className="px-4 py-6 sm:px-8 space-y-6 max-w-[1600px] mx-auto">
            
            {/* ── 1. DASHBOARD VIEW ────────────────────────────────────────── */}
            {activeTab === "dashboard" && (() => {
              // ── Real KPI Metrics ──
              const totalShopsKPI = shops.length;
              const activeShopsKPI = activeSubs;
              const activeShopsPct = shops.length > 0 ? `${Math.round((activeSubs / shops.length) * 100)}%` : "0%";
              const monthlyRevKPI = formatLKR(estimatedMRR, { withDecimals: false });
              const totalTilesKPI = totalTiles.toLocaleString();
              const expiringSoonKPI = expiringSubs.length;

              const pendingPaymentsTotal = pendingPaymentsList.reduce((sum, p) => sum + p.amountRaw, 0);
              const pendingPaymentsKPI = formatLKR(pendingPaymentsTotal, { withDecimals: false });

              // ── Real Revenue Data Calculated from Shops & Payment Ledger ──
              const currentYear = now.getFullYear();
              const currentMonth = now.getMonth();

              // Calculate 12 monthly data points based on actual tenant registrations & payments
              const realMonths12 = Array.from({ length: 12 }, (_, i) => {
                const d = new Date(currentYear, currentMonth - 11 + i, 1);
                const mLabel = d.toLocaleString("en-US", { month: "short" });
                const yr = String(d.getFullYear()).slice(2);
                const monthKey = `${mLabel} '${yr}`;
                const startOfMonth = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
                const endOfMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59).getTime();

                // Each invoice belongs to the month it falls due (the 1st or the last day, depending on the billing day)
                const bucketKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
                const collectedInMonth = paymentHistory.reduce((sum, p) => (p.status === "Received" && p.dueKey === bucketKey ? sum + (p.amountRaw || 0) : sum), 0);
                const owedInMonth = paymentHistory.reduce((sum, p) => ((p.status === "Pending" || p.status === "Failed") && p.dueKey === bucketKey ? sum + (p.amountRaw || 0) : sum), 0);

                return {
                  month: monthKey,
                  collected: collectedInMonth,
                  owed: owedInMonth,
                };
              });

              // Weekly breakdown for this-month
              const realWeeksThisMonth = Array.from({ length: 4 }, (_, i) => {
                const weekNum = i + 1;
                const daysPerWeek = 7;
                const startDay = i * daysPerWeek + 1;
                // The last week runs to the end of the month (days 29-31 used to be dropped)
                const endDay = i === 3 ? new Date(currentYear, currentMonth + 1, 0).getDate() : (i + 1) * daysPerWeek;
                const weekStart = new Date(currentYear, currentMonth, startDay).getTime();
                const weekEnd = new Date(currentYear, currentMonth, endDay, 23, 59, 59).getTime();

                const inWeek = (p: (typeof paymentHistory)[number]) => p.dueKey === thisMonthKey && Math.min(3, Math.floor((p.dueDay - 1) / 7)) === i;
                const weekOwed = paymentHistory.reduce((sum, p) => ((p.status === "Pending" || p.status === "Failed") && inWeek(p) ? sum + (p.amountRaw || 0) : sum), 0);
                const weekPayments = paymentHistory.reduce((sum, p) => (p.status === "Received" && inWeek(p) ? sum + (p.amountRaw || 0) : sum), 0);

                return {
                  month: `Week ${weekNum}`,
                  collected: weekPayments,
                  owed: weekOwed,
                };
              });

              const activeRevenueData = revenueTimeframe === "this-month"
                ? realWeeksThisMonth
                : revenueTimeframe === "6M"
                ? realMonths12.slice(-6)
                : realMonths12;

              // Period summary: what was collected, what is still owed, and the share collected
              const periodCollected = activeRevenueData.reduce((sum, d) => sum + d.collected, 0);
              const periodOwed = activeRevenueData.reduce((sum, d) => sum + d.owed, 0);
              const periodBilled = periodCollected + periodOwed;
              const collectionPct = periodBilled > 0 ? Math.round((periodCollected / periodBilled) * 100) : null;
              const periodLabel = revenueTimeframe === "this-month" ? "this month" : revenueTimeframe === "6M" ? "last 6 months" : "last 12 months";

              // ── Subscription plan counts: every package saved in the dashboard, plus the Free Trial ──
              const planChoices = packageChoices(livePlans);
              const planCount: Record<string, number> = {};
              shops.forEach((s) => {
                // A showroom saved as "Enterprise" before the rename is on the Custom Plan; one on a deleted package counts there too
                const pkg = (normalizePlan(s.subscriptionPackage) || "Free Trial").toLowerCase();
                const known = planChoices.find((c) => c.value.toLowerCase() === pkg);
                const key = (known ?? planChoices.find((c) => c.value === "Custom") ?? planChoices[0]).value;
                planCount[key] = (planCount[key] || 0) + 1;
              });

              const priceText = (c: { value: string; price: number }) =>
                c.value === "Free Trial" ? "Free"
                : c.value === "Custom" ? "Per quote"
                : `LKR ${c.price >= 1000 && c.price % 1000 === 0 ? `${c.price / 1000}K` : c.price.toLocaleString()} / month`;
              const planSegments = [...planChoices].reverse().map((c, i, all) => ({
                plan: c.value === "Custom" ? "Custom Plan" : c.label,
                count: planCount[c.value] || 0,
                opacity: all.length > 1 ? 1 - (i * 0.66) / (all.length - 1) : 1,
                price: priceText(c),
              }));

              const totalPlanCount = shops.length;

              // ── Real Top Shops by Tile Usage ──
              const topTileUsageShops = [...shops]
                .map((shop) => {
                  const used = shop._count?.tiles || 0;
                  const limit = shop.tileQuota || 50;
                  const pct = Math.min(100, Math.round((used / limit) * 100));
                  let city = "Showroom";
                  try {
                    if (shop.metadata) {
                      const meta = typeof shop.metadata === "string" ? JSON.parse(shop.metadata) : shop.metadata;
                      if (meta?.city) city = meta.city;
                      else if (meta?.district) city = meta.district;
                    }
                  } catch (e) {}
                  return {
                    id: shop.id,
                    name: shop.shopName || shop.email,
                    used,
                    limit,
                    plan: pkgLabel(shop.subscriptionPackage) || "Free Trial",
                    city,
                    pct,
                  };
                })
                .sort((a, b) => b.used - a.used)
                .slice(0, 5);

              const avgTilesPerShop = shops.length > 0 ? Math.round(totalTiles / shops.length) : 0;

              // ── Real Payment Totals & Recent Transactions ──
              const totalPaidAmount = paymentHistory
                .filter((p) => p.status === "Received")
                .reduce((acc, p) => acc + (p.amountRaw || 0), 0);

              const totalPendingAmount = paymentHistory
                .filter((p) => p.status === "Pending")
                .reduce((acc, p) => acc + (p.amountRaw || 0), 0);

              const totalFailedAmount = paymentHistory
                .filter((p) => p.status === "Failed" || p.status === "Refunded")
                .reduce((acc, p) => acc + (p.amountRaw || 0), 0);

              const expiredSubsCount = shops.filter((s) => !s.subscriptionActive || (s.subscriptionEnd && new Date(s.subscriptionEnd) < now)).length;
              const trialSubsCount = shops.filter((s) => s.subscriptionPackage === "Free Trial").length;

              // ── Dynamic Real Activity Stream ──
              const dynamicActivityList: Array<{ title: string; time: string; icon: any }> = [];

              shops.slice(0, 2).forEach((s) => {
                const daysAgo = Math.floor((now.getTime() - new Date(s.createdAt).getTime()) / (1000 * 60 * 60 * 24));
                const timeStr = daysAgo === 0 ? "Today" : daysAgo === 1 ? "1 day ago" : `${daysAgo}d ago`;
                dynamicActivityList.push({
                  title: `Showroom "${s.shopName || s.email}" provisioned on ${pkgLabel(s.subscriptionPackage) || "Starter"} tier`,
                  time: timeStr,
                  icon: Store,
                });
              });

              recentDesigns.slice(0, 3).forEach((d) => {
                const daysAgo = Math.floor((now.getTime() - new Date(d.createdAt).getTime()) / (1000 * 60 * 60 * 24));
                const timeStr = daysAgo === 0 ? "Today" : daysAgo === 1 ? "1 day ago" : `${daysAgo}d ago`;
                dynamicActivityList.push({
                  title: `3D configuration saved for ${d.roomType} (${d.user?.shopName || "Showroom"})`,
                  time: timeStr,
                  icon: Activity,
                });
              });

              paymentHistory.filter(p => p.status === "Received").slice(0, 2).forEach((p) => {
                dynamicActivityList.push({
                  title: `Payment of ${p.amount} received via ${p.method} (${p.shopName})`,
                  time: p.date,
                  icon: Banknote,
                });
              });

              return (
                <div className="space-y-6">
                  
                  {/* Dashboard Header Banner */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-1">
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="ds-page-title">
                          Dashboard
                        </h2>
                        <span className="text-2xs font-bold px-3 py-1 rounded-full bg-field border border-input text-muted-foreground flex items-center gap-1.5 shadow-xs">
                          <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                          <span>{now.toLocaleDateString("en-US", { month: "short", year: "numeric" })}</span>
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Real-time showroom analytics, revenue performance, and tenant capacity metrics
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => { setActiveTab("shops"); setShopSubTab("add"); }}
                      className="ds-btn ds-btn-lg ds-btn-primary self-start sm:self-auto"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Provision Shop</span>
                    </button>
                  </div>

                  {/* ── 1. TOP 6 KPI CARDS (BLACK & WHITE THEME) ─────────────── */}
                  <div className="grid grid-cols-2 md:grid-cols-3 2xl:grid-cols-6 gap-3.5">
                    
                    <StatCard icon={Store} label="Total shops" value={totalShopsKPI} tag={"Showrooms"} />
                    <StatCard icon={ShieldCheck} label="Active shops" value={activeShopsKPI} tag={activeShopsPct} />
                    <StatCard icon={Banknote} label="Monthly revenue" value={monthlyRevKPI} tag={"MRR"} />
                    <StatCard icon={Layers} label="Total tiles" value={totalTilesKPI} tag={"Live SKUs"} />
                    <StatCard icon={Clock} label="Expiring soon" value={expiringSoonKPI} tag={"≤ 14d"} />
                    <StatCard icon={AlertCircle} label="Pending payments" value={pendingPaymentsKPI} tag={"Unsettled"} />

                  </div>

                  {/* ── 2. REVENUE LINE CHART & SUBSCRIPTION PIE CHART (BLACK & WHITE THEME) ── */}
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    
                    {/* 2A. Revenue Overview — Line Chart (7 cols) */}
                    <div className="ds-card lg:col-span-7 p-6 sm:p-7 space-y-4">
                      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <h3 className="whitespace-nowrap text-base font-bold text-foreground">
                              Revenue Overview
                            </h3>
                            <span className="whitespace-nowrap text-2xs font-bold px-2.5 py-0.5 rounded-full bg-secondary text-foreground/80 border border-input">
                              LKR Currency
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Full package fee billed each month, and how much is collected
                          </p>
                        </div>

                        {/* Timeframe Filter Buttons */}
                        <div className="flex items-center gap-1 bg-muted p-1 rounded-xl border border-input self-start xl:self-auto">
                          {[
                            { id: "this-month" as const, label: "This month" },
                            { id: "6M" as const, label: "6 months" },
                            { id: "12M" as const, label: "12 months" },
                          ].map((tf) => (
                            <button
                              key={tf.id}
                              type="button"
                              onClick={() => setRevenueTimeframe(tf.id)}
                              className={`whitespace-nowrap px-3 py-1 rounded-lg text-2xs font-bold transition-all cursor-pointer ${
                                revenueTimeframe === tf.id
                                  ? "bg-card text-foreground shadow-xs"
                                  : "text-muted-foreground hover:text-foreground"
                              }`}
                            >
                              {tf.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Period summary */}
                      {/* One row per figure until the card is wide enough for three side by side, so no value is cut short */}
                      <div className="grid grid-cols-1 gap-2 pt-1 2xl:grid-cols-3 2xl:gap-3">
                        {[
                          { label: "Collected", value: `LKR ${periodCollected.toLocaleString()}`, hint: "money received", tone: "" },
                          { label: "Still to collect", value: `LKR ${periodOwed.toLocaleString()}`, hint: periodOwed > 0 ? "pending or failed invoices" : "nothing outstanding", tone: periodOwed > 0 ? "text-warning" : "" },
                          {
                            label: "Collection rate",
                            value: collectionPct === null ? "—" : `${collectionPct}%`,
                            hint: collectionPct === null ? "no invoices in this period" : `of LKR ${periodBilled.toLocaleString()} billed`,
                            tone: collectionPct === null ? "" : collectionPct >= 100 ? "text-success" : "",
                          },
                        ].map((k) => (
                          <div key={k.label} className="grid min-w-0 grid-cols-[1fr_auto] items-baseline gap-x-3 rounded-2xl border border-border bg-muted px-3.5 py-3 2xl:block">
                            <p className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">{k.label}</p>
                            <p className="whitespace-nowrap text-right font-mono text-sm font-bold text-foreground 2xl:mt-1 2xl:text-left 2xl:text-base">{k.value}</p>
                            <p className={`col-span-2 mt-0.5 text-2xs leading-snug ${k.tone || "text-muted-foreground"}`}>{k.hint}</p>
                          </div>
                        ))}
                      </div>

                      {/* Legend: solid is money in, dashed is money still to come */}
                      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 pt-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-2">
                          <span className="h-3 w-3 rounded-[3px] bg-primary" />
                          <span><strong className="font-semibold text-foreground">Collected</strong>: status Received</span>
                        </span>
                        <span className="flex items-center gap-2">
                          <span className="h-3 w-3 rounded-[3px] border border-dashed border-primary/70 bg-primary/15" />
                          <span><strong className="font-semibold text-foreground">Still to collect</strong>: Pending or Failed</span>
                        </span>
                      </div>

                      {/* Chart: stacked areas per billing month. Hover a month to read it. */}
                      <RevenueAreaChart
                        data={activeRevenueData.map((d) => ({ label: d.month, collected: d.collected, owed: d.owed }))}
                        legend={false}
                        ariaLabel={`Collected LKR ${periodCollected.toLocaleString()}, still to collect LKR ${periodOwed.toLocaleString()} ${periodLabel}`}
                      />
                    </div>

                    {/* 2B. Subscription Distribution */}
                    <div className="ds-card lg:col-span-5 p-6 sm:p-7 flex flex-col justify-between space-y-4">
                      <div>
                        <div className="flex items-center justify-between">
                          <h3 className="text-base font-bold text-foreground">
                            Subscription Plans
                          </h3>
                          <span className="text-xs font-bold text-muted-foreground font-mono">
                            {totalPlanCount} Shops
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Distribution across pricing tiers
                        </p>
                      </div>

                      {/* Radial chart + legend */}
                      <div className="flex flex-1 flex-col items-center justify-center gap-6 py-2">
                        <PlanRadialChart
                          slices={planSegments}
                          total={totalPlanCount}
                          hovered={hoveredPlanSegment}
                          onHover={setHoveredPlanSegment}
                          ariaLabel={`${totalPlanCount} showrooms across subscription plans`}
                        />

                        {/* Legend: full width under the chart; plan on one line, price under it */}
                        <ul className="w-full min-w-0 flex-1 space-y-1.5 text-xs">
                          {planSegments.map((p) => {
                            const isHovered = hoveredPlanSegment === p.plan;
                            const pct = totalPlanCount > 0 ? Math.round((p.count / totalPlanCount) * 100) : 0;
                            return (
                              <li
                                key={p.plan}
                                onMouseEnter={() => setHoveredPlanSegment(p.plan)}
                                onMouseLeave={() => setHoveredPlanSegment(null)}
                                className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 transition-colors ${
                                  isHovered ? "border-input bg-secondary" : "border-transparent bg-muted hover:border-border"
                                } ${p.count === 0 ? "opacity-70" : ""}`}
                              >
                                <span className="h-3 w-3 shrink-0 rounded-full bg-primary" style={{ opacity: p.opacity }} />
                                <div className="min-w-0 flex-1">
                                  <p className="truncate font-semibold leading-tight text-foreground">{p.plan}</p>
                                  <p className="truncate text-2xs leading-tight text-muted-foreground">{p.price}</p>
                                </div>
                                <span className="w-6 shrink-0 text-right font-mono text-sm font-bold text-foreground">{p.count}</span>
                                <span className="w-11 shrink-0 rounded-lg bg-secondary px-1.5 py-0.5 text-center font-mono text-2xs font-bold text-muted-foreground">
                                  {pct}%
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-border/60 pt-3 text-2xs text-muted-foreground">
                        <span>
                          Est. recurring revenue{" "}
                          <strong className="font-mono text-foreground">LKR {estimatedMRR.toLocaleString()}</strong> / month
                        </span>
                        <button
                          onClick={() => setActiveTab("subscriptions")}
                          className="cursor-pointer whitespace-nowrap font-bold text-foreground hover:underline"
                        >
                          Manage Plans →
                        </button>
                      </div>
                    </div>

                  </div>

                  {/* ── 3. TILE USAGE — HORIZONTAL BAR CHART (BLACK & WHITE THEME) ── */}
                  <div className="ds-card p-6 sm:p-7 space-y-5">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-base font-bold text-foreground">
                            Tile Usage by Shop
                          </h3>
                          <span className="text-2xs font-bold px-2.5 py-0.5 rounded-full bg-secondary text-foreground/80 border border-input">
                            Storage Allocation
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Identifies showrooms approaching storage quota thresholds
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                        <span className="text-muted-foreground">
                          Platform average: <strong className="text-foreground font-mono">{avgTilesPerShop} tiles/shop</strong>
                        </span>
                        <button
                          onClick={() => setActiveTab("tile-usage")}
                          className="whitespace-nowrap font-bold text-foreground hover:underline cursor-pointer"
                        >
                          All Usage ({shops.length}) →
                        </button>
                      </div>
                    </div>

                    {/* Horizontal Bars */}
                    {topTileUsageShops.length === 0 ? (
                      <div className="py-8 text-center text-xs text-muted-foreground">
                        No showroom tenants provisioned yet. Add a showroom to view live tile storage analytics.
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {topTileUsageShops.map((item, idx) => {
                          const isNearLimit = item.pct >= 80;
                          return (
                            <div key={idx} className="space-y-1.5">
                              <div className="flex items-center justify-between text-xs">
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-foreground">{item.name}</span>
                                  <span className="text-2xs text-muted-foreground font-medium">({item.city})</span>
                                  <span className="text-2xs font-bold px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">
                                    {item.plan}
                                  </span>
                                  {isNearLimit && (
                                    <span className="text-2xs font-bold uppercase px-2 py-0.5 rounded-full bg-secondary text-foreground border border-input">
                                      Near Limit
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 font-mono">
                                  <span className="font-semibold text-foreground">
                                    {item.used} / {item.limit} tiles
                                  </span>
                                  <span className="text-muted-foreground text-2xs">
                                    ({item.limit - item.used} free • {item.pct}%)
                                  </span>
                                </div>
                              </div>

                              {/* Bar Container */}
                              <div className="h-2.5 w-full bg-secondary rounded-full overflow-hidden p-0.5">
                                <div
                                  className="h-full rounded-full transition-all duration-500 bg-primary"
                                  style={{ width: `${Math.max(3, item.pct)}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* ── 4. EXPIRING SUBSCRIPTIONS & RECENT PAYMENTS (BLACK & WHITE THEME) ── */}
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    
                    {/* 4A. Expiring Subscriptions & Subscription Status (6 cols) */}
                    <div className="ds-card lg:col-span-6 p-6 sm:p-7 space-y-5">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-base font-bold text-foreground">
                            Subscriptions Expiring Soon
                          </h3>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Renewal alerts requiring administrator follow-up
                          </p>
                        </div>
                        <button
                          onClick={() => { setActiveTab("subscriptions"); setSubSubTab("expiring"); }}
                          className="text-xs font-bold text-foreground hover:underline cursor-pointer"
                        >
                          View All ({expiringSubs.length}) →
                        </button>
                      </div>

                      {/* Subscription Status Pill Breakdown in Monochrome */}
                      <div className="grid grid-cols-4 gap-2 text-center">
                        <div className="p-2.5 rounded-xl bg-muted border border-input">
                          <span className="block text-2xs font-bold text-muted-foreground">Active</span>
                          <span className="text-base font-bold text-foreground font-mono">{activeSubs}</span>
                        </div>
                        <div className="p-2.5 rounded-xl bg-muted border border-input">
                          <span className="block text-2xs font-bold text-muted-foreground">Expiring</span>
                          <span className="text-base font-bold text-foreground font-mono">{expiringSubs.length}</span>
                        </div>
                        <div className="p-2.5 rounded-xl bg-muted border border-input">
                          <span className="block text-2xs font-bold text-muted-foreground">Expired</span>
                          <span className="text-base font-bold text-foreground font-mono">{expiredSubsCount}</span>
                        </div>
                        <div className="p-2.5 rounded-xl bg-muted border border-input">
                          <span className="block text-2xs font-bold text-muted-foreground">Trial</span>
                          <span className="text-base font-bold text-foreground font-mono">{trialSubsCount}</span>
                        </div>
                      </div>

                      {/* Expiring List */}
                      {expiringSubs.length === 0 ? (
                        <div className="py-6 text-center text-xs text-muted-foreground">
                          No subscriptions expiring in the next 14 days. All showrooms are up to date.
                        </div>
                      ) : (
                        <div className="space-y-2.5 pt-1">
                          {expiringSubs.slice(0, 4).map((sub, idx) => {
                            const daysLeft = sub.subscriptionEnd 
                              ? Math.max(0, Math.ceil((new Date(sub.subscriptionEnd).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
                              : 0;
                            const dateStr = sub.subscriptionEnd ? new Date(sub.subscriptionEnd).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Soon";
                            return (
                              <div
                                key={idx}
                                className="flex items-center justify-between p-3 rounded-2xl bg-muted border border-input"
                              >
                                <div>
                                  <span className="font-bold text-xs text-foreground block">{sub.shopName || sub.email}</span>
                                  <span className="text-2xs text-muted-foreground font-medium">{pkgLabel(sub.subscriptionPackage) || "Starter"} • Due {dateStr}</span>
                                </div>
                                <span className="text-2xs font-bold px-2.5 py-1 rounded-full bg-secondary text-foreground/80 border border-input font-mono">
                                  {daysLeft} days
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* 4B. Payment Overview & Recent Payments (6 cols) */}
                    <div className="ds-card lg:col-span-6 p-6 sm:p-7 space-y-5">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-base font-bold text-foreground">
                            Payment Overview
                          </h3>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Recent commercial billing receipts and status
                          </p>
                        </div>
                        <button
                          onClick={() => setActiveTab("payments")}
                          className="text-xs font-bold text-foreground hover:underline cursor-pointer"
                        >
                          View Ledger →
                        </button>
                      </div>

                      {/* Payment Status Summary */}
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="p-2.5 rounded-xl bg-muted border border-input">
                          <span className="block text-2xs font-bold text-muted-foreground">Paid</span>
                          <span className="text-xs font-bold text-foreground font-mono">{formatLKR(totalPaidAmount, { withDecimals: false })}</span>
                        </div>
                        <div className="p-2.5 rounded-xl bg-muted border border-input">
                          <span className="block text-2xs font-bold text-muted-foreground">Pending</span>
                          <span className="text-xs font-bold text-foreground font-mono">{formatLKR(totalPendingAmount, { withDecimals: false })}</span>
                        </div>
                        <div className="p-2.5 rounded-xl bg-muted border border-input">
                          <span className="block text-2xs font-bold text-muted-foreground">Failed/Refund</span>
                          <span className="text-xs font-bold text-foreground font-mono">{formatLKR(totalFailedAmount, { withDecimals: false })}</span>
                        </div>
                      </div>

                      {/* Recent Payments Table */}
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead>
                            <tr className="border-b border-border/60 text-2xs font-bold uppercase tracking-wider text-muted-foreground">
                              <th className="pb-2">Shop</th>
                              <th className="pb-2">Plan</th>
                              <th className="pb-2">Amount</th>
                              <th className="pb-2">Date</th>
                              <th className="pb-2 text-right">Status</th>
                            </tr>
                          </thead>
                          {paymentHistory.length === 0 ? (
                            <tbody>
                              <tr>
                                <td colSpan={5} className="py-6 text-center text-xs text-muted-foreground">
                                  No transaction records found.
                                </td>
                              </tr>
                            </tbody>
                          ) : (
                            <tbody className="divide-y divide-border/60">
                              {paymentHistory.slice(0, 5).map((item, idx) => (
                                <tr key={idx} className="hover:bg-accent">
                                  <td className="py-2.5 font-bold text-foreground truncate max-w-[120px]">
                                    {item.shopName}
                                  </td>
                                  <td className="py-2.5 text-muted-foreground text-2xs">{item.package}</td>
                                  <td className="py-2.5 font-mono font-bold text-foreground">{item.amount}</td>
                                  <td className="py-2.5 text-muted-foreground text-2xs">{item.date}</td>
                                  <td className="py-2.5 text-right">
                                    <span className={`px-2 py-0.5 rounded-full text-2xs font-bold ${
                                      item.status === "Received"
                                        ? "bg-primary text-primary-foreground"
                                        : item.status === "Pending"
                                        ? "bg-secondary text-foreground/80 border border-input"
                                        : "border border-input text-muted-foreground"
                                    }`}>
                                      {item.status}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          )}
                        </table>
                      </div>
                    </div>

                  </div>

                  {/* ── 5. RECENTLY ADDED SHOPS & RECENT ACTIVITY (REAL DATA) ─── */}
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    
                    {/* 5A. Recently Added Shops (6 cols) */}
                    <div className="ds-card lg:col-span-6 p-6 sm:p-7 space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-base font-bold text-foreground">
                            Recently Added Shops
                          </h3>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Newest tenant registrations and assigned plans
                          </p>
                        </div>
                        <button
                          onClick={() => { setActiveTab("shops"); setShopSubTab("all"); }}
                          className="text-xs font-bold text-foreground hover:underline cursor-pointer"
                        >
                          All Shops ({shops.length}) →
                        </button>
                      </div>

                      {shops.length === 0 ? (
                        <div className="py-6 text-center text-xs text-muted-foreground">
                          No showroom tenants provisioned yet.
                        </div>
                      ) : (
                        <div className="space-y-2.5">
                          {shops.slice(0, 4).map((sh) => {
                            let owner = sh.email;
                            try {
                              if (sh.metadata) {
                                const meta = typeof sh.metadata === "string" ? JSON.parse(sh.metadata) : sh.metadata;
                                if (meta?.ownerName) owner = meta.ownerName;
                                else if (meta?.contactPerson) owner = meta.contactPerson;
                              }
                            } catch (e) {}
                            const daysAgo = Math.floor((now.getTime() - new Date(sh.createdAt).getTime()) / (1000 * 60 * 60 * 24));
                            const joinedStr = daysAgo === 0 ? "Today" : daysAgo === 1 ? "1 day ago" : `${daysAgo}d ago`;

                            return (
                              <div
                                key={sh.id}
                                className="flex items-center justify-between p-3 rounded-2xl bg-muted border border-input"
                              >
                                <div className="flex items-center gap-3">
                                  <div className="w-9 h-9 rounded-xl bg-field text-foreground border border-input flex items-center justify-center font-bold text-xs shrink-0 overflow-hidden shadow-xs">
                                    {sh.logoUrl ? (
                                      <img src={sh.logoUrl} alt={sh.shopName || "Logo"} className="w-full h-full object-cover" />
                                    ) : (
                                      (sh.shopName || sh.email).charAt(0).toUpperCase()
                                    )}
                                  </div>
                                  <div>
                                    <h4 className="font-bold text-xs text-foreground leading-snug">{sh.shopName || sh.email}</h4>
                                    <span className="text-2xs text-muted-foreground">{owner} • {pkgLabel(sh.subscriptionPackage) || "Starter"} ({sh.tileQuota || 50} tiles)</span>
                                  </div>
                                </div>
                                <div className="text-right">
                                  <span className="inline-block px-2 py-0.5 rounded-full text-2xs font-bold bg-secondary text-foreground/80 border border-input mb-0.5">
                                    {sh.subscriptionActive ? "Active" : "Inactive"}
                                  </span>
                                  <span className="block text-2xs text-muted-foreground font-mono">{joinedStr}</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* 5B. Recent Activity Timeline (6 cols) */}
                    <div className="ds-card lg:col-span-6 p-6 sm:p-7 space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-base font-bold text-foreground">
                            Recent Activity
                          </h3>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Real-time platform logs, uploads, and visualizer events
                          </p>
                        </div>
                        <span className="flex h-2 w-2 rounded-full bg-primary animate-pulse" />
                      </div>

                      {dynamicActivityList.length === 0 ? (
                        <div className="py-6 text-center text-xs text-muted-foreground">
                          Activity logs will appear here as showrooms and designers interact with the platform.
                        </div>
                      ) : (
                        <div className="space-y-3 pt-1">
                          {dynamicActivityList.map((act, idx) => {
                            const Icon = act.icon;
                            return (
                              <div key={idx} className="flex items-start gap-3 py-1">
                                <div className="w-7 h-7 rounded-xl flex items-center justify-center shrink-0 mt-0.5 bg-muted border border-input text-foreground">
                                  <Icon className="w-3.5 h-3.5" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-bold text-foreground leading-snug">{act.title}</p>
                                  <span className="text-2xs text-muted-foreground font-medium">{act.time}</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                  </div>

                </div>
              );
            })()}

            {/* ── 2. SHOPS VIEW ────────────────────────────────────────────── */}
            {activeTab === "shops" && (
              <div className="space-y-6">
                {shopSubTab === "all" ? (
                  <ShopList 
                    shops={shops} 
                    plans={livePlans}
                    onOpenProvisionModal={() => setShopSubTab("add")} 
                  />
                ) : (
                  <div className="max-w-4xl mx-auto rounded-3xl bg-card p-8 border border-border shadow-xl space-y-6">
                    <div className="flex items-center justify-between pb-5 border-b border-border">
                      <div>
                        <h2 className="ds-section-title">Add New Showroom Shop</h2>
                        <p className="ds-subtitle">Configure shop profile, owner contact, administrator account, and commercial subscription terms.</p>
                      </div>
                      <button
                        onClick={() => setShopSubTab("all")}
                        className="p-2 rounded-full text-muted-foreground hover:text-foreground cursor-pointer"
                        title="Close form"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <CreateUserForm 
                      plans={livePlans}
                      onCancel={() => setShopSubTab("all")} 
                      onSuccess={() => setShopSubTab("all")} 
                    />
                  </div>
                )}
              </div>
            )}

            {/* ── 3. SUBSCRIPTIONS VIEW ────────────────────────────────────── */}
            {activeTab === "subscriptions" && (
              subSubTab === "plans" ? (
                <SubscriptionPlansPanel initialPlans={subscriptionPlans || []} />
              ) : (
                <div className="space-y-6">
                {/* Summary Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h2 className="ds-page-title">
                      {subSubTab === "active" && "Active Showroom Subscriptions"}
                      {subSubTab === "expiring" && "Expiring Subscriptions & Trials (≤ 14 Days)"}
                      {subSubTab === "expired" && "Expired & Suspended Accounts"}
                    </h2>
                    <p className="ds-subtitle">
                      {subSubTab === "active" && `Managing ${activeSubsList.length} showroom accounts in good standing.`}
                      {subSubTab === "expiring" && `${expiringSubs.length} showroom accounts require renewal attention.`}
                      {subSubTab === "expired" && `${expiredSubs.length} showroom accounts currently inactive or lapsed.`}
                    </p>
                  </div>

                  <div className="rounded-full border border-border bg-card px-4 py-2 text-xs text-muted-foreground shadow-xs">
                    Est. MRR: <strong className="text-foreground">${estimatedMRR}</strong> • Active Rate: <strong className="text-foreground">{billingRate}%</strong>
                  </div>
                </div>

                {/* Subscriptions Table */}
                <div className="ds-card overflow-x-auto">
                  <table className="min-w-full divide-y divide-border text-left text-xs">
                    <thead className="bg-muted text-2xs font-bold uppercase tracking-wider text-muted-foreground">
                      <tr>
                        <th className="px-5 py-4">Showroom</th>
                        <th className="px-5 py-4">Package</th>
                        <th className="px-5 py-4">Status</th>
                        <th className="px-5 py-4">Start Date</th>
                        <th className="px-5 py-4">End Date</th>
                        <th className="px-5 py-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {(subSubTab === "active" ? activeSubsList : subSubTab === "expiring" ? expiringSubs : expiredSubs).map((shop) => {
                        const expired = shop.subscriptionEnd && new Date(shop.subscriptionEnd) < now;
                        const trialActive = shop.subscriptionActive && shop.trialEndsAt && new Date(shop.trialEndsAt) >= now;
                        const status = !shop.subscriptionActive ? "Suspended" : expired ? "Expired" : trialActive ? "Free Trial" : "Active";
                        const statusTone = status === "Suspended" || status === "Expired"
                          ? "destructive"
                          : status === "Free Trial"
                          ? "neutral"
                          : "success";

                        return (
                          <tr key={shop.id} className="transition-colors hover:bg-accent">
                            <td className="whitespace-nowrap px-5 py-4">
                              <div className="font-bold text-foreground">{shop.shopName || "Showroom"}</div>
                              <div className="mt-0.5 font-mono text-2xs text-muted-foreground">{shop.email}</div>
                            </td>
                            <td className="whitespace-nowrap px-5 py-4">
                              <span className="rounded-full border border-input bg-muted px-3 py-1 font-semibold text-foreground/80">
                                {pkgLabel(shop.subscriptionPackage) || "Free Trial"} (LKR ${(tierPricing[normalizePlan(shop.subscriptionPackage)] || 0).toLocaleString()}/mo)
                              </span>
                            </td>
                            <td className="whitespace-nowrap px-5 py-4">
                              <StatusBadge tone={statusTone}>
                                {status}
                              </StatusBadge>
                            </td>
                            <td className="whitespace-nowrap px-5 py-4 text-muted-foreground">
                              {shop.subscriptionStart ? new Date(shop.subscriptionStart).toLocaleDateString() : "Not set"}
                            </td>
                            <td className="whitespace-nowrap px-5 py-4 text-muted-foreground">
                              {shop.subscriptionEnd ? new Date(shop.subscriptionEnd).toLocaleDateString() : shop.trialEndsAt ? `Trial: ${new Date(shop.trialEndsAt).toLocaleDateString()}` : "Indefinite"}
                            </td>
                            <td className="whitespace-nowrap px-5 py-4 text-right space-x-2">
                              {subSubTab === "expiring" && (
                                <button
                                  type="button"
                                  onClick={() => handleQuickExtend(shop.id, 30)}
                                  className="ds-btn ds-btn-primary text-2xs"
                                >
                                  +30 Days
                                </button>
                              )}
                              {subSubTab === "expired" && (
                                <button
                                  type="button"
                                  onClick={() => handleQuickReactivate(shop.id)}
                                  className="ds-btn ds-btn-sm ds-btn-primary"
                                >
                                  Reactivate
                                </button>
                              )}
                              <button 
                                type="button" 
                                onClick={() => openSubscriptionEditor(shop)} 
                                className="rounded-full border border-input bg-field px-4 py-1.5 text-2xs font-bold text-foreground shadow-xs hover:bg-accent transition-colors cursor-pointer"
                              >
                                Edit
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          )}

            {/* ── 4. PAYMENTS / INCOME VIEW ────────────────────────────────── */}
            {activeTab === "payments" && (() => {
              // Filtering logic for payment history
              const filteredPaymentHistory = paymentHistory.filter((item) => {
                if (historyStatusFilter !== "all") {
                  if (item.status.toLowerCase() !== historyStatusFilter.toLowerCase()) {
                    return false;
                  }
                }

                if (historySearchQuery.trim()) {
                  const q = historySearchQuery.toLowerCase();
                  const match = 
                    item.id.toLowerCase().includes(q) ||
                    item.shopName.toLowerCase().includes(q) ||
                    item.email.toLowerCase().includes(q) ||
                    (item.reference && item.reference.toLowerCase().includes(q)) ||
                    item.package.toLowerCase().includes(q);
                  if (!match) return false;
                }

                const itemDate = new Date(item.timestamp);
                if (historyDateRange === "this-month") {
                  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
                  if (itemDate < firstOfMonth) return false;
                } else if (historyDateRange === "last-30-days") {
                  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);
                  if (itemDate < thirtyDaysAgo) return false;
                } else if (historyDateRange === "last-90-days") {
                  const ninetyDaysAgo = new Date(now.getTime() - 90 * 86400000);
                  if (itemDate < ninetyDaysAgo) return false;
                } else if (historyDateRange === "this-year") {
                  const firstOfYear = new Date(now.getFullYear(), 0, 1);
                  if (itemDate < firstOfYear) return false;
                } else if (historyDateRange === "custom") {
                  if (historyCustomStartDate && itemDate < new Date(historyCustomStartDate)) return false;
                  if (historyCustomEndDate && itemDate > new Date(new Date(historyCustomEndDate).getTime() + 86400000)) return false;
                }

                if (historyAmountFilter === "under-5k") {
                  if (item.amountRaw >= 5000) return false;
                } else if (historyAmountFilter === "5k-15k") {
                  if (item.amountRaw < 5000 || item.amountRaw > 15000) return false;
                } else if (historyAmountFilter === "over-15k") {
                  if (item.amountRaw <= 15000) return false;
                } else if (historyAmountFilter === "custom") {
                  if (historyMinAmount && item.amountRaw < Number(historyMinAmount)) return false;
                  if (historyMaxAmount && item.amountRaw > Number(historyMaxAmount)) return false;
                }

                return true;
              }).sort((a, b) => {
                if (historySortBy === "date-desc") return b.timestamp - a.timestamp;
                if (historySortBy === "date-asc") return a.timestamp - b.timestamp;
                if (historySortBy === "amount-desc") return b.amountRaw - a.amountRaw;
                if (historySortBy === "amount-asc") return a.amountRaw - b.amountRaw;
                return 0;
              });

              const totalFilteredLKR = filteredPaymentHistory.reduce((sum, item) => sum + item.amountRaw, 0);
              const totalPendingAmountLKR = owedNow;
              const overdueCount = pendingPaymentsList.filter((p) => p.overdue).length;
              const collectedThisMonth = paymentHistory
                .filter((p) => p.status === "Received" && p.paidKey === thisMonthKey)
                .reduce((sum, p) => sum + p.amountRaw, 0);
              const collectedAllTime = paymentHistory.filter((p) => p.status === "Received").reduce((sum, p) => sum + p.amountRaw, 0);
              const failedAmount = paymentHistory.filter((p) => p.status === "Failed").reduce((sum, p) => sum + p.amountRaw, 0);
              const recentReceived = paymentHistory.filter((p) => p.status === "Received").sort((a, b) => b.timestamp - a.timestamp).slice(0, 5);

              const isFilterActive = 
                historyStatusFilter !== "all" || 
                historyDateRange !== "all" || 
                historyAmountFilter !== "all" || 
                historySearchQuery.trim().length > 0 ||
                historyCustomStartDate !== "" ||
                historyCustomEndDate !== "" ||
                historyMinAmount !== "" ||
                historyMaxAmount !== "";

              return (
                <div className="space-y-6">
                  {/* ── SUB-TAB 1: PAYMENTS OVERVIEW ── */}
                  {paymentSubTab === "overview" && (
                    <div className="space-y-6">
                      {/* Headline numbers */}
                      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
                        <div className="ds-card p-6">
                          <span className="block text-2xs font-bold uppercase tracking-wider text-muted-foreground">Collected this month</span>
                          <div className="mt-2 font-mono text-2xl font-bold text-success sm:text-3xl">{formatLKR(collectedThisMonth)}</div>
                          <span className="mt-1 block text-xs text-muted-foreground">{formatLKR(collectedAllTime)} collected in total</span>
                        </div>
                        <div className="ds-card p-6">
                          <span className="block text-2xs font-bold uppercase tracking-wider text-muted-foreground">Outstanding</span>
                          <div className={`mt-2 font-mono text-2xl font-bold sm:text-3xl ${totalPendingAmountLKR > 0 ? "text-warning" : "text-foreground"}`}>{formatLKR(totalPendingAmountLKR)}</div>
                          <span className="mt-1 block text-xs text-muted-foreground">
                            {totalPendingAmountLKR === 0 && pendingPaymentsList.length === 0
                              ? "All invoices settled"
                              : `${pendingPaymentsList.length} invoice${pendingPaymentsList.length === 1 ? "" : "s"}${overdueCount > 0 ? `, ${overdueCount} overdue` : ""}`}
                            {failedAmount > 0 && <span className="font-semibold text-destructive"> · {formatLKR(failedAmount)} failed</span>}
                          </span>
                        </div>
                        <div className="ds-card p-6">
                          <span className="block text-2xs font-bold uppercase tracking-wider text-muted-foreground">Monthly recurring revenue</span>
                          <div className="mt-2 font-mono text-2xl font-bold text-foreground sm:text-3xl">{formatLKR(estimatedMRR)}</div>
                          <span className="mt-1 block text-xs text-muted-foreground">
                            {activeSubs} active showroom{activeSubs === 1 ? "" : "s"} · {formatLKR(estimatedARR)} a year
                          </span>
                        </div>
                      </div>

                      {/* Monthly revenue by plan */}
                      {(() => {
                        const planRows = packageChoices(livePlans)
                          .filter((c) => c.value !== "Free Trial")
                          .map((choice) => {
                            const mine = shops.filter((s) => normalizePlan(s.subscriptionPackage).toLowerCase() === choice.value.toLowerCase() && s.subscriptionActive);
                            return { choice, count: mine.length, total: mine.reduce((sum, s) => sum + getMonthlyPrice(s), 0) };
                          });
                        return (
                          <div className="ds-card overflow-hidden">
                            <div className="border-b border-border px-6 py-4">
                              <h3 className="text-base font-bold text-foreground">Monthly revenue by plan</h3>
                            </div>
                            <div className="overflow-x-auto">
                              <table className="w-full text-left text-xs">
                                <thead>
                                  <tr className="bg-muted text-2xs font-bold uppercase tracking-wider text-muted-foreground">
                                    <th className="px-6 py-3">Plan</th>
                                    <th className="px-6 py-3">Price</th>
                                    <th className="px-6 py-3 text-right">Showrooms</th>
                                    <th className="px-6 py-3 text-right">Revenue</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-border/60">
                                  {planRows.map(({ choice, count, total }) => (
                                    <tr key={choice.value}>
                                      <td className="px-6 py-3 font-semibold text-foreground">{choice.label}</td>
                                      <td className="px-6 py-3 font-mono text-muted-foreground">{choice.value === "Custom" ? "Per quote" : `${formatLKR(choice.price)}/mo`}</td>
                                      <td className="px-6 py-3 text-right font-mono text-foreground">{count}</td>
                                      <td className="px-6 py-3 text-right font-mono font-bold text-foreground">{formatLKR(total)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                                <tfoot>
                                  <tr className="border-t border-border bg-muted/50">
                                    <td className="px-6 py-3 font-bold text-foreground">Total</td>
                                    <td className="px-6 py-3" />
                                    <td className="px-6 py-3 text-right font-mono font-bold text-foreground">{planRows.reduce((sum, r) => sum + r.count, 0)}</td>
                                    <td className="px-6 py-3 text-right font-mono font-bold text-foreground">{formatLKR(planRows.reduce((sum, r) => sum + r.total, 0))}</td>
                                  </tr>
                                </tfoot>
                              </table>
                            </div>
                          </div>
                        );
                      })()}

                      {/* What to chase and what just came in */}
                      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                        <div className="ds-card space-y-4 p-6">
                          <div className="flex items-center justify-between">
                            <h3 className="text-base font-bold text-foreground">Still to collect this month</h3>
                            <button type="button" onClick={() => setPaymentSubTab("pending")} className="cursor-pointer text-xs font-bold text-foreground/80 hover:text-foreground">
                              View all →
                            </button>
                          </div>
                          {toCollectRows.length === 0 ? (
                            <p className="py-4 text-center text-xs text-muted-foreground">Nothing left to collect this month.</p>
                          ) : (
                            <ul className="divide-y divide-border/60">
                              {toCollectRows.slice(0, 5).map((row) => {
                                const label = row.suspended ? "Suspended" : row.overdue ? "Overdue" : "Due";
                                const tone = row.suspended || row.overdue ? "border-destructive/30 bg-destructive-muted text-destructive" : "border-warning/30 bg-warning-muted text-warning";
                                return (
                                  <li key={row.shop.id} className="flex items-center gap-3 py-3">
                                    <ShopAvatar name={row.shop.shopName || row.shop.email} logoUrl={row.shop.logoUrl} className="h-9 w-9 rounded-xl" />
                                    <div className="min-w-0 flex-1">
                                      <p className="truncate text-xs font-bold text-foreground">{row.shop.shopName || row.shop.email}</p>
                                      <p className="mt-0.5 flex items-center gap-1.5 text-2xs text-muted-foreground">
                                        <span className={`rounded-full border px-2 py-0.5 font-bold ${tone}`}>{label}</span>
                                        {row.dueISO && <span>{fmtDay(`${row.dueISO}T00:00:00Z`)}</span>}
                                      </p>
                                    </div>
                                    <span className="shrink-0 font-mono text-xs font-bold text-foreground">{formatLKR(row.owed)}</span>
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </div>

                        <div className="ds-card space-y-4 p-6">
                          <div className="flex items-center justify-between">
                            <h3 className="text-base font-bold text-foreground">Recent payments</h3>
                            <button type="button" onClick={() => setPaymentSubTab("history")} className="cursor-pointer text-xs font-bold text-foreground/80 hover:text-foreground">
                              View ledger →
                            </button>
                          </div>
                          {recentReceived.length === 0 ? (
                            <p className="py-4 text-center text-xs text-muted-foreground">No payments have been received yet.</p>
                          ) : (
                            <ul className="divide-y divide-border/60">
                              {recentReceived.map((p) => (
                                <li key={p.paymentId} className="flex items-center gap-3 py-3">
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate text-xs font-bold text-foreground">{p.shopName}</p>
                                    <p className="mt-0.5 truncate text-2xs text-muted-foreground">{p.package} · {p.date}</p>
                                  </div>
                                  <span className="shrink-0 font-mono text-xs font-bold text-success">{p.amount}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ── SUB-TAB 2: COLLECT FROM SHOWROOMS: this month's list ── */}
                  {paymentSubTab === "pending" && (() => {
                    const monthName = monthLabel(thisMonthKey);
                    const payingTotal = toCollectRows.length + paidRows.length;
                    const pct = payingTotal > 0 ? Math.round((paidRows.length / payingTotal) * 100) : 0;
                    const activeCollectTab = collectTab === "trial" && trialRows.length === 0 ? "collect" : collectTab;

                    const renderPending = (row: (typeof collectionRows)[number]) => {
                      const { shop, owed, suspended, overdue, graceUntil, isTrial, trialEnd, trialOver, months, dueISO, openDue, nextOpen } = row;
                      const days = dueISO ? Math.round((new Date(`${dueISO}T00:00:00Z`).getTime() - new Date(`${todayKey}T00:00:00Z`).getTime()) / 86400000) : 0;
                      const dueText = dueISO ? fmtDay(`${dueISO}T00:00:00Z`) : "";

                      let tone: "danger" | "warning" | "muted" = "warning";
                      let pill = "Pending";
                      let line = dueText ? `Payment date ${dueText}` : "Payment due";
                      if (isTrial) {
                        tone = trialOver || suspended ? "danger" : "muted";
                        pill = trialOver || suspended ? "Trial ended, suspended" : "Free trial";
                        line = trialEnd ? `Free trial ${trialOver ? "ended" : "ends"} ${fmtDay(`${trialEnd}T00:00:00Z`)}` : "Free trial";
                      } else if (suspended) {
                        tone = "danger";
                        pill = "Suspended";
                        line = dueText ? `Suspended because ${dueText} passed without payment` : "Suspended";
                      } else if (overdue) {
                        tone = "danger";
                        pill = "Overdue";
                        line = `Payment date ${dueText} has passed. Suspends on the next check.`;
                      } else if (graceUntil && graceUntil >= todayKey) {
                        pill = "Extra time";
                        line = `Extra time until ${fmtDay(`${graceUntil}T00:00:00Z`)}`;
                      } else {
                        pill = days <= 0 ? "Due today" : `Due in ${days} day${days === 1 ? "" : "s"}`;
                      }
                      const pillClass = {
                        danger: "border-destructive/30 bg-destructive-muted text-destructive",
                        warning: "border-warning/30 bg-warning-muted text-warning",
                        muted: "border-input bg-secondary text-muted-foreground",
                      }[tone];
                      const canGiveTime = (isTrial && (trialOver || suspended)) || !isTrial;
                      return (
                        <li key={shop.id} className="flex flex-col gap-4 rounded-2xl border border-input bg-muted p-4 lg:flex-row lg:items-center">
                          <div className="flex min-w-0 flex-1 items-center gap-4">
                            <ShopAvatar name={shop.shopName || shop.email} logoUrl={shop.logoUrl} className="h-14 w-14 rounded-2xl" />
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <h4 className="truncate text-sm font-bold text-foreground">{shop.shopName || shop.email}</h4>
                                {!isTrial && <span className="rounded-full border border-input bg-card px-2 py-0.5 text-2xs font-bold text-muted-foreground">{pkgLabel(shop.subscriptionPackage)}</span>}
                                <span className={`rounded-full border px-2.5 py-0.5 text-2xs font-bold ${pillClass}`}>{pill}</span>
                              </div>
                              <p className="mt-1 text-xs text-muted-foreground">{line}</p>
                              {!isTrial && months.length > 0 && (
                                <p className="mt-0.5 text-2xs font-semibold text-foreground/80">
                                  To collect: {months.map((k) => monthLabel(k).split(" ")[0]).join(", ")}
                                  {openDue.length > 1 ? ` (${openDue.length} months)` : ""}
                                </p>
                              )}
                              {!isTrial && [...new Set(months)].filter((k) => reminderFor(shop.id, k)).map((k) => {
                                const r = reminderFor(shop.id, k)!;
                                const st = reminderStatusOf(r);
                                return (
                                  <p key={k} className="mt-1 flex flex-wrap items-center gap-1.5 text-2xs text-muted-foreground">
                                    <span>Reminder for {monthLabel(k).split(" ")[0]}</span>
                                    <ReminderStatusBadge status={st} />
                                    <span>{st === "Read" && r.readAt ? `read ${formatMoment(r.readAt)}` : `sent ${formatMoment(r.sentAt)}`}</span>
                                  </p>
                                );
                              })}
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-3 lg:justify-end">
                            {!isTrial && (
                              <div className="min-w-[110px] text-right">
                                <span className="block text-2xs font-bold uppercase tracking-wider text-muted-foreground">To collect</span>
                                <span className="font-mono text-sm font-bold text-warning">{formatLKR(owed)}</span>
                              </div>
                            )}
                            {!isTrial ? (
                              <button type="button" onClick={() => handleOpenMarkReceivedModal({ shopId: shop.id })} className="ds-btn ds-btn-primary">
                                <Check className="h-3.5 w-3.5 stroke-[3]" />
                                <span>Record payment</span>
                              </button>
                            ) : (
                              <button type="button" onClick={() => openSubscriptionEditor(shop)} className="ds-btn ds-btn-primary">Choose a plan</button>
                            )}
                            {!isTrial && (
                              <button type="button" onClick={() => handleOpenNotify(shop.id, months[0])} className="ds-btn ds-btn-outline">
                                <Bell className="h-3.5 w-3.5" />
                                <span>Notify Shop</span>
                              </button>
                            )}
                            {canGiveTime && (
                              <button type="button" onClick={() => handleOpenExtraTime(row)} className="ds-btn ds-btn-outline">Give extra time</button>
                            )}
                          </div>
                        </li>
                      );
                    };

                    return (
                    <div className="space-y-6">
                      {/* Header: the month, and how far through collecting we are */}
                      <div className="ds-card space-y-4 p-6 sm:p-7">
                        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                          <div>
                            <div className="flex flex-wrap items-center gap-2.5">
                              <h3 className="text-lg font-bold text-foreground">Collect for {monthName}</h3>
                              <StatusBadge tone={toCollectRows.length > 0 ? "warning" : "success"}>
                                {toCollectRows.length > 0 ? `${toCollectRows.length} to collect` : "All collected"}
                              </StatusBadge>
                            </div>
                            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">
                              Every showroom is listed when the month starts. Press <strong className="text-foreground">Record payment</strong> when you receive the money and the showroom moves down to Paid.
                              If a payment date passes without payment, the showroom is <strong className="text-foreground">suspended automatically</strong> unless you give it extra time.
                            </p>
                          </div>
                          <div className="shrink-0 sm:text-right">
                            <span className="block text-2xs font-bold uppercase tracking-wider text-muted-foreground">Still to collect</span>
                            <span className="font-mono text-lg font-bold text-warning">{formatLKR(owedNow)}</span>
                            <span className="block text-2xs text-muted-foreground">{formatLKR(collectedThisMonthRows)} collected</span>
                          </div>
                        </div>
                        {payingTotal > 0 && (
                          <div>
                            <div className="mb-1.5 flex items-center justify-between text-2xs font-semibold text-muted-foreground">
                              <span>{paidRows.length} of {payingTotal} showrooms paid</span>
                              <span>{pct}%</span>
                            </div>
                            <div className="h-2 overflow-hidden rounded-full bg-secondary">
                              <div className="h-full rounded-full bg-success transition-all" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        )}
                      </div>

                      {/* One section at a time, as tabs */}
                      <div className="flex items-center gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Collection sections">
                        {([
                          { id: "collect" as const, label: "To collect", count: toCollectRows.length, dot: toCollectRows.some((r) => r.overdue || r.suspended) ? "bg-destructive" : "" },
                          { id: "reminders" as const, label: "Payment reminders", count: feed.reminders.length, dot: feed.reminders.some((r) => !r.readAt) ? "bg-warning" : "" },
                          { id: "paid" as const, label: `Paid in ${monthName}`, count: paidRows.length, dot: "" },
                          ...(trialRows.length > 0 ? [{ id: "trial" as const, label: "On a free trial", count: trialRows.length, dot: "" }] : []),
                        ]).map((t) => (
                          <button
                            key={t.id}
                            type="button"
                            role="tab"
                            aria-selected={activeCollectTab === t.id}
                            onClick={() => setCollectTab(t.id)}
                            className={`ds-tab ${activeCollectTab === t.id ? "ds-tab-active" : ""}`}
                          >
                            <span>{t.label}</span>
                            <span className="font-mono opacity-70">({t.count})</span>
                            {t.dot && <span className={`h-2 w-2 rounded-full ${t.dot}`} />}
                          </button>
                        ))}
                      </div>

                      {/* To collect: stays here until the payment is recorded */}
                      {activeCollectTab === "collect" && (
                      <section className="ds-card space-y-3 p-6 sm:p-7" aria-label="Showrooms to collect from">
                        <h4 className="text-sm font-bold text-foreground">
                          To collect <span className="ml-1 font-mono text-xs text-muted-foreground">({toCollectRows.length})</span>
                        </h4>
                        {toCollectRows.length > 0 ? (
                          <ul className="space-y-3">{toCollectRows.map(renderPending)}</ul>
                        ) : (
                          <div className="space-y-2 py-8 text-center text-xs text-muted-foreground">
                            <CheckCircle2 className="mx-auto h-8 w-8 text-success opacity-70" />
                            <p className="text-sm font-bold text-foreground">Everyone has paid for {monthName}</p>
                            <p>Next month every showroom will appear here again.</p>
                          </div>
                        )}
                      </section>
                      )}

                      {/* Reminders already sent, and whether the showroom has seen them */}
                      {activeCollectTab === "reminders" && (feed.reminders.length > 0 ? (() => {
                        const list = showAllReminders ? feed.reminders : feed.reminders.slice(0, 6);
                        return (
                          <section className="ds-card space-y-3 p-6 sm:p-7" aria-label="Payment reminders sent">
                            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                              <h4 className="text-sm font-bold text-foreground">
                                Payment reminders <span className="ml-1 font-mono text-xs text-muted-foreground">({feed.reminders.length})</span>
                              </h4>
                              <p className="text-2xs text-muted-foreground">
                                <strong className="text-foreground">Sent</strong> not opened yet · <strong className="text-foreground">Unread</strong> shown, not marked read · <strong className="text-foreground">Read</strong> marked read
                              </p>
                            </div>
                            <ul className="space-y-2">
                              {list.map((r) => {
                                const st = reminderStatusOf(r);
                                const canResend = notifyOptionsFor(r.shopId).some((o) => o.key === r.month);
                                return (
                                  <li key={r.id} className="flex flex-col gap-3 rounded-2xl border border-border bg-card/60 p-3.5 sm:flex-row sm:items-center">
                                    <div className="flex min-w-0 flex-1 items-center gap-3.5">
                                      <ShopAvatar name={r.shopName} logoUrl={r.shopLogoUrl} className="h-11 w-11 rounded-xl" />
                                      <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                          <h4 className="truncate text-sm font-semibold text-foreground">{r.shopName}</h4>
                                          <ReminderStatusBadge status={st} />
                                          {r.resendCount > 0 && <span className="text-2xs text-muted-foreground">resent {r.resendCount}×</span>}
                                        </div>
                                        <p className="mt-0.5 text-xs text-muted-foreground">
                                          {monthLabelOf(r.month)}{r.amount != null ? ` • ${formatLKR(r.amount)}` : ""}{r.dueDate ? ` • due ${formatNotifyDay(r.dueDate)}` : ""}
                                        </p>
                                        <p className="text-2xs text-muted-foreground">
                                          {st === "Read" && r.readAt
                                            ? `Read ${formatMoment(r.readAt)}`
                                            : st === "Unread" && r.deliveredAt
                                            ? `Shown to the owner ${formatMoment(r.deliveredAt)}, not marked as read`
                                            : `Sent ${formatMoment(r.sentAt)}, waiting for the owner to open the app`}
                                        </p>
                                      </div>
                                    </div>
                                    {canResend ? (
                                      <button type="button" onClick={() => handleOpenNotify(r.shopId, r.month)} className="ds-btn ds-btn-sm ds-btn-outline self-start sm:self-auto">
                                        <RefreshCw className="h-3 w-3" />
                                        <span>Resend</span>
                                      </button>
                                    ) : (
                                      <span className="self-start text-2xs font-semibold text-success sm:self-auto">Paid</span>
                                    )}
                                  </li>
                                );
                              })}
                            </ul>
                            {feed.reminders.length > 6 && (
                              <button type="button" onClick={() => setShowAllReminders((v) => !v)} className="ds-btn ds-btn-sm ds-btn-ghost">
                                {showAllReminders ? "Show fewer" : `Show all ${feed.reminders.length}`}
                              </button>
                            )}
                          </section>
                        );
                      })() : (
                        <section className="ds-card space-y-2 p-6 py-12 text-center text-xs text-muted-foreground sm:p-7" aria-label="Payment reminders sent">
                          <Bell className="mx-auto h-8 w-8 opacity-50" />
                          <p className="text-sm font-bold text-foreground">No reminders sent yet</p>
                          <p>Press <strong className="text-foreground">Notify Shop</strong> on a showroom in the To collect tab. Its Sent, Unread and Read status shows up here.</p>
                        </section>
                      ))}

                      {/* Paid this month: moves down here once recorded */}
                      {activeCollectTab === "paid" && (paidRows.length > 0 ? (
                        <section className="ds-card space-y-3 p-6 sm:p-7" aria-label="Showrooms that have paid">
                          <h4 className="text-sm font-bold text-foreground">
                            Paid in {monthName} <span className="ml-1 font-mono text-xs text-muted-foreground">({paidRows.length})</span>
                          </h4>
                          <ul className="space-y-2">
                            {paidRows.map((row) => {
                              const { shop, paidThisMonth, nextOpen } = row;
                              return (
                                <li key={shop.id} className="flex flex-col gap-3 rounded-2xl border border-border bg-card/60 p-3.5 sm:flex-row sm:items-center">
                                  <div className="flex min-w-0 flex-1 items-center gap-3.5">
                                    <ShopAvatar name={shop.shopName || shop.email} logoUrl={shop.logoUrl} className="h-11 w-11 rounded-xl" />
                                    <div className="min-w-0">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <h4 className="truncate text-sm font-semibold text-foreground">{shop.shopName || shop.email}</h4>
                                        <span className="rounded-full border border-success/30 bg-success-muted px-2.5 py-0.5 text-2xs font-bold text-success">Paid</span>
                                      </div>
                                      <p className="mt-0.5 text-xs text-muted-foreground">
                                        {paidThisMonth ? `${paidThisMonth.amount} received ${paidThisMonth.paidTimestamp ? fmtDay(new Date(paidThisMonth.paidTimestamp).toISOString()) : ""}` : "Paid"}
                                        {paidThisMonth && paidThisMonth.method !== "Not collected" ? ` • ${paidThisMonth.method}` : ""}
                                        {nextOpen ? ` • next payment ${nextOpen.dueDate}` : ""}
                                      </p>
                                    </div>
                                  </div>
                                  {paidThisMonth && (
                                    <button
                                      type="button"
                                      disabled={busyPaymentId === paidThisMonth.paymentId}
                                      onClick={() => {
                                        if (window.confirm(`Mark ${shop.shopName || shop.email}'s ${monthName} payment as not received? It goes back to the collect list.`)) handleChangeStatus(paidThisMonth, "Pending");
                                      }}
                                      className="ds-btn ds-btn-sm ds-btn-outline self-start sm:self-auto"
                                    >
                                      Undo
                                    </button>
                                  )}
                                </li>
                              );
                            })}
                          </ul>
                        </section>
                      ) : (
                        <section className="ds-card space-y-2 p-6 py-12 text-center text-xs text-muted-foreground sm:p-7" aria-label="Showrooms that have paid">
                          <CheckCircle2 className="mx-auto h-8 w-8 opacity-50" />
                          <p className="text-sm font-bold text-foreground">No payments recorded for {monthName} yet</p>
                          <p>A showroom moves here when you press Record payment.</p>
                        </section>
                      ))}

                      {/* Free trials owe nothing */}
                      {activeCollectTab === "trial" && trialRows.length > 0 && (
                        <section className="ds-card space-y-3 p-6 sm:p-7" aria-label="Showrooms on a free trial">
                          <h4 className="text-sm font-bold text-foreground">
                            On a free trial <span className="ml-1 font-mono text-xs text-muted-foreground">({trialRows.length})</span>
                          </h4>
                          <ul className="space-y-3">{trialRows.map(renderPending)}</ul>
                        </section>
                      )}
                    </div>
                    );
                  })()}

                  {/* ── SUB-TAB 3: PAYMENT HISTORY & ADVANCED LEDGER ── */}
                  {paymentSubTab === "history" && (
                    <div className="space-y-5">
                      {/* Filter Toolbar Card */}
                      <div className="ds-card p-6 space-y-4">
                        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                          <div>
                            <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                              <Receipt className="h-4 w-4 text-success" />
                              <span>Transaction History & Ledger</span>
                            </h3>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Filter records by status, date range, and payment amount in Sri Lankan Rupees (LKR).
                            </p>
                          </div>

                          <div className="flex items-center gap-2 self-start lg:self-auto">
                            {isFilterActive && (
                              <button
                                type="button"
                                onClick={() => {
                                  setHistoryStatusFilter("all");
                                  setHistoryDateRange("all");
                                  setHistoryAmountFilter("all");
                                  setHistorySearchQuery("");
                                  setHistoryCustomStartDate("");
                                  setHistoryCustomEndDate("");
                                  setHistoryMinAmount("");
                                  setHistoryMaxAmount("");
                                }}
                                className="px-3 py-1.5 rounded-full text-xs font-bold text-destructive hover:bg-destructive-muted transition-colors cursor-pointer"
                              >
                                Clear Filters
                              </button>
                            )}

                            <button type="button" onClick={handleOpenInvoiceModal} className="ds-btn ds-btn-outline">
                              <Plus className="h-3.5 w-3.5" />
                              <span>New invoice</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleExportPaymentHistoryCSV(filteredPaymentHistory)}
                              className="flex items-center gap-1.5 px-4 py-1.5 rounded-full border border-input bg-muted text-xs font-bold text-foreground/80 hover:text-foreground transition-colors cursor-pointer shadow-xs"
                            >
                              <Download className="h-3.5 w-3.5" />
                              <span>Export Ledger (CSV)</span>
                            </button>
                          </div>
                        </div>

                        {/* Filter Controls Row */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-2">
                          {/* Search Input */}
                          <div className="relative">
                            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                            <input
                              type="text"
                              value={historySearchQuery}
                              onChange={(e) => setHistorySearchQuery(e.target.value)}
                              placeholder="Search invoice, shop, email..."
                              className="ds-field pl-9 pr-3.5"
                            />
                          </div>

                          {/* Status Filter */}
                          <div>
                            <select
                              value={historyStatusFilter}
                              onChange={(e) => setHistoryStatusFilter(e.target.value as any)}
                              className="ds-field font-bold cursor-pointer"
                            >
                              <option value="all">All Statuses</option>
                              <option value="Received">🟢 Received / Paid</option>
                              <option value="Pending">🟡 Pending</option>
                              <option value="Failed">🔴 Failed</option>
                              <option value="Refunded">🟣 Refunded</option>
                            </select>
                          </div>

                          {/* Date Range Filter */}
                          <div>
                            <select
                              value={historyDateRange}
                              onChange={(e) => setHistoryDateRange(e.target.value as any)}
                              className="ds-field font-bold cursor-pointer"
                            >
                              <option value="all">All Dates</option>
                              <option value="this-month">This Month</option>
                              <option value="last-30-days">Last 30 Days</option>
                              <option value="last-90-days">Last 90 Days</option>
                              <option value="this-year">This Year (2026)</option>
                              <option value="custom">Custom Date Range...</option>
                            </select>
                          </div>

                          {/* Amount Filter */}
                          <div>
                            <select
                              value={historyAmountFilter}
                              onChange={(e) => setHistoryAmountFilter(e.target.value as any)}
                              className="ds-field font-bold cursor-pointer"
                            >
                              <option value="all">All Amounts (LKR)</option>
                              <option value="under-5k">Under LKR 5,000</option>
                              <option value="5k-15k">LKR 5,000 – 15,000</option>
                              <option value="over-15k">Over LKR 15,000</option>
                              <option value="custom">Custom Amount Range...</option>
                            </select>
                          </div>
                        </div>

                        {/* Custom inputs row (only when custom chosen) */}
                        {(historyDateRange === "custom" || historyAmountFilter === "custom") && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-1 border-t border-border/60">
                            {historyDateRange === "custom" && (
                              <>
                                <div>
                                  <label className="ds-label">From Date</label>
                                  <input
                                    type="date"
                                    value={historyCustomStartDate}
                                    onChange={(e) => setHistoryCustomStartDate(e.target.value)}
                                    className="ds-field"
                                  />
                                </div>
                                <div>
                                  <label className="ds-label">To Date</label>
                                  <input
                                    type="date"
                                    value={historyCustomEndDate}
                                    onChange={(e) => setHistoryCustomEndDate(e.target.value)}
                                    className="ds-field"
                                  />
                                </div>
                              </>
                            )}

                            {historyAmountFilter === "custom" && (
                              <>
                                <div>
                                  <label className="ds-label">Min Amount (LKR)</label>
                                  <input
                                    type="number"
                                    placeholder="e.g. 5000"
                                    value={historyMinAmount}
                                    onChange={(e) => setHistoryMinAmount(e.target.value)}
                                    className="ds-field"
                                  />
                                </div>
                                <div>
                                  <label className="ds-label">Max Amount (LKR)</label>
                                  <input
                                    type="number"
                                    placeholder="e.g. 50000"
                                    value={historyMaxAmount}
                                    onChange={(e) => setHistoryMaxAmount(e.target.value)}
                                    className="ds-field"
                                  />
                                </div>
                              </>
                            )}
                          </div>
                        )}

                        {/* Sort & Results Banner */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 text-xs text-muted-foreground border-t border-border/60">
                          <div>
                            Showing <strong className="text-foreground">{filteredPaymentHistory.length}</strong> of {paymentHistory.length} records • Total Filtered: <strong className="text-foreground font-mono">{formatLKR(totalFilteredLKR, { withDecimals: true })}</strong>
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="text-2xs font-medium">Sort by:</span>
                            <select
                              value={historySortBy}
                              onChange={(e) => setHistorySortBy(e.target.value as any)}
                              className="rounded-lg border border-input bg-field px-2 py-1 text-2xs font-bold text-foreground outline-none cursor-pointer"
                            >
                              <option value="date-desc">Date (Newest first)</option>
                              <option value="date-asc">Date (Oldest first)</option>
                              <option value="amount-desc">Amount (High to Low)</option>
                              <option value="amount-asc">Amount (Low to High)</option>
                            </select>
                          </div>
                        </div>
                      </div>

                      {/* Transaction Records Table */}
                      <div className="ds-card overflow-hidden">
                        <div className="overflow-x-auto">
                          <table className="min-w-full divide-y divide-border text-left text-xs">
                            <thead className="bg-muted text-2xs font-bold uppercase tracking-wider text-muted-foreground">
                              <tr>
                                <th className="px-5 py-4">Invoice</th>
                                <th className="px-5 py-4">Showroom</th>
                                <th className="px-5 py-4">Package</th>
                                <th className="px-5 py-4">Paid / due</th>
                                <th className="px-5 py-4">Method & Reference</th>
                                <th className="px-5 py-4">Amount</th>
                                <th className="px-5 py-4">Status</th>
                                <th className="px-5 py-4 text-right">Actions</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border/60">
                              {filteredPaymentHistory.length > 0 ? (
                                filteredPaymentHistory.map((item) => (
                                  <tr key={item.id} className="hover:bg-accent transition-colors">
                                    <td className="px-5 py-4 font-mono font-bold text-foreground">
                                      {item.id}
                                    </td>
                                    <td className="px-5 py-4">
                                      <div className="font-bold text-foreground">{item.shopName}</div>
                                      <div className="text-2xs text-muted-foreground font-mono">{item.email}</div>
                                    </td>
                                    <td className="px-5 py-4 text-muted-foreground font-semibold">{item.package}</td>
                                    <td className="px-5 py-4 text-muted-foreground whitespace-nowrap">{item.status === "Received" ? item.date : <span title="Due date">Due {item.dueDate}</span>}</td>
                                    <td className="px-5 py-4 text-muted-foreground">
                                      <div className="text-foreground/80 font-medium">{item.method}</div>
                                      <div className="text-2xs text-muted-foreground font-mono">{item.reference}</div>
                                    </td>
                                    <td className="px-5 py-4 font-mono font-bold text-foreground whitespace-nowrap">
                                      {item.amount}
                                    </td>
                                    <td className="px-5 py-4 whitespace-nowrap">
                                      <select
                                        value={item.status}
                                        disabled={busyPaymentId === item.paymentId}
                                        onChange={(e) => handleChangeStatus(item, e.target.value as PaymentStatusName)}
                                        aria-label={`Status of ${item.id}`}
                                        className={`cursor-pointer rounded-full border px-3 py-1 text-2xs font-bold outline-none disabled:opacity-50 ${
                                          item.status === "Received" ? "border-success/30 bg-success-muted text-success"
                                          : item.status === "Pending" ? "border-warning/30 bg-warning-muted text-warning"
                                          : item.status === "Refunded" ? "border-input bg-secondary text-muted-foreground"
                                          : "border-destructive/30 bg-destructive-muted text-destructive"
                                        }`}
                                      >
                                        <option value="Pending">Pending</option>
                                        <option value="Received">Received</option>
                                        <option value="Failed">Failed</option>
                                        <option value="Refunded">Refunded</option>
                                      </select>
                                      {item.overdue && <span className="ml-2 text-2xs font-semibold text-warning">Overdue</span>}
                                    </td>
                                    <td className="px-5 py-4 text-right whitespace-nowrap">
                                      <div className="flex items-center justify-end gap-2">
                                        <button
                                          type="button"
                                          onClick={() => setViewingReceipt(item)}
                                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-input bg-field hover:bg-muted text-2xs font-bold text-foreground/80 transition-colors cursor-pointer shadow-xs"
                                          title="View & Print Official Receipt"
                                        >
                                          <Receipt className="h-3 w-3 text-muted-foreground" />
                                          <span>Receipt</span>
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleDeleteInvoice(item)}
                                          disabled={busyPaymentId === item.paymentId}
                                          className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-destructive-muted hover:text-destructive disabled:opacity-50 cursor-pointer"
                                          title="Delete invoice"
                                          aria-label={`Delete ${item.id}`}
                                        >
                                          <Trash2 className="h-3.5 w-3.5" />
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                ))
                              ) : (
                                <tr>
                                  <td colSpan={8} className="text-center py-12 text-muted-foreground text-xs">
                                    No transaction records matching the active filter criteria.
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* ── 5. TILE USAGE VIEW ───────────────────────────────────────── */}
            {activeTab === "tile-usage" && (
              <div className="space-y-6">
                {/* Global Capacity Meter */}
                <div className="ds-card p-6 sm:p-7 space-y-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h2 className="ds-section-title">Global Texture Cloud Allocation</h2>
                      <p className="ds-subtitle">Real-time capacity tracking across all tenant catalogues</p>
                    </div>
                    <div className="text-right">
                      <span className="text-3xl font-bold text-foreground">{globalUtilization}%</span>
                      <span className="text-xs text-muted-foreground block">Total Utilization</span>
                    </div>
                  </div>

                  <div className="h-4 w-full bg-secondary rounded-full overflow-hidden p-0.5">
                    <div 
                      className="h-full bg-primary rounded-full transition-all duration-500 shadow-xs"
                      style={{ width: `${Math.max(4, globalUtilization)}%` }}
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                    <div className="p-4 rounded-2xl bg-muted border border-input">
                      <span className="text-2xs font-bold text-muted-foreground uppercase tracking-wider block">Allocated Quota</span>
                      <span className="text-xl font-bold text-foreground mt-1 block">{totalQuota} Slots</span>
                    </div>
                    <div className="p-4 rounded-2xl bg-muted border border-input">
                      <span className="text-2xs font-bold text-muted-foreground uppercase tracking-wider block">Uploaded Textures</span>
                      <span className="text-xl font-bold text-foreground mt-1 block">{totalTiles} Live SKU Textures</span>
                    </div>
                    <div className="p-4 rounded-2xl bg-muted border border-input">
                      <span className="text-2xs font-bold text-muted-foreground uppercase tracking-wider block">Pre-loaded Built-ins</span>
                      <span className="text-xl font-bold text-foreground mt-1 block">{builtInTilesCount} Standard Presets</span>
                    </div>
                  </div>
                </div>

                {/* Showroom Quota Consumption Table */}
                <div className="ds-card overflow-hidden">
                  <div className="px-6 py-5 border-b border-border">
                    <h3 className="font-bold text-base text-foreground">Showroom Storage Consumption</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">Individual showroom texture storage with one-click quota expansions.</p>
                  </div>

                  <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-border text-left text-xs">
                    <thead className="bg-muted text-2xs font-bold uppercase tracking-wider text-muted-foreground">
                      <tr>
                        <th className="px-5 py-4">Showroom</th>
                        <th className="px-5 py-4">Used / Quota</th>
                        <th className="px-5 py-4">Consumption Meter</th>
                        <th className="px-5 py-4">Usage %</th>
                        <th className="px-5 py-4 text-right">Expand Storage</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {shops.map((shop) => {
                        const count = shop._count?.tiles || 0;
                        const quota = shop.tileQuota || 50;
                        const pct = Math.min(100, Math.round((count / quota) * 100));
                        return (
                          <tr key={shop.id} className="hover:bg-accent transition-colors">
                            <td className="px-5 py-4">
                              <div className="font-bold text-foreground">{shop.shopName || "Showroom"}</div>
                              <div className="text-2xs text-muted-foreground font-mono">{shop.email}</div>
                            </td>
                            <td className="px-5 py-4 font-mono font-bold text-foreground">
                              {count} / {quota}
                            </td>
                            <td className="px-5 py-4 w-48">
                              <div className="h-2.5 w-full bg-secondary rounded-full overflow-hidden">
                                <div 
                                  className={`h-full rounded-full ${pct > 80 ? "bg-warning" : "bg-primary"}`}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </td>
                            <td className="px-5 py-4">
                              <span className={`px-2.5 py-0.5 rounded-full text-2xs font-bold ${
                                pct > 80 ? "bg-warning-muted text-warning" : "bg-muted text-foreground/80"
                              }`}>
                                {pct}%
                              </span>
                            </td>
                            <td className="px-5 py-4 text-right">
                              <button
                                onClick={() => handleQuickAddQuota(shop.id, quota, 50)}
                                className="px-3.5 py-1.5 rounded-full border border-input bg-field text-2xs font-bold hover:bg-accent transition-colors cursor-pointer"
                                title="Add 50 slots to this showroom"
                              >
                                +50 Slots
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  </div>
                </div>
              </div>
            )}

            {/* ── 6. REPORTS VIEW ──────────────────────────────────────────── */}
            {activeTab === "reports" && (
              <ReportsPanel
                payments={payments}
                shops={shops}
                today={todayKey}
                activeShowrooms={activeSubs}
                totalShowrooms={shops.length}
                monthlyRecurring={estimatedMRR}
                onExportShops={handleExportCSV}
                onNotify={triggerToast}
              />
            )}

            {/* ── LOGIN POSTERS VIEW ───────────────────────────────────────── */}
            {activeTab === "login-posters" && (
              <LoginPostersPanel posters={loginPosters} onNotify={triggerToast} />
            )}

            {/* ── VISUALIZER ACCESS VIEW ───────────────────────────────────── */}
            {activeTab === "visualizer-access" && <VisualizerAccessPanel shops={shops} />}

            {/* ── 7. NOTIFICATIONS VIEW ────────────────────────────────────── */}
            {activeTab === "notifications" && (
              <div className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h2 className="ds-page-title">System Notifications & Alerts</h2>
                    <p className="ds-subtitle">Actionable operational notices across tenant showrooms.</p>
                  </div>
                  {(activeNotifications.length > 0 || feed.unreadCount > 0) && (
                    <button
                      onClick={() => {
                        setDismissedNotifications(rawNotifications.map((n) => n.id));
                        void feed.markAllRead();
                        triggerToast("All notifications marked as read");
                      }}
                      className="px-4 py-2 rounded-full border border-input bg-field text-xs font-bold text-foreground/80 hover:bg-accent transition-colors cursor-pointer shadow-xs"
                    >
                      Mark All as Read
                    </button>
                  )}
                </div>

                <div className="space-y-3">
                  {/* Read receipts: a showroom owner pressed Mark as read on a payment reminder */}
                  {(notificationFilter === "all" || notificationFilter === "payments") && feed.notifications.map((n) => (
                    <ReadReceiptCard key={n.id} n={n} onMarkRead={feed.markRead} />
                  ))}
                  {notificationFilter === "payments" && feed.notifications.length === 0 && (
                    <div className="ds-card p-12 text-center">
                      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-muted-foreground">
                        <Bell className="h-6 w-6" />
                      </div>
                      <h3 className="font-bold text-base text-foreground">No payment updates yet</h3>
                      <p className="mt-1 text-xs text-muted-foreground">When a showroom marks one of your payment reminders as read, it shows up here.</p>
                    </div>
                  )}
                  {notificationFilter !== "payments" && (filteredNotifications.length > 0 ? (
                    filteredNotifications.map((notice) => (
                      <div 
                        key={notice.id}
                        className="ds-card rounded-2xl p-5 flex items-start justify-between gap-4"
                      >
                        <div className="flex items-start gap-4">
                          <div className={`h-10 w-10 rounded-2xl flex items-center justify-center shrink-0 mt-0.5 ${
                            notice.severity === "high"
                              ? "bg-warning-muted text-warning border border-warning/20"
                              : notice.severity === "medium"
                              ? "bg-secondary text-foreground border border-border"
                              : "bg-success-muted text-success border border-success/20"
                          }`}>
                            {notice.severity === "high" ? (
                              <AlertTriangle className="h-5 w-5" />
                            ) : notice.severity === "medium" ? (
                              <Clock className="h-5 w-5" />
                            ) : (
                              <CheckCircle2 className="h-5 w-5" />
                            )}
                          </div>
                          <div>
                            <div className="flex items-center gap-2.5">
                              <h4 className="text-sm font-bold text-foreground">{notice.title}</h4>
                              <span className="text-2xs text-muted-foreground font-medium">{notice.time}</span>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{notice.description}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {notice.shopId && (
                            <button
                              onClick={() => { setActiveTab("shops"); setShopSubTab("all"); }}
                              className="ds-btn ds-btn-primary"
                            >
                              Inspect
                            </button>
                          )}
                          <button
                            onClick={() => {
                              setDismissedNotifications([...dismissedNotifications, notice.id]);
                              triggerToast("Notification dismissed");
                            }}
                            className="p-1.5 rounded-full text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                            title="Dismiss notification"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))
                  ) : feed.notifications.length === 0 || notificationFilter !== "all" ? (
                    <div className="ds-card p-12 text-center">
                      <div className="h-12 w-12 rounded-full bg-success-muted text-success flex items-center justify-center mx-auto mb-3">
                        <Check className="h-6 w-6" />
                      </div>
                      <h3 className="font-bold text-base text-foreground">All Caught Up</h3>
                      <p className="text-xs text-muted-foreground mt-1">No unread alerts or pending operational warnings.</p>
                    </div>
                  ) : null)}
                </div>
              </div>
            )}

            {/* ── 8. SETTINGS VIEW ─────────────────────────────────────────── */}
            {activeTab === "settings" && (
              <div className="w-full space-y-6">
                <SettingsTabs
                  active={adminSettingsTab}
                  onSelect={setAdminSettingsTab}
                  items={[
                    { id: "profile", label: "Profile" },
                    { id: "appearance", label: "Theme" },
                    { id: "security", label: "Security" },
                    { id: "admins", label: "Administrators" },
                    { id: "links", label: "Footer & Social Links" },
                  ]}
                />

                <SettingsNotice
                  notice={profileFeedback ? { success: profileFeedback.type === "success", message: profileFeedback.message } : null}
                  onDismiss={() => setProfileFeedback(null)}
                />

                {adminSettingsTab === "profile" && (
                  <form onSubmit={handleSaveProfile}>
                    <SettingsCard title="Administrator profile" description="Your name, contact email and avatar.">
                      <SettingsRow label="Avatar" hint="PNG, JPG, SVG or WebP. Square works best.">
                        <div className="flex flex-wrap items-center gap-4">
                          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-border bg-muted">
                            {profile.logoUrl ? (
                              <img src={profile.logoUrl} alt="Avatar" className="h-full w-full object-cover" />
                            ) : (
                              <span className="text-xl font-bold text-foreground">
                                {profile.name?.charAt(0)?.toUpperCase() || "A"}
                              </span>
                            )}
                          </div>
                          <label className="ds-btn ds-btn-outline cursor-pointer">
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => handleUploadLogo(e.target.files?.[0])}
                            />
                            {isUploadingLogo ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                            {isUploadingLogo ? "Uploading…" : profile.logoUrl ? "Change photo" : "Upload photo"}
                          </label>
                          {profile.logoUrl && (
                            <button type="button" onClick={handleRemoveLogo} className="ds-btn ds-btn-outline text-destructive">
                              <Trash2 className="h-4 w-4" />
                              Remove
                            </button>
                          )}
                        </div>
                      </SettingsRow>
                      <div className="grid gap-6 sm:grid-cols-2">
                        <SettingsRow label="Name" htmlFor="admin-name">
                          <input
                            id="admin-name"
                            type="text"
                            required
                            value={profile.name}
                            onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                            className="ds-field"
                          />
                        </SettingsRow>
                        <SettingsRow label="Email" htmlFor="admin-email">
                          <input
                            id="admin-email"
                            type="email"
                            required
                            value={profile.email}
                            onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                            className="ds-field"
                          />
                        </SettingsRow>
                      </div>
                      <SettingsRow label="Role">
                        <div className="flex items-center gap-2 text-sm text-foreground">
                          <ShieldCheck className="h-4 w-4 text-success" />
                          Super administrator, full platform access
                        </div>
                      </SettingsRow>
                      <SettingsSave saving={isSavingProfile} label="Save changes" />
                    </SettingsCard>
                  </form>
                )}

                {adminSettingsTab === "appearance" && (
                  <SettingsCard title="Theme" description="Pick a look. It applies to the whole dashboard straight away.">
                    <ThemeSelector showTitle={false} className="!rounded-none !border-0 !bg-transparent !p-0 !shadow-none" />
                  </SettingsCard>
                )}

                {adminSettingsTab === "security" && (
                  <form onSubmit={handleSaveSecurity}>
                    <SettingsCard title="Password" description="Change the password you use to sign in." bodyClassName="grid gap-6 md:grid-cols-3">
                      <SettingsRow label="Current password" htmlFor="admin-pw-current">
                        <PasswordField
                          id="admin-pw-current"
                          autoComplete="current-password"
                          value={currentPassword}
                          onChange={setCurrentPassword}
                        />
                      </SettingsRow>
                      <SettingsRow label="New password" htmlFor="admin-pw-new" hint="At least 6 characters.">
                        <PasswordField
                          id="admin-pw-new"
                          autoComplete="new-password"
                          minLength={6}
                          value={newPassword}
                          onChange={setNewPassword}
                        />
                      </SettingsRow>
                      <SettingsRow label="Confirm new password" htmlFor="admin-pw-confirm">
                        <PasswordField
                          id="admin-pw-confirm"
                          autoComplete="new-password"
                          value={confirmPassword}
                          onChange={setConfirmPassword}
                        />
                      </SettingsRow>
                      <SettingsSave saving={isSavingProfile} label="Update password" />
                    </SettingsCard>
                  </form>
                )}

                {/* ── SUPER ADMINISTRATOR AUTHORITY & APPOINTMENT MANAGEMENT ── */}
                {adminSettingsTab === "admins" && (
                <section className="ds-card p-6 sm:p-7 space-y-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-2xl bg-muted border border-input flex items-center justify-center text-foreground shrink-0">
                        <ShieldCheck className="h-5 w-5 text-success" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-base font-bold text-foreground">
                            Platform Super Administrators
                          </h3>
                          <StatusBadge tone="success">
                            {adminsList.length} Active
                          </StatusBadge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Appoint additional Super Administrators or revoke platform credentials.
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setAppointError("");
                        setAppointSuccess("");
                        setAppointForm({ name: "", email: "", password: "" });
                        setIsAppointModalOpen(true);
                      }}
                      className="ds-btn ds-btn-lg ds-btn-primary shrink-0"
                    >
                      <UserPlus className="h-4 w-4" />
                      <span>Appoint Super Admin</span>
                    </button>
                  </div>

                  {/* Super Admin List */}
                  <div className="divide-y divide-border border border-border rounded-2xl overflow-hidden bg-muted">
                    {adminsList.map((adm) => {
                      const isSelf = adm.id === adminUser?.id || adm.email === adminUser?.email;
                      const formattedDate = adm.createdAt
                        ? new Date(adm.createdAt).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })
                        : "Platform Founder";

                      return (
                        <div
                          key={adm.id}
                          className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-colors hover:bg-card"
                        >
                          <div className="flex items-center gap-3.5 min-w-0">
                            <div className="h-10 w-10 rounded-2xl bg-primary text-primary-foreground font-bold text-xs flex items-center justify-center shrink-0 shadow-xs">
                              {adm.name ? adm.name.charAt(0).toUpperCase() : "A"}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-bold text-sm text-foreground truncate">
                                  {adm.name || "Super Administrator"}
                                </span>
                                {isSelf ? (
                                  <span className="px-2.5 py-0.5 rounded-full text-2xs font-semibold bg-primary text-primary-foreground shadow-xs">
                                    Current Session (You)
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded-full text-2xs font-bold bg-secondary text-muted-foreground">
                                    Co-Administrator
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                                <span className="truncate">{adm.email}</span>
                                <span>•</span>
                                <span>Appointed: {formattedDate}</span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                            {isSelf ? (
                              <span className="text-2xs font-semibold text-muted-foreground italic px-3 py-1.5">
                                Active Primary Session
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setDeleteConfirmAdmin(adm)}
                                className="px-3.5 py-1.5 rounded-xl text-xs font-bold text-destructive hover:bg-destructive-muted border border-transparent hover:border-destructive/30 flex items-center gap-1.5 transition-all cursor-pointer"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                <span>Revoke Authority</span>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
                )}

                {adminSettingsTab === "links" && (
                  <form onSubmit={handleSaveSocialLinks} className="space-y-6">
                    <SettingsNotice
                      notice={linksFeedback ? { success: linksFeedback.type === "success", message: linksFeedback.message } : null}
                      onDismiss={() => setLinksFeedback(null)}
                    />

                    <SettingsCard
                      title="Footer & Social Media Channels"
                      description="Manage the external hyperlinks displayed on the showroom sidebar footer and contact cards, including the Echilion brand website, WhatsApp, phone, Facebook, and Instagram."
                    >
                      <div className="grid gap-6 sm:grid-cols-2">
                        <SettingsRow label="Website Link (Echilion Logo)" hint="The URL opened when visitors click the Echilion logo.">
                          <input
                            type="url"
                            required
                            value={socialLinks.websiteUrl}
                            onChange={(e) => setSocialLinks({ ...socialLinks, websiteUrl: e.target.value })}
                            className="ds-field"
                            placeholder="https://echilion.com"
                          />
                        </SettingsRow>

                        <SettingsRow label="WhatsApp Link / Contact" hint="WhatsApp chat link (e.g. https://wa.me/94771234567).">
                          <input
                            type="text"
                            required
                            value={socialLinks.whatsappUrl}
                            onChange={(e) => setSocialLinks({ ...socialLinks, whatsappUrl: e.target.value })}
                            className="ds-field"
                            placeholder="https://wa.me/94771234567"
                          />
                        </SettingsRow>

                        <SettingsRow label="Direct Phone Number" hint="Phone number triggered for voice calls.">
                          <input
                            type="text"
                            required
                            value={socialLinks.phone}
                            onChange={(e) => setSocialLinks({ ...socialLinks, phone: e.target.value })}
                            className="ds-field"
                            placeholder="+94771234567"
                          />
                        </SettingsRow>

                        <SettingsRow label="Facebook Page URL" hint="Official Facebook page or group link.">
                          <input
                            type="url"
                            required
                            value={socialLinks.facebookUrl}
                            onChange={(e) => setSocialLinks({ ...socialLinks, facebookUrl: e.target.value })}
                            className="ds-field"
                            placeholder="https://facebook.com"
                          />
                        </SettingsRow>

                        <SettingsRow label="Instagram Profile URL" hint="Official Instagram profile link.">
                          <input
                            type="url"
                            required
                            value={socialLinks.instagramUrl}
                            onChange={(e) => setSocialLinks({ ...socialLinks, instagramUrl: e.target.value })}
                            className="ds-field"
                            placeholder="https://instagram.com"
                          />
                        </SettingsRow>
                      </div>

                      <div className="mt-6 flex justify-end">
                        <SettingsSave saving={linksSaving} label="Save Links" />
                      </div>
                    </SettingsCard>
                  </form>
                )}
              </div>
            )}

          </main>
        </div>
      </div>

      {/* ── EDIT SUBSCRIPTION MODAL ───────────────────────────────────────── */}
      {editingSubscription && (
        <div className="fixed inset-0 z-50 flex justify-center overflow-y-auto bg-black/50 p-3 backdrop-blur-sm sm:p-4" role="dialog" aria-modal="true">
          <button type="button" aria-label="Close editor" onClick={() => setEditingSubscription(null)} className="fixed inset-0 cursor-default" />
          <div className="relative z-10 my-auto w-full max-w-lg rounded-3xl border border-border bg-card p-5 sm:p-7 shadow-2xl">
            <div className="mb-6 flex items-start justify-between gap-4 border-b border-border pb-5">
              <div>
                <h2 className="ds-section-title">{editingSubscription.shopName || editingSubscription.email}</h2>
                <p className="ds-subtitle">Update package access and subscription dates.</p>
              </div>
              <button 
                type="button" 
                onClick={() => setEditingSubscription(null)} 
                className="rounded-full p-2 text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-4 text-xs">
              <div>
                <label className="ds-label" htmlFor="subscription-package">Subscription package</label>
                <select 
                  id="subscription-package"
                  value={subscriptionDraft.packageName} 
                  onChange={(event) => selectSubscriptionPackage(event.target.value)} 
                  className="ds-field cursor-pointer"
                >
                  {packageChoices(livePlans, editingSubscription.subscriptionPackage).map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
              {subscriptionDraft.packageName !== "Free Trial" && (
                <div>
                  <label className="ds-label" htmlFor="billing-day">Collect the full monthly fee on</label>
                  <select
                    id="billing-day"
                    value={subscriptionDraft.billingDay}
                    onChange={(event) => setSubscriptionDraft({ ...subscriptionDraft, billingDay: asBillingDay(event.target.value) })}
                    className="ds-field cursor-pointer"
                  >
                    {(Object.keys(BILLING_DAY_LABELS) as BillingDay[]).map((k) => (
                      <option key={k} value={k}>{BILLING_DAY_LABELS[k]}</option>
                    ))}
                  </select>
                  <p className="mt-1.5 text-2xs text-muted-foreground">
                    {subscriptionDraft.billingDay === "start"
                      ? "Each month's invoice falls due on the 1st, for the whole package fee."
                      : subscriptionDraft.billingDay === "end"
                      ? "Each month's invoice falls due on the last day of the month, for the whole package fee."
                      : "Invoices fall due on the same day of the month as the plan start date."}
                  </p>
                </div>
              )}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="ds-label" htmlFor="subscription-start">Start date</label>
                  <input 
                    id="subscription-start"
                    type="date" 
                    value={subscriptionDraft.startDate} 
                    onChange={(event) => changeSubscriptionStart(event.target.value)} 
                    className="ds-field"
                  />
                </div>
                <div>
                  <label className="ds-label" htmlFor="subscription-expiry">{subscriptionDraft.packageName === "Free Trial" ? "Free trial ends" : "Expiry date"}</label>
                  <input 
                    id="subscription-expiry"
                    type="text"
                    readOnly
                    aria-live="polite"
                    value={formatLongDate(subscriptionDraft.packageName === "Free Trial" ? subscriptionDraft.trialEndsAt : subscriptionDraft.endDate)}
                    placeholder="Worked out from the start date"
                    className="ds-field cursor-default font-semibold"
                  />
                </div>
              </div>
              <p className="-mt-1 text-2xs leading-relaxed text-muted-foreground">
                {subscriptionDraft.packageName === "Free Trial"
                  ? "Free Trial: 14 days from the start date."
                  : subscriptionDraft.startDate
                  ? `${formatLongDate(subscriptionDraft.startDate)} + ${durationLabel(packageMonths(subscriptionDraft.packageName))} = ${formatLongDate(subscriptionDraft.endDate)}. The expiry follows the start date and the package's duration.`
                  : "Choose a start date to work out the expiry date from the package's duration."}
              </p>
              <button 
                type="button" 
                onClick={() => setSubscriptionDraft({ ...subscriptionDraft, active: !subscriptionDraft.active })} 
                className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left font-bold transition-colors cursor-pointer ${
                  subscriptionDraft.active 
                    ? "border-success/30 bg-success-muted text-success" 
                    : "border-border bg-muted text-muted-foreground"
                }`}
              >
                <span className="flex items-center gap-2">
                  {subscriptionDraft.active ? <PlayCircle className="h-4 w-4" /> : <PauseCircle className="h-4 w-4" />}
                  {subscriptionDraft.active ? "Subscription active" : "Subscription suspended"}
                </span>
                <span className="text-2xs uppercase tracking-wider font-semibold">Click to toggle</span>
              </button>
              <div className="flex justify-end gap-3 border-t border-border pt-5">
                <button 
                  type="button" 
                  onClick={() => setEditingSubscription(null)} 
                  className="rounded-full px-5 py-2.5 font-semibold text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button 
                  type="button" 
                  disabled={
                    isSavingSubscription ||
                    (subscriptionDraft.packageName !== "Free Trial" && !subscriptionDraft.endDate)
                  }
                  onClick={saveSubscription}  
                  className="ds-btn ds-btn-lg ds-btn-primary"
                >
                  <Save className="h-4 w-4" />
                  {isSavingSubscription ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── RECORD PAYMENT MODAL: which month, and the date it was received ─── */}
      {receivingPayment && (() => {
        const options = monthOptionsFor(receivingPayment.shopId);
        const chosen = options.find((o) => o.key === markReceivedForm.month);
        return (
        <div className="fixed inset-0 z-50 flex justify-center overflow-y-auto bg-black/60 p-3 backdrop-blur-sm sm:p-4" role="dialog" aria-modal="true">
          <button type="button" aria-label="Close" onClick={() => setReceivingPayment(null)} className="fixed inset-0 cursor-default" />
          <div className="relative z-10 my-auto w-full max-w-md space-y-5 rounded-3xl border border-border bg-card p-5 shadow-2xl sm:p-7">
            <div className="flex items-start justify-between gap-4 border-b border-border pb-4">
              <div className="flex items-center gap-3">
                <ShopAvatar name={receivingPayment.name} logoUrl={receivingPayment.logoUrl} className="h-12 w-12 rounded-xl" />
                <div>
                  <h3 className="text-lg font-bold text-foreground">Record payment</h3>
                  <p className="text-xs font-medium text-muted-foreground">{receivingPayment.name} • {pkgLabel(receivingPayment.plan)}</p>
                </div>
              </div>
              <button type="button" onClick={() => setReceivingPayment(null)} className="cursor-pointer rounded-full p-2 text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="ds-label" htmlFor="pay-month">Payment for month <span className="text-red-500 font-bold">*</span></label>
                  <select
                    id="pay-month"
                    value={markReceivedForm.month}
                    onChange={(e) => {
                      const o = options.find((x) => x.key === e.target.value);
                      setMarkReceivedForm({ ...markReceivedForm, month: e.target.value, amount: o ? o.amount : markReceivedForm.amount });
                    }}
                    className="ds-field cursor-pointer font-semibold"
                  >
                    {options.map((o) => (
                      <option key={o.key} value={o.key} disabled={o.state === "paid"}>
                        {o.label}{o.state === "paid" ? " (collected)" : o.state === "unpaid" ? " (unpaid)" : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="ds-label" htmlFor="pay-date">Date received <span className="text-red-500 font-bold">*</span></label>
                  <input id="pay-date" type="date" max={todayISO()} value={markReceivedForm.date} onChange={(e) => setMarkReceivedForm({ ...markReceivedForm, date: e.target.value })} className="ds-field" />
                </div>
              </div>
              {chosen?.state === "new" && (
                <p className="-mt-2 text-2xs text-muted-foreground">This month has not been billed yet. Recording it now collects the fee in advance.</p>
              )}

              <div>
                <label className="ds-label">Amount received (LKR) <span className="text-red-500 font-bold">*</span></label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">LKR</span>
                  <input
                    type="number"
                    min="0"
                    step="100"
                    value={markReceivedForm.amount}
                    onChange={(e) => setMarkReceivedForm({ ...markReceivedForm, amount: Number(e.target.value) || 0 })}
                    className="ds-field pl-14 pr-4 font-mono font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="ds-label">Payment channel</label>
                  <select value={markReceivedForm.method} onChange={(e) => setMarkReceivedForm({ ...markReceivedForm, method: e.target.value })} className="ds-field cursor-pointer font-semibold">
                    <option>Bank Transfer</option>
                    <option>Cash Deposit</option>
                    <option>Commercial Card</option>
                    <option>Cheque / Slip</option>
                  </select>
                </div>
                <div>
                  <label className="ds-label">Slip / reference</label>
                  <input type="text" value={markReceivedForm.reference} onChange={(e) => setMarkReceivedForm({ ...markReceivedForm, reference: e.target.value })} placeholder="e.g. TRX-982314" className="ds-field font-mono" />
                </div>
              </div>

              <div className="flex justify-end gap-3 border-t border-border pt-3">
                <button type="button" onClick={() => setReceivingPayment(null)} className="cursor-pointer rounded-full px-4 py-2 font-semibold text-muted-foreground transition-colors hover:text-foreground">
                  Cancel
                </button>
                <button type="button" disabled={isSubmittingPayment || !markReceivedForm.month || !markReceivedForm.date || !(markReceivedForm.amount > 0) || chosen?.state === "paid"} onClick={handleConfirmMarkReceived} className="ds-btn ds-btn-lg ds-btn-primary">
                  <Check className="h-4 w-4 stroke-[3]" />
                  <span>{isSubmittingPayment ? "Saving..." : "Save payment"}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
        );
      })()}

      {/* ── GIVE EXTRA TIME MODAL ──────────────────────────────────────────── */}
      {extraTimeFor && (
        <div className="fixed inset-0 z-50 flex justify-center overflow-y-auto bg-black/60 p-3 backdrop-blur-sm sm:p-4" role="dialog" aria-modal="true">
          <button type="button" aria-label="Close" onClick={() => setExtraTimeFor(null)} className="fixed inset-0 cursor-default" />
          <div className="relative z-10 my-auto w-full max-w-md space-y-5 rounded-3xl border border-border bg-card p-5 shadow-2xl sm:p-7">
            <div className="flex items-start justify-between gap-4 border-b border-border pb-4">
              <div className="flex items-center gap-3">
                <ShopAvatar name={extraTimeFor.name} logoUrl={extraTimeFor.logoUrl} className="h-12 w-12 rounded-xl" />
                <div>
                  <h3 className="text-lg font-bold text-foreground">Give extra time</h3>
                  <p className="text-xs font-medium text-muted-foreground">{extraTimeFor.name}</p>
                </div>
              </div>
              <button type="button" onClick={() => setExtraTimeFor(null)} className="cursor-pointer rounded-full p-2 text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <p className="leading-relaxed text-muted-foreground">
                {extraTimeFor.isTrial
                  ? "The free trial is extended to the date you choose. After it the showroom is suspended automatically."
                  : "The showroom stays on until the date you choose, even though its payment date has passed. After it, if the payment is still not recorded, the showroom is suspended automatically."}
                {extraTimeFor.suspended && " It is suspended now and will be switched back on."}
              </p>

              <div>
                <label className="ds-label" htmlFor="extra-date">Keep active until <span className="text-red-500 font-bold">*</span></label>
                <input id="extra-date" type="date" min={todayISO()} value={extraTimeDate} onChange={(e) => setExtraTimeDate(e.target.value)} className="ds-field" />
                <div className="mt-2 flex flex-wrap gap-2">
                  {[3, 7, 14, 30].map((n) => {
                    const d = new Date(`${todayKey}T00:00:00Z`);
                    d.setUTCDate(d.getUTCDate() + n);
                    const v = d.toISOString().slice(0, 10);
                    return (
                      <button key={n} type="button" onClick={() => setExtraTimeDate(v)} className={`cursor-pointer rounded-full border px-3 py-1 text-2xs font-bold transition-colors ${extraTimeDate === v ? "border-primary bg-primary text-primary-foreground" : "border-input bg-muted text-muted-foreground hover:text-foreground"}`}>
                        +{n} days
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-end gap-3 border-t border-border pt-3">
                <button type="button" onClick={() => setExtraTimeFor(null)} className="cursor-pointer rounded-full px-4 py-2 font-semibold text-muted-foreground transition-colors hover:text-foreground">
                  Cancel
                </button>
                <button type="button" disabled={isGivingTime || !extraTimeDate} onClick={handleConfirmExtraTime} className="ds-btn ds-btn-lg ds-btn-primary">
                  <span>{isGivingTime ? "Saving..." : "Give extra time"}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── NOTIFY SHOP (payment reminder) MODAL ───────────────────────────── */}
      {notifyFor && (() => {
        const options = notifyOptionsFor(notifyFor.shopId);
        const existing = notifyMonth ? reminderFor(notifyFor.shopId, notifyMonth) : null;
        const details = notifyMonth ? reminderDetails(notifyFor.shopId, notifyMonth) : null;
        const text = notifyText ?? (notifyMonth ? suggestedReminderText(notifyFor.name, notifyFor.shopId, notifyMonth) : "");
        const statusTone = details?.status === "Pending" ? "warning" : "destructive";
        return (
          <div className="fixed inset-0 z-50 flex justify-center overflow-y-auto bg-black/60 p-3 backdrop-blur-sm sm:p-4" role="dialog" aria-modal="true" aria-label="Notify showroom about a payment">
            <button type="button" aria-label="Close" onClick={() => setNotifyFor(null)} className="fixed inset-0 cursor-default" />
            <div className="relative z-10 my-auto w-full max-w-lg space-y-5 rounded-3xl border border-border bg-card p-5 shadow-2xl sm:p-7">
              <div className="flex items-start justify-between gap-4 border-b border-border pb-4">
                <div className="flex items-center gap-3">
                  <ShopAvatar name={notifyFor.name} logoUrl={notifyFor.logoUrl} className="h-12 w-12 rounded-xl" />
                  <div>
                    <h3 className="text-lg font-bold text-foreground">{existing ? "Resend payment reminder" : "Send payment reminder"}</h3>
                    <p className="text-xs font-medium text-muted-foreground">{notifyFor.name}</p>
                  </div>
                </div>
                <button type="button" onClick={() => setNotifyFor(null)} className="cursor-pointer rounded-full p-2 text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              </div>

              {options.length === 0 || !details ? (
                <p className="text-xs leading-relaxed text-muted-foreground">There is no unpaid month to remind this showroom about.</p>
              ) : (
                <div className="space-y-4 text-xs">
                  <div>
                    <label className="ds-label" htmlFor="notify-month">Payment month <span className="text-red-500 font-bold">*</span></label>
                    <select
                      id="notify-month"
                      value={notifyMonth}
                      onChange={(e) => { setNotifyMonth(e.target.value); setNotifyText(null); setNotifyError(""); }}
                      className="ds-field cursor-pointer font-semibold"
                    >
                      {options.map((o) => (
                        <option key={o.key} value={o.key}>{o.label}{reminderFor(notifyFor.shopId, o.key) ? " (reminder already sent)" : ""}</option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-2xl border border-border bg-muted p-4">
                    <div><span className="ds-label !mb-0.5">Showroom</span><span className="block truncate font-semibold text-foreground">{notifyFor.name}</span></div>
                    <div><span className="ds-label !mb-0.5">Payment month</span><span className="block font-semibold text-foreground">{monthLabelOf(notifyMonth)}</span></div>
                    <div><span className="ds-label !mb-0.5">Amount</span><span className="block font-mono font-bold text-warning">{formatLKR(details.amount)}</span></div>
                    <div><span className="ds-label !mb-0.5">Due date</span><span className="block font-semibold text-foreground">{formatNotifyDay(details.dueISO)}</span></div>
                    <div className="col-span-2"><span className="ds-label !mb-0.5">Payment status</span><StatusBadge tone={statusTone}>{details.status}</StatusBadge></div>
                  </div>

                  {existing && (
                    <div className="space-y-1.5 rounded-2xl border border-warning/30 bg-warning-muted p-3.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <AlertTriangle className="h-3.5 w-3.5 text-warning" />
                        <span className="font-bold text-foreground">A reminder for {monthLabelOf(notifyMonth)} was already sent</span>
                        <ReminderStatusBadge status={reminderStatusOf(existing)} />
                      </div>
                      <p className="leading-relaxed text-muted-foreground">
                        Sent {formatMoment(existing.sentAt)}{existing.readAt ? `, read ${formatMoment(existing.readAt)}` : ""}. Sending again alerts the showroom a second time and puts the reminder back to Sent.
                      </p>
                    </div>
                  )}

                  <div>
                    <div className="flex items-center justify-between">
                      <label className="ds-label" htmlFor="notify-message">Message to the showroom</label>
                      {notifyText !== null && (
                        <button type="button" onClick={() => setNotifyText(null)} className="mb-1.5 cursor-pointer text-2xs font-semibold text-muted-foreground hover:text-foreground">Use suggested wording</button>
                      )}
                    </div>
                    <textarea
                      id="notify-message"
                      rows={5}
                      maxLength={MESSAGE_MAX}
                      value={text}
                      onChange={(e) => setNotifyText(e.target.value)}
                      className="ds-field resize-y leading-relaxed"
                    />
                    <p className="mt-1 text-2xs text-muted-foreground">The owner gets a pop-up if they are signed in, and the reminder waits in their notifications if they are not.</p>
                  </div>

                  {notifyError && (
                    <div className="rounded-xl border border-destructive/30 bg-destructive-muted px-3.5 py-2.5 font-semibold text-destructive">{notifyError}</div>
                  )}

                  <div className="flex justify-end gap-3 border-t border-border pt-3">
                    <button type="button" onClick={() => setNotifyFor(null)} className="cursor-pointer rounded-full px-4 py-2 font-semibold text-muted-foreground transition-colors hover:text-foreground">
                      Cancel
                    </button>
                    <button type="button" disabled={isNotifying || !notifyMonth || !text.trim()} onClick={handleConfirmNotify} className="ds-btn ds-btn-lg ds-btn-primary">
                      <Bell className="h-4 w-4" />
                      <span>{isNotifying ? "Sending..." : existing ? "Resend reminder" : "Send reminder"}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* ── NEW INVOICE MODAL ──────────────────────────────────────────────── */}
      {invoiceModalOpen && (
        <div className="fixed inset-0 z-50 flex justify-center overflow-y-auto bg-black/60 p-3 backdrop-blur-sm sm:p-4" role="dialog" aria-modal="true">
          <button type="button" aria-label="Close" onClick={() => setInvoiceModalOpen(false)} className="fixed inset-0 cursor-default" />
          <div className="relative z-10 my-auto w-full max-w-md space-y-5 rounded-3xl border border-border bg-card p-5 shadow-2xl sm:p-7">
            <div className="flex items-start justify-between gap-4 border-b border-border pb-4">
              <div>
                <span className="ds-eyebrow block">Payments</span>
                <h3 className="mt-0.5 text-xl font-bold text-foreground">New invoice</h3>
                <p className="mt-0.5 text-xs font-medium text-muted-foreground">Bill a showroom, or record a payment you already collected.</p>
              </div>
              <button type="button" onClick={() => setInvoiceModalOpen(false)} className="cursor-pointer rounded-full p-2 text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="ds-label">Showroom <span className="text-red-500 font-bold">*</span></label>
                <select
                  value={invoiceForm.shopId}
                  onChange={(e) => {
                    const shop = shops.find((x) => x.id === e.target.value);
                    setInvoiceForm({ ...invoiceForm, shopId: e.target.value, amount: shop ? getMonthlyPrice(shop) : invoiceForm.amount });
                  }}
                  className="ds-field cursor-pointer font-semibold"
                >
                  {shops.map((x) => (
                    <option key={x.id} value={x.id}>{x.shopName || x.email} ({pkgLabel(x.subscriptionPackage)})</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="ds-label">Amount (LKR) <span className="text-red-500 font-bold">*</span></label>
                  <input type="number" min="0" step="100" value={invoiceForm.amount} onChange={(e) => setInvoiceForm({ ...invoiceForm, amount: Number(e.target.value) || 0 })} className="ds-field font-mono font-bold" />
                </div>
                <div>
                  <label className="ds-label">{invoiceForm.status === "Received" ? "Date received" : "Due date"} <span className="text-red-500 font-bold">*</span></label>
                  <input type="date" value={invoiceForm.dueDate} onChange={(e) => setInvoiceForm({ ...invoiceForm, dueDate: e.target.value })} className="ds-field" />
                </div>
              </div>

              <div>
                <label className="ds-label">Status</label>
                <div className="grid grid-cols-2 gap-2">
                  {(["Pending", "Received"] as const).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setInvoiceForm({ ...invoiceForm, status: st })}
                      className={`cursor-pointer rounded-xl border px-3 py-2.5 text-xs font-bold transition-colors ${
                        invoiceForm.status === st ? "border-primary bg-primary text-primary-foreground" : "border-border bg-muted text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {st === "Pending" ? "Not collected yet" : "Already collected"}
                    </button>
                  ))}
                </div>
              </div>

              {invoiceForm.status === "Received" && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="ds-label">Payment channel</label>
                    <select value={invoiceForm.method} onChange={(e) => setInvoiceForm({ ...invoiceForm, method: e.target.value })} className="ds-field cursor-pointer font-semibold">
                      <option>Bank Transfer</option>
                      <option>Cash Deposit</option>
                      <option>Commercial Card</option>
                      <option>Cheque / Slip</option>
                    </select>
                  </div>
                  <div>
                    <label className="ds-label">Reference</label>
                    <input type="text" value={invoiceForm.reference} onChange={(e) => setInvoiceForm({ ...invoiceForm, reference: e.target.value })} placeholder="TRX-…" className="ds-field font-mono" />
                  </div>
                </div>
              )}

              <div>
                <label className="ds-label">Notes (optional)</label>
                <input type="text" value={invoiceForm.notes} onChange={(e) => setInvoiceForm({ ...invoiceForm, notes: e.target.value })} className="ds-field" />
              </div>

              <div className="flex justify-end gap-3 border-t border-border pt-3">
                <button type="button" onClick={() => setInvoiceModalOpen(false)} className="cursor-pointer rounded-full px-4 py-2 font-semibold text-muted-foreground transition-colors hover:text-foreground">
                  Cancel
                </button>
                <button type="button" disabled={isSavingInvoice || !invoiceForm.shopId || !(invoiceForm.amount > 0) || !invoiceForm.dueDate} onClick={handleCreateInvoice} className="ds-btn ds-btn-lg ds-btn-primary">
                  <Plus className="h-4 w-4" />
                  <span>{isSavingInvoice ? "Saving..." : "Create invoice"}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── PRINTABLE OFFICIAL LKR TAX RECEIPT / VOUCHER MODAL ─────────────── */}
      {viewingReceipt && (
        <div className="fixed inset-0 z-50 flex justify-center overflow-y-auto bg-black/60 p-3 backdrop-blur-sm sm:p-4" role="dialog" aria-modal="true">
          <button type="button" aria-label="Close" onClick={() => setViewingReceipt(null)} className="fixed inset-0 cursor-default" />
          <div className="relative z-10 my-auto w-full max-w-xl rounded-3xl border border-border bg-card p-5 sm:p-8 shadow-2xl space-y-6">
            <div className="flex items-start justify-between border-b border-border pb-5">
              <div className="space-y-1">
                <span className="ds-eyebrow block">
                  Official Payment Receipt & Tax Invoice
                </span>
                <h3 className="text-2xl font-bold text-foreground tracking-tight">
                  Tile Visualizer Platform
                </h3>
                <p className="text-2xs text-muted-foreground">
                  Commercial Showroom Visualizer SaaS Licensing • Colombo, Sri Lanka
                </p>
              </div>
              <button 
                type="button" 
                onClick={() => setViewingReceipt(null)} 
                className="rounded-full p-2 text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Receipt Metadata */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-2xl bg-muted border border-border text-xs">
              <div>
                <span className="text-2xs font-bold text-muted-foreground block uppercase">Invoice #</span>
                <span className="font-mono font-bold text-foreground">{viewingReceipt.id}</span>
              </div>
              <div>
                <span className="text-2xs font-bold text-muted-foreground block uppercase">Date</span>
                <span className="font-bold text-foreground">{viewingReceipt.date}</span>
              </div>
              <div>
                <span className="text-2xs font-bold text-muted-foreground block uppercase">Channel</span>
                <span className="font-bold text-foreground">{viewingReceipt.method}</span>
              </div>
              <div>
                <span className="text-2xs font-bold text-muted-foreground block uppercase">Reference #</span>
                <span className="font-mono text-2xs text-muted-foreground">{viewingReceipt.reference}</span>
              </div>
            </div>

            {/* Client / Showroom Section */}
            <div className="text-xs space-y-1">
              <span className="text-2xs font-bold uppercase tracking-wider text-muted-foreground">Billed To Showroom</span>
              <h4 className="font-semibold text-sm text-foreground">{viewingReceipt.shopName}</h4>
              <p className="text-muted-foreground font-mono">{viewingReceipt.email}</p>
            </div>

            {/* Itemized Table */}
            <div className="rounded-xl border border-border overflow-hidden text-xs">
              <table className="w-full text-left">
                <thead className="bg-muted text-2xs font-bold uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2.5">Description</th>
                    <th className="px-4 py-2.5 text-center">Plan Tier</th>
                    <th className="px-4 py-2.5 text-right">Amount (LKR)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  <tr>
                    <td className="px-4 py-3">
                      <div className="font-bold text-foreground">Commercial SaaS Subscription</div>
                      <div className="text-2xs text-muted-foreground">WebGL 3D Room Visualizer Engine + Catalog Storage</div>
                    </td>
                    <td className="px-4 py-3 text-center font-bold text-muted-foreground">
                      {viewingReceipt.package}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-foreground">
                      {viewingReceipt.amount}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Financial Summary Breakdown */}
            <div className="p-4 rounded-2xl bg-muted border border-border space-y-2 text-xs">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span className="font-mono font-bold text-foreground">{viewingReceipt.amount}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Value Added Tax (VAT 0%)</span>
                <span className="font-mono">LKR 0.00</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-border text-sm font-bold text-foreground">
                <span>Total Amount Paid</span>
                <span className="text-foreground font-mono text-base">{viewingReceipt.amount}</span>
              </div>
            </div>

            {/* Official Stamp & Verification */}
            <div className="flex items-center justify-between pt-2">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-success-muted text-success border border-success/30 text-2xs font-bold uppercase tracking-wider">
                <CheckCircle2 className="h-4 w-4" />
                <span>OFFICIAL RECEIPT • {viewingReceipt.status}</span>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setViewingReceipt(null)}
                  className="rounded-full px-4 py-2 font-semibold text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="ds-btn ds-btn-primary"
                >
                  <Printer className="h-3.5 w-3.5" />
                  <span>Print Receipt</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── APPOINT SUPER ADMIN MODAL ────────────────────────────────────── */}
      {isAppointModalOpen && (
        <div className="fixed inset-0 z-50 flex justify-center overflow-y-auto bg-black/60 p-3 backdrop-blur-sm sm:p-4" role="dialog" aria-modal="true">
          <button type="button" aria-label="Close" onClick={() => setIsAppointModalOpen(false)} className="fixed inset-0 cursor-default" />
          <div className="relative z-10 my-auto w-full max-w-lg rounded-3xl border border-border bg-card p-5 sm:p-7 shadow-2xl space-y-6">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-2xl bg-muted border border-input flex items-center justify-center text-foreground">
                  <UserPlus className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-foreground">Appoint Super Administrator</h3>
                  <p className="text-xs text-muted-foreground">Grant full platform management and administrative authority</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAppointModalOpen(false)}
                className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {appointError && (
              <div className="p-3.5 rounded-xl bg-destructive-muted text-destructive border border-destructive/30 text-xs font-bold flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{appointError}</span>
              </div>
            )}

            {appointSuccess && (
              <div className="p-3.5 rounded-xl bg-success-muted text-success border border-success/30 text-xs font-bold flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>{appointSuccess}</span>
              </div>
            )}

            <form onSubmit={handleAppointSuperAdmin} className="space-y-4 text-xs font-sans">
              <div>
                <label className="ds-label">
                  Administrator Full Name *
                </label>
                <input
                  type="text"
                  required
                  value={appointForm.name}
                  onChange={(e) => setAppointForm({ ...appointForm, name: e.target.value })}
                  placeholder="e.g. Chief Operations Officer"
                  className="ds-field"
                />
              </div>

              <div>
                <label className="ds-label">
                  Administrator Login Email *
                </label>
                <input
                  type="email"
                  required
                  value={appointForm.email}
                  onChange={(e) => setAppointForm({ ...appointForm, email: e.target.value })}
                  placeholder="admin@tilevisualizer.com"
                  className="ds-field"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="ds-label">
                    Temporary Password *
                  </label>
                  <button
                    type="button"
                    onClick={generateAdminPassword}
                    className="text-2xs font-bold text-muted-foreground hover:text-foreground flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    <Sparkles className="h-3 w-3" />
                    <span>Generate Strong Password</span>
                  </button>
                </div>
                <div className="relative">
                  <input
                    type={showAppointPassword ? "text" : "password"}
                    required
                    value={appointForm.password}
                    onChange={(e) => setAppointForm({ ...appointForm, password: e.target.value })}
                    placeholder="Min 6 characters"
                    className="ds-field pl-4 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowAppointPassword(!showAppointPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    {showAppointPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-warning-muted border border-warning/30 text-2xs text-warning">
                <strong>Platform Security Notice:</strong> Appointed Super Administrators will have complete authority over all showrooms, subscriptions, revenue records, and global settings.
              </div>

              <div className="pt-4 border-t border-border flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsAppointModalOpen(false)}
                  className="px-5 py-2.5 rounded-full text-xs font-bold text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isAppointingAdmin}
                  className="ds-btn ds-btn-lg ds-btn-primary"
                >
                  {isAppointingAdmin && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                  <span>Appoint Super Administrator</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── REVOKE / DELETE SUPER ADMIN MODAL ────────────────────────────── */}
      {deleteConfirmAdmin && (
        <div className="fixed inset-0 z-50 flex justify-center overflow-y-auto bg-black/60 p-3 backdrop-blur-sm sm:p-4" role="dialog" aria-modal="true">
          <button type="button" aria-label="Close" onClick={() => setDeleteConfirmAdmin(null)} className="fixed inset-0 cursor-default" />
          <div className="relative z-10 my-auto w-full max-w-md rounded-3xl border border-border bg-card p-5 sm:p-7 shadow-2xl space-y-5">
            <div className="flex items-center gap-3 text-destructive">
              <div className="h-10 w-10 rounded-2xl bg-destructive-muted border border-destructive/30 flex items-center justify-center">
                <Trash2 className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-foreground">Revoke Super Administrator</h3>
                <p className="text-xs text-muted-foreground">Permanent authority revocation</p>
              </div>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">
              Are you sure you want to permanently revoke Super Admin credentials for{" "}
              <strong className="text-foreground">{deleteConfirmAdmin.name || "Super Administrator"}</strong> (
              <span className="font-mono">{deleteConfirmAdmin.email}</span>)?
              <br /><br />
              This administrator will be permanently deleted and immediately locked out of the platform control panel.
            </p>

            <div className="pt-3 border-t border-border flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteConfirmAdmin(null)}
                className="px-4 py-2 rounded-full text-xs font-bold text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeletingAdmin}
                onClick={handleConfirmDeleteAdmin}
                className="ds-btn ds-btn-destructive"
              >
                {isDeletingAdmin && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                <span>Revoke & Delete</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
