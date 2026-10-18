"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Banknote, ChevronDown, Clock, Download, FileSpreadsheet, FileText, Percent } from "lucide-react";
import { StatCard, StatusBadge, EmptyState, type StatusTone } from "@/components/dashboard";
import { RevenueBarInteractive } from "@/components/dashboard/RevenueBarInteractive";
import { ShopAvatar } from "@/components/ShopAvatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { buildReport, invoicesToCsv, reportFileName, type ReportInvoice, type ReportPayment, type ReportRange } from "@/lib/reports";
import { cn, formatLKR } from "@/lib/utils";

interface ReportsPanelProps {
  payments: ReportPayment[];
  shops: { id: string; shopName?: string | null; logoUrl?: string | null }[];
  /** Today as YYYY-MM-DD. */
  today: string;
  activeShowrooms: number;
  totalShowrooms: number;
  monthlyRecurring: number;
  onExportShops: () => void;
  onNotify: (message: string) => void;
}

const RANGES: { id: ReportRange; label: string }[] = [
  { id: "month", label: "This month" },
  { id: "6m", label: "6 months" },
  { id: "12m", label: "12 months" },
];

const STATUS_FILTERS = ["All", "Received", "Pending", "Failed", "Refunded"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

const PAGE = 10;
const lkr = (n: number) => formatLKR(n);
const fmtDay = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }) : "—";

function statusOf(p: ReportInvoice): { tone: StatusTone; label: string } {
  if (p.status === "Received") return { tone: "success", label: "Received" };
  if (p.overdue) return { tone: "destructive", label: "Overdue" };
  if (p.status === "Failed") return { tone: "destructive", label: "Failed" };
  if (p.status === "Pending") return { tone: "warning", label: "Pending" };
  return { tone: "neutral", label: p.status };
}

