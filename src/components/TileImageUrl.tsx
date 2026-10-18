"use client";

import React, { useEffect, useState } from "react";
import { AlertCircle, Check, Image as ImageIcon, Loader2 } from "lucide-react";
import { resolveTileImageUrl, TILE_IMAGE_KIND_LABEL, TILE_IMAGE_TYPES, type TileImageKind } from "@/lib/tileImageUrl";

export type TileImageCheck =
  | { status: "empty" }
  | { status: "checking"; kind?: TileImageKind }
  | { status: "ok"; kind: TileImageKind; url: string; previewSrc: string; width: number; height: number }
  | { status: "error"; error: string; kind?: TileImageKind };

const DEBOUNCE_MS = 450;

/** Loads a picture in the browser so a link that is not a readable image is caught before saving. */
function decode(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error("decode"));
    img.src = src;
  });
}

/**
 * Checks a pasted tile picture link as it is typed: works out what kind of link it is, fetches the picture
 * (through our own image proxy, which refuses private addresses and non-images) and decodes it for the preview.
 * `url` is what to save; it is only set once the picture really loaded.
 */
export function useTileImageCheck(input: string, enabled = true): TileImageCheck {
  const [result, setResult] = useState<TileImageCheck>({ status: "empty" });
  const trimmed = input.trim();

  useEffect(() => {
    if (!enabled || !trimmed) return;
    const resolved = resolveTileImageUrl(trimmed);
    if (!resolved.ok) {
      // Wait for the person to stop typing before telling them a half-typed link is wrong
      setResult({ status: "empty" });
      const timer = setTimeout(() => setResult({ status: "error", error: resolved.error }), DEBOUNCE_MS);
      return () => clearTimeout(timer);
    }

    const controller = new AbortController();
    let objectUrl = "";
    setResult({ status: "checking", kind: resolved.kind });

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/tiles/proxy?url=${encodeURIComponent(resolved.url)}`, { signal: controller.signal });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          const message = typeof body?.error === "string" ? body.error : "That image could not be loaded.";
          setResult({ status: "error", error: message, kind: resolved.kind });
          return;
        }
        const blob = await res.blob();
        if (!TILE_IMAGE_TYPES.includes(blob.type)) {
          setResult({ status: "error", error: "Unsupported image format. Use a JPG, PNG or WebP picture.", kind: resolved.kind });
          return;
        }
        objectUrl = URL.createObjectURL(blob);
        const size = await decode(objectUrl);
        if (controller.signal.aborted) return;
        setResult({ status: "ok", kind: resolved.kind, url: resolved.url, previewSrc: objectUrl, ...size });
      } catch (e) {
        if (controller.signal.aborted) return;
        const unreadable = e instanceof Error && e.message === "decode";
        setResult({
          status: "error",
          kind: resolved.kind,
          error: unreadable ? "That file could not be read as an image. It may be damaged." : "Could not reach that link. Check your connection and the address.",
        });
      }
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [trimmed, enabled]);

  return enabled && trimmed ? result : { status: "empty" };
}

interface FieldProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  check: TileImageCheck;
  disabled?: boolean;
  className?: string;
  required?: boolean;
  placeholder?: string;
  /** Shown while the box is empty; defaults to the tile wording. */
  hint?: string;
}

/** One box for any tile picture link, with what was recognised and why a link was refused. */
export function TileImageUrlField({
  id,
  value,
  onChange,
  check,
  disabled,
  className = "",
  required = true,
  placeholder = "Paste image URL or Google Drive link",
  hint = "Paste a direct image link (right-click a Google Images result → Copy image address) or a Google Drive sharing link.",
}: FieldProps) {
  return (
    <div>
      <input
        id={id}
        type="text"
        inputMode="url"
        autoComplete="off"
        spellCheck={false}
        required={required}
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={check.status === "error"}
        placeholder={placeholder}
        className={`${className} ${check.status === "error" ? "border-destructive/60" : ""}`}
      />
      <div aria-live="polite" className="mt-1.5 min-h-4 text-2xs">
        {check.status === "empty" && <p className="text-muted-foreground">{hint}</p>}
        {check.status === "checking" && (
          <p className="flex items-center gap-1.5 text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>{check.kind ? `${TILE_IMAGE_KIND_LABEL[check.kind]} detected. ` : ""}Loading preview…</span>
          </p>
        )}
        {check.status === "ok" && (
          <p className="flex items-center gap-1.5 text-success">
            <Check className="h-3 w-3 shrink-0" />
            <span>
              {TILE_IMAGE_KIND_LABEL[check.kind]} · {check.width} × {check.height} px
            </span>
          </p>
        )}
        {check.status === "error" && (
          <p role="alert" className="flex items-start gap-1.5 text-destructive">
            <AlertCircle className="mt-px h-3 w-3 shrink-0" />
            <span>{check.error}</span>
          </p>
        )}
      </div>
    </div>
  );
}

/** The preview picture, or a placeholder that says what is happening. */
export function TileImagePreview({ check, className = "" }: { check: TileImageCheck; className?: string }) {
  return (
    <div className={`relative flex items-center justify-center overflow-hidden bg-muted ${className}`}>
      {check.status === "ok" ? (
        <img src={check.previewSrc} alt="Texture preview" className="h-full w-full object-cover" />
      ) : (
        <div className="space-y-1 p-4 text-center text-muted-foreground/70">
          {check.status === "checking" ? <Loader2 className="mx-auto h-7 w-7 animate-spin opacity-60" /> : <ImageIcon className="mx-auto h-8 w-8 opacity-40" />}
          <p className="text-2xs text-muted-foreground">
            {check.status === "checking" ? "Loading preview…" : check.status === "error" ? "No preview — fix the link below" : "The picture appears here before you save"}
          </p>
        </div>
      )}
    </div>
  );
}
