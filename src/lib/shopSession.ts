import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Ensures the caller is a showroom whose account still exists and is switched on.
 * A cookie alone is not enough: a deleted or suspended showroom must not keep working for the rest of its 24h session.
 */
export async function getShopSession() {
  const session = await getSession();
  if (!session || session.role !== "SHOP") {
    throw new Error("Unauthorized");
  }
  const account = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { role: true, subscriptionActive: true },
  });
  if (!account || account.role !== "SHOP") {
    throw new Error("Unauthorized");
  }
  if (!account.subscriptionActive) {
    throw new Error("This showroom is suspended. Please contact the administrator.");
  }
  return session;
}
