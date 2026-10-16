"use client";

import { LogOut, Phone, ShieldAlert } from "lucide-react";

/**
 * Shown over the showroom dashboard the moment the administrator suspends the account while the owner
 * is signed in. Nothing behind it can be used: the only way forward is to sign out (or to call the phone number).
 */
export function SuspendedOverlay({ shopName, supportPhone, logoutAction }: { shopName: string; supportPhone?: string | null; logoutAction: () => Promise<void> }) {
  const phone = supportPhone?.trim() || "";
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-background/95 p-4 backdrop-blur-md"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="suspended-title"
      aria-describedby="suspended-body"
    >
      <div className="w-full max-w-md space-y-5 rounded-3xl border border-border bg-card p-6 text-center shadow-2xl sm:p-8">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive-muted text-destructive">
          <ShieldAlert className="h-7 w-7" />
        </div>
        <div className="space-y-2">
          <h2 id="suspended-title" className="text-xl font-bold tracking-tight text-foreground">Your showroom has been suspended</h2>
          <p id="suspended-body" className="text-sm leading-relaxed text-muted-foreground">
            {shopName ? `${shopName} can` : "This showroom can"} no longer use the dashboard or the 3D visualizer. You cannot continue until access is restored.
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-muted p-4 text-left">
          <p className="text-xs font-semibold text-foreground">To restore access, contact the owner</p>
          {phone ? (
            <a href={`tel:${phone.replace(/[^+\d]/g, "")}`} className="mt-2 inline-flex items-center gap-2 font-mono text-base font-bold text-foreground hover:underline">
              <Phone className="h-4 w-4" />
              {phone}
            </a>
          ) : (
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Please contact the administrator of Tile Studio Plus+.</p>
          )}
        </div>

        <form action={logoutAction}>
          <button type="submit" className="ds-btn ds-btn-lg ds-btn-primary w-full">
            <LogOut className="h-4 w-4" />
            <span>Log out</span>
          </button>
        </form>
      </div>
    </div>
  );
}
