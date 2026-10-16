"use client";

import React, { useEffect, useState } from "react";
import { updateTile } from "@/actions/shop";
import { AlertCircle, Check, Image as ImageIcon, Loader2, Pencil, Save, X } from "lucide-react";
import { TileImagePreview, TileImageUrlField, useTileImageCheck } from "@/components/TileImageUrl";

export interface EditableTile {
  id: string;
  sku: string;
  name: string;
  widthMm: number;
  heightMm: number;
  pricePerSqFt: number | null;
  category: string;
  finish: string | null;
  textureUrl: string;
  previewUrl?: string | null;
}

const FINISHES = [
  { value: "Matt", label: "Matt Finish" },
  { value: "Gloss", label: "Gloss Finish" },
  { value: "Polished", label: "High Polished" },
  { value: "Satin", label: "Satin / Semi-gloss" },
];

const label = "block text-muted-foreground font-semibold mb-1.5 uppercase tracking-wider text-2xs";
const field = "w-full px-3 py-2.5 bg-field border border-border rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ring transition-colors disabled:opacity-40";
const invalid = "border-destructive/60";

interface EditTileDrawerProps {
  tile: EditableTile;
  onClose: () => void;
  collections?: { id: string; name: string }[];
  initialCollectionId?: string;
  onCollectionChange?: (tileId: string, newCollectionId: string) => void;
}

