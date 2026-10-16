"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Box, CheckCircle2, Image as ImageIcon, Loader2, Lock, Search, ShieldAlert } from "lucide-react";
import { setVisualizerAccess } from "@/actions/admin";
import { SettingsNotice } from "../shop/ShopSettingsParts";
import {
  SUMMARY_LABEL,
  VISUALIZER_LABEL,
  accessStates,
  canonicalPlan,
  effectiveAccess,
  isSpecialGrant,
  summarize,
  type AccessState,
  type AccessSummary,
  type VisualizerKind,
} from "@/lib/visualizerAccess";
import { planLabel } from "@/lib/subscriptionPlans";
import { cn } from "@/lib/utils";

interface Shop {
  id: string;
  shopName?: string | null;
  email: string;
  subscriptionPackage?: string | null;
  details?: string | null;
}

const PLANS = ["Free Trial", "Starter", "Professional", "Custom"];
const SUMMARIES: AccessSummary[] = ["both", "2d-only", "3d-only", "none"];

const SUMMARY_STYLE: Record<AccessSummary, string> = {
  both: "bg-success-muted text-success",
  "2d-only": "bg-info-muted text-info",
  "3d-only": "bg-info-muted text-info",
  none: "bg-destructive-muted text-destructive",
};

/** One visualizer for one showroom: a switch, or a lock when the plan does not include it. */
function AccessToggle({ kind, state, special, busy, shopName, plan, onChange }: { kind: VisualizerKind; state: AccessState; special: boolean; busy: boolean; shopName: string; plan: string; onChange: (next: boolean) => void }) {
  const label = VISUALIZER_LABEL[kind];
  const on = state === "enabled";
  return (
    <div className="inline-flex items-center gap-2.5">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={`${label} for ${shopName}`}
        disabled={busy}
        onClick={() => onChange(!on)}
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-wait disabled:opacity-70",
          on ? "border-transparent bg-primary" : "border-border bg-secondary",
        )}
      >
        <span className={cn("flex h-5 w-5 items-center justify-center rounded-full shadow-sm transition-transform", on ? "translate-x-[22px] bg-primary-foreground" : "translate-x-0.5 bg-muted-foreground")}>
          {busy && <Loader2 className={cn("h-3 w-3 animate-spin", on ? "text-primary" : "text-secondary")} />}
        </span>
      </button>
      <span className={cn("inline-flex items-center gap-1 text-2xs font-bold", on ? "text-success" : "text-muted-foreground")}>
        {on ? <CheckCircle2 className="h-3 w-3" aria-hidden="true" /> : <Lock className="h-3 w-3" aria-hidden="true" />}
        {on ? "Enabled" : "Disabled"}
      </span>
      {special && (
        <span
          className="rounded-full border border-warning/30 bg-warning-muted px-2 py-0.5 text-2xs font-bold text-warning"
          title={`The ${label} is not part of the ${plan} plan: it is enabled for ${shopName} as an add-on. Switch it off when it is no longer needed.`}
        >
          Add-on
        </span>
      )}
    </div>
  );
}

/**
 * The main administrator's "Visualizer Access" screen: every showroom with its plan, one switch per visualizer, and what it
 * can use now. A switch saves to the database for that showroom only; the plan decides what can be switched on at all.
 */
