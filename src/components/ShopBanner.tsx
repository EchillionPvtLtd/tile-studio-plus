"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * A shop's cover banner. Shows `fallback` when there is no link, or `errorFallback` (default: the same)
 * when the link does not load as an image. A `href` makes the whole banner clickable.
 */
export function BannerImage({
  src,
  href,
  alt = "",
  className,
  fallback = null,
  errorFallback,
  onFail,
}: {
  src?: string | null;
  href?: string | null;
  alt?: string;
  className?: string;
  fallback?: React.ReactNode;
  errorFallback?: React.ReactNode;
  /** Called once the link fails to load as an image. */
  onFail?: () => void;
}) {
  // Remember which link failed, so a corrected link gets a fresh attempt
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  if (!src) return <>{fallback}</>;
  if (failedSrc === src) return <>{errorFallback ?? fallback}</>;

  // eslint-disable-next-line @next/next/no-img-element
  const img = <img src={src} alt={alt} onError={() => {
        setFailedSrc(src);
        onFail?.();
      }} className={cn("h-full w-full object-cover", className)} />;
  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className="block h-full w-full" aria-label={alt || "Open the showroom's link"}>
      {img}
    </a>
  ) : (
    img
  );
}
