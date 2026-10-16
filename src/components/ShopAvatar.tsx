"use client";

import React, { useState } from "react";
import { cn } from "@/lib/utils";

const initialsOf = (name?: string | null) => {
  const words = (name || "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "S";
  return (words.length === 1 ? words[0].slice(0, 2) : words[0][0] + words[1][0]).toUpperCase();
};

/** A steady colour per showroom so the no-logo tile looks intentional. */
const hueOf = (name?: string | null) => {
  let h = 0;
  for (const ch of name || "Showroom") h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
};

/**
 * A showroom's logo filling its tile edge to edge (a transparent logo shows white behind it), falling back to
 * its initials on a coloured tile when there is no logo or the image fails to load.
 */
export function ShopAvatar({
  name,
  logoUrl,
  className,
}: {
  name?: string | null;
  logoUrl?: string | null;
  /** Size and radius, e.g. "h-12 w-12 rounded-xl". Defaults to 48px. */
  className?: string;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showLogo = !!logoUrl && failedUrl !== logoUrl;
  const box = cn("h-12 w-12 rounded-xl", className);

  if (showLogo) {
    return (
      <div className={cn("flex shrink-0 items-center justify-center overflow-hidden bg-white ring-1 ring-black/10", box)}>
        <img
          src={logoUrl!}
          alt={name ? `${name} logo` : "Showroom logo"}
          onError={() => setFailedUrl(logoUrl!)}
          className="h-full w-full select-none object-cover"
        />
      </div>
    );
  }

  return (
    <div
      aria-label={name || "Showroom"}
      style={{ backgroundColor: `hsl(${hueOf(name)} 42% 36%)` }}
      className={cn("flex shrink-0 select-none items-center justify-center text-sm font-bold tracking-tight text-white ring-1 ring-white/10", box)}
    >
      {initialsOf(name)}
    </div>
  );
}
