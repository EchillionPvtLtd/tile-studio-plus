import { prisma } from "@/lib/prisma";
import { getSession, deleteSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { backfillInvoices, ensureMonthlyInvoices, enforceOverdueSuspensions } from "@/lib/payments";
import { loadFeed } from "@/lib/notifications";
import { getSubscriptionPlans } from "@/lib/subscriptionPlansServer";
import { getPlatformSocialLinks } from "@/lib/platformLinks";
import { AdminWorkspace } from "./AdminWorkspace";

export default async function AdminPage() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    redirect("/login");
  }

  // Paid shops that pre-date the payments ledger get their first invoice (collected only if it was recorded as received)
  await backfillInvoices();
  // A new month: every paying showroom owes it, so it is back on the collect list
  await ensureMonthlyInvoices();
  // Showrooms whose payment date has passed are suspended before the list is read
  await enforceOverdueSuspensions();

  const rawPayments = await prisma.payment.findMany({
    orderBy: { dueDate: "desc" },
    include: { shop: { select: { shopName: true, email: true } } },
  });
  const payments = rawPayments.map((p) => ({
    id: p.id,
    invoiceNo: p.invoiceNo,
    shopId: p.shopId,
    shopName: p.shop.shopName || "Showroom",
    email: p.shop.email,
    plan: p.plan,
    amount: p.amount,
    status: p.status as "Pending" | "Received" | "Failed" | "Refunded",
    dueDate: p.dueDate.toISOString(),
    graceUntil: p.graceUntil ? p.graceUntil.toISOString() : null,
    paidAt: p.paidAt ? p.paidAt.toISOString() : null,
    method: p.method,
    reference: p.reference,
    notes: p.notes,
  }));

  const shops = await prisma.user.findMany({
    where: { role: "SHOP" },
    orderBy: { createdAt: "desc" },
    include: {
      _count: {
        select: { tiles: true, savedDesigns: true },
      },
    },
  });

  const totalTiles = shops.reduce((acc, s) => acc + s._count.tiles, 0);
  const activeSubs = shops.filter((s) => s.subscriptionActive).length;
  const tileValueAggregate = await prisma.tile.aggregate({
    _sum: { pricePerSqFt: true },
  });
  const tileCategories = await prisma.tile.groupBy({
    by: ["category"],
    _count: { _all: true },
  });
  const builtInTilesCount = await prisma.tile.count({
    where: { isBuiltIn: true },
  });
  const recentDesigns = await prisma.savedDesign.findMany({
    take: 8,
    orderBy: { createdAt: "desc" },
    include: {
      user: {
        select: { id: true, shopName: true, email: true },
      },
    },
  });

  const currentAdmin = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, email: true, shopName: true, logoUrl: true, theme: true },
  });

  const adminUser = {
    id: currentAdmin?.id || session.userId,
    email: currentAdmin?.email || session.email,
    name: currentAdmin?.shopName || "Platform Admin",
    logoUrl: currentAdmin?.logoUrl || "",
    theme: currentAdmin?.theme || null,
  };

  const rawSuperAdmins = await prisma.user.findMany({
    where: { role: "ADMIN" },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      email: true,
      shopName: true,
      logoUrl: true,
      createdAt: true,
    },
  });

  const superAdmins = rawSuperAdmins.map((a) => ({
    id: a.id,
    email: a.email,
    name: a.shopName || "Super Administrator",
    logoUrl: a.logoUrl || "",
    createdAt: a.createdAt.toISOString(),
  }));

  const loginPosters = await prisma.loginPoster.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      imageUrl: true,
      tag: true,
      title: true,
      body: true,
      buttonLabel: true,
      buttonUrl: true,
      sortOrder: true,
      active: true,
    },
  });

  // Read receipts addressed to this admin, and every payment reminder sent so far (with its Sent / Unread / Read state)
  const initialNotifications = await loadFeed(session);

  const [subscriptionPlans, platformLinks] = await Promise.all([
    getSubscriptionPlans(),
    getPlatformSocialLinks(),
  ]);

  async function handleLogout() {
    "use server";
    await deleteSession();
    redirect("/login");
  }

  return (
    <AdminWorkspace
      shops={shops}
      totalTiles={totalTiles}
      activeSubs={activeSubs}
      estimatedTileValue={tileValueAggregate._sum.pricePerSqFt || 0}
      tileCategories={tileCategories.map((item) => ({
        category: item.category,
        count: item._count._all,
      }))}
      builtInTilesCount={builtInTilesCount}
      recentDesigns={recentDesigns}
      adminUser={adminUser}
      superAdmins={superAdmins}
      loginPosters={loginPosters}
      payments={payments}
      initialNotifications={initialNotifications}
      subscriptionPlans={subscriptionPlans}
      platformLinks={platformLinks}
      logoutAction={handleLogout}
    />
  );
}


