"use client";

import React, { useState, useTransition, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import QRCode from "qrcode";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ThemeSelector } from "@/components/ThemeSelector";
import { useThemeStore, useThemeScope } from "@/stores/themeStore";
import { cn, formatLKR } from "@/lib/utils";
import { AddTileDrawer } from "./AddTileDrawer";
import { TileImageUrlField, useTileImageCheck } from "@/components/TileImageUrl";
import { ShopTileCatalog } from "./ShopTileCatalog";
import { ShowroomKioskCard } from "./ShowroomKioskCard";
import { ShopSidebar } from "./ShopSidebar";
import { ShopDashboard } from "./ShopDashboard";
import { Visualizer2DHub } from "./Visualizer2DHub";
import { Visualizer3DHub } from "./Visualizer3DHub";
import { VisualizerLocked } from "@/components/Visualizer/VisualizerLocked";
import { RESTRICTED_MESSAGE, type VisualizerAccess } from "@/lib/visualizerAccess";
import { BannerImage } from "@/components/ShopBanner";
import {
  CopyField,
  PasswordField,
  SettingsCard,
  SettingsNotice,
  SettingsRow,
  SettingsSave,
  SettingsSwitch,
  SettingsTabs,
  ShowroomPreview,
} from "./ShopSettingsParts";
import { StatusBadge, EmptyState, NeumorphicMetricCard } from "@/components/dashboard";
import { addTile, deleteTile, setVisualizerDownloads, updateShopProfileSettings } from "@/actions/shop";
import { readDownloads, type VisualizerDownloads } from "@/lib/visualizerDownloads";
import { useNotificationFeed } from "@/components/notifications/useNotificationFeed";
import { NotificationBell, NotificationToasts, PaymentReminderCard } from "@/components/notifications/NotificationParts";
import type { NotificationFeed } from "@/lib/notificationTypes";
import type { SubscriptionPlanItem } from "@/lib/subscriptionPlanTypes";
import { DEFAULT_SUBSCRIPTION_PLANS } from "@/lib/subscriptionPlanTypes";
import { asDurationMonths, durationLabel, findPackage, isCustomPlan, monthsBetweenISO, packageName } from "@/lib/subscriptionPlans";
import type { PlatformSocialLinks } from "@/lib/platformLinksTypes";
import { DEFAULT_SOCIAL_LINKS } from "@/lib/platformLinksTypes";
import {
  LayoutDashboard,
  Layers,
  Box,
  BarChart3,
  CreditCard,
  FileText,
  Bell,
  Settings,
  LogOut,
  Search,
  Plus,
  X,
  Check,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  RefreshCw,
  User,
  Mail,
  Lock,
  Eye,
  EyeOff,
  Palette,
  Camera,
  Download,
  ShieldCheck,
  Activity,
  Users,
  Clock,
  ArrowUpRight,
  ArrowDownLeft,
  ArrowDownRight,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  Trash2,
  Pencil,
  Home,
  HardDrive,
  QrCode,
  Tv,
  Copy,
  Image as ImageIcon,
  Grid,
  List,
  Compass,
  Store,
  Tag,
  FolderKanban,
  CheckCheck,
  Upload,
  Maximize2,
  Minimize2,
  ChevronLeft,
  PanelLeftOpen,
  Sliders,
  Bath,
  Sofa,
  UtensilsCrossed,
  Building2,
  CheckSquare,
  Phone,
  MessageCircle
} from "lucide-react";

export type ShopTab =
  | "dashboard"
  | "tiles"
  | "visualizer"
  | "visualizer-2d"
  | "tile-usage"
  | "subscription"
  | "reports"
  | "notifications"
  | "settings";

const SHOP_TABS: ShopTab[] = ["dashboard", "tiles", "visualizer", "visualizer-2d", "tile-usage", "subscription", "reports", "notifications", "settings"];

export interface ShopCollection {
  id: string;
  name: string;
  desc: string;
  image: string;
  tileIds?: string[];
  count: number;
}

const DEFAULT_SHOP_COLLECTIONS: ShopCollection[] = [
  {
    id: "col-1",
    name: "Luxury Italian Marble Suite",
    desc: "Refined Carrara, Calacatta, and Nero Marquina finishes with mirror-polished reflectivity.",
    image: "",
    tileIds: [],
    count: 0,
  },
  {
    id: "col-2",
    name: "Nordic Architectural Wood Planks",
    desc: "Natural oak, walnut, and smoked timber grain textures with realistic matte tactile feel.",
    image: "",
    tileIds: [],
    count: 0,
  },
  {
    id: "col-3",
    name: "Urban Concrete & Industrial Stone",
    desc: "Subtle micro-cement, brushed slate, and raw industrial surfaces ideal for modern open lofts.",
    image: "",
    tileIds: [],
    count: 0,
  },
  {
    id: "col-4",
    name: "Warm Travertine & Desert Sand",
    desc: "Earthy Mediterranean textures with soft porous character and warm ambient warmth.",
    image: "",
    tileIds: [],
    count: 0,
  },
];

interface ShopWorkspaceProps {
  user: any;
  /** What the main administrator allows this showroom to use (decided on the server: plan and the administrator's switches). */
  visualizerAccess: VisualizerAccess;
  /** Payment reminders saved for this showroom (including any that arrived while the owner was offline). */
  initialNotifications: NotificationFeed;
  subscriptionPlans?: SubscriptionPlanItem[];
  platformLinks?: PlatformSocialLinks;
  logoutAction: () => Promise<void>;
}

