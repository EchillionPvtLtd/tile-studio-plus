"use client";

import React, { useState } from "react";
import { AlertCircle, Check, CheckCircle2, Copy, Eye, EyeOff, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Simple building blocks for the showroom Settings screens:
 *   SettingsTabs   – plain underline tabs
 *   SettingsCard   – one card: title, short description, fields
 *   SettingsRow    – label above a field, optional hint below
 *   SettingsSave   – the save button
 */

export function SettingsTabs<T extends string>({
  items,
  active,
  onSelect,
}: {
  items: { id: T; label: string }[];
  active: T;
  onSelect: (id: T) => void;
}) {
  return (
    <nav aria-label="Settings sections" className="-mb-px flex gap-6 overflow-x-auto border-b border-border">
      {items.map(({ id, label }) => {
        const isActive = id === active;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onSelect(id)}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "shrink-0 cursor-pointer border-b-2 pb-3 text-sm transition-colors",
              isActive
                ? "border-foreground font-semibold text-foreground"
                : "border-transparent font-medium text-muted-foreground hover:text-foreground"
            )}
          >
            {label}
          </button>
        );
      })}
    </nav>
  );
}

export function SettingsNotice({
  notice,
  onDismiss,
}: {
  notice: { success?: boolean; message?: string } | null;
  onDismiss: () => void;
}) {
  if (!notice?.message) return null;
  const ok = !!notice.success;
  return (
    <div
      role={ok ? "status" : "alert"}
      className={cn(
        "flex items-start gap-3 rounded-xl px-4 py-3 text-sm",
        ok ? "bg-success-muted text-success" : "bg-destructive-muted text-destructive"
      )}
    >
      {ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}
      <span className="flex-1 font-medium">{notice.message}</span>
      <button type="button" onClick={onDismiss} aria-label="Dismiss message" className="opacity-70 hover:opacity-100">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export function SettingsCard({
  title,
  description,
  children,
  bodyClassName = "space-y-6",
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  /** Layout of the fields; the default stacks them, pass a grid to use the width. */
  bodyClassName?: string;
}) {
  return (
    <section className="ds-card p-6 sm:p-8">
      <h2 className="ds-section-title">{title}</h2>
      {description && <p className="ds-subtitle">{description}</p>}
      <div className={cn("mt-7", bodyClassName)}>{children}</div>
    </section>
  );
}

/** Live preview of how the showroom looks, driven by the form values. */
export function ShowroomPreview({
  name,
  description,
  logoUrl,
  coverUrl,
}: {
  name: string;
  description: string;
  logoUrl: string;
  coverUrl: string;
}) {
  return (
    <aside className="ds-card overflow-hidden xl:sticky xl:top-28 xl:self-start">
      <p className="ds-eyebrow px-6 pt-5 sm:px-8">Preview</p>
      <div className="p-4 sm:px-6 sm:pb-6">
        <div className="overflow-hidden rounded-2xl border border-border bg-background">
          <div className="relative aspect-[16/6] w-full bg-gradient-to-br from-muted to-secondary">
            {coverUrl && <img src={coverUrl} alt="" className="h-full w-full object-cover" />}
          </div>
          <div className="relative px-5 pb-5">
            <div className="-mt-8 flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border border-border bg-white shadow-md">
              {logoUrl ? (
                <img src={logoUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="text-lg font-bold text-neutral-500">{(name.trim()[0] || "S").toUpperCase()}</span>
              )}
            </div>
            <p className="mt-3 truncate text-base font-semibold text-foreground">{name.trim() || "Your showroom"}</p>
            <p className="mt-1 line-clamp-3 min-h-[3rem] text-xs leading-relaxed text-muted-foreground">
              {description.trim() || "Your description appears here."}
            </p>
          </div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">Updates as you type. Save to publish.</p>
      </div>
    </aside>
  );
}

export function SettingsRow({
  label,
  htmlFor,
  hint,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-foreground">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function SettingsSave({ saving, label }: { saving: boolean; label: string }) {
  return (
    <div className="pt-1 md:col-span-full">
      <button type="submit" disabled={saving} className="ds-btn ds-btn-primary ds-btn-lg">
        {saving && <Loader2 className="h-4 w-4 animate-spin" />}
        {label}
      </button>
    </div>
  );
}

/** Read-only value with a copy button. */
export function CopyField({ value, mono = true, id }: { value: string; mono?: boolean; id?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked: the field is still selectable */
    }
  };
  return (
    <div className="flex gap-2">
      <input
        id={id}
        readOnly
        value={value}
        onFocus={(e) => e.currentTarget.select()}
        className={cn("ds-field min-w-0 flex-1", mono && "font-mono text-xs")}
      />
      <button type="button" onClick={copy} className="ds-btn ds-btn-outline h-auto shrink-0 px-3.5" aria-label="Copy to clipboard">
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

/** Password input with its own show/hide toggle. */
export function PasswordField({
  id,
  value,
  onChange,
  autoComplete,
  minLength,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  minLength?: number;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        id={id}
        type={show ? "text" : "password"}
        required
        minLength={minLength}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="ds-field pr-11"
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? "Hide password" : "Show password"}
        className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer text-muted-foreground transition-colors hover:text-foreground"
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

/** One on / off setting: a title and what it does on the left, the switch on the right. */
export function SettingsSwitch({
  id,
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-2xl border border-border p-4 sm:p-5">
      <div className="min-w-0">
        <label htmlFor={id} className="block cursor-pointer text-sm font-medium text-foreground">
          {label}
        </label>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative mt-0.5 inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-wait disabled:opacity-60",
          checked ? "border-transparent bg-primary" : "border-border bg-secondary"
        )}
      >
        <span
          className={cn(
            "inline-block h-5 w-5 rounded-full shadow-sm transition-transform",
            checked ? "translate-x-[22px] bg-primary-foreground" : "translate-x-0.5 bg-muted-foreground"
          )}
        />
      </button>
    </div>
  );
}
