import { getSession, deleteSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, ArrowLeft } from "lucide-react";
import { loadFeed } from "@/lib/notifications";
import { PaymentReminders } from "./PaymentReminders";

export default async function PaymentDelayPage() {
  const session = await getSession();
  
  if (!session) {
    redirect("/login");
  }

  let user = null;
  if (session?.userId) {
    try {
      user = await prisma.user.findUnique({
        where: { id: session.userId },
        select: {
          shopName: true,
          email: true,
          subscriptionPackage: true,
          subscriptionEnd: true,
        },
      });
    } catch {
      // Fallback gracefully if database lookup fails
    }
  }

  // Reminders the administrator sent (an owner who is suspended is sent here instead of the dashboard)
  let feed = null;
  if (session.role === "SHOP") {
    try {
      feed = await loadFeed(session);
    } catch {
      // The reminders are a courtesy; the page still works without them
    }
  }

  return (
    <div className="min-h-screen flex flex-col justify-between bg-white dark:bg-[#0A0A0C] text-[#101216] dark:text-white transition-colors duration-200 p-4 sm:p-6 relative overflow-hidden">
      
      {/* Top Bar: Brand Logo & Theme Toggle */}
      <header className="w-full max-w-5xl mx-auto flex items-center justify-between z-10">
        <img
          src="/Logo/TS+.BG.png"
          alt="Tile Studio Plus+"
          className="h-9 w-auto object-contain rounded-xl bg-[#0A0A0C] dark:bg-transparent p-1 dark:p-0"
        />
        <ThemeToggle scope="shop" ownerId={session.userId} />
      </header>

      {/* Main Notification Card (Compact Monochrome) */}
      <main className="flex-1 flex flex-col items-center justify-center gap-5 py-6 z-10">
        <Card className="max-w-sm w-full rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-[#F9FAFB] dark:bg-neutral-900/95 p-5 sm:p-6 shadow-xl dark:shadow-[0_20px_50px_-10px_rgba(0,0,0,0.8)] backdrop-blur-md text-center space-y-4">
          
          {/* Monochrome Icon Disc */}
          <div className="relative mx-auto w-12 h-12 rounded-xl bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 flex items-center justify-center text-black dark:text-white shadow-xs">
            <Clock className="w-6 h-6" />
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-center">
              <Badge
                variant="outline"
                className="text-[9px] font-mono uppercase tracking-wider px-2 py-0.5 border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400"
              >
                Access Temporarily Paused
              </Badge>
            </div>
            
            <h1 className="text-xl font-bold tracking-tight text-[#101216] dark:text-white">
              Payment Delay
            </h1>
            
            <p className="text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed">
              Your showroom subscription has reached its renewal date. Access to your dashboard and 3D visualizer is temporarily on hold.
            </p>
          </div>

          {/* Account Details Box */}
          {user && (
            <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-800/60 p-3 text-xs text-left space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-neutral-400 text-[11px]">Showroom</span>
                <span className="font-semibold text-[#101216] dark:text-white truncate max-w-[180px]">{user.shopName || "Showroom Workspace"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-neutral-400 text-[11px]">Email</span>
                <span className="font-mono text-neutral-600 dark:text-neutral-300 text-[11px] truncate max-w-[180px]">{user.email}</span>
              </div>
              <div className="flex items-center justify-between border-t border-neutral-100 dark:border-neutral-700/60 pt-1.5">
                <span className="text-neutral-400 text-[11px]">Plan</span>
                <span className="font-semibold text-black dark:text-white">{user.subscriptionPackage || "Standard"}</span>
              </div>
            </div>
          )}

          {/* Notice & Administrator Support Info */}
          <div className="rounded-lg border border-neutral-200 dark:border-neutral-800/80 bg-neutral-100/70 dark:bg-neutral-800/40 p-2.5 text-[11px] text-neutral-600 dark:text-neutral-400 space-y-0.5 text-left">
            <p className="font-medium text-black dark:text-white text-[11px]">Need immediate reactivation?</p>
            <p className="text-[10px] text-neutral-500 leading-snug">
              Contact the administrator or submit your payment verification receipt to restore access.
            </p>
          </div>

          {/* Action / Return to Login */}
          <div className="pt-1">
            <form action={async () => {
              "use server";
              await deleteSession();
              redirect("/login");
            }}>
              <Button
                type="submit"
                className="w-full h-9 rounded-xl text-xs font-semibold gap-1.5 shadow-xs cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Return to Login Portal</span>
              </Button>
            </form>
          </div>

        </Card>

        {feed && <PaymentReminders initial={feed} />}
      </main>

      {/* Footer Note */}
      <footer className="w-full text-center text-[10px] text-neutral-400 font-mono z-10 py-1">
        Tile Studio Plus+ &copy; {new Date().getFullYear()}
      </footer>

    </div>
  );
}
