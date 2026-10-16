"use client";

import React, { useActionState, useRef, useState, useEffect } from "react";
import { addTile } from "@/actions/shop";
import { Plus, Check, AlertCircle, X, Image as ImageIcon, Sparkles } from "lucide-react";
import { TileImagePreview, TileImageUrlField, useTileImageCheck } from "@/components/TileImageUrl";

const initialState = {
  message: "",
  success: false,
};

interface AddTileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  disabled: boolean;
  currentCount: number;
  quota: number;
  collections?: { id: string; name: string }[];
  onTileAddedToCollection?: (collectionId: string, tileId?: string) => void;
}

export function AddTileDrawer({ isOpen, onClose, disabled, currentCount, quota, collections = [], onTileAddedToCollection }: AddTileDrawerProps) {
  const [state, formAction, isPending] = useActionState(addTile, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const [imageLink, setImageLink] = useState("");
  const imageCheck = useTileImageCheck(imageLink, isOpen);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string>("");

  useEffect(() => {
    if (state.success && formRef.current) {
      if (selectedCollectionId && onTileAddedToCollection) {
        onTileAddedToCollection(selectedCollectionId, (state as any).tileId);
      }
      formRef.current.reset();
      setImageLink("");
      setSelectedCollectionId("");
      const timer = setTimeout(() => {
        onClose();
      }, 1200);
      return () => clearTimeout(timer);
    }
  }, [state.success, onClose, selectedCollectionId, onTileAddedToCollection]);

  // Handle ESC key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/80 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Drawer Panel */}
      <div className="relative w-full max-w-md bg-card border-l border-border text-foreground h-full overflow-y-auto custom-scrollbar shadow-2xl flex flex-col z-10 animate-in slide-in-from-right duration-300">
        
        {/* Drawer Header */}
        <div className="p-6 border-b border-border flex items-center justify-between sticky top-0 bg-card/95 backdrop-blur-md z-10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary text-primary-foreground flex items-center justify-center font-bold">
              <Plus className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold tracking-tight text-foreground">Add New Tile</h2>
              <p className="text-xs text-muted-foreground">
                Add a texture by link and set its physical dimensions
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-2xs font-mono px-2 py-0.5 rounded bg-muted text-muted-foreground border border-border">
              {currentCount} / {quota} used
            </span>
            <button
              onClick={onClose}
              type="button"
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              title="Close panel (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Drawer Form Body */}
        <form action={formAction} ref={formRef} className="p-6 space-y-5 text-xs font-sans flex-1">
          
          {/* Live Preview Box */}
          <div className="rounded-2xl border border-border p-3.5 bg-card space-y-2">
            <div className="flex items-center justify-between text-2xs font-semibold text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <ImageIcon className="w-3.5 h-3.5 text-foreground" />
                <span>Live Texture Preview</span>
              </span>
              <span className="text-2xs font-mono text-muted-foreground">Square 1:1 Aspect</span>
            </div>

            <TileImagePreview check={imageCheck} className="h-40 w-full rounded-xl border border-border" />
          </div>

          {/* Texture Image URL (Google Images direct link or Google Drive sharing link) */}
          <div>
            <label htmlFor="add-texture" className="block text-muted-foreground font-semibold mb-1.5 uppercase tracking-wider text-2xs">
              Texture Image URL <span className="text-red-500 font-bold">*</span>
            </label>
            <TileImageUrlField
              id="add-texture"
              value={imageLink}
              onChange={setImageLink}
              check={imageCheck}
              disabled={disabled}
              className="w-full px-3 py-2.5 bg-field border border-border rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ring transition-colors disabled:opacity-40 font-mono text-xs"
            />
            {/* What is saved is the checked, ready-to-use address (a Drive link becomes a direct picture address) */}
            <input type="hidden" name="textureUrl" value={imageCheck.status === "ok" ? imageCheck.url : ""} />
          </div>

          {/* Tile Name & SKU */}
          <div className="grid grid-cols-2 gap-3.5">
            <div>
              <label className="block text-muted-foreground font-semibold mb-1.5 uppercase tracking-wider text-2xs">
                Tile Name <span className="text-red-500 font-bold">*</span>
              </label>
              <input 
                type="text" 
                name="name" 
                required 
                disabled={disabled}
                className="w-full px-3 py-2.5 bg-field border border-border rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ring transition-colors disabled:opacity-40"
                placeholder="e.g. Venato Carrara"
              />
            </div>
            <div>
              <label className="block text-muted-foreground font-semibold mb-1.5 uppercase tracking-wider text-2xs">
                SKU Number <span className="text-red-500 font-bold">*</span>
              </label>
              <input 
                type="text" 
                name="sku" 
                required 
                disabled={disabled}
                className="w-full px-3 py-2.5 bg-field border border-border rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ring transition-colors disabled:opacity-40 font-mono"
                placeholder="SKU-9021"
              />
            </div>
          </div>

          {/* Physical Dimensions & Unit Rate */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-muted-foreground font-semibold mb-1.5 uppercase tracking-wider text-2xs">
                Width (mm) <span className="text-red-500 font-bold">*</span>
              </label>
              <input 
                type="number" 
                name="widthMm" 
                required 
                min={10}
                defaultValue={600}
                disabled={disabled}
                className="w-full px-3 py-2.5 bg-field border border-border rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ring transition-colors disabled:opacity-40 font-mono"
              />
            </div>
            <div>
              <label className="block text-muted-foreground font-semibold mb-1.5 uppercase tracking-wider text-2xs">
                Height (mm) <span className="text-red-500 font-bold">*</span>
              </label>
              <input 
                type="number" 
                name="heightMm" 
                required 
                min={10}
                defaultValue={600}
                disabled={disabled}
                className="w-full px-3 py-2.5 bg-field border border-border rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ring transition-colors disabled:opacity-40 font-mono"
              />
            </div>
            <div>
              <label className="block text-muted-foreground font-semibold mb-1.5 uppercase tracking-wider text-2xs">
                Price (LKR)
              </label>
              <input 
                type="number" 
                name="pricePerSqFt" 
                required 
                min={0}
                defaultValue={650}
                disabled={disabled}
                className="w-full px-3 py-2.5 bg-field border border-border rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ring transition-colors disabled:opacity-40 font-mono"
              />
            </div>
          </div>

          {/* Application & Finish */}
          <div className="grid grid-cols-2 gap-3.5">
            <div>
              <label className="block text-muted-foreground font-semibold mb-1.5 uppercase tracking-wider text-2xs">
                Surface Category
              </label>
              <select 
                name="category" 
                disabled={disabled}
                className="w-full px-3 py-2.5 bg-field border border-border rounded-xl text-foreground focus:outline-none focus:border-ring transition-colors disabled:opacity-40"
              >
                <option value="both">Both</option>
                <option value="floor">Floor Only</option>
                <option value="wall">Wall Only</option>
              </select>
            </div>

            <div>
              <label className="block text-muted-foreground font-semibold mb-1.5 uppercase tracking-wider text-2xs">
                Surface Finish
              </label>
              <select 
                name="finish" 
                disabled={disabled}
                className="w-full px-3 py-2.5 bg-field border border-border rounded-xl text-foreground focus:outline-none focus:border-ring transition-colors disabled:opacity-40"
              >
                <option value="Matt">Matt Finish</option>
                <option value="Gloss">Gloss Finish</option>
                <option value="Polished">High Polished</option>
                <option value="Satin">Satin / Semi-gloss</option>
              </select>
            </div>
          </div>

          {/* Collection Assignment (Optional) */}
          {collections && collections.length > 0 && (
            <div>
              <label className="block text-muted-foreground font-semibold mb-1.5 uppercase tracking-wider text-2xs">
                Add to Collection (Optional)
              </label>
              <select
                name="collectionId"
                value={selectedCollectionId}
                onChange={(e) => setSelectedCollectionId(e.target.value)}
                disabled={disabled}
                className="w-full px-3 py-2.5 bg-field border border-border rounded-xl text-foreground focus:outline-none focus:border-ring transition-colors disabled:opacity-40"
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

          {/* Status Message */}
          {state?.message && (
            <div className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
              state.success 
                ? 'bg-success-muted border-success/20 text-success'
                : 'bg-destructive-muted border-destructive/20 text-destructive'
            }`}>
              {state.success ? <Check className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
              <span>{state.message}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="pt-4 border-t border-border flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 rounded-xl border border-border hover:bg-accent text-muted-foreground hover:text-foreground font-semibold transition-colors text-xs"
            >
              Cancel
            </button>

            <button 
              type="submit" 
              disabled={isPending || disabled || imageCheck.status !== "ok"}
              className="flex-2 bg-primary hover:bg-primary/90 text-primary-foreground font-bold py-3 rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 disabled:opacity-40 text-xs"
            >
              <Sparkles className="w-4 h-4" />
              <span>{isPending ? "Adding Tile..." : "Add Tile to Showroom"}</span>
            </button>
          </div>

        </form>

      </div>
    </div>
  );
}
