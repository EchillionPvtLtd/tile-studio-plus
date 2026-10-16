"use client";

import React, { useRef, useState, useTransition } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  ImagePlus,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import {
  createPoster,
  deletePoster,
  reorderPosters,
  setPosterActive,
  updatePoster,
  type PosterInput,
} from "@/actions/posters";
import type { LoginPosterData } from "@/lib/loginPosters";
import { cn } from "@/lib/utils";

type FormState = {
  imageUrl: string;
  tag: string;
  title: string;
  body: string;
  buttonLabel: string;
  buttonUrl: string;
  active: boolean;
};

const EMPTY_FORM: FormState = {
  imageUrl: "",
  tag: "",
  title: "",
  body: "",
  buttonLabel: "",
  buttonUrl: "",
  active: true,
};

const toForm = (p: LoginPosterData): FormState => ({
  imageUrl: p.imageUrl,
  tag: p.tag,
  title: p.title,
  body: p.body,
  buttonLabel: p.buttonLabel,
  buttonUrl: p.buttonUrl,
  active: p.active,
});

/** Mirrors how a poster is drawn on the login page. */
function PosterPreview({ form }: { form: FormState }) {
  return (
    <div className="relative aspect-[4/5] w-full overflow-hidden rounded-2xl bg-neutral-950 text-white">
      {form.imageUrl ? (
        <img src={form.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div className="absolute inset-0 grid place-content-center text-xs text-white/40">No image yet</div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-black/40" />
      <div className="absolute inset-x-5 bottom-5 space-y-2">
        {form.tag && (
          <span className="inline-block rounded-full border border-white/25 bg-white/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider">
            {form.tag}
          </span>
        )}
        <h3 className="text-lg font-semibold leading-tight tracking-tight">
          {form.title || "Your headline appears here"}
        </h3>
        {form.body && <p className="text-xs leading-relaxed text-white/75">{form.body}</p>}
        {form.buttonLabel && (
          <span className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-white px-3.5 py-1.5 text-xs font-semibold text-neutral-950">
            {form.buttonLabel}
            <ArrowRight className="h-3.5 w-3.5" />
          </span>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="ds-label">{label}</label>
      {children}
      {error ? (
        <p className="mt-1 text-xs font-medium text-destructive">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-2xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

export function LoginPostersPanel({
  posters,
  onNotify,
}: {
  posters: LoginPosterData[];
  onNotify: (message: string) => void;
}) {
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [linkText, setLinkText] = useState("");
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const openNew = () => {
    setEditingId("new");
    setForm(EMPTY_FORM);
    setLinkText("");
    setFieldErrors({});
    setFormError("");
  };

  const openEdit = (p: LoginPosterData) => {
    setEditingId(p.id);
    setForm(toForm(p));
    setLinkText(/^https?:\/\//i.test(p.imageUrl) ? p.imageUrl : "");
    setFieldErrors({});
    setFormError("");
  };

  const closeEditor = () => {
    setEditingId(null);
    setFieldErrors({});
    setFormError("");
  };

  const upload = async (file: File) => {
    setUploading(true);
    setFormError("");
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/upload/poster", { method: "POST", body });
      const json = await res.json();
      if (!res.ok || !json.imageUrl) throw new Error(json.error || "Upload failed");
      set("imageUrl", json.imageUrl);
      setLinkText("");
      setFieldErrors((e) => ({ ...e, imageUrl: [] }));
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const save = () => {
    const input: PosterInput = { ...form };
    startTransition(async () => {
      const result =
        editingId === "new" ? await createPoster(input) : await updatePoster(editingId as string, input);
      if (result.success) {
        onNotify(editingId === "new" ? "Poster added to the login page" : "Poster updated");
        closeEditor();
      } else {
        setFieldErrors(result.fieldErrors ?? {});
        setFormError(result.fieldErrors && Object.keys(result.fieldErrors).length ? "" : result.message ?? "Could not save");
      }
    });
  };

  const run = (action: () => Promise<{ success: boolean; message?: string }>, done: string) =>
    startTransition(async () => {
      const result = await action();
      onNotify(result.success ? done : result.message ?? "Something went wrong");
    });

  const move = (index: number, dir: -1 | 1) => {
    const ids = posters.map((p) => p.id);
    const target = index + dir;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    run(() => reorderPosters(ids), "Poster order saved");
  };

  const remove = (p: LoginPosterData) => {
    if (!window.confirm(`Delete the poster "${p.title}"? This can't be undone.`)) return;
    if (editingId === p.id) closeEditor();
    run(() => deletePoster(p.id), "Poster deleted");
  };

  const err = (key: string) => fieldErrors[key]?.[0];
  const activeCount = posters.filter((p) => p.active).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="ds-page-title">Login Page Posters</h2>
          <p className="ds-subtitle">
            Advertisement slides shown beside the sign-in form.{" "}
            {posters.length === 0
              ? "No posters yet, so the login page is showing the built-in defaults."
              : `${activeCount} of ${posters.length} live, shown in the order below.`}
          </p>
        </div>
        {editingId === null && (
          <button type="button" onClick={openNew} className="ds-btn ds-btn-primary ds-btn-lg">
            <Plus className="h-4 w-4" />
            New poster
          </button>
        )}
      </div>

      {/* ── Editor ── */}
      {editingId !== null && (
        <div className="ds-card p-5 sm:p-6">
          <div className="mb-5 flex items-center justify-between">
            <h3 className="ds-section-title">{editingId === "new" ? "New poster" : "Edit poster"}</h3>
            <button type="button" onClick={closeEditor} aria-label="Close editor" className="ds-btn ds-btn-ghost w-8 px-0">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-[220px_minmax(0,1fr)] lg:gap-8">
            {/* Preview + image upload */}
            <div className="mx-auto w-full max-w-[220px] space-y-3 md:mx-0">
              <PosterPreview form={form} />
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                id="poster-image"
                onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
              />
              <label htmlFor="poster-image" className="ds-btn ds-btn-outline w-full">
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                {uploading ? "Uploading…" : form.imageUrl ? "Replace image" : "Upload image"}
              </label>
              <div className="flex items-center gap-2 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                <span className="h-px flex-1 bg-border" />
                or
                <span className="h-px flex-1 bg-border" />
              </div>
              <input
                className="ds-field"
                inputMode="url"
                aria-label="Image link"
                placeholder="Paste an https:// image link"
                value={linkText}
                onChange={(e) => {
                  setLinkText(e.target.value);
                  set("imageUrl", e.target.value.trim());
                }}
              />
              {err("imageUrl") ? (
                <p className="text-xs font-medium text-destructive">{err("imageUrl")}</p>
              ) : (
                <p className="text-2xs text-muted-foreground">
                  Use either an upload (JPG, PNG or WebP, up to 8 MB) or a link, not both. Portrait works best.
                </p>
              )}
            </div>

            {/* Fields */}
            <div className="grid grid-cols-1 content-start gap-x-5 gap-y-4 sm:grid-cols-2">
              <Field label="Tag (optional)" error={err("tag")} hint="Small label above the headline, e.g. “Partner offer”.">
                <input className="ds-field" maxLength={40} value={form.tag} onChange={(e) => set("tag", e.target.value)} />
              </Field>

              <Field label="Headline" error={err("title")}>
                <input className="ds-field" maxLength={120} value={form.title} onChange={(e) => set("title", e.target.value)} />
              </Field>

              <div className="sm:col-span-2">
                <Field label="Description (optional)" error={err("body")}>
                  <textarea
                    className="ds-field min-h-[84px] resize-y"
                    maxLength={220}
                    value={form.body}
                    onChange={(e) => set("body", e.target.value)}
                  />
                </Field>
              </div>

              <Field label="Button text (optional)" error={err("buttonLabel")}>
                <input
                  className="ds-field"
                  maxLength={32}
                  value={form.buttonLabel}
                  onChange={(e) => set("buttonLabel", e.target.value)}
                />
              </Field>

              <Field label="Button link (optional)" error={err("buttonUrl")} hint="Opens in a new tab.">
                <input
                  className="ds-field"
                  inputMode="url"
                  placeholder="https://partner.com/offer"
                  value={form.buttonUrl}
                  onChange={(e) => set("buttonUrl", e.target.value)}
                />
              </Field>

              <label className="flex cursor-pointer items-center gap-2.5 text-sm sm:col-span-2">
                <input
                  type="checkbox"
                  className="h-4 w-4 cursor-pointer accent-[hsl(var(--primary))]"
                  checked={form.active}
                  onChange={(e) => set("active", e.target.checked)}
                />
                Show on the login page
              </label>

              {formError && <p className="text-sm font-medium text-destructive sm:col-span-2">{formError}</p>}

              <div className="flex gap-2 sm:col-span-2">
                <button type="button" onClick={save} disabled={pending || uploading} className="ds-btn ds-btn-primary ds-btn-lg">
                  {pending && <Loader2 className="h-4 w-4 animate-spin" />}
                  {editingId === "new" ? "Add poster" : "Save changes"}
                </button>
                <button type="button" onClick={closeEditor} className="ds-btn ds-btn-outline ds-btn-lg">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Poster list ── */}
      {posters.length === 0 && editingId === null && (
        <div className="ds-card grid place-content-center gap-3 p-10 text-center">
          <ImagePlus className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium">No custom posters yet</p>
          <p className="max-w-sm text-xs text-muted-foreground">
            Add a poster for a partner brand, a promotion or a product announcement. It shows on the login page
            straight away.
          </p>
          <button type="button" onClick={openNew} className="ds-btn ds-btn-primary mx-auto">
            <Plus className="h-4 w-4" />
            Add your first poster
          </button>
        </div>
      )}

      {posters.length > 0 && (
        <div className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
          {posters.map((p, i) => (
            <div
              key={p.id}
              className={cn(
                "ds-card flex flex-wrap items-center gap-x-4 gap-y-3 p-3 sm:flex-nowrap sm:p-4",
                editingId === p.id && "ring-2 ring-ring",
                !p.active && "opacity-70"
              )}
            >
              <img
                src={p.imageUrl}
                alt=""
                className="h-20 w-16 shrink-0 rounded-xl border border-border object-cover sm:h-24 sm:w-20"
              />
              <div className="min-w-0 flex-1 basis-40 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  {p.tag && <span className="ds-eyebrow">{p.tag}</span>}
                  {!p.active && (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-2xs font-semibold text-muted-foreground">
                      Hidden
                    </span>
                  )}
                </div>
                <p className="truncate text-sm font-semibold">{p.title}</p>
                {p.buttonLabel && (
                  <p className="truncate text-xs text-muted-foreground">
                    Button: {p.buttonLabel}
                    {p.buttonUrl ? ` → ${p.buttonUrl}` : ""}
                  </p>
                )}
              </div>

              <div className="flex w-full shrink-0 items-center justify-between gap-2 border-t border-border pt-3 sm:w-auto sm:justify-start sm:border-t-0 sm:pt-0">
                <button
                  type="button"
                  role="switch"
                  aria-checked={p.active}
                  aria-label={p.active ? "Hide poster" : "Show poster"}
                  disabled={pending}
                  onClick={() => run(() => setPosterActive(p.id, !p.active), p.active ? "Poster hidden" : "Poster is live")}
                  className={cn(
                    "relative h-6 w-11 cursor-pointer rounded-full transition-colors disabled:opacity-50",
                    p.active ? "bg-primary" : "bg-input"
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-0.5 h-5 w-5 rounded-full bg-background shadow transition-all",
                      p.active ? "left-[22px]" : "left-0.5"
                    )}
                  />
                </button>
                <div className="flex gap-1">
                  <button
                    type="button"
                    aria-label="Move up"
                    disabled={pending || i === 0}
                    onClick={() => move(i, -1)}
                    className="ds-btn ds-btn-ghost w-8 px-0"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="Move down"
                    disabled={pending || i === posters.length - 1}
                    onClick={() => move(i, 1)}
                    className="ds-btn ds-btn-ghost w-8 px-0"
                  >
                    <ArrowDown className="h-4 w-4" />
                  </button>
                  <button type="button" aria-label="Edit poster" onClick={() => openEdit(p)} className="ds-btn ds-btn-ghost w-8 px-0">
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="Delete poster"
                    disabled={pending}
                    onClick={() => remove(p)}
                    className="ds-btn ds-btn-ghost w-8 px-0 hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