export function VisualizerAccessPanel({ shops }: { shops: Shop[] }) {
  const [search, setSearch] = useState("");
  const [planFilter, setPlanFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | AccessSummary>("all");
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<{ success?: boolean; message?: string } | null>(null);
  // What a save returned, until the page has been refreshed with it (ignored once the showroom's saved details have changed)
  const [saved, setSaved] = useState<Record<string, { base: string | null; details: string }>>({});

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(t);
  }, [notice]);

  const rows = useMemo(
    () =>
      shops.map((s) => {
        const s2 = saved[s.id];
        const details = s2 && s2.base === (s.details ?? null) ? s2.details : s.details ?? null;
        const plan = canonicalPlan(s.subscriptionPackage);
        const states = accessStates(plan, details);
        return { shop: s, plan, states, summary: summarize(effectiveAccess(plan, details)), name: s.shopName || "Showroom" };
      }),
    [shops, saved],
  );

  const needle = search.trim().toLowerCase();
  const visible = rows.filter(
    (r) =>
      (!needle || r.name.toLowerCase().includes(needle) || r.shop.email.toLowerCase().includes(needle)) &&
      (planFilter === "all" || r.plan === planFilter) &&
      (statusFilter === "all" || r.summary === statusFilter),
  );
  const plans = [...new Set([...PLANS, ...rows.map((r) => r.plan)])];
  const count = (s: AccessSummary) => rows.filter((r) => r.summary === s).length;

  const change = async (shop: Shop, kind: VisualizerKind, enabled: boolean) => {
    const key = `${shop.id}:${kind}`;
    // One change at a time per showroom, so two quick clicks cannot overwrite each other
    if ([...busy].some((k) => k.startsWith(`${shop.id}:`))) return;
    setBusy((b) => new Set(b).add(key));
    setNotice(null);
    try {
      const res = await setVisualizerAccess(shop.id, kind, enabled);
      if (res.success && "details" in res && res.details) setSaved((m) => ({ ...m, [shop.id]: { base: shop.details ?? null, details: res.details as string } }));
      setNotice({ success: res.success, message: res.message });
    } catch {
      setNotice({ success: false, message: "Could not save this change. Please try again." });
    } finally {
      setBusy((b) => {
        const next = new Set(b);
        next.delete(key);
        return next;
      });
    }
  };

  const toggle = (r: (typeof rows)[number], kind: VisualizerKind) => (
    <AccessToggle kind={kind} state={r.states[kind]} special={isSpecialGrant(r.plan, r.shop.details, kind)} busy={busy.has(`${r.shop.id}:${kind}`)} shopName={r.name} plan={r.plan} onChange={(next) => change(r.shop, kind, next)} />
  );
  const status = (r: (typeof rows)[number]) => (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-2xs font-bold", SUMMARY_STYLE[r.summary])}>{SUMMARY_LABEL[r.summary]}</span>
  );

  return (
    <div className="space-y-6">
      <div className="ds-card space-y-5 p-6 sm:p-7">
        <div>
          <h2 className="ds-section-title">Visualizer Access</h2>
          <p className="ds-subtitle">
            Switch the 2D and 3D visualizer on or off for each showroom. Each change saves for that showroom only. A plan sets the starting point (Starter: 2D, Professional and
            Custom Plan: both), and you can switch either one on or off for any showroom, for example to give a Starter showroom 3D for a while. A change of plan resets it to the new plan's starting point.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {SUMMARIES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter((cur) => (cur === s ? "all" : s))}
              aria-pressed={statusFilter === s}
              className={cn("rounded-2xl border p-3.5 text-left transition-colors", statusFilter === s ? "border-foreground bg-accent" : "border-input bg-muted hover:bg-accent")}
            >
              <span className="block text-2xs font-bold uppercase tracking-wider text-muted-foreground">{SUMMARY_LABEL[s]}</span>
              <span className="mt-1 block text-xl font-bold text-foreground">{count(s)}</span>
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by shop name or email"
              aria-label="Search showrooms"
              className="ds-field w-full pl-10"
            />
          </div>
          <select value={planFilter} onChange={(e) => setPlanFilter(e.target.value)} aria-label="Filter by subscription plan" className="ds-field md:w-52">
            <option value="all">All plans</option>
            {plans.map((p) => (
              <option key={p} value={p}>
                {planLabel(p)}
              </option>
            ))}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as "all" | AccessSummary)} aria-label="Filter by access status" className="ds-field md:w-52">
            <option value="all">Any access</option>
            {SUMMARIES.map((s) => (
              <option key={s} value={s}>
                {SUMMARY_LABEL[s]}
              </option>
            ))}
          </select>
        </div>

        <SettingsNotice notice={notice} onDismiss={() => setNotice(null)} />
      </div>

      {visible.length === 0 ? (
        <div className="ds-card flex flex-col items-center gap-2 px-6 py-14 text-center">
          <ShieldAlert className="h-7 w-7 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm font-semibold text-foreground">{rows.length === 0 ? "No showrooms yet" : "No showroom matches"}</p>
          <p className="text-xs text-muted-foreground">{rows.length === 0 ? "Showrooms appear here once they are registered." : "Try another search or clear a filter."}</p>
        </div>
      ) : (
        <>
          {/* Tablet and desktop */}
          <div className="ds-card hidden overflow-hidden md:block">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-border text-left text-xs">
                <thead className="bg-muted text-2xs font-bold uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-5 py-4">Shop</th>
                    <th className="px-5 py-4">Shop admin email</th>
                    <th className="px-5 py-4">Plan</th>
                    <th className="px-5 py-4">
                      <span className="inline-flex items-center gap-1.5"><ImageIcon className="h-3.5 w-3.5" aria-hidden="true" />2D Visualizer</span>
                    </th>
                    <th className="px-5 py-4">
                      <span className="inline-flex items-center gap-1.5"><Box className="h-3.5 w-3.5" aria-hidden="true" />3D Visualizer</span>
                    </th>
                    <th className="px-5 py-4">Current access</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {visible.map((r) => (
                    <tr key={r.shop.id} className="transition-colors hover:bg-accent">
                      <td className="px-5 py-4 font-bold text-foreground">{r.name}</td>
                      <td className="px-5 py-4 font-mono text-2xs text-muted-foreground">{r.shop.email}</td>
                      <td className="px-5 py-4">
                        <span className="rounded-full bg-muted px-2.5 py-1 text-2xs font-bold text-foreground/80">{planLabel(r.plan)}</span>
                      </td>
                      <td className="px-5 py-4">{toggle(r, "viz2d")}</td>
                      <td className="px-5 py-4">{toggle(r, "viz3d")}</td>
                      <td className="px-5 py-4">{status(r)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Phone */}
          <ul className="space-y-3 md:hidden">
            {visible.map((r) => (
              <li key={r.shop.id} className="ds-card space-y-4 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-foreground">{r.name}</p>
                    <p className="truncate font-mono text-2xs text-muted-foreground">{r.shop.email}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-2xs font-bold text-foreground/80">{planLabel(r.plan)}</span>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground"><ImageIcon className="h-4 w-4" aria-hidden="true" />2D Visualizer</span>
                    {toggle(r, "viz2d")}
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground"><Box className="h-4 w-4" aria-hidden="true" />3D Visualizer</span>
                    {toggle(r, "viz3d")}
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
                  <span className="text-2xs font-bold uppercase tracking-wider text-muted-foreground">Current access</span>
                  {status(r)}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="text-2xs text-muted-foreground">
        Showing {visible.length} of {rows.length} showroom{rows.length === 1 ? "" : "s"}. A showroom sees its change the next time its dashboard or visualizer loads, and a restricted visualizer is refused on the server.
      </p>
    </div>
  );
}
