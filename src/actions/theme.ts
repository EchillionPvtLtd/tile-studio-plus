"use server";

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

const THEMES = [
  "dark", "light", "navy", "travertine", "emerald",
  "champagne", "slate", "charcoal", "ocean", "sage",
];

/**
 * Save the dashboard theme on the signed-in account (a shop or an admin), so it follows
 * them to any browser or device. Does nothing unless the session owns `ownerId`
 * (e.g. an admin previewing a shop's visualizer must not change their own saved theme).
 */
export async function saveTheme(ownerId: string, theme: string) {
  if (!THEMES.includes(theme)) return { success: false };
  try {
    const session = await getSession();
    if (!session || session.userId !== ownerId) return { success: false };
    await prisma.user.update({ where: { id: ownerId }, data: { theme } });
    return { success: true };
  } catch {
    return { success: false };
  }
}