function download(content: BlobPart, type: string, name: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** A horizontal bar with its label and value, scaled against the largest row. */
function BarRow({ label, value, share, hint, lead }: { label: string; value: string; share: number; hint?: string; lead?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      {lead}
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-baseline justify-between gap-3 text-xs">
          <span className="truncate font-semibold text-foreground">{label}</span>
          <span className="shrink-0 font-mono font-bold text-foreground">{value}</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
          <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(share, share > 0 ? 3 : 0)}%` }} />
        </div>
        {hint && <p className="truncate text-2xs text-muted-foreground">{hint}</p>}
      </div>
    </div>
  );
}

export function ReportsPanel({ payments, shops, today, activeShowrooms, totalShowrooms, monthlyRecurring, onExportShops, onNotify }: ReportsPanelProps) {
  const [range, setRange] = useState<ReportRange>("6m");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("All");
  const [shown, setShown] = useState(PAGE);
  const [busy, setBusy] = useState(false);

  const report = useMemo(() => buildReport(payments, range, today), [payments, range, today]);
  const logoOf = useMemo(() => new Map(shops.map((s) => [s.id, s.logoUrl ?? null])), [shops]);

  const counts = useMemo(() => {
    const c: Record<StatusFilter, number> = { All: report.invoices.length, Received: 0, Pending: 0, Failed: 0, Refunded: 0 };
    for (const p of report.invoices) c[p.status]++;
    return c;
  }, [report.invoices]);
  const rows = statusFilter === "All" ? report.invoices : report.invoices.filter((p) => p.status === statusFilter);

  const pickRange = (r: ReportRange) => {
    setRange(r);
    setShown(PAGE);
  };

  const exportCsv = () => {
    if (report.invoices.length === 0) return onNotify("No invoices in this period to export");
    // The byte-order mark makes Excel read the file as UTF-8
    download("﻿" + invoicesToCsv(report.invoices), "text/csv;charset=utf-8;", reportFileName(report, today, "csv"));
    onNotify(`Exported ${report.invoices.length} invoices as CSV`);
  };

  const exportPdf = async () => {
    setBusy(true);
    try {
      const { buildRevenueReportPdf } = await import("@/lib/revenueReportPdf");
      const generatedOn = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
      const doc = await buildRevenueReportPdf({ report, generatedOn, platform: { activeShowrooms, totalShowrooms, monthlyRecurring } });
      doc.save(reportFileName(report, today, "pdf"));
      onNotify("Revenue report saved as PDF");
    } catch {
      onNotify("Could not create the PDF. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const periodPhrase = range === "month" ? "this month" : range === "6m" ? "the last 6 months" : "the last 12 months";
  const maxPlan = Math.max(1, ...report.byPlan.map((p) => p.collected + p.owed));
  const maxShop = Math.max(1, ...report.byShop.map((s) => s.collected + s.owed));
  const maxMethod = Math.max(1, ...report.byMethod.map((m) => m.amount));

  return (
    <div className="space-y-6">
      {/* Header: period and exports */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="ds-page-title">Revenue &amp; Reports</h2>
          <p className="ds-subtitle">{report.title}: {report.subtitle}. Each invoice counts in the month it falls due.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 self-start rounded-xl border border-input bg-muted p-1">
            {RANGES.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => pickRange(r.id)}
                aria-pressed={range === r.id}
                className={cn(
                  "cursor-pointer whitespace-nowrap rounded-lg px-3 py-1.5 text-2xs font-bold transition-all",
                  range === r.id ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" disabled={busy} className="ds-btn ds-btn-primary disabled:opacity-60">
                <Download className="h-4 w-4" />
                <span>{busy ? "Preparing…" : "Export"}</span>
                <ChevronDown className="h-3.5 w-3.5 opacity-70" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuItem onSelect={exportCsv} className="cursor-pointer gap-2">
                <FileSpreadsheet className="h-4 w-4" /> Revenue list (CSV)
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={exportPdf} className="cursor-pointer gap-2">
                <FileText className="h-4 w-4" /> Revenue report (PDF)
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onExportShops} className="cursor-pointer gap-2">
                <FileSpreadsheet className="h-4 w-4" /> Showroom list (CSV)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Key figures for the period */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Banknote} label="Collected" value={lkr(report.collected)} tag={range === "month" ? "This month" : range === "6m" ? "6 months" : "12 months"} hint={`${counts.Received} invoice${counts.Received === 1 ? "" : "s"} received`} />
        <StatCard icon={Clock} label="Still to collect" value={lkr(report.owed)} hint={report.owed > 0 ? "Pending or failed invoices" : "Nothing outstanding"} />
        <StatCard icon={Percent} label="Collection rate" value={report.rate === null ? "—" : `${report.rate}%`} hint={report.rate === null ? "No invoices in this period" : `of ${lkr(report.billed)} billed`} />
        <StatCard
          icon={AlertTriangle}
          label="Overdue now"
          value={lkr(report.overdueAmount)}
          tag={report.overdue.length > 0 ? `${report.overdue.length} invoice${report.overdue.length === 1 ? "" : "s"}` : undefined}
          hint={report.overdue.length > 0 ? "Past their payment date" : "Everyone is on time"}
        />
      </div>

      {/* Revenue chart */}
      <RevenueBarInteractive
        title={`Revenue ${range === "month" ? "by week" : "by month"}`}
        description={
          <>
            Monthly recurring revenue right now: <strong className="font-mono text-foreground">{lkr(monthlyRecurring)}</strong> from {activeShowrooms} active showroom{activeShowrooms === 1 ? "" : "s"}
          </>
        }
        data={report.buckets}
        collected={report.collected}
        owed={report.owed}
        ariaLabel={`Collected ${lkr(report.collected)}, still to collect ${lkr(report.owed)}, ${report.title}`}
      />

      {/* Where the money comes from */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="ds-card space-y-5 p-6 sm:p-7">
          <div>
            <h3 className="text-base font-bold text-foreground">Revenue by plan</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">Billed in this period, per subscription plan</p>
          </div>
          {report.byPlan.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">No invoices in this period.</p>
          ) : (
            <div className="space-y-4">
              {report.byPlan.map((p) => (
                <BarRow
                  key={p.plan}
                  label={p.plan}
                  value={lkr(p.collected + p.owed)}
                  share={((p.collected + p.owed) / maxPlan) * 100}
                  hint={`${lkr(p.collected)} collected${p.owed > 0 ? ` · ${lkr(p.owed)} to collect` : ""} · ${p.count} invoice${p.count === 1 ? "" : "s"}`}
                />
              ))}
            </div>
          )}
        </div>

        <div className="ds-card space-y-5 p-6 sm:p-7">
          <div>
            <h3 className="text-base font-bold text-foreground">Top showrooms</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">Who paid the most in this period</p>
          </div>
          {report.byShop.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">No invoices in this period.</p>
          ) : (
            <div className="space-y-4">
              {report.byShop.slice(0, 5).map((s) => (
                <BarRow
                  key={s.shopId}
                  lead={<ShopAvatar name={s.shopName} logoUrl={logoOf.get(s.shopId)} className="h-9 w-9 rounded-lg" />}
                  label={s.shopName}
                  value={lkr(s.collected)}
                  share={((s.collected + s.owed) / maxShop) * 100}
                  hint={s.owed > 0 ? `${lkr(s.owed)} still to collect` : "Fully collected"}
                />
              ))}
            </div>
          )}
        </div>

        <div className="ds-card space-y-5 p-6 sm:p-7">
          <div>
            <h3 className="text-base font-bold text-foreground">How payments were received</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">Collected money by payment method</p>
          </div>
          {report.byMethod.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">No payments received in this period.</p>
          ) : (
            <div className="space-y-4">
              {report.byMethod.map((m) => (
                <BarRow key={m.method} label={m.method} value={lkr(m.amount)} share={(m.amount / maxMethod) * 100} hint={`${m.count} payment${m.count === 1 ? "" : "s"}`} />
              ))}
            </div>
          )}
        </div>

        <div className="ds-card space-y-5 p-6 sm:p-7">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-foreground">Needs attention</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">Unpaid and past their payment date, any month</p>
            </div>
            {report.overdue.length > 0 && <StatusBadge tone="destructive">{report.overdue.length} overdue</StatusBadge>}
          </div>
          {report.overdue.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">No overdue invoices. Everyone is paid up or within their payment date.</p>
          ) : (
            <ul className="divide-y divide-border">
              {report.overdue.slice(0, 5).map((p) => (
                <li key={p.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                  <ShopAvatar name={p.shopName} logoUrl={logoOf.get(p.shopId)} className="h-9 w-9 rounded-lg" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-foreground">{p.shopName}</p>
                    <p className="truncate text-2xs text-muted-foreground">{p.invoiceNo} · due {fmtDay(p.graceUntil ?? p.dueDate)}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-mono text-xs font-bold text-foreground">{lkr(p.amount)}</p>
                    <p className="text-2xs font-semibold text-destructive">{p.daysLate} day{p.daysLate === 1 ? "" : "s"} late</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {report.overdue.length > 5 && <p className="text-2xs text-muted-foreground">and {report.overdue.length - 5} more. Open the Payments tab to collect them.</p>}
        </div>
      </div>

      {/* Invoice list */}
      <div className="ds-card space-y-4 p-6 sm:p-7">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <h3 className="text-base font-bold text-foreground">Invoice list</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">{report.invoices.length} invoice{report.invoices.length === 1 ? "" : "s"} in {periodPhrase}. The CSV export contains all of them.</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => { setStatusFilter(f); setShown(PAGE); }}
                aria-pressed={statusFilter === f}
                className={cn(
                  "cursor-pointer rounded-full border px-3 py-1 text-2xs font-semibold transition-colors",
                  statusFilter === f ? "border-primary bg-primary text-primary-foreground" : "border-input bg-field text-muted-foreground hover:text-foreground",
                )}
              >
                {f} <span className="opacity-70">{counts[f]}</span>
              </button>
            ))}
          </div>
        </div>

        {rows.length === 0 ? (
          <EmptyState icon={FileText} title="No invoices to show" description={statusFilter === "All" ? "Nothing was billed in this period." : `No ${statusFilter.toLowerCase()} invoices in this period.`} />
        ) : (
          <>
            <div className="-mx-2 overflow-x-auto px-2">
              <table className="w-full min-w-[720px] text-left text-xs">
                <thead>
                  <tr className="border-b border-border text-2xs uppercase tracking-wider text-muted-foreground">
                    <th className="pb-3 font-semibold">Showroom</th>
                    <th className="pb-3 font-semibold">Invoice</th>
                    <th className="pb-3 font-semibold">Plan</th>
                    <th className="pb-3 font-semibold">Due</th>
                    <th className="pb-3 font-semibold">Received</th>
                    <th className="pb-3 font-semibold">Status</th>
                    <th className="pb-3 text-right font-semibold">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.slice(0, shown).map((p) => {
                    const st = statusOf(p);
                    return (
                      <tr key={p.id}>
                        <td className="py-3 pr-3">
                          <div className="flex items-center gap-2.5">
                            <ShopAvatar name={p.shopName} logoUrl={logoOf.get(p.shopId)} className="h-8 w-8 rounded-lg" />
                            <span className="max-w-[180px] truncate font-semibold text-foreground">{p.shopName}</span>
                          </div>
                        </td>
                        <td className="py-3 pr-3 font-mono text-muted-foreground">{p.invoiceNo}</td>
                        <td className="py-3 pr-3 text-foreground/80">{p.plan}</td>
                        <td className="py-3 pr-3 whitespace-nowrap text-foreground/80">{fmtDay(p.dueDate)}</td>
                        <td className="py-3 pr-3 whitespace-nowrap text-foreground/80">{fmtDay(p.paidAt)}</td>
                        <td className="py-3 pr-3"><StatusBadge tone={st.tone} dot>{st.label}</StatusBadge></td>
                        <td className="py-3 text-right font-mono font-bold text-foreground">{lkr(p.amount)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex flex-col items-center justify-between gap-2 border-t border-border pt-3 text-xs text-muted-foreground sm:flex-row">
              <span>
                Showing {Math.min(shown, rows.length)} of {rows.length} · total{" "}
                <strong className="font-mono text-foreground">{lkr(rows.reduce((sum, p) => sum + p.amount, 0))}</strong>
              </span>
              {rows.length > shown && (
                <button type="button" onClick={() => setShown((n) => n + PAGE)} className="ds-btn ds-btn-outline ds-btn-sm cursor-pointer">
                  Show {Math.min(PAGE, rows.length - shown)} more
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
