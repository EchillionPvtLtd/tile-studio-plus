import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import { BackButton } from "@/components/BackButton";

export const metadata: Metadata = {
  title: "Page not found | Tile Studio Plus+",
};

/** Grout lines drawn over the fill, so the numerals read as laid tiles. */
const GROUT = "hsl(var(--background))";
const tiledNumerals = {
  backgroundImage: [
    `repeating-linear-gradient(0deg, transparent 0 calc(1.6rem - 3px), ${GROUT} calc(1.6rem - 3px) 1.6rem)`,
    `repeating-linear-gradient(90deg, transparent 0 calc(1.6rem - 3px), ${GROUT} calc(1.6rem - 3px) 1.6rem)`,
    "linear-gradient(160deg, hsl(var(--foreground)) 15%, hsl(var(--primary)) 85%)",
  ].join(", "),
} as const;

export default function NotFound() {
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-background px-6 py-16 text-center text-foreground">
      {/* Tiled floor receding to the horizon */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[45%] overflow-hidden [mask-image:linear-gradient(to_top,black_30%,transparent)]"
      >
        <div
          className="absolute -inset-x-[60%] bottom-0 h-[260%] origin-bottom"
          style={{
            transform: "perspective(420px) rotateX(64deg)",
            backgroundImage: [
              "linear-gradient(hsl(var(--input)) 2px, transparent 2px)",
              "linear-gradient(90deg, hsl(var(--input)) 2px, transparent 2px)",
            ].join(", "),
            backgroundSize: "88px 88px",
          }}
        />
      </div>

      {/* Colour glow behind the numerals */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[38%] h-[420px] w-[min(90vw,720px)] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/20 blur-[110px]"
      />

      <div className="relative flex w-full max-w-xl flex-col items-center">
        <img src="/Logo/TS+.BG.png" alt="Tile Studio Plus+" className="logo-on-dark mb-6 h-11 w-auto select-none object-contain" />
        <img src="/Logo/TS+.BK.png" alt="Tile Studio Plus+" className="logo-on-light mb-6 h-11 w-auto select-none object-contain" />

        <h1 aria-label="404" className="select-none">
          <span
            aria-hidden
            className="block bg-clip-text text-[clamp(7rem,30vw,15rem)] font-extrabold leading-[0.9] tracking-tighter text-transparent"
            style={tiledNumerals}
          >
            404
          </span>
        </h1>

        <p className="mt-4 text-xl font-semibold tracking-tight sm:text-2xl">This tile isn&apos;t laid yet</p>
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
          The page you&apos;re looking for doesn&apos;t exist or has been moved. Check the address, or head back to your workspace.
        </p>

        <div className="mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          <Link href="/login" className="ds-btn ds-btn-lg ds-btn-primary">
            Go to sign in
            <ArrowRight className="h-4 w-4" />
          </Link>
          <BackButton className="ds-btn ds-btn-lg ds-btn-outline bg-background/60 backdrop-blur" />
        </div>
      </div>
    </main>
  );
}
