import React, { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { getSession, deleteSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { enforceOverdueSuspensions } from "@/lib/payments";
import { loadFeed } from "@/lib/notifications";
import { effectiveAccess } from "@/lib/visualizerAccess";
import { getSubscriptionPlans } from "@/lib/subscriptionPlansServer";
import { getPlatformSocialLinks } from "@/lib/platformLinks";
import { ShopWorkspace } from "./ShopWorkspace";

export default async function ShopPage() {
  const session = await getSession();
  if (!session || session.role !== "SHOP") {
    redirect("/login");
  }

  // A passed payment date suspends the showroom, even for someone who is already signed in
  await enforceOverdueSuspensions(session.userId);

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    include: {
      tiles: {
        orderBy: { createdAt: "desc" },
      },
      savedDesigns: {
        orderBy: { createdAt: "desc" },
        take: 30,
      },
      roomScenes: {
        orderBy: { createdAt: "desc" },
      },
      _count: { select: { tiles: true, savedDesigns: true } }
    },
  });

  if (!user) {
    redirect("/login");
  }

  if (!user.subscriptionActive) {
    redirect("/payment-delay");
  }

  // Reminders saved while the owner was away are waiting here; the dashboard pops them up on arrival
  const [initialNotifications, subscriptionPlans, platformLinks] = await Promise.all([
    loadFeed(session),
    getSubscriptionPlans(),
    getPlatformSocialLinks(),
  ]);

  async function handleLogout() {
    "use server";
    await deleteSession();
    redirect("/login");
  }

  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <ShopWorkspace
        user={user}
        initialNotifications={initialNotifications}
        logoutAction={handleLogout}
        visualizerAccess={effectiveAccess(user.subscriptionPackage, user.details)}
        subscriptionPlans={subscriptionPlans}
        platformLinks={platformLinks}
      />
    </Suspense>
  );
}