/** The Add Tile panel's twin: the same fields, filled in with an existing tile, saved back to that tile. */
export function EditTileDrawer({
  tile,
  onClose,
  collections = [],
  initialCollectionId = "",
  onCollectionChange,
}: EditTileDrawerProps) {
  const [form, setForm] = useState({
    name: tile.name,
    sku: tile.sku,
    widthMm: String(tile.widthMm),
    heightMm: String(tile.heightMm),
    pricePerSqFt: String(tile.pricePerSqFt ?? 0),
    category: tile.category || "both",
    finish: tile.finish || "Matt",
    textureUrl: tile.textureUrl,
  });
  const [selectedCollectionId, setSelectedCollectionId] = useState(initialCollectionId);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string; errors?: Record<string, string[] | undefined> } | null>(null);
  const [previewError, setPreviewError] = useState(false);
  // The picture already saved is shown as it is; a new link is checked (and a Drive link converted) before it can be saved
  const linkUnchanged = form.textureUrl.trim() === tile.textureUrl;
  const imageCheck = useTileImageCheck(form.textureUrl, !linkUnchanged);
  const textureToSave = linkUnchanged ? tile.textureUrl : imageCheck.status === "ok" ? imageCheck.url : "";

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    setResult(null);
    if (key === "textureUrl") setPreviewError(false);
  };

  // A finish a showroom saved earlier (for example "Rustic") stays selectable
  const finishes = FINISHES.some((f) => f.value === form.finish) ? FINISHES : [...FINISHES, { value: form.finish, label: form.finish }];
  const changed =
    form.name !== tile.name ||
    form.sku !== tile.sku ||
    Number(form.widthMm) !== tile.widthMm ||
    Number(form.heightMm) !== tile.heightMm ||
    Number(form.pricePerSqFt) !== (tile.pricePerSqFt ?? 0) ||
    form.category !== (tile.category || "both") ||
    form.finish !== (tile.finish || "Matt") ||
    !linkUnchanged;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Closes shortly after a successful save, once the person has seen the confirmation
  useEffect(() => {
    if (!result?.success) return;
    const t = setTimeout(onClose, 900);
    return () => clearTimeout(t);
  }, [result, onClose]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      const res = await updateTile(tile.id, { ...form, textureUrl: textureToSave, category: form.category as "both" | "floor" | "wall" });
      setResult(res);
      if (res.success && onCollectionChange) {
        onCollectionChange(tile.id, selectedCollectionId);
      }
    } catch {
      setResult({ success: false, message: "Could not update the tile. Please try again." });
    } finally {
      setSaving(false);
    }
  };

  const bad = (key: string) => (result && !result.success && result.errors?.[key] ? invalid : "");

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={`Edit ${tile.name}`}>
      <div className="fixed inset-0 animate-in fade-in bg-black/80 backdrop-blur-xs duration-200" onClick={onClose} />

      <div className="custom-scrollbar relative z-10 flex h-full w-full max-w-md animate-in slide-in-from-right flex-col overflow-y-auto border-l border-border bg-card text-foreground shadow-2xl duration-300">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card/95 p-6 backdrop-blur-md">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary font-bold text-primary-foreground">
              <Pencil className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-semibold tracking-tight text-foreground">Edit Tile</h2>
              <p className="truncate font-mono text-xs text-muted-foreground">{tile.sku}</p>
            </div>
          </div>
          <button onClick={onClose} type="button" className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground" title="Close panel (Esc)" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={submit} className="flex-1 space-y-5 p-6 font-sans text-xs">
          <div className="space-y-2 rounded-2xl border border-border bg-card p-3.5">
            <div className="flex items-center justify-between text-2xs font-semibold text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <ImageIcon className="h-3.5 w-3.5 text-foreground" />
                <span>Texture Preview</span>
              </span>
              <span className="font-mono">{form.widthMm || "–"} × {form.heightMm || "–"} mm</span>
            </div>
            {linkUnchanged ? (
              <div className="relative flex h-40 w-full items-center justify-center overflow-hidden rounded-xl border border-border bg-muted">
                {tile.textureUrl && !previewError ? (
                  <img src={tile.textureUrl} alt="Texture preview" className="h-full w-full object-cover" onError={() => setPreviewError(true)} />
                ) : (
                  <div className="space-y-1 p-4 text-center text-muted-foreground/70">
                    <ImageIcon className="mx-auto h-8 w-8 opacity-40" />
                    <p className="text-2xs">This picture could not be loaded. Paste a new image link below.</p>
                  </div>
                )}
              </div>
            ) : (
              <TileImagePreview check={imageCheck} className="h-40 w-full rounded-xl border border-border" />
            )}
          </div>

          <div>
            <label htmlFor="edit-texture" className={label}>Texture Image URL <span className="text-red-500 font-bold">*</span></label>
            <TileImageUrlField
              id="edit-texture"
              value={form.textureUrl}
              onChange={(v) => {
                setForm((f) => ({ ...f, textureUrl: v }));
                setResult(null);
                setPreviewError(false);
              }}
              check={linkUnchanged ? { status: "empty" } : imageCheck}
              className={`${field} font-mono text-xs ${bad("textureUrl")}`}
            />
          </div>

          <div className="grid grid-cols-2 gap-3.5">
            <div>
              <label htmlFor="edit-name" className={label}>Tile Name <span className="text-red-500 font-bold">*</span></label>
              <input id="edit-name" type="text" required maxLength={120} value={form.name} onChange={set("name")} className={`${field} ${bad("name")}`} />
            </div>
            <div>
              <label htmlFor="edit-sku" className={label}>SKU Number <span className="text-red-500 font-bold">*</span></label>
              <input id="edit-sku" type="text" required maxLength={60} value={form.sku} onChange={set("sku")} className={`${field} font-mono ${bad("sku")}`} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label htmlFor="edit-width" className={label}>Width (mm) <span className="text-red-500 font-bold">*</span></label>
              <input id="edit-width" type="number" inputMode="numeric" required min={10} max={5000} step={1} value={form.widthMm} onChange={set("widthMm")} className={`${field} font-mono ${bad("widthMm")}`} />
            </div>
            <div>
              <label htmlFor="edit-height" className={label}>Height (mm) <span className="text-red-500 font-bold">*</span></label>
              <input id="edit-height" type="number" inputMode="numeric" required min={10} max={5000} step={1} value={form.heightMm} onChange={set("heightMm")} className={`${field} font-mono ${bad("heightMm")}`} />
            </div>
            <div>
              <label htmlFor="edit-price" className={label}>Price (LKR)</label>
              <input id="edit-price" type="number" inputMode="decimal" required min={0} step="any" value={form.pricePerSqFt} onChange={set("pricePerSqFt")} className={`${field} font-mono ${bad("pricePerSqFt")}`} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3.5">
            <div>
              <label htmlFor="edit-category" className={label}>Surface Category</label>
              <select id="edit-category" value={form.category} onChange={set("category")} className={field}>
                <option value="both">Both</option>
                <option value="floor">Floor Only</option>
                <option value="wall">Wall Only</option>
              </select>
            </div>
            <div>
              <label htmlFor="edit-finish" className={label}>Surface Finish</label>
              <select id="edit-finish" value={form.finish} onChange={set("finish")} className={field}>
                {finishes.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Collection Assignment (Optional) */}
          {collections && collections.length > 0 && (
            <div>
              <label htmlFor="edit-collection" className={label}>Collection (Optional)</label>
              <select
                id="edit-collection"
                value={selectedCollectionId}
                onChange={(e) => setSelectedCollectionId(e.target.value)}
                className={field}
              >
                <option value="">No Collection (General Catalog)</option>
                {collections.map((col) => (
                  <option key={col.id} value={col.id}>
                    {col.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <p className="text-2xs leading-relaxed text-muted-foreground">
            Changes apply to new designs straight away. Designs customers already saved keep the tile details they were made with.
          </p>

          {result?.message && (
            <div role={result.success ? "status" : "alert"} className={`flex items-center gap-2 rounded-xl border p-3 text-xs ${result.success ? "border-success/20 bg-success-muted text-success" : "border-destructive/20 bg-destructive-muted text-destructive"}`}>
              {result.success ? <Check className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
              <span>{result.message}</span>
            </div>
          )}

          <div className="flex items-center gap-3 border-t border-border pt-4">
            <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-border py-3 text-xs font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
              Cancel
            </button>
            <button type="submit" disabled={saving || !changed || !!result?.success || !textureToSave} className="flex flex-[2] items-center justify-center gap-2 rounded-xl bg-primary py-3 text-xs font-bold text-primary-foreground shadow-xs transition-all hover:bg-primary/90 disabled:opacity-40">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              <span>{saving ? "Saving…" : "Save Changes"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