export function ShopWorkspace({
  user,
  initialNotifications,
  logoutAction,
  visualizerAccess,
  subscriptionPlans = [],
  platformLinks = DEFAULT_SOCIAL_LINKS,
}: ShopWorkspaceProps) {
  useThemeScope("shop", user.id, user.theme);
  // Navigation State
  // Coming back from the full-screen 2D visualizer lands on its tab (?tab=visualizer-2d)
  const searchParams = useSearchParams();
  // Initial state derives only from values the server also sees (the URL), so hydration matches;
  // the localStorage fallback is applied right after mount.
  const [activeTab, setActiveTab] = useState<ShopTab>(() => {
    const wanted = searchParams.get("tab") as ShopTab | null;
    return wanted && SHOP_TABS.includes(wanted) ? wanted : "dashboard";
  });
  const [tilesSubTab, setTilesSubTab] = useState<"all" | "add" | "categories" | "collections">(() => {
    const v = searchParams.get("subtab");
    if (v === "all" || v === "add" || v === "categories" || v === "collections") return v;
    return "all";
  });
  const [usageSubTab, setUsageSubTab] = useState<"overview" | "history">("overview");
  const [subSubTab, setSubSubTab] = useState<"plan" | "limit" | "expiry">("plan");
  const [reportSubTab, setReportSubTab] = useState<"tiles" | "activity">("tiles");
  const [settingsSubTab, setSettingsSubTab] = useState<"profile" | "branding" | "visualizer" | "appearance" | "account" | "security">(() => {
    const v = searchParams.get("subtab");
    if (v === "profile" || v === "branding" || v === "visualizer" || v === "appearance" || v === "account" || v === "security") return v;
    return "profile";
  });
  const [tabRestored, setTabRestored] = useState(false);

  // Restore the last tab from localStorage when the URL doesn't name one
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).get("tab")) {
      try {
        const storedTab = localStorage.getItem(`shop_active_tab_${user.id}`) as ShopTab | null;
        if (storedTab && SHOP_TABS.includes(storedTab)) setActiveTab(storedTab);
      } catch (_) {}
    }
    setTabRestored(true);
  }, [user.id]);

  // Preserve active tab and subtabs across page reloads / refreshes
  useEffect(() => {
    if (!tabRestored) return;
    try {
      localStorage.setItem(`shop_active_tab_${user.id}`, activeTab);
      const url = new URL(window.location.href);
      url.searchParams.set("tab", activeTab);
      if (activeTab === "tiles") {
        url.searchParams.set("subtab", tilesSubTab);
      } else if (activeTab === "settings") {
        url.searchParams.set("subtab", settingsSubTab);
      } else {
        url.searchParams.delete("subtab");
      }
      window.history.replaceState(null, "", url.toString());
    } catch (_) {}
  }, [tabRestored, activeTab, tilesSubTab, settingsSubTab, user.id]);

  // Sidebar accordion expansion
  const [sidebarOpenSections, setSidebarOpenSections] = useState<Record<string, boolean>>({
    tiles: false,
    "tile-usage": false,
    subscription: false,
    reports: false,
    settings: false,
  });

  const toggleSidebarSection = (section: string) => {
    setSidebarOpenSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  // Modals & Drawers
  const [isAddDrawerOpen, setIsAddDrawerOpen] = useState(false);
  const [upgradeNotice, setUpgradeNotice] = useState<{ success?: boolean; message?: string } | null>(null);
  const [upgradeModalPlan, setUpgradeModalPlan] = useState<{
    name: string;
    price?: number;
    isDowngrade?: boolean;
  } | null>(null);
  const [copiedContact, setCopiedContact] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleCopyContact = (text: string, type: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedContact(type);
      setTimeout(() => setCopiedContact(null), 2000);
    }
  };

  // Metrics & Counters
  const tilesCount = user._count?.tiles ?? user.tiles?.length ?? 0;
  const tileQuota = user.tileQuota || 50;
  const quotaPercent = Math.min(100, Math.round((tilesCount / tileQuota) * 100));
  const isQuotaFull = tilesCount >= tileQuota;
  const savedDesignsCount = user._count?.savedDesigns ?? user.savedDesigns?.length ?? 0;

  // Breakdown statistics
  const floorTilesCount = (user.tiles || []).filter((t: any) => t.category === "floor" || t.category === "both").length;
  const wallTilesCount = (user.tiles || []).filter((t: any) => t.category === "wall" || t.category === "both").length;
  const bothTilesCount = (user.tiles || []).filter((t: any) => t.category === "both").length;

  const finishesCount: Record<string, number> = {};
  (user.tiles || []).forEach((t: any) => {
    const f = t.finish || "Matt";
    finishesCount[f] = (finishesCount[f] || 0) + 1;
  });

  const estimatedShopValue = (user.tiles || []).reduce((acc: number, t: any) => acc + (t.pricePerSqFt || 0), 0);
  const avgTilePrice = tilesCount > 0 ? Math.round(estimatedShopValue / tilesCount) : 0;

  // ── INLINE ADD TILE FORM STATE ──────────────────────────────────────────
  const [addTileState, setAddTileState] = useState({
    sku: "",
    name: "",
    widthMm: 600,
    heightMm: 600,
    textureUrl: "",
    pricePerSqFt: 350,
    category: "floor",
    finish: "Matt",
    collectionId: "",
  });
  const [addTileStatus, setAddTileStatus] = useState<{ success?: boolean; message?: string } | null>(null);
  const [isAddingInlineTile, setIsAddingInlineTile] = useState(false);

  const addTileImage = useTileImageCheck(addTileState.textureUrl);



  const handleInlineAddTileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isQuotaFull) {
      setAddTileStatus({ success: false, message: `Storage quota reached (${tileQuota} tiles max). Please upgrade your plan.` });
      return;
    }
    if (!addTileState.sku || !addTileState.name || !addTileState.textureUrl) {
      setAddTileStatus({ success: false, message: "Please fill in SKU, Tile Name, and Texture URL." });
      return;
    }
    if (addTileImage.status !== "ok") {
      setAddTileStatus({
        success: false,
        message: addTileImage.status === "error" ? addTileImage.error : "Wait for the image preview to load, then add the tile.",
      });
      return;
    }

    setIsAddingInlineTile(true);
    setAddTileStatus(null);

    const formData = new FormData();
    formData.append("sku", addTileState.sku);
    formData.append("name", addTileState.name);
    formData.append("widthMm", String(addTileState.widthMm));
    formData.append("heightMm", String(addTileState.heightMm));
    formData.append("textureUrl", addTileImage.url);
    formData.append("pricePerSqFt", String(addTileState.pricePerSqFt));
    formData.append("category", addTileState.category);
    formData.append("finish", addTileState.finish);
    if (addTileState.collectionId) {
      formData.append("collectionId", addTileState.collectionId);
    }

    try {
      const res = await addTile(null, formData);
      if (res?.success) {
        if (addTileState.collectionId) {
          handleTileAddedToCollection(addTileState.collectionId, (res as any).tileId);
        }
        setAddTileStatus({ success: true, message: "Tile added to showroom catalog and live 3D visualizer!" });
        setAddTileState({
          sku: "",
          name: "",
          widthMm: 600,
          heightMm: 600,
          textureUrl: "",
          pricePerSqFt: 350,
          category: "floor",
          finish: "Matt",
          collectionId: "",
        });
      } else {
        setAddTileStatus({ success: false, message: res?.message || "Failed to add tile." });
      }
    } catch (err: any) {
      setAddTileStatus({ success: false, message: err.message || "An unexpected error occurred." });
    } finally {
      setIsAddingInlineTile(false);
    }
  };

  // ── SETTINGS FORM STATE ────────────────────────────────────────────────
  // `details` holds the admin-managed shop metadata as JSON (owner, contacts,
  // billing …); the shop only edits its `description`, everything else is kept.
  const detailsMeta = useMemo<Record<string, unknown> | null>(() => {
    try {
      const parsed = JSON.parse(user.details || "");
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }, [user.details]);

  const [profileForm, setProfileForm] = useState({
    shopName: user.shopName || "",
    details: detailsMeta ? String(detailsMeta.description ?? "") : user.details || "",
  });

  const [brandingForm, setBrandingForm] = useState({
    logoUrl: user.logoUrl || "",
    coverPhotoUrl: user.coverPhotoUrl || "",
    coverLinkUrl: user.coverLinkUrl || "",
  });

  const [securityForm, setSecurityForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [settingsMessage, setSettingsMessage] = useState<{ success?: boolean; message?: string } | null>(null);

  // Which visualizers show a Download button (saved on the server, so it holds after a refresh and on every device)
  const [downloads, setDownloads] = useState<VisualizerDownloads>(() => readDownloads(user.details));
  const [savingDownload, setSavingDownload] = useState<keyof VisualizerDownloads | null>(null);
  const handleDownloadSwitch = async (key: keyof VisualizerDownloads, value: boolean) => {
    if (savingDownload) return;
    const before = downloads;
    setSavingDownload(key);
    setSettingsMessage(null);
    setDownloads({ ...before, [key]: value });
    const res = await setVisualizerDownloads({ [key]: value });
    if (res.success && res.downloads) setDownloads(res.downloads);
    else setDownloads(before);
    setSettingsMessage({ success: res.success, message: res.message });
    setSavingDownload(null);
  };
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  // A saved/error banner belongs to the tab it came from.
  useEffect(() => {
    setSettingsMessage(null);
  }, [settingsSubTab]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingSettings(true);
    setSettingsMessage(null);
    try {
      const res = await updateShopProfileSettings({
        shopName: profileForm.shopName,
        details: detailsMeta
          ? JSON.stringify({ ...detailsMeta, description: profileForm.details.trim() || null })
          : profileForm.details,
      });
      setSettingsMessage(res);
    } catch (err: any) {
      setSettingsMessage({ success: false, message: err.message || "Failed to update profile." });
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleSaveBranding = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingSettings(true);
    setSettingsMessage(null);
    try {
      const res = await updateShopProfileSettings({
        logoUrl: brandingForm.logoUrl,
        coverPhotoUrl: brandingForm.coverPhotoUrl,
        coverLinkUrl: brandingForm.coverLinkUrl,
      });
      setSettingsMessage(res);
    } catch (err: any) {
      setSettingsMessage({ success: false, message: err.message || "Failed to update branding." });
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleSaveSecurity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (securityForm.newPassword !== securityForm.confirmPassword) {
      setSettingsMessage({ success: false, message: "New passwords do not match." });
      return;
    }
    if (securityForm.newPassword.length < 6) {
      setSettingsMessage({ success: false, message: "New password must be at least 6 characters." });
      return;
    }
    setIsSavingSettings(true);
    setSettingsMessage(null);
    try {
      const res = await updateShopProfileSettings({
        currentPassword: securityForm.currentPassword,
        newPassword: securityForm.newPassword,
      });
      setSettingsMessage(res);
      if (res.success) {
        setSecurityForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      }
    } catch (err: any) {
      setSettingsMessage({ success: false, message: err.message || "Failed to change password." });
    } finally {
      setIsSavingSettings(false);
    }
  };

  // ── COLLECTIONS REPOSITORY & SHOP OWNER UPLOADS ─────────────────────────
  // ── COLLECTIONS REPOSITORY & SHOP OWNER MANAGEMENT ──────────────────────
  const [collections, setCollections] = useState<ShopCollection[]>(DEFAULT_SHOP_COLLECTIONS);
  const [isCollectionModalOpen, setIsCollectionModalOpen] = useState(false);
  const [editingCollectionId, setEditingCollectionId] = useState<string | null>(null);
  const [collectionForm, setCollectionForm] = useState({
    name: "",
    desc: "",
    image: "",
    tileIds: [] as string[],
  });

  const [selectingCollectionId, setSelectingCollectionId] = useState<string | null>(null);
  const [selectedCollectionTileIds, setSelectedCollectionTileIds] = useState<string[]>([]);
  const [viewingCollectionId, setViewingCollectionId] = useState<string | null>(null);
  const [viewingCategoryId, setViewingCategoryId] = useState<string | null>(null);

  const activeSelectingCollection = useMemo(() => {
    if (!selectingCollectionId) return null;
    return collections.find((c) => c.id === selectingCollectionId) || null;
  }, [selectingCollectionId, collections]);

  const handleStartSelectTilesForCollection = (col: ShopCollection) => {
    setSelectingCollectionId(col.id);
    setSelectedCollectionTileIds(col.tileIds || []);
    setActiveTab("tiles");
    setTilesSubTab("all");
  };

  const handleToggleCollectionTile = (tileId: string) => {
    setSelectedCollectionTileIds((prev) =>
      prev.includes(tileId) ? prev.filter((id) => id !== tileId) : [...prev, tileId]
    );
  };

  const handleSaveCollectionSelection = () => {
    if (!selectingCollectionId) return;
    const targetColId = selectingCollectionId;
    const updated = collections.map((c) => {
      if (c.id === selectingCollectionId) {
        let coverImg = c.image;
        if (!coverImg && selectedCollectionTileIds.length > 0) {
          const firstTile = (user.tiles || []).find((t: any) => selectedCollectionTileIds.includes(t.id));
          if (firstTile) {
            coverImg = firstTile.previewUrl || firstTile.textureUrl || "";
          }
        }
        return {
          ...c,
          tileIds: selectedCollectionTileIds,
          count: selectedCollectionTileIds.length,
          image: coverImg,
        };
      }
      return c;
    });
    saveCollectionsToStorage(updated);
    setSelectingCollectionId(null);
    setSelectedCollectionTileIds([]);
    setTilesSubTab("collections");
    setViewingCollectionId(targetColId);
  };

  const handleCancelCollectionSelection = () => {
    setSelectingCollectionId(null);
    setSelectedCollectionTileIds([]);
    setTilesSubTab("collections");
  };

  const handleRemoveTileFromCollection = (colId: string, tileId: string) => {
    const updated = collections.map((c) => {
      if (c.id === colId) {
        const nextIds = (c.tileIds || []).filter((id) => id !== tileId);
        let nextCover = c.image;
        const removedTile = (user.tiles || []).find((t: any) => t.id === tileId);
        const removedImg = removedTile ? (removedTile.previewUrl || removedTile.textureUrl) : null;
        if (removedImg && c.image === removedImg) {
          const firstRemaining = (user.tiles || []).find((t: any) => nextIds.includes(t.id));
          nextCover = firstRemaining ? (firstRemaining.previewUrl || firstRemaining.textureUrl || "") : "";
        }
        return {
          ...c,
          tileIds: nextIds,
          count: nextIds.length,
          image: nextCover,
        };
      }
      return c;
    });
    saveCollectionsToStorage(updated);
  };

  const handleAssignTilesToCollection = (tileIds: string[], targetColId: string) => {
    const updated = collections.map((c) => {
      if (c.id === targetColId) {
        const existing = new Set(c.tileIds || []);
        tileIds.forEach((id) => existing.add(id));
        const merged = Array.from(existing);
        let coverImg = c.image;
        if (!coverImg && merged.length > 0) {
          const firstTile = (user.tiles || []).find((t: any) => merged.includes(t.id));
          if (firstTile) coverImg = firstTile.previewUrl || firstTile.textureUrl || "";
        }
        return {
          ...c,
          tileIds: merged,
          count: merged.length,
          image: coverImg,
        };
      }
      return c;
    });
    saveCollectionsToStorage(updated);
  };

  const handleTileAddedToCollection = (colId: string, tileId?: string) => {
    if (!colId) return;
    const updated = collections.map((c) => {
      if (c.id === colId) {
        const existing = new Set(c.tileIds || []);
        if (tileId) existing.add(tileId);
        const merged = Array.from(existing);
        let coverImg = c.image;
        if (!coverImg && tileId) {
          const newlyAdded = (user.tiles || []).find((t: any) => t.id === tileId);
          if (newlyAdded) coverImg = newlyAdded.previewUrl || newlyAdded.textureUrl || "";
        }
        return {
          ...c,
          tileIds: merged,
          count: tileId ? merged.length : (c.count || 0) + 1,
          image: coverImg,
        };
      }
      return c;
    });
    saveCollectionsToStorage(updated);
  };

  // Load collections from localStorage on mount, ensuring legacy images are sanitized
  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem(`shop_collections_${user.id}`);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const sanitized = parsed.map((col: any) => {
              const tileIds = Array.isArray(col.tileIds) ? col.tileIds : [];
              return {
                id: col.id || `col-${Math.random()}`,
                name: col.name || "Untitled Collection",
                desc: col.desc || "",
                image: col.image && col.image.includes("unsplash.com") ? "" : (col.image || ""),
                tileIds,
                count: tileIds.length > 0 ? tileIds.length : (typeof col.count === "number" ? col.count : 0),
              };
            });
            setCollections(sanitized);
            return;
          }
        }
      } catch (e) {
        console.error("Error reading saved collections:", e);
      }
    }
  }, [user.id]);

  const saveCollectionsToStorage = (updated: ShopCollection[]) => {
    setCollections(updated);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(`shop_collections_${user.id}`, JSON.stringify(updated));
      } catch (e) {
        console.error("Error saving collections:", e);
      }
    }
  };

  const handleDeleteCollection = (colId: string) => {
    if (confirm("Are you sure you want to remove this collection?")) {
      const updated = collections.filter((c) => c.id !== colId);
      saveCollectionsToStorage(updated);
      if (viewingCollectionId === colId) {
        setViewingCollectionId(null);
      }
    }
  };

  const handleOpenCreateCollection = () => {
    setEditingCollectionId(null);
    setCollectionForm({
      name: "",
      desc: "",
      image: "",
      tileIds: [],
    });
    setIsCollectionModalOpen(true);
  };

  const handleOpenEditCollection = (col: ShopCollection) => {
    setEditingCollectionId(col.id);
    setCollectionForm({
      name: col.name,
      desc: col.desc,
      image: col.image || "",
      tileIds: col.tileIds || [],
    });
    setIsCollectionModalOpen(true);
  };

  const handleSaveCollection = (e: React.FormEvent) => {
    e.preventDefault();
    if (!collectionForm.name.trim()) return;

    if (editingCollectionId) {
      const updated = collections.map((c) =>
        c.id === editingCollectionId
          ? {
              ...c,
              name: collectionForm.name.trim(),
              desc: collectionForm.desc.trim(),
            }
          : c
      );
      saveCollectionsToStorage(updated);
    } else {
      const newCol: ShopCollection = {
        id: `col-${Date.now()}`,
        name: collectionForm.name.trim(),
        desc: collectionForm.desc.trim() || "Custom curated showroom suite.",
        image: "",
        tileIds: [],
        count: 0,
      };
      const updated = [newCol, ...collections];
      saveCollectionsToStorage(updated);
    }

    setIsCollectionModalOpen(false);
    setEditingCollectionId(null);
  };

  // ── CSV EXPORT FOR TILE INVENTORY REPORT ────────────────────────────────
  const handleExportCSV = () => {
    const headers = ["SKU", "Name", "Width(mm)", "Height(mm)", "Category", "Finish", "PricePerSqFt(LKR)", "Created Date"];
    const rows = (user.tiles || []).map((t: any) => [
      `"${t.sku}"`,
      `"${t.name}"`,
      t.widthMm,
      t.heightMm,
      `"${t.category}"`,
      `"${t.finish || "Matt"}"`,
      t.pricePerSqFt || 0,
      `"${t.createdAt ? new Date(t.createdAt).toISOString().split("T")[0] : ""}"`,
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e: any[]) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${user.shopName?.replace(/\s+/g, "_") || "Showroom"}_tile_inventory_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // ── NOTIFICATIONS & ALERTS ──────────────────────────────────────────────
  const [dismissedNotifications, setDismissedNotifications] = useState<string[]>([]);
  // Payment reminders from the admin: saved in the database, polled live, popped up when they arrive
  const feed = useNotificationFeed(initialNotifications);
  const paymentReminders = feed.notifications.filter((n) => n.type === "PAYMENT_REMINDER");

  // Raw notifications: empty by default so only real payment reminders and database notifications appear
  const rawNotifications: {
    id: string;
    category: "action" | "tips";
    title: string;
    description: string;
    time: string;
    severity: "high" | "medium" | "low" | "info";
  }[] = [];

  const activeNotifications = rawNotifications.filter((n) => !dismissedNotifications.includes(n.id));

  // ── VISUALIZER QR CODE GENERATION ──────────────────────────────────────
  const [visualizerQrUrl, setVisualizerQrUrl] = useState<string>("");
  const [visualizerLinkCopied, setVisualizerLinkCopied] = useState(false);
  const [fullVisualizerUrl, setFullVisualizerUrl] = useState(`/visualizer?shopId=${user.id}`);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const url = `${window.location.origin}/visualizer?shopId=${user.id}`;
      setFullVisualizerUrl(url);
      QRCode.toDataURL(url, {
        width: 220,
        margin: 1,
        color: {
          dark: "#000000",
          light: "#ffffff",
        },
      })
        .then((dataUri) => setVisualizerQrUrl(dataUri))
        .catch((err) => console.error("QR Code Error:", err));
    }
  }, [user.id]);

  const handleCopyVisualizerLink = () => {
    if (typeof navigator !== "undefined") {
      navigator.clipboard.writeText(fullVisualizerUrl);
      setVisualizerLinkCopied(true);
      setTimeout(() => setVisualizerLinkCopied(false), 2000);
    }
  };

  // ── FULLSCREEN EXPAND / SHRINK & SIDEBAR COLLAPSE ──────────────────────
  const router = useRouter();
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

    // Synchronize fullscreen state from document, query parameter, or sessionStorage
    const isFsActive = !!document.fullscreenElement;
    const urlParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
    const hasFsParam = searchParams.get("fullscreen") === "true" || urlParams?.get("fullscreen") === "true";
    const hasFsStorage = typeof window !== "undefined" && sessionStorage.getItem("tileviz_fullscreen") === "true";

    const shouldBeFullscreen = isFsActive || hasFsParam || hasFsStorage;

    if (shouldBeFullscreen) {
      setIsFullscreen(true);
      sessionStorage.setItem("tileviz_fullscreen", "true");

      if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {
          // If browser requires user gesture to enter fullscreen, listen for first interaction
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
  }, [searchParams]);

  // A change the main administrator makes to this showroom's plan or visualizer access shows up when the person comes back to the tab
  useEffect(() => {
    let last = Date.now();
    const refresh = () => {
      if (document.visibilityState !== "visible" || Date.now() - last < 15_000) return;
      last = Date.now();
      router.refresh();
    };
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [router]);

  // Packages made or changed in the admin dashboard show when the Subscription tab is opened
  useEffect(() => {
    if (activeTab === "subscription") router.refresh();
  }, [activeTab, router]);

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

  const navigateToVisualizer = (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    if (!visualizerAccess.viz3d) {
      setActiveTab("visualizer");
      return;
    }
    const isFs = !!document.fullscreenElement || isFullscreen || (typeof window !== "undefined" && sessionStorage.getItem("tileviz_fullscreen") === "true");
    const targetUrl = isFs 
      ? `/visualizer?shopId=${user.id}&fullscreen=true` 
      : `/visualizer?shopId=${user.id}`;
    if (isFs) {
      sessionStorage.setItem("tileviz_fullscreen", "true");
    }
    if (typeof window !== "undefined") {
      router.push(targetUrl);
    }
  };

  const navigateToVisualizer2D = (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    if (!visualizerAccess.viz2d) {
      setActiveTab("visualizer-2d");
      return;
    }
    const isFs = !!document.fullscreenElement || isFullscreen || (typeof window !== "undefined" && sessionStorage.getItem("tileviz_fullscreen") === "true");
    if (isFs) sessionStorage.setItem("tileviz_fullscreen", "true");
    const targetUrl = isFs 
      ? `/visualizer-2d?shopId=${user.id}&fullscreen=true` 
      : `/visualizer-2d?shopId=${user.id}`;
    if (typeof window !== "undefined") {
      router.push(targetUrl);
    }
  };

  // ── REAL CUSTOMER 3D ENGAGEMENT DATA ────────────────────────────────────
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const currentMonthIdx = new Date().getMonth();
  const currentYear = new Date().getFullYear();

  // Aggregate real saved designs by month of current calendar year
  const monthlyEngagement = Array(12).fill(0);
  if (user.savedDesigns && Array.isArray(user.savedDesigns)) {
    user.savedDesigns.forEach((d: any) => {
      const dt = new Date(d.createdAt);
      if (dt.getFullYear() === currentYear) {
        const m = dt.getMonth();
        if (m >= 0 && m < 12) monthlyEngagement[m]++;
      }
    });
  }

  const maxEngagementMonth = Math.max(...monthlyEngagement, 1);
  const barChartData = months.map((month, idx) => {
    const count = monthlyEngagement[idx];
    const actual = savedDesignsCount === 0 ? 0 : Math.max(count > 0 ? 15 : 0, Math.round((count / maxEngagementMonth) * 100));
    return {
      month,
      count,
      actual,
      isHighlighted: idx === currentMonthIdx,
    };
  });

  // Days remaining calculation
  const expiryDate = user.subscriptionEnd ? new Date(user.subscriptionEnd) : user.trialEndsAt ? new Date(user.trialEndsAt) : null;
  const daysRemaining = expiryDate ? Math.max(0, Math.ceil((expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))) : null;

  // The package list is the one saved in the admin dashboard; the current package is looked up in it by name
  const livePlans: SubscriptionPlanItem[] = subscriptionPlans && subscriptionPlans.length > 0 ? subscriptionPlans : DEFAULT_SUBSCRIPTION_PLANS;
  const currentPackageName = packageName(user.subscriptionPackage, livePlans) || "Free Trial";
  const subscriptionStartDate = user.subscriptionStart ? new Date(user.subscriptionStart) : null;
  const subscriptionMonths = (() => {
    const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");
    let saved: unknown;
    try {
      saved = JSON.parse(user.details || "{}").durationMonths;
    } catch {
      saved = undefined;
    }
    return asDurationMonths(saved) ?? monthsBetweenISO(iso(subscriptionStartDate), user.subscriptionEnd ? iso(new Date(user.subscriptionEnd)) : "");
  })();
  // The expiry date is the last day of the plan, so it only counts as expired once that day has ended
  const isExpired = !!expiryDate && expiryDate.getTime() + 24 * 60 * 60 * 1000 <= Date.now();
  const isOnTrial = !isExpired && !user.subscriptionEnd && !!user.trialEndsAt;

  return (
    <div className="min-h-screen bg-background text-foreground font-sans selection:bg-black selection:text-white transition-colors duration-200">
      <div className="flex min-h-screen">
        
        {/* ── MODERN SHOWROOM SIDEBAR NAVIGATION ────────────────────────── */}
        <ShopSidebar
          user={user}
          planName={currentPackageName}
          visualizerAccess={visualizerAccess}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          tilesSubTab={tilesSubTab}
          setTilesSubTab={setTilesSubTab}
          usageSubTab={usageSubTab}
          setUsageSubTab={setUsageSubTab}
          subSubTab={subSubTab}
          setSubSubTab={setSubSubTab}
          reportSubTab={reportSubTab}
          setReportSubTab={setReportSubTab}
          settingsSubTab={settingsSubTab}
          setSettingsSubTab={setSettingsSubTab}
          sidebarOpenSections={sidebarOpenSections}
          toggleSidebarSection={toggleSidebarSection}
          tilesCount={tilesCount}
          quotaPercent={quotaPercent}
          activeNotificationsCount={activeNotifications.length + feed.unreadCount}
          logoutAction={logoutAction}
          platformLinks={platformLinks}
          isSidebarCollapsed={isSidebarCollapsed}
          setIsSidebarCollapsed={setIsSidebarCollapsed}
          isMobileOpen={isMobileOpen}
          setIsMobileOpen={setIsMobileOpen}
        />

        {/* ── MAIN WORKSPACE CONTENT AREA ─────────────────────────────────── */}
        <div className={`flex-1 min-w-0 transition-all duration-200 pl-0 ${isSidebarCollapsed ? "lg:pl-[72px]" : "lg:pl-[248px]"}`}>
          
          {/* Top Header Bar */}
          <header className="sticky top-0 z-30 bg-background/90 backdrop-blur-md px-4 py-4 sm:px-8 sm:py-5 flex items-center justify-between gap-4 border-b border-border">
            {/* Showroom Title & Breadcrumb */}
            <div className="flex min-w-0 flex-1 items-center gap-3.5">
              <div className="min-w-0">
                <h1 className="truncate text-lg font-semibold text-foreground tracking-tight sm:text-xl">
                  {user.shopName || "Showroom Workspace"}
                </h1>
                <p className="truncate text-xs text-muted-foreground">
                  Tile Studio Plus 3D Platform
                </p>
              </div>
            </div>

            {/* Right Action Icons & Primary CTA */}
            <div className="flex shrink-0 items-center gap-2">
              {/* Quick Add Tile CTA */}
              <button
                type="button"
                onClick={() => {
                  setActiveTab("tiles");
                  setTilesSubTab("add");
                }}
                disabled={isQuotaFull}
                className="ds-btn ds-btn-primary"
              >
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">Upload Tile</span>
              </button>

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

              <NotificationBell count={activeNotifications.length + feed.unreadCount} onClick={() => setActiveTab("notifications")} />

              <ThemeToggle scope="shop" ownerId={user.id} iconOnly className="sm:hidden" />
              <ThemeToggle scope="shop" ownerId={user.id} className="hidden sm:inline-flex" />
            </div>
          </header>



          <NotificationToasts
            toasts={feed.toasts}
            onDismiss={feed.dismissToast}
            onOpen={() => { setActiveTab("notifications"); }}
            onMarkRead={feed.markRead}
          />

          {/* Sub-Navigation Tabs for Tiles Section */}
          {activeTab === "tiles" && (
            <div className="px-4 sm:px-8 border-b border-border/70 bg-card/40">
              <nav className="flex items-center gap-2 sm:gap-6 -mb-px overflow-x-auto" aria-label="Tiles Tabs">
                {[
                  { id: "all" as const, label: "All Tiles", count: tilesCount },
                  { id: "categories" as const, label: "Categories" },
                  { id: "collections" as const, label: "Collections" },
                ].map((tab) => {
                  const isActive = tilesSubTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => {
                        setTilesSubTab(tab.id);
                        if (tab.id === "collections") {
                          setViewingCollectionId(null);
                        }
                      }}
                      className={cn(
                        "group inline-flex items-center gap-2 py-3.5 px-3 border-b-2 font-semibold text-xs transition-all cursor-pointer whitespace-nowrap",
                        isActive
                          ? "border-primary text-foreground"
                          : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                      )}
                    >
                      <span>{tab.label}</span>
                      {typeof tab.count === "number" && (
                        <span
                          className={cn(
                            "px-2 py-0.5 rounded-full text-2xs font-mono font-bold transition-colors",
                            isActive
                              ? "bg-primary/10 text-primary"
                              : "bg-muted text-muted-foreground group-hover:text-foreground"
                          )}
                        >
                          {tab.count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </nav>
            </div>
          )}

          {/* Sub-Navigation Tabs for Tile Usage Section */}
          {activeTab === "tile-usage" && (
            <div className="px-4 sm:px-8 border-b border-border/70 bg-card/40">
              <nav className="flex items-center gap-2 sm:gap-6 -mb-px overflow-x-auto" aria-label="Tile Usage Tabs">
                {[
                  { id: "overview" as const, label: "Usage Overview" },
                  { id: "history" as const, label: "Usage History" },
                ].map((sub) => {
                  const isActive = usageSubTab === sub.id;
                  return (
                    <button
                      key={sub.id}
                      type="button"
                      onClick={() => setUsageSubTab(sub.id)}
                      className={cn(
                        "group inline-flex items-center gap-2 py-3.5 px-3 border-b-2 font-semibold text-xs transition-all cursor-pointer whitespace-nowrap",
                        isActive
                          ? "border-primary text-foreground"
                          : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                      )}
                    >
                      <span>{sub.label}</span>
                    </button>
                  );
                })}
              </nav>
            </div>
          )}



          {/* Main Body */}
          <main className="px-4 py-6 sm:px-8 space-y-6 max-w-[1600px] mx-auto">
            
            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* 1. TAB: DASHBOARD                                              */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            {activeTab === "dashboard" && (
              <ShopDashboard
                hasLogo={!!user.logoUrl}
                tilesCount={tilesCount}
                tileQuota={tileQuota}
                quotaPercent={quotaPercent}
                isQuotaFull={isQuotaFull}
                floorTilesCount={floorTilesCount}
                wallTilesCount={wallTilesCount}
                savedDesignsCount={savedDesignsCount}
                activity={barChartData.map((d) => ({ month: d.month, count: d.count, isCurrent: d.isHighlighted }))}
                plan={currentPackageName}
                daysRemaining={daysRemaining}
                recentTiles={(user.tiles || []).slice(0, 5)}
                onUploadTile={() => {
                  setActiveTab("tiles");
                  setTilesSubTab("add");
                }}
                onManageTiles={() => {
                  setActiveTab("tiles");
                  setTilesSubTab("all");
                }}
                onOpenBranding={() => {
                  setActiveTab("settings");
                  setSettingsSubTab("branding");
                }}
                onOpenPlan={() => setActiveTab("subscription")}
              />
            )}

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* 2. TAB: TILES                                                  */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            {activeTab === "tiles" && (
              <div className="space-y-6">
                
                {/* 2A. All Tiles */}
                {tilesSubTab === "all" && (
                  <div className="space-y-4">
                    <ShopTileCatalog
                      tiles={user.tiles || []}
                      userId={user.id}
                      onOpenAddModal={() => setTilesSubTab("add")}
                      canAddTile={!isQuotaFull}
                      canOpen3D={visualizerAccess.viz3d}
                      canOpen2D={visualizerAccess.viz2d}
                      collections={collections.map((c) => ({ id: c.id, name: c.name, tileIds: c.tileIds }))}
                      selectingForCollection={activeSelectingCollection ? { id: activeSelectingCollection.id, name: activeSelectingCollection.name } : null}
                      selectedCollectionTileIds={selectedCollectionTileIds}
                      onToggleCollectionTile={handleToggleCollectionTile}
                      onSaveCollectionSelection={handleSaveCollectionSelection}
                      onCancelCollectionSelection={handleCancelCollectionSelection}
                      onAssignTilesToCollection={handleAssignTilesToCollection}
                    />
                  </div>
                )}

                {/* 2B. Add Tile Inline Studio */}
                {tilesSubTab === "add" && (
                  <div className="max-w-4xl mx-auto space-y-6">
                    <div className="ds-card p-6 sm:p-7">
                      <div className="flex items-center justify-between pb-5 border-b border-border mb-6">
                        <div>
                          <h2 className="ds-section-title">
                            Add New Tile to Showroom
                          </h2>
                          <p className="ds-subtitle">
                            Configure physical dimensions, surface compatibility, and texture URL for real-time 3D rendering
                          </p>
                        </div>
                        <span className="text-xs font-mono font-bold px-3 py-1.5 rounded-full bg-secondary text-muted-foreground">
                          {tilesCount} / {tileQuota} slots used
                        </span>
                      </div>

                      {addTileStatus && (
                        <div className={`p-4 rounded-2xl text-xs font-bold mb-6 flex items-center gap-2 ${
                          addTileStatus.success 
                            ? "bg-success-muted text-success"
                            : "bg-destructive-muted text-destructive"
                        }`}>
                          {addTileStatus.success ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
                          <span>{addTileStatus.message}</span>
                        </div>
                      )}

                      <form onSubmit={handleInlineAddTileSubmit} className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          
                          {/* Left Column: Form Fields */}
                          <div className="space-y-4">
                            <div>
                              <label className="ds-label">
                                SKU Code <span className="text-red-500 font-bold">*</span>
                              </label>
                              <input
                                type="text"
                                required
                                value={addTileState.sku}
                                onChange={(e) => setAddTileState({ ...addTileState, sku: e.target.value })}
                                placeholder="e.g. TL-MARB-6060"
                                className="ds-field"
                              />
                            </div>

                            <div>
                              <label className="ds-label">
                                Tile Name <span className="text-red-500 font-bold">*</span>
                              </label>
                              <input
                                type="text"
                                required
                                value={addTileState.name}
                                onChange={(e) => setAddTileState({ ...addTileState, name: e.target.value })}
                                placeholder="e.g. Calacatta Gold Glossy Porcelain"
                                className="ds-field"
                              />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="ds-label">
                                  Width (mm) <span className="text-red-500 font-bold">*</span>
                                </label>
                                <input
                                  type="number"
                                  required
                                  min={50}
                                  max={3000}
                                  value={addTileState.widthMm}
                                  onChange={(e) => setAddTileState({ ...addTileState, widthMm: Number(e.target.value) })}
                                  className="ds-field"
                                />
                              </div>
                              <div>
                                <label className="ds-label">
                                  Height (mm) <span className="text-red-500 font-bold">*</span>
                                </label>
                                <input
                                  type="number"
                                  required
                                  min={50}
                                  max={3000}
                                  value={addTileState.heightMm}
                                  onChange={(e) => setAddTileState({ ...addTileState, heightMm: Number(e.target.value) })}
                                  className="ds-field"
                                />
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="ds-label">
                                  Surface Application
                                </label>
                                <select
                                  value={addTileState.category}
                                  onChange={(e) => setAddTileState({ ...addTileState, category: e.target.value })}
                                  className="ds-field"
                                >
                                  <option value="floor">Floor Only</option>
                                  <option value="wall">Wall Only</option>
                                  <option value="both">Both</option>
                                </select>
                              </div>
                              <div>
                                <label className="ds-label">
                                  Surface Finish
                                </label>
                                <select
                                  value={addTileState.finish}
                                  onChange={(e) => setAddTileState({ ...addTileState, finish: e.target.value })}
                                  className="ds-field"
                                >
                                  <option value="Matt">Matt</option>
                                  <option value="Gloss">Glossy</option>
                                  <option value="Polished">Polished</option>
                                  <option value="Satin">Satin</option>
                                  <option value="Rustic">Rustic / Textured</option>
                                </select>
                              </div>
                            </div>

                            <div>
                              <label className="ds-label">
                                Price (LKR)
                              </label>
                              <input
                                type="number"
                                min={0}
                                value={addTileState.pricePerSqFt}
                                onChange={(e) => setAddTileState({ ...addTileState, pricePerSqFt: Number(e.target.value) })}
                                className="ds-field"
                              />
                            </div>

                            <div>
                              <label className="ds-label">
                                Add to Collection (Optional)
                              </label>
                              <select
                                value={addTileState.collectionId}
                                onChange={(e) => setAddTileState({ ...addTileState, collectionId: e.target.value })}
                                className="ds-field"
                              >
                                <option value="">None (Don&apos;t assign to collection)</option>
                                {collections.map((col) => (
                                  <option key={col.id} value={col.id}>
                                    {col.name}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div>
                              <label className="ds-label">
                                Texture Image URL <span className="text-red-500 font-bold">*</span>
                              </label>
                              <TileImageUrlField
                                value={addTileState.textureUrl}
                                onChange={(v) => setAddTileState({ ...addTileState, textureUrl: v })}
                                check={addTileImage}
                                className="ds-field"
                              />
                            </div>
                          </div>

                          {/* Right Column: Live 3D Texture Preview */}
                          <div className="flex flex-col items-center justify-center p-6 rounded-2xl bg-muted border border-input text-center space-y-4">
                            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                              Real-Time Texture Preview
                            </span>
                            
                            <div className="w-64 h-64 rounded-2xl overflow-hidden bg-secondary shadow-md border-2 border-card relative flex items-center justify-center">
                              {addTileImage.status === "ok" ? (
                                <img src={addTileImage.previewSrc} alt="Preview" className="w-full h-full object-cover" />
                              ) : (
                                <div className="text-muted-foreground text-xs flex flex-col items-center gap-2 p-4">
                                  {addTileImage.status === "checking" ? <RefreshCw className="h-8 w-8 opacity-60 animate-spin" /> : <ImageIcon className="h-8 w-8 opacity-40" />}
                                  <span>
                                    {addTileImage.status === "checking"
                                      ? "Loading preview…"
                                      : addTileImage.status === "error"
                                        ? "No preview — fix the link"
                                        : "Paste an image URL or Google Drive link, or choose a preset"}
                                  </span>
                                </div>
                              )}

                              {/* Live Spec Badges Overlay */}
                              {addTileImage.status === "ok" && (
                                <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between gap-1 text-2xs font-bold bg-black/70 backdrop-blur-xs text-white px-2 py-1 rounded-lg">
                                  <span>{addTileState.widthMm}×{addTileState.heightMm} mm</span>
                                  <span>{addTileState.finish}</span>
                                  <span>LKR {addTileState.pricePerSqFt}</span>
                                </div>
                              )}
                            </div>

                            <p className="text-2xs text-muted-foreground max-w-xs leading-relaxed">
                              This tile texture will be rendered with PBR lighting, roughness parameters, and scale matrix across showroom 3D customer rooms.
                            </p>
                          </div>

                        </div>

                        <div className="pt-4 border-t border-border flex items-center justify-end gap-3">
                          <button
                            type="button"
                            onClick={() => setTilesSubTab("all")}
                            className="px-5 py-2.5 rounded-full border border-input text-xs font-bold text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            disabled={isAddingInlineTile || isQuotaFull || addTileImage.status !== "ok"}
                            className="ds-btn ds-btn-lg ds-btn-primary"
                          >
                            {isAddingInlineTile && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                            <span>Add Tile to Showroom</span>
                          </button>
                        </div>
                      </form>
                    </div>
                  </div>
                )}

                {/* 2C. Categories */}
                {tilesSubTab === "categories" && (() => {
                  if (viewingCategoryId) {
                    const categoryTitles: Record<string, string> = {
                      floor: "Floor Tiles",
                      wall: "Wall Tiles",
                      both: "Both (Floor & Wall) Surfaces",
                    };
                    const categoryDescs: Record<string, string> = {
                      floor: "Slip-resistant, heavy traffic porcelain & vitrified floor tiles.",
                      wall: "Glazed ceramic, subway, and accent wall surfaces.",
                      both: "Versatile large-format tiles suitable for both floors and walls.",
                    };
                    const catTiles = (user.tiles || []).filter((t: any) =>
                      viewingCategoryId === "both"
                        ? t.category === "both"
                        : t.category === viewingCategoryId || t.category === "both"
                    );

                    return (
                      <div className="space-y-5">
                        {/* High-contrast Back Button Header */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border">
                          <div className="space-y-1.5">
                            <button
                              type="button"
                              onClick={() => setViewingCategoryId(null)}
                              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-card border border-border text-xs font-bold text-foreground hover:bg-accent hover:border-foreground/30 transition-all shadow-2xs group cursor-pointer"
                            >
                              <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
                              <span>Back to Categories</span>
                            </button>
                            <div className="flex items-center gap-3">
                              <h2 className="ds-section-title">
                                {categoryTitles[viewingCategoryId] || viewingCategoryId}
                              </h2>
                              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-muted text-foreground border border-border">
                                {catTiles.length} {catTiles.length === 1 ? "tile" : "tiles"}
                              </span>
                            </div>
                            <p className="ds-subtitle">
                              {categoryDescs[viewingCategoryId]}
                            </p>
                          </div>
                        </div>

                        {/* Tiles Grid */}
                        {catTiles.length === 0 ? (
                          <div className="ds-card p-10 text-center space-y-3 max-w-md mx-auto my-6 border border-border">
                            <Layers className="w-8 h-8 opacity-40 mx-auto text-muted-foreground" />
                            <h3 className="text-sm font-bold text-foreground">No tiles in this category</h3>
                            <p className="text-2xs text-muted-foreground">
                              Add tiles to your showroom with this surface category to display them here.
                            </p>
                          </div>
                        ) : (
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-3.5">
                            {catTiles.map((tile: any) => {
                              const preview = tile.previewUrl || tile.textureUrl;
                              return (
                                <div
                                  key={tile.id}
                                  className="group rounded-2xl border border-border bg-card overflow-hidden hover:border-foreground/30 hover:shadow-sm transition-all flex flex-col justify-between"
                                >
                                  {/* Thumbnail */}
                                  <div className="relative aspect-square w-full overflow-hidden bg-muted">
                                    {preview ? (
                                      <img
                                        src={preview}
                                        alt={tile.name}
                                        className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
                                      />
                                    ) : (
                                      <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                                        <ImageIcon className="h-6 w-6 opacity-40" />
                                      </div>
                                    )}
                                    <span className="absolute top-2 right-2 px-1.5 py-0.5 rounded-md bg-black/80 backdrop-blur-xs text-[10px] font-mono font-bold text-white border border-white/20">
                                      {tile.sku}
                                    </span>
                                  </div>

                                  {/* Details */}
                                  <div className="p-3 space-y-2 flex-1 flex flex-col justify-between">
                                    <div>
                                      <p className="text-xs font-bold text-foreground truncate leading-tight">
                                        {tile.name}
                                      </p>
                                      <div className="flex items-center justify-between text-2xs mt-1">
                                        <span className="text-muted-foreground font-mono">
                                          {tile.widthMm}×{tile.heightMm}mm
                                        </span>
                                        <span className="text-2xs font-semibold px-1.5 py-0.5 rounded-md bg-muted text-foreground/80 border border-border/70 shrink-0 capitalize">
                                          {tile.finish || "Matt"}
                                        </span>
                                      </div>
                                    </div>

                                    <div className="pt-2 border-t border-border flex items-center justify-between text-2xs">
                                      <span className="text-foreground font-bold font-mono">
                                        {tile.pricePerSqFt ? formatLKR(tile.pricePerSqFt) : "Custom"}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  }

                  return (
                    <div className="space-y-5">
                      <div>
                        <h2 className="ds-section-title">
                          Showroom Tile Categories
                        </h2>
                        <p className="ds-subtitle">
                          Organized by surface suitability and architectural placement in 3D rooms
                        </p>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 sm:gap-4">
                        {[
                          {
                            id: "floor",
                            title: "Floor Tiles",
                            count: floorTilesCount,
                            desc: "Slip-resistant, heavy traffic porcelain & vitrified floor tiles.",
                          },
                          {
                            id: "wall",
                            title: "Wall Tiles",
                            count: wallTilesCount,
                            desc: "Glazed ceramic, subway, and accent wall surfaces.",
                          },
                          {
                            id: "both",
                            title: "Both Surfaces",
                            count: bothTilesCount,
                            desc: "Versatile large-format tiles suitable for both floors and walls.",
                          },
                        ].map((cat) => {
                          return (
                            <div
                              key={cat.id}
                              onClick={() => setViewingCategoryId(cat.id as any)}
                              className="ds-card p-4 sm:p-4.5 flex flex-col justify-between hover:border-foreground/30 hover:shadow-sm transition-all cursor-pointer group"
                            >
                              <div>
                                <div className="flex items-center justify-between gap-2">
                                  <h3 className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">
                                    {cat.title}
                                  </h3>
                                  <span className="px-2 py-0.5 rounded-full text-2xs font-bold bg-muted text-foreground border border-border/70">
                                    {cat.count}
                                  </span>
                                </div>
                                <p className="text-2xs text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
                                  {cat.desc}
                                </p>
                              </div>

                              <div className="mt-3.5 pt-2.5 border-t border-border/60 flex items-center justify-between">
                                <span className="text-2xs text-muted-foreground font-medium">
                                  {cat.count} {cat.count === 1 ? "tile" : "tiles"}
                                </span>
                                <span className="text-2xs font-bold text-foreground flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
                                  <span>Browse</span>
                                  <ChevronRight className="h-3 w-3" />
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                {/* 2D. Collections */}
                {tilesSubTab === "collections" && (() => {
                  const viewingCollection = viewingCollectionId
                    ? collections.find((c) => c.id === viewingCollectionId) || null
                    : null;

                  if (viewingCollection) {
                    const colTileIds = viewingCollection.tileIds || [];
                    const collectedTiles = (user.tiles || []).filter((t: any) => colTileIds.includes(t.id));

                    return (
                      <div className="space-y-6">
                        {/* Header with Back button and actions */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border">
                          <div className="space-y-1">
                            <button
                              type="button"
                              onClick={() => setViewingCollectionId(null)}
                              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-card border border-border text-xs font-bold text-foreground hover:bg-accent hover:border-foreground/30 transition-all shadow-2xs group cursor-pointer mb-1"
                            >
                              <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
                              <span>Back to Collections</span>
                            </button>
                            <div className="flex items-center gap-3">
                              <h2 className="ds-section-title">
                                {viewingCollection.name}
                              </h2>
                              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-muted text-foreground border border-border">
                                {collectedTiles.length} {collectedTiles.length === 1 ? "tile" : "tiles"}
                              </span>
                            </div>
                            {viewingCollection.desc && (
                              <p className="ds-subtitle">
                                {viewingCollection.desc}
                              </p>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleStartSelectTilesForCollection(viewingCollection)}
                              className="ds-btn ds-btn-primary flex items-center gap-1.5 cursor-pointer"
                            >
                              <CheckSquare className="w-3.5 h-3.5" />
                              <span>Select Tiles</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenEditCollection(viewingCollection)}
                              className="ds-btn ds-btn-secondary flex items-center gap-1.5 cursor-pointer"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                              <span>Edit</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteCollection(viewingCollection.id)}
                              className="p-2 rounded-xl text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer border border-transparent hover:border-destructive/20"
                              title="Delete Collection"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {/* Tiles Grid or Empty State */}
                        {collectedTiles.length === 0 ? (
                          <div className="ds-card p-12 text-center space-y-4 max-w-lg mx-auto my-6 border border-border">
                            <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mx-auto text-muted-foreground border border-border">
                              <Layers className="w-6 h-6 opacity-60" />
                            </div>
                            <div className="space-y-1.5">
                              <h3 className="text-base font-bold text-foreground">No tiles in this collection</h3>
                              <p className="text-xs text-muted-foreground leading-relaxed">
                                Add tiles from your catalog to &quot;{viewingCollection.name}&quot; using the Select Tiles button.
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleStartSelectTilesForCollection(viewingCollection)}
                              className="ds-btn ds-btn-primary inline-flex items-center gap-2 mx-auto cursor-pointer"
                            >
                              <CheckSquare className="w-4 h-4" />
                              <span>Select Tiles</span>
                            </button>
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
                            {collectedTiles.map((tile: any) => {
                              const preview = tile.previewUrl || tile.textureUrl;
                              const categoryLabel = tile.category === "both" ? "Both" : tile.category === "floor" ? "Floor" : "Wall";
                              return (
                                <div
                                  key={tile.id}
                                  className="ds-card overflow-hidden flex flex-col justify-between group border border-border hover:border-border/80 transition-all shadow-xs"
                                >
                                  {/* Tile Thumbnail */}
                                  <div className="h-44 w-full relative overflow-hidden bg-muted flex items-center justify-center">
                                    {preview ? (
                                      <img
                                        src={preview}
                                        alt={tile.name}
                                        className="w-full h-full object-cover group-hover:scale-102 transition-transform duration-300"
                                      />
                                    ) : (
                                      <div className="text-center text-muted-foreground space-y-1">
                                        <ImageIcon className="h-6 w-6 mx-auto opacity-40" />
                                        <span className="text-2xs font-semibold opacity-70">No image</span>
                                      </div>
                                    )}
                                    {/* Category (Left) & Finish (Right) Badges */}
                                    <div className="absolute top-2 left-2 flex items-center gap-1">
                                      <span className="px-2 py-0.5 rounded-md text-2xs font-semibold bg-black/75 text-white backdrop-blur-xs">
                                        {categoryLabel}
                                      </span>
                                    </div>
                                    <div className="absolute top-2 right-2 flex items-center gap-1">
                                      <span className="px-2 py-0.5 rounded-md text-2xs font-semibold bg-black/60 text-white/90 backdrop-blur-xs capitalize">
                                        {tile.finish || "Matt"}
                                      </span>
                                    </div>
                                  </div>

                                  {/* Details */}
                                  <div className="p-3.5 space-y-2 flex-1 flex flex-col justify-between">
                                    <div>
                                      <span className="text-2xs font-mono font-bold text-muted-foreground block truncate">
                                        {tile.sku}
                                      </span>
                                      <h4 className="text-sm font-bold text-foreground line-clamp-1 mt-0.5">
                                        {tile.name}
                                      </h4>
                                      <div className="flex items-center justify-between text-2xs mt-1">
                                        <span className="text-muted-foreground font-mono">
                                          {tile.widthMm} × {tile.heightMm} mm
                                        </span>
                                        <span className="text-2xs font-semibold px-1.5 py-0.5 rounded-md bg-muted text-foreground/80 border border-border/70 shrink-0 capitalize">
                                          {tile.finish || "Matt"}
                                        </span>
                                      </div>
                                    </div>

                                    <div className="pt-2 border-t border-border/60 flex items-center justify-between text-xs">
                                      <span className="font-mono font-bold text-foreground">
                                        {tile.pricePerSqFt ? formatLKR(tile.pricePerSqFt) : "—"}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => handleRemoveTileFromCollection(viewingCollection.id, tile.id)}
                                        className="px-2.5 py-1 rounded-lg border border-destructive/30 bg-destructive/5 hover:bg-destructive/15 text-destructive text-2xs font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer"
                                        title="Remove from this collection"
                                      >
                                        <Trash2 className="w-3 h-3" />
                                        <span>Remove</span>
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  }

                  return (
                    <div className="space-y-6">
                      <div className="flex items-start justify-between flex-wrap gap-4">
                        <div>
                          <h2 className="ds-section-title">
                            Curated Showroom Collections
                          </h2>
                          <p className="ds-subtitle">
                            Thematic design suites recommended for living rooms, master bathrooms, and modern kitchens. Click any collection to view its tiles.
                          </p>
                        </div>
                        <button
                          onClick={handleOpenCreateCollection}
                          className="ds-btn ds-btn-lg ds-btn-primary cursor-pointer"
                        >
                          <Plus className="h-4 w-4" />
                          <span>Create Collection</span>
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4">
                        {collections.map((col) => {
                          const tileCount = (col.tileIds && col.tileIds.length > 0) ? col.tileIds.length : (col.count || 0);
                          return (
                            <div
                              key={col.id}
                              onClick={() => setViewingCollectionId(col.id)}
                              role="button"
                              tabIndex={0}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  setViewingCollectionId(col.id);
                                }
                              }}
                              className="ds-card overflow-hidden flex flex-col justify-between group border border-border hover:border-foreground/30 hover:shadow-sm transition-all cursor-pointer text-left"
                            >
                              {/* Collection Cover Image */}
                              {col.image ? (
                                <div className="h-28 sm:h-32 w-full relative overflow-hidden bg-muted">
                                  <img
                                    src={col.image}
                                    alt={col.name}
                                    className="w-full h-full object-cover group-hover:scale-102 transition-transform duration-300"
                                  />
                                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2.5">
                                    <span className="text-white text-2xs font-semibold flex items-center gap-1">
                                      <span>View tiles</span>
                                      <ChevronRight className="w-3 h-3" />
                                    </span>
                                  </div>
                                </div>
                              ) : (
                                <div className="h-28 w-full bg-muted/40 border-b border-border flex items-center justify-center text-muted-foreground relative">
                                  <div className="text-center space-y-0.5">
                                    <Layers className="h-5 w-5 mx-auto opacity-40" />
                                    <span className="text-2xs font-semibold opacity-70">No cover image</span>
                                  </div>
                                  <div className="absolute inset-0 bg-black/5 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                    <span className="text-2xs font-semibold text-foreground flex items-center gap-1">
                                      <span>View tiles</span>
                                      <ChevronRight className="w-3 h-3" />
                                    </span>
                                  </div>
                                </div>
                              )}

                              {/* Collection Details */}
                              <div className="p-3.5 space-y-2 flex-1 flex flex-col justify-between">
                                <div className="space-y-1">
                                  <div className="flex items-center justify-between gap-1.5">
                                    <h3 className="text-sm font-bold text-foreground group-hover:text-primary transition-colors truncate">
                                      {col.name}
                                    </h3>
                                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground group-hover:translate-x-0.5 transition-all shrink-0" />
                                  </div>
                                  <p className="text-2xs text-muted-foreground leading-relaxed line-clamp-1">
                                    {col.desc}
                                  </p>
                                </div>

                                {/* Footer: Count and Edit/Delete */}
                                <div className="pt-2 border-t border-border/60 flex items-center justify-between text-2xs">
                                  <span className="font-semibold text-2xs text-muted-foreground px-2 py-0.5 rounded-md bg-muted border border-border/70">
                                    {tileCount} {tileCount === 1 ? "tile" : "tiles"}
                                  </span>

                                  <div className="flex items-center gap-1">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleStartSelectTilesForCollection(col);
                                      }}
                                      className="px-2 py-0.5 rounded-md border border-primary/30 bg-primary/10 hover:bg-primary/20 text-2xs font-semibold text-primary transition-colors inline-flex items-center gap-1 cursor-pointer"
                                      title="Select Tiles on All Tiles page"
                                    >
                                      <CheckSquare className="w-2.5 h-2.5" />
                                      <span>Select</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleOpenEditCollection(col);
                                      }}
                                      className="px-2 py-0.5 rounded-md border border-input bg-muted hover:bg-accent text-2xs font-semibold text-foreground/80 hover:text-foreground transition-colors inline-flex items-center gap-1 cursor-pointer"
                                      title="Edit Collection"
                                    >
                                      <Pencil className="w-2.5 h-2.5" />
                                      <span>Edit</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDeleteCollection(col.id);
                                      }}
                                      className="p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
                                      title="Delete Collection"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

              </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* 3. TAB: VISUALIZER                                             */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            {activeTab === "visualizer" && !visualizerAccess.viz3d && <VisualizerLocked kind="viz3d" compact />}

            {activeTab === "visualizer" && visualizerAccess.viz3d && (
              <Visualizer3DHub
                shopId={user.id}
                tilesCount={tilesCount}
                onLaunch={navigateToVisualizer}
                onLaunch2D={navigateToVisualizer2D}
              />
            )}

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* 3B. TAB: 2D VISUALIZER                                         */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            {activeTab === "visualizer-2d" && !visualizerAccess.viz2d && <VisualizerLocked kind="viz2d" compact />}

            {activeTab === "visualizer-2d" && visualizerAccess.viz2d && (
              <Visualizer2DHub
                shopId={user.id}
                tilesCount={tilesCount}
                ownRooms={(user.roomScenes || []).length}
                onLaunch={navigateToVisualizer2D}
                onLaunch3D={navigateToVisualizer}
              />
            )}

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* 4. TAB: TILE USAGE                                             */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            {activeTab === "tile-usage" && (
              <div className="space-y-6">
                
                {/* 4A. Usage Overview */}
                {usageSubTab === "overview" && (
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      
                      {/* Quota Gauge */}
                      <div className="ds-card p-6 sm:p-7 space-y-4">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                          Showroom Storage Allocation
                        </h3>
                        <div className="text-center py-4 space-y-2">
                          <div className="font-mono text-4xl font-bold text-foreground">
                            {quotaPercent}%
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {tilesCount} of {tileQuota} total slots utilized
                          </p>
                          <div className="h-3 w-full overflow-hidden rounded-full bg-secondary">
                            <div 
                              className="h-full rounded-full bg-primary transition-all"
                              style={{ width: `${quotaPercent}%` }}
                            />
                          </div>
                        </div>
                        <div className="pt-2 text-center">
                          <span className="text-xs font-bold text-muted-foreground">
                            {Math.max(0, tileQuota - tilesCount)} upload slots remaining
                          </span>
                        </div>
                      </div>

                      {/* Surface Breakdown */}
                      <div className="ds-card p-6 sm:p-7 space-y-4">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                          Surface Classification
                        </h3>
                        <div className="space-y-3 pt-2 text-xs">
                          <div className="flex items-center justify-between border-b border-border/60 pb-2">
                            <span className="text-muted-foreground">Floor Suitable</span>
                            <span className="font-mono font-bold text-foreground">{floorTilesCount} tiles</span>
                          </div>
                          <div className="flex items-center justify-between border-b border-border/60 pb-2">
                            <span className="text-muted-foreground">Wall Suitable</span>
                            <span className="font-mono font-bold text-foreground">{wallTilesCount} tiles</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">Average Valuation</span>
                            <span className="font-mono font-bold text-foreground">
                              LKR {avgTilePrice.toLocaleString()}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Finishes Distribution */}
                      <div className="ds-card p-6 sm:p-7 space-y-4">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                          Finish Textures Breakdown
                        </h3>
                        <div className="space-y-2 pt-2 text-xs">
                          {Object.keys(finishesCount).length === 0 ? (
                            <p className="text-muted-foreground text-center py-4">No tiles uploaded yet</p>
                          ) : (
                            Object.entries(finishesCount).map(([finish, count]) => (
                              <div key={finish} className="flex items-center justify-between border-b border-border/60 pb-2">
                                <span className="text-muted-foreground">{finish}</span>
                                <span className="font-mono font-bold text-foreground">{count} tiles</span>
                              </div>
                            ))
                          )}
                        </div>
                      </div>

                    </div>
                  </div>
                )}

                {/* 4B. Usage History */}
                {usageSubTab === "history" && (
                  <div className="ds-card p-6 sm:p-7 space-y-4">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h2 className="ds-section-title">Tile Upload & Usage History</h2>
                        <p className="ds-subtitle">Chronological record of all textures added to your showroom catalog</p>
                      </div>
                      <span className="text-xs font-mono font-bold text-muted-foreground">
                        {tilesCount} total entries
                      </span>
                    </div>

                    {tilesCount === 0 ? (
                      <EmptyState icon={Clock} title="No upload history recorded yet" />
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="min-w-full text-left text-xs">
                          <thead>
                            <tr className="text-2xs font-bold text-muted-foreground uppercase tracking-wider border-b border-border">
                              <th className="pb-3">Texture</th>
                              <th className="pb-3">SKU</th>
                              <th className="pb-3">Name</th>
                              <th className="pb-3">Dimensions</th>
                              <th className="pb-3">Category</th>
                              <th className="pb-3">Finish</th>
                              <th className="pb-3">Price</th>
                              <th className="pb-3">Date Added</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border/60">
                            {(user.tiles || []).map((t: any, idx: number) => (
                              <tr key={t.id || idx} className="hover:bg-accent">
                                <td className="py-3 px-2">
                                  <div className="h-8 w-8 rounded-lg overflow-hidden bg-secondary border border-input shrink-0">
                                    <img src={t.previewUrl || t.textureUrl} alt="" className="w-full h-full object-cover" />
                                  </div>
                                </td>
                                <td className="py-3 px-2 font-mono font-bold text-foreground">{t.sku}</td>
                                <td className="py-3 px-2 text-muted-foreground">{t.name}</td>
                                <td className="py-3 px-2 font-mono text-muted-foreground">{t.widthMm} × {t.heightMm} mm</td>
                                <td className="py-3 px-2 capitalize">{t.category}</td>
                                <td className="py-3 px-2 text-muted-foreground">{t.finish || "Matt"}</td>
                                <td className="py-3 px-2 font-mono font-bold">LKR {(t.pricePerSqFt || 0).toLocaleString()}</td>
                                <td className="py-3 px-2 text-muted-foreground">
                                  {t.createdAt ? new Date(t.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "N/A"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

              </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* 5. TAB: SUBSCRIPTION                                           */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            {activeTab === "subscription" && (
              <div className="space-y-6">
                
                {/* ── UNIFIED SUBSCRIPTION & CURRENT PLAN HERO BANNER ─────────────────── */}
                <div className="relative overflow-hidden rounded-3xl border border-border bg-card p-6 sm:p-8 shadow-elevated">
                  {/* Subtle decorative background gradient glow */}
                  <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
                  <div className="pointer-events-none absolute -left-20 -bottom-20 h-64 w-64 rounded-full bg-primary/5 blur-3xl" />

                  <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                    
                    {/* Left Column: Current Activated Plan & Expiry Date */}
                    <div className="space-y-5">
                      
                      {/* Plan Header & Status */}
                      <div className="space-y-2">
                        <div className={cn(
                          "inline-flex items-center gap-2 px-3 py-1 rounded-full border text-xs font-semibold",
                          isExpired
                            ? "bg-destructive/10 border-destructive/25 text-destructive"
                            : "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                        )}>
                          <span className="relative flex h-2 w-2">
                            {!isExpired && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />}
                            <span className={cn("relative inline-flex rounded-full h-2 w-2", isExpired ? "bg-destructive" : "bg-emerald-500")} />
                          </span>
                          <span>{isExpired ? "Subscription Expired" : isOnTrial ? "Free Trial" : "Active Subscription"}</span>
                        </div>

                        <div>
                          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
                            {currentPackageName.toLowerCase().endsWith("plan") ? currentPackageName : `${currentPackageName} Plan`}
                          </h2>
                        </div>
                      </div>

                      {/* Expiry Date & Time Remaining (Clean, no background container, no icon) */}
                      <div className="flex items-center gap-6 flex-wrap">
                        {subscriptionStartDate && (
                          <div>
                            <span className="text-2xs text-muted-foreground uppercase tracking-wider block font-semibold">
                              Start Date
                            </span>
                            <span className="text-sm font-bold text-foreground font-mono">
                              {subscriptionStartDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}
                            </span>
                          </div>
                        )}

                        {subscriptionMonths !== null && !isOnTrial && (
                          <div className={subscriptionStartDate ? "pl-6 border-l border-border/60" : ""}>
                            <span className="text-2xs text-muted-foreground uppercase tracking-wider block font-semibold">
                              Duration
                            </span>
                            <span className="text-sm font-bold text-foreground font-mono">
                              {durationLabel(subscriptionMonths)}
                            </span>
                          </div>
                        )}

                        <div className={subscriptionStartDate || subscriptionMonths !== null ? "pl-6 border-l border-border/60" : ""}>
                          <span className="text-2xs text-muted-foreground uppercase tracking-wider block font-semibold">
                            Expiry Date
                          </span>
                          <span className="text-sm font-bold text-foreground font-mono">
                            {expiryDate
                              ? expiryDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
                              : "Active / Indefinite"}
                          </span>
                        </div>

                        {daysRemaining !== null && (
                          <div className="pl-6 border-l border-border/60">
                            <span className="text-2xs text-muted-foreground uppercase tracking-wider block font-semibold">
                              Time Remaining
                            </span>
                            <span className={cn(
                              "text-sm font-bold font-mono",
                              daysRemaining <= 7 ? "text-destructive" : daysRemaining <= 30 ? "text-amber-500" : "text-emerald-500"
                            )}>
                              {daysRemaining} {daysRemaining === 1 ? "day" : "days"} left
                            </span>
                          </div>
                        )}
                      </div>

                    </div>

                    {/* Right Column: Tile Limit Circular Progress Bar (without extra bg container) */}
                    <div className="flex items-center justify-start sm:justify-end shrink-0">
                      <div className="relative w-28 h-28 shrink-0 flex items-center justify-center">
                        <svg className="w-full h-full -rotate-90 transform" viewBox="0 0 100 100">
                          {/* Background Track */}
                          <circle
                            cx="50"
                            cy="50"
                            r="38"
                            className="stroke-muted-foreground/20"
                            strokeWidth="8"
                            fill="transparent"
                          />
                          {/* Progress Arc */}
                          <circle
                            cx="50"
                            cy="50"
                            r="38"
                            className="stroke-primary transition-all duration-700 ease-out"
                            strokeWidth="8"
                            strokeDasharray={238.76}
                            strokeDashoffset={238.76 * (1 - Math.min(100, Math.max(0, quotaPercent)) / 100)}
                            strokeLinecap="round"
                            fill="transparent"
                          />
                        </svg>

                        {/* Centered Percentage */}
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                          <span className="text-lg font-extrabold font-mono text-foreground tracking-tight leading-none">
                            {quotaPercent}%
                          </span>
                          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mt-0.5">
                            Used
                          </span>
                        </div>
                      </div>
                    </div>

                  </div>
                </div>

                {/* Plan Tier Cards */}
                <SettingsNotice notice={upgradeNotice} onDismiss={() => setUpgradeNotice(null)} />
                {(() => {
                  const activePlans: SubscriptionPlanItem[] = livePlans.filter((p) => p.active);

                  // The showroom's package is matched to a saved package by name ("Enterprise", the old name, is the Custom Plan)
                  const currentMatchedPlan = findPackage(user.subscriptionPackage, livePlans);
                  const currentPlanPrice = currentMatchedPlan?.price ?? 0;

                  return (
                    <div className="overflow-x-auto pb-4">
                      <div className="grid grid-cols-3 gap-3 sm:gap-6 min-w-[700px] lg:min-w-0">
                      {activePlans.map((tier) => {
                        const isCurrent = !!currentMatchedPlan && tier.id === currentMatchedPlan.id;

                        const isDowngrade = !isCurrent && currentPlanPrice > 0 && tier.price < currentPlanPrice;

                        // A Custom Plan is priced per showroom, so its amount stays masked
                        const displayPrice = tier.isCustomPrice || isCustomPlan(tier.name)
                          ? tier.customPriceLabel || "LKR XX,XXX"
                          : `${tier.currency || "LKR"} ${tier.price.toLocaleString()}`;
                        const periodLabel = tier.billingCycle === "yearly" ? "/year" : "/month";

                        return (
                          <div
                            key={tier.id}
                            className={cn(
                              "relative rounded-[1.5rem] p-4 sm:p-6 lg:p-7 bg-black text-white border transition-all duration-300 flex flex-col justify-between group shadow-xl",
                              isCurrent
                                ? "border-2 border-emerald-500 ring-4 ring-emerald-500/20 shadow-lg shadow-emerald-500/15"
                                : tier.isPopular
                                  ? "border-zinc-700 hover:border-zinc-500 ring-1 ring-white/10"
                                  : "border-zinc-800 hover:border-zinc-600"
                            )}
                          >
                            {/* Top Section: Plan Name, Badges, Price & Quota */}
                            <div>
                              <div className="flex items-center justify-between mb-3">
                                <h3 className="font-bold text-base sm:text-lg text-white tracking-wide truncate">
                                  {tier.name.trim().toLowerCase().endsWith("plan") ? tier.name : `${tier.name} Plan`}
                                </h3>
                                {isCurrent ? (
                                  <span className="bg-emerald-500 text-black font-extrabold px-2.5 py-0.5 rounded-full text-2xs flex items-center gap-1 shadow-sm tracking-wider uppercase shrink-0">
                                    <Check className="w-3 h-3 stroke-[3]" /> Activated
                                  </span>
                                ) : tier.isPopular ? (
                                  <span className="bg-zinc-800 border border-zinc-700 text-zinc-200 px-2.5 py-0.5 rounded-full text-2xs font-bold tracking-wider uppercase shrink-0">
                                    Popular
                                  </span>
                                ) : null}
                              </div>

                              {/* Price Display from Uiverse card */}
                              <div className="flex items-baseline gap-1 mt-1">
                                <span className="text-xl sm:text-3xl lg:text-[2.5rem] font-light tracking-tight text-white font-mono leading-none">
                                  {displayPrice}
                                </span>
                                <span className="text-xs text-zinc-400 font-normal ml-1">
                                  {periodLabel}
                                </span>
                              </div>
                              <p className="text-2xs font-mono text-zinc-400 mt-2">
                                {tier.quotaLabel || `${tier.tileQuota} storage quota`}
                              </p>

                              {/* Action Button: Activated vs Downgrade vs Upgrade */}
                              {isCurrent ? (
                                <button
                                  type="button"
                                  disabled
                                  aria-disabled="true"
                                  className="mt-6 w-full rounded-full border-2 border-emerald-500 bg-emerald-500/15 text-emerald-400 py-2.5 px-6 text-sm font-bold text-center cursor-default select-none outline-none flex items-center justify-center gap-2 shadow-sm"
                                >
                                  <Check className="w-4 h-4 stroke-[3] text-emerald-400" />
                                  <span>Activated</span>
                                </button>
                              ) : isDowngrade ? (
                                <button
                                  type="button"
                                  onClick={() => setUpgradeModalPlan({ name: tier.name, price: tier.price, isDowngrade: true })}
                                  className="mt-6 w-full rounded-full border-2 border-amber-400/80 bg-amber-400/10 hover:bg-amber-400 text-amber-300 hover:text-black py-2.5 px-6 text-sm font-bold text-center transition-all duration-200 cursor-pointer outline-none flex items-center justify-center gap-1.5 group/btn shadow-sm active:scale-[0.98]"
                                >
                                  <span>Request Downgrade</span>
                                  <ArrowDownLeft className="w-4 h-4 text-amber-400 group-hover/btn:text-black group-hover/btn:-translate-x-0.5 group-hover/btn:translate-y-0.5 transition-transform stroke-[2.5]" />
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setUpgradeModalPlan({ name: tier.name, price: tier.price, isDowngrade: false })}
                                  className="mt-6 w-full rounded-full border-2 border-white bg-white hover:bg-transparent text-black hover:text-white py-2.5 px-6 text-sm font-bold text-center transition-all duration-200 cursor-pointer outline-none flex items-center justify-center gap-1.5 group/btn shadow-sm active:scale-[0.98]"
                                >
                                  <span>Request Upgrade</span>
                                  <ArrowUpRight className="w-4 h-4 opacity-70 group-hover/btn:opacity-100 group-hover/btn:translate-x-0.5 group-hover/btn:-translate-y-0.5 transition-transform" />
                                </button>
                              )}
                            </div>

                            {/* Features List (.lists and .list from Uiverse card) */}
                            <div className="mt-8 pt-5 border-t border-zinc-800/80">
                              <span className="text-2xs font-bold uppercase tracking-wider text-zinc-400 block mb-3.5">
                                Included Capabilities
                              </span>
                              <ul className="flex flex-col gap-3 font-normal text-sm text-white">
                                {tier.features.map((f, i) => (
                                  <li key={i} className="flex items-center">
                                    <svg
                                      xmlns="http://www.w3.org/2000/svg"
                                      fill="none"
                                      viewBox="0 0 24 24"
                                      className={cn(
                                        "h-4 w-4 shrink-0",
                                        isCurrent ? "text-emerald-400 fill-emerald-400" : "text-white fill-white"
                                      )}
                                    >
                                      <path
                                        fill="currentColor"
                                        d="M21.5821 5.54289C21.9726 5.93342 21.9726 6.56658 21.5821 6.95711L10.2526 18.2867C9.86452 18.6747 9.23627 18.6775 8.84475 18.293L2.29929 11.8644C1.90527 11.4774 1.89956 10.8443 2.28655 10.4503C2.67354 10.0562 3.30668 10.0505 3.70071 10.4375L9.53911 16.1717L20.1679 5.54289C20.5584 5.15237 21.1916 5.15237 21.5821 5.54289Z"
                                        clipRule="evenodd"
                                        fillRule="evenodd"
                                      />
                                    </svg>
                                    <span className="ml-3 text-xs sm:text-sm text-zinc-300 font-medium leading-snug">
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
                    </div>
                  );
                })()}

              </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* 6. TAB: REPORTS                                                */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* 6. TAB: REPORTS                                                */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            {activeTab === "reports" && (
              <div className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h2 className="ds-section-title">
                      Tile Inventory & Valuation Report
                    </h2>
                    <p className="ds-subtitle">
                      Detailed catalog summary with dimensions, surface classification, and price per square foot
                    </p>
                  </div>

                  <button
                    onClick={handleExportCSV}
                    className="ds-btn ds-btn-lg ds-btn-primary self-start sm:self-auto cursor-pointer"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>Export Inventory (CSV)</span>
                  </button>
                </div>

                {/* Report Summary Cards (matching dashboard 3 component box design) */}
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-3 py-2">
                  <NeumorphicMetricCard
                    label="Total Catalog Value (Est.)"
                    value={`LKR ${estimatedShopValue.toLocaleString()}`}
                  />

                  <NeumorphicMetricCard
                    label="Average Tile Price"
                    value={`LKR ${avgTilePrice.toLocaleString()}`}
                  />

                  <NeumorphicMetricCard
                    label="Active Texture Slots"
                    value={tilesCount}
                    suffix={`/ ${tileQuota}`}
                  />
                </div>

                {/* Report Table */}
                <div className="ds-card p-6 sm:p-7">
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-left text-xs">
                      <thead>
                        <tr className="text-2xs font-bold text-muted-foreground uppercase tracking-wider border-b border-border">
                          <th className="pb-3">SKU</th>
                          <th className="pb-3">Tile Name</th>
                          <th className="pb-3">Size (mm)</th>
                          <th className="pb-3">Surface</th>
                          <th className="pb-3">Finish</th>
                          <th className="pb-3 text-right">Price</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/60">
                        {(user.tiles || []).map((t: any, idx: number) => (
                          <tr key={t.id || idx} className="hover:bg-accent">
                            <td className="py-3 px-2 font-mono font-bold text-foreground">{t.sku}</td>
                            <td className="py-3 px-2 text-foreground/80">{t.name}</td>
                            <td className="py-3 px-2 font-mono text-muted-foreground">{t.widthMm} × {t.heightMm} mm</td>
                            <td className="py-3 px-2">
                              <StatusBadge className="capitalize">
                                {t.category === "both" ? "Both" : t.category}
                              </StatusBadge>
                            </td>
                            <td className="py-3 px-2 text-muted-foreground">{t.finish || "Matt"}</td>
                            <td className="py-3 px-2 text-right font-mono font-bold text-foreground">
                              LKR {(t.pricePerSqFt || 0).toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* 7. TAB: NOTIFICATIONS                                          */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            {activeTab === "notifications" && (
              <div className="space-y-6 max-w-4xl mx-auto">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="ds-section-title">Showroom Notifications</h2>
                    <p className="ds-subtitle">Payment reminders, system updates, storage capacity warnings, and visualizer alerts</p>
                  </div>

                  {feed.unreadCount > 0 && (
                    <div className="flex items-center shrink-0">
                      <button type="button" onClick={() => void feed.markAllRead()} className="ds-btn ds-btn-sm ds-btn-outline">
                        <Check className="h-3.5 w-3.5" />
                        <span>Mark all as read</span>
                      </button>
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  {/* Payment reminders from the administrator: saved in the database, so they are here whenever the owner signs in */}
                  {paymentReminders.map((n) => (
                    <PaymentReminderCard key={n.id} n={n} onMarkRead={feed.markRead} />
                  ))}

                  {/* System & status alerts */}
                  {activeNotifications.map((n) => (
                    <div
                      key={n.id}
                      className="p-5 rounded-2xl bg-card border border-border shadow-xs flex items-start justify-between gap-4"
                    >
                      <div className="flex items-start gap-3.5">
                        <div className={`mt-0.5 h-8 w-8 rounded-xl flex items-center justify-center shrink-0 ${
                          n.severity === "high"
                            ? "bg-destructive-muted text-destructive"
                            : n.severity === "medium"
                            ? "bg-warning-muted text-warning"
                            : "bg-success-muted text-success"
                        }`}>
                          {n.severity === "high" ? <AlertTriangle className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-bold text-xs text-foreground">{n.title}</h4>
                            <span className="text-2xs text-muted-foreground">• {n.time}</span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                            {n.description}
                          </p>
                        </div>
                      </div>

                      <button
                        onClick={() => setDismissedNotifications((prev) => [...prev, n.id])}
                        className="text-muted-foreground hover:text-foreground p-1 rounded-lg hover:bg-accent transition-colors cursor-pointer"
                        title="Dismiss"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}

                  {paymentReminders.length === 0 && activeNotifications.length === 0 && (
                    <div className="ds-card p-12 text-center text-muted-foreground text-xs">
                      No notifications right now. Everything is up to date!
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* 8. TAB: SETTINGS                                               */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            {activeTab === "settings" && (
              <div className="w-full space-y-6">
                <SettingsTabs
                  active={settingsSubTab}
                  onSelect={setSettingsSubTab}
                  items={[
                    { id: "profile", label: "Profile" },
                    { id: "branding", label: "Branding" },
                    { id: "visualizer", label: "Visualizer" },
                    { id: "appearance", label: "Theme" },
                    { id: "account", label: "Account" },
                    { id: "security", label: "Security" },
                  ]}
                />

                <SettingsNotice notice={settingsMessage} onDismiss={() => setSettingsMessage(null)} />

                {settingsSubTab === "profile" && (
                  <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
                  <form onSubmit={handleSaveProfile}>
                    <SettingsCard title="Shop profile" description="How your showroom appears to customers.">
                      <SettingsRow label="Showroom name" htmlFor="shop-name">
                        <input
                          id="shop-name"
                          type="text"
                          required
                          value={profileForm.shopName}
                          onChange={(e) => setProfileForm({ ...profileForm, shopName: e.target.value })}
                          className="ds-field"
                          placeholder="e.g. Royal Ceramic Studio"
                        />
                      </SettingsRow>
                      <SettingsRow label="Description" htmlFor="shop-details">
                        <textarea
                          id="shop-details"
                          rows={4}
                          value={profileForm.details}
                          onChange={(e) => setProfileForm({ ...profileForm, details: e.target.value })}
                          className="ds-field resize-y"
                          placeholder="Premium Italian porcelain, vitrified tiles, and custom mosaic installations."
                        />
                      </SettingsRow>
                      <SettingsSave saving={isSavingSettings} label="Save changes" />
                    </SettingsCard>
                  </form>
                  <ShowroomPreview
                    name={profileForm.shopName}
                    description={profileForm.details}
                    logoUrl={brandingForm.logoUrl}
                    coverUrl={brandingForm.coverPhotoUrl}
                  />
                  </div>
                )}

                {settingsSubTab === "branding" && (
                  <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
                  <form onSubmit={handleSaveBranding}>
                    <SettingsCard title="Branding" description="Your logo and cover banner.">
                      <SettingsRow label="Logo link" htmlFor="brand-logo" hint="A transparent PNG at least 400px wide looks best.">
                        <div className="flex items-center gap-3">
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-white">
                            {brandingForm.logoUrl ? (
                              <img src={brandingForm.logoUrl} alt="Logo preview" className="h-full w-full object-cover" />
                            ) : (
                              <Store className="h-5 w-5 text-neutral-400" />
                            )}
                          </div>
                          <input
                            id="brand-logo"
                            type="url"
                            value={brandingForm.logoUrl}
                            onChange={(e) => setBrandingForm({ ...brandingForm, logoUrl: e.target.value.trim() })}
                            placeholder="https://…/logo.png"
                            className="ds-field min-w-0 flex-1"
                          />
                        </div>
                      </SettingsRow>
                      <SettingsRow
                        label="Cover banner link"
                        htmlFor="brand-cover"
                        hint="Shown on your dashboard and above the 3D visualizer. Best at 1600×500, JPG or WebP, under 500 KB."
                      >
                        {brandingForm.coverPhotoUrl && (
                          <div className="aspect-[16/5] w-full overflow-hidden rounded-xl border border-border bg-muted">
                            <BannerImage
                              src={brandingForm.coverPhotoUrl}
                              alt="Cover banner preview"
                              errorFallback={
                                <div role="alert" className="flex h-full items-center justify-center bg-destructive-muted px-4 text-center text-xs font-semibold text-destructive">
                                  This link could not be loaded as an image. Use a direct link to a .jpg, .png or .webp file.
                                </div>
                              }
                            />
                          </div>
                        )}
                        <input
                          id="brand-cover"
                          type="url"
                          value={brandingForm.coverPhotoUrl}
                          onChange={(e) => setBrandingForm({ ...brandingForm, coverPhotoUrl: e.target.value.trim() })}
                          placeholder="https://…/banner.jpg"
                          className="ds-field"
                        />
                      </SettingsRow>
                      <SettingsRow
                        label="Banner opens (optional)"
                        htmlFor="brand-cover-link"
                        hint="Where customers go when they click the banner, such as your website or WhatsApp chat."
                      >
                        <input
                          id="brand-cover-link"
                          type="url"
                          value={brandingForm.coverLinkUrl}
                          onChange={(e) => setBrandingForm({ ...brandingForm, coverLinkUrl: e.target.value.trim() })}
                          placeholder="https://your-showroom.com"
                          className="ds-field"
                        />
                      </SettingsRow>
                      <SettingsSave saving={isSavingSettings} label="Save branding" />
                    </SettingsCard>
                  </form>
                  <ShowroomPreview
                    name={profileForm.shopName}
                    description={profileForm.details}
                    logoUrl={brandingForm.logoUrl}
                    coverUrl={brandingForm.coverPhotoUrl}
                  />
                  </div>
                )}

                {settingsSubTab === "visualizer" && (
                  <SettingsCard
                    title="Visualizer downloads"
                    description="Choose whether customers can save a picture of their design from each visualizer. A change applies straight away, on every device, and only to your showroom."
                  >
                    <SettingsSwitch
                      id="download-2d"
                      label="2D Visualizer download button"
                      description="Shows a Download button in the 2D room-photo visualizer. It saves the customer's tiled room photo as a high-quality picture, with the floor and wall tiles they chose."
                      checked={downloads.viz2d}
                      disabled={savingDownload !== null || !visualizerAccess.viz2d}
                      onChange={(next) => handleDownloadSwitch("viz2d", next)}
                    />
                    <SettingsSwitch
                      id="download-3d"
                      label="3D Visualizer download button"
                      description="Shows a Download button in the 3D visualizer. It saves a high-quality picture of the room exactly as the customer is looking at it."
                      checked={downloads.viz3d}
                      disabled={savingDownload !== null || !visualizerAccess.viz3d}
                      onChange={(next) => handleDownloadSwitch("viz3d", next)}
                    />
                  </SettingsCard>
                )}

                {settingsSubTab === "appearance" && (
                  <SettingsCard title="Theme" description="Pick a look. It applies to the whole dashboard straight away.">
                    <ThemeSelector showTitle={false} className="!rounded-none !border-0 !bg-transparent !p-0 !shadow-none" />
                  </SettingsCard>
                )}

                {settingsSubTab === "account" && (
                  <SettingsCard title="Account" description="Your sign-in details. These cannot be changed here." bodyClassName="grid gap-6 md:grid-cols-2">
                    <SettingsRow label="Login email" htmlFor="acct-email">
                      <CopyField id="acct-email" value={user.email} mono={false} />
                    </SettingsRow>
                    <SettingsRow label="Showroom ID" htmlFor="acct-id" hint="Quote this when you contact support.">
                      <CopyField id="acct-id" value={user.id} />
                    </SettingsRow>
                  </SettingsCard>
                )}

                {settingsSubTab === "security" && (
                  <form onSubmit={handleSaveSecurity}>
                    <SettingsCard title="Password" description="Change the password you use to sign in." bodyClassName="grid gap-6 md:grid-cols-3">
                      <SettingsRow label="Current password" htmlFor="pw-current">
                        <PasswordField
                          id="pw-current"
                          autoComplete="current-password"
                          value={securityForm.currentPassword}
                          onChange={(v) => setSecurityForm({ ...securityForm, currentPassword: v })}
                        />
                      </SettingsRow>
                      <SettingsRow label="New password" htmlFor="pw-new" hint="At least 6 characters.">
                        <PasswordField
                          id="pw-new"
                          autoComplete="new-password"
                          minLength={6}
                          value={securityForm.newPassword}
                          onChange={(v) => setSecurityForm({ ...securityForm, newPassword: v })}
                        />
                      </SettingsRow>
                      <SettingsRow label="Confirm new password" htmlFor="pw-confirm">
                        <PasswordField
                          id="pw-confirm"
                          autoComplete="new-password"
                          value={securityForm.confirmPassword}
                          onChange={(v) => setSecurityForm({ ...securityForm, confirmPassword: v })}
                        />
                      </SettingsRow>
                      <SettingsSave saving={isSavingSettings} label="Update password" />
                    </SettingsCard>
                  </form>
                )}
              </div>
            )}

          </main>
        </div>
      </div>

      {/* ── CREATE / EDIT COLLECTION MODAL ────────────────────────────────────────── */}
      {isCollectionModalOpen && (
        <div className="fixed inset-0 z-50 flex justify-center overflow-y-auto bg-black/60 p-3 backdrop-blur-sm sm:p-4" role="dialog" aria-modal="true">
          <button type="button" aria-label="Close" onClick={() => setIsCollectionModalOpen(false)} className="fixed inset-0 cursor-default" />
          <div className="relative z-10 my-auto w-full max-w-xl rounded-3xl border border-border bg-card p-5 sm:p-7 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div>
                <h3 className="text-lg font-bold text-foreground">
                  {editingCollectionId ? "Edit Collection" : "Create Showroom Collection"}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {editingCollectionId
                    ? "Update collection title and description"
                    : "Create a named collection suite for your showroom"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsCollectionModalOpen(false)}
                className="rounded-full p-2 text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveCollection} className="space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="font-semibold text-foreground">
                  Collection Name <span className="text-red-500 font-bold">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={collectionForm.name}
                  onChange={(e) => setCollectionForm({ ...collectionForm, name: e.target.value })}
                  placeholder="e.g., Scandinavian Master Bath Suite"
                  className="ds-field"
                />
              </div>

              <div className="space-y-1.5">
                <label className="font-semibold text-foreground">Description</label>
                <textarea
                  rows={2}
                  value={collectionForm.desc}
                  onChange={(e) => setCollectionForm({ ...collectionForm, desc: e.target.value })}
                  placeholder="Describe this tile collection suite..."
                  className="ds-field"
                />
              </div>



              <div className="flex items-center justify-end gap-3 pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={() => setIsCollectionModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="ds-btn ds-btn-primary"
                >
                  {editingCollectionId ? "Update Collection" : "Save Collection"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── UPGRADE / CONTACT ECHILION MODAL ─── */}
      {upgradeModalPlan && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-md"
          role="dialog"
          aria-modal="true"
        >
          <div className="fixed inset-0 cursor-default" onClick={() => setUpgradeModalPlan(null)} />

          <div
            className="relative z-[100] w-[400px] max-w-[95vw] overflow-hidden rounded-3xl border border-white/10 bg-[#0c0c0f] shadow-2xl shadow-black/60"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Soft brand glow + hairline accent */}
            <div className="pointer-events-none absolute inset-x-0 top-0 h-52 bg-[radial-gradient(ellipse_at_top,rgba(239,12,23,0.28),transparent_70%)]" />
            <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-[#ef0c17] to-transparent" />

            <button
              type="button"
              onClick={() => setUpgradeModalPlan(null)}
              className="absolute right-3.5 top-3.5 z-10 flex size-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-zinc-400 transition-colors hover:bg-white/10 hover:text-white cursor-pointer"
              title="Close"
            >
              <X className="h-4 w-4" />
            </button>

            {/* Brand header */}
            <div className="relative flex flex-col items-center px-6 pb-5 pt-9 text-center">
              <div className="flex size-24 items-center justify-center rounded-3xl bg-black p-3 ring-1 ring-white/10 shadow-xl shadow-red-950/40">
                <img src="/Logo/logo_echilion.png" alt="Echilion" className="h-full w-full object-contain" />
              </div>
              <p className="mt-4 text-xl font-extrabold tracking-[0.22em] text-white">ECHILION</p>
              <span className="mt-2.5 inline-flex items-center gap-1.5 rounded-full border border-[#ef0c17]/30 bg-[#ef0c17]/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-zinc-200">
                <span className="size-1.5 rounded-full bg-[#ef0c17]" />
                {upgradeModalPlan.isDowngrade ? "Downgrade to " : "Upgrade to "}
                <span className="text-[#ff4d55]">{upgradeModalPlan.name}</span> plan
              </span>
              <p className="mt-3 text-xs font-medium text-zinc-500">Reach out and we will switch your plan.</p>
            </div>

            {(() => {
              const displaySupportPhone = platformLinks?.phone || feed.supportPhone || "+94 77 123 4567";
              const rawPhone = displaySupportPhone.replace(/[^+\d]/g, "");
              const rawWaPhone = (platformLinks?.phone || feed.supportPhone || "94771234567").replace(/[^\d]/g, "");
              const actionLabel = upgradeModalPlan.isDowngrade ? "downgrade" : "upgrade";
              const waMessage = `Hello Echilion, I would like to request a plan ${actionLabel} for my showroom (${user.shopName || "Showroom"}) to the ${upgradeModalPlan.name} plan.`;
              const emailSubject = `${upgradeModalPlan.isDowngrade ? "Downgrade Request" : "Upgrade Request"}: ${upgradeModalPlan.name} Plan for ${user.shopName || "Showroom"}`;
              const waHref = `https://wa.me/${rawWaPhone}?text=${encodeURIComponent(waMessage)}`;

              const rowCls = "group/row flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.03] p-2.5 transition-colors hover:border-[#ef0c17]/40 hover:bg-white/[0.06]";
              const chipCls = "flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#ef0c17]/10 text-[#ef0c17] transition-colors group-hover/row:bg-[#ef0c17] group-hover/row:text-white";
              const labelCls = "text-[10px] font-bold uppercase tracking-wider text-zinc-500";
              const valueCls = "truncate text-sm font-semibold text-zinc-100 tabular-nums";
              const actCls = "flex size-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-zinc-400 transition-colors hover:bg-white/10 hover:text-white cursor-pointer";

              return (
                <div className="relative flex flex-col gap-2.5 px-5 pb-6">
                  {/* Phone */}
                  <div className={rowCls}>
                    <a href={`tel:${rawPhone}`} className="flex min-w-0 flex-1 items-center gap-3">
                      <span className={chipCls}><Phone className="size-[18px]" /></span>
                      <span className="min-w-0">
                        <span className={`block ${labelCls}`}>Call</span>
                        <span className={`block ${valueCls}`}>{displaySupportPhone}</span>
                      </span>
                    </a>
                    <button type="button" onClick={(e) => { e.stopPropagation(); handleCopyContact(displaySupportPhone, "phone"); }} className={actCls} title="Copy phone">
                      {copiedContact === "phone" ? <Check className="size-4 text-emerald-500" /> : <Copy className="size-4" />}
                    </button>
                  </div>

                  {/* WhatsApp */}
                  <div className={rowCls}>
                    <a href={waHref} target="_blank" rel="noopener noreferrer" className="flex min-w-0 flex-1 items-center gap-3">
                      <span className={chipCls}>
                        <svg viewBox="0 0 24 24" className="size-[18px] fill-current" xmlns="http://www.w3.org/2000/svg">
                          <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0012.04 2zm0 18.15c-1.48 0-2.93-.4-4.2-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.16 8.16 0 01-1.25-4.38c0-4.54 3.7-8.24 8.24-8.24 2.2 0 4.27.86 5.82 2.42a8.18 8.18 0 012.41 5.83c0 4.54-3.7 8.23-8.23 8.23zm4.51-6.17c-.25-.12-1.47-.72-1.7-.81-.23-.08-.39-.12-.56.12-.17.25-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-2-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.12-.14.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.4-.42-.56-.43h-.48c-.17 0-.43.06-.66.31-.23.25-.87.85-.87 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.6.19 1.14.16 1.57.1.48-.07 1.47-.6 1.68-1.18.21-.58.21-1.07.15-1.18-.07-.12-.23-.19-.48-.31z" />
                        </svg>
                      </span>
                      <span className="min-w-0">
                        <span className={`block ${labelCls}`}>WhatsApp</span>
                        <span className={`block ${valueCls}`}>{displaySupportPhone}</span>
                      </span>
                    </a>
                    <a href={waHref} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className={actCls} title="Open WhatsApp">
                      <MessageCircle className="size-4" />
                    </a>
                  </div>

                  {/* Email */}
                  <div className={rowCls}>
                    <a href={`mailto:echilion@gmail.com?subject=${encodeURIComponent(emailSubject)}`} className="flex min-w-0 flex-1 items-center gap-3">
                      <span className={chipCls}><Mail className="size-[18px]" /></span>
                      <span className="min-w-0">
                        <span className={`block ${labelCls}`}>Email</span>
                        <span className={`block ${valueCls}`}>echilion@gmail.com</span>
                      </span>
                    </a>
                    <button type="button" onClick={(e) => { e.stopPropagation(); handleCopyContact("echilion@gmail.com", "email"); }} className={actCls} title="Copy email">
                      {copiedContact === "email" ? <Check className="size-4 text-emerald-500" /> : <Copy className="size-4" />}
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* ── ADD TILE DRAWER MODAL ─────────────────────────────────────────── */}
      <AddTileDrawer
        isOpen={isAddDrawerOpen}
        onClose={() => setIsAddDrawerOpen(false)}
        disabled={isQuotaFull}
        currentCount={tilesCount}
        quota={tileQuota}
        collections={collections.map((c) => ({ id: c.id, name: c.name }))}
        onTileAddedToCollection={handleTileAddedToCollection}
      />

    </div>
  );
}
