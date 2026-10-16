import path from "path";
import fs from "fs/promises";
import { prisma } from "@/lib/prisma";

const UPLOAD_URL = /^\/uploads\/([\w.-]+)$/;

/** File name of an image uploaded to this app ("/uploads/logo-1.webp" -> "logo-1.webp"), or null for any other link. */
export function uploadFileName(url: string | null | undefined): string | null {
  const name = url ? UPLOAD_URL.exec(url.trim())?.[1] : undefined;
  return name && !name.includes("..") ? name : null;
}

/** Every "/uploads/..." link mentioned anywhere in a piece of text (e.g. a JSON blob of settings). */
export function uploadUrlsIn(text: string | null | undefined): string[] {
  return text ? (text.match(/\/uploads\/[\w.-]+/g) ?? []) : [];
}

async function isStillUsed(url: string): Promise<boolean> {
  const [users, tiles, posters, rooms] = await Promise.all([
    prisma.user.count({ where: { OR: [{ logoUrl: url }, { coverPhotoUrl: url }, { details: { contains: url } }] } }),
    prisma.tile.count({ where: { OR: [{ textureUrl: url }, { previewUrl: url }] } }),
    prisma.loginPoster.count({ where: { imageUrl: url } }),
    // A room's thumbnail is stored beside its photo as "<name>-t.webp"
    prisma.roomScene.count({ where: { imageUrl: url.replace(/-t\.webp$/, ".webp") } }),
  ]);
  return users + tiles + posters + rooms > 0;
}

/**
 * Delete uploaded image files that nothing in the database refers to any more.
 * Links that are not uploads, and files still used by someone else, are left alone. Never throws:
 * a leftover file is harmless, whereas failing the caller's real work because of it would not be.
 */
export async function removeUnreferencedUploads(urls: Iterable<string | null | undefined>): Promise<number> {
  const names = new Set<string>();
  for (const url of urls) {
    const name = uploadFileName(url);
    if (name) names.add(name);
  }

  let removed = 0;
  for (const name of names) {
    try {
      if (await isStillUsed(`/uploads/${name}`)) continue;
      await fs.unlink(path.join(process.cwd(), "public", "uploads", name));
      removed++;
    } catch {
      // already gone, or not removable: ignore
    }
  }
  return removed;
}
