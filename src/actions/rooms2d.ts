"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getShopSession } from "@/lib/shopSession";
import { isGuardMessage, requireVisualizer } from "@/lib/visualizerGuard";
import { removeUnreferencedUploads } from "@/lib/uploads";
import { isRoomImageUrl, roomMetaSchema, thumbUrlOf, validateRoomData } from "@/lib/viz2d/roomSchema";

/** More than this and the dashboard would be slow to open; the limit is far above what a showroom needs. */
const MAX_ROOMS_PER_SHOP = 40;
const MAX_DATA_CHARS = 250_000;

/** The dashboard and the full-screen 2D visualizer both list the showroom's rooms. */
function refreshPages() {
  revalidatePath("/shop");
  revalidatePath("/visualizer-2d");
}

const inputSchema = roomMetaSchema.extend({
  id: z.string().uuid().optional(),
  imageUrl: z.string().refine(isRoomImageUrl, "Upload the room photo first"),
  width: z.number().int().min(100).max(8192),
  height: z.number().int().min(100).max(8192),
  data: z.unknown(),
});

export type SaveRoom2DInput = z.input<typeof inputSchema>;
export interface SaveRoom2DResult {
  success: boolean;
  message?: string;
  id?: string;
}

/** Creates or updates a room photo of the signed-in showroom, with the surfaces it marked on it. */
export async function saveRoom2D(input: SaveRoom2DInput): Promise<SaveRoom2DResult> {
  try {
    const session = await getShopSession();
    await requireVisualizer(session.userId, "viz2d");
    const parsed = inputSchema.safeParse(input);
    if (!parsed.success) return { success: false, message: parsed.error.issues[0]?.message ?? "Invalid room." };
    const { id, name, roomType, imageUrl, width, height } = parsed.data;

    const checked = validateRoomData(parsed.data.data);
    if (!checked.ok || !checked.data) return { success: false, message: checked.message ?? "The room's surfaces are not valid." };
    const data = JSON.stringify(checked.data);
    if (data.length > MAX_DATA_CHARS) return { success: false, message: "That room is too detailed. Simplify the outlines." };

    if (id) {
      // Only the showroom that made a room may change it
      const existing = await prisma.roomScene.findUnique({ where: { id }, select: { userId: true, imageUrl: true } });
      if (!existing || existing.userId !== session.userId) return { success: false, message: "Room not found." };
      await prisma.roomScene.update({ where: { id }, data: { name, roomType, imageUrl, width, height, data } });
      if (existing.imageUrl !== imageUrl) await removeUnreferencedUploads([existing.imageUrl, thumbUrlOf(existing.imageUrl)]);
      refreshPages();
      return { success: true, id };
    }

    const count = await prisma.roomScene.count({ where: { userId: session.userId } });
    if (count >= MAX_ROOMS_PER_SHOP) return { success: false, message: `A showroom can keep up to ${MAX_ROOMS_PER_SHOP} room photos. Delete one first.` };
    const created = await prisma.roomScene.create({ data: { name, roomType, imageUrl, width, height, data, userId: session.userId }, select: { id: true } });
    refreshPages();
    return { success: true, id: created.id };
  } catch (e) {
    const message = e instanceof Error ? e.message : "";
    return { success: false, message: isGuardMessage(message) ? message : "Could not save the room. Please try again." };
  }
}

/** Deletes one of the showroom's rooms and its photo. Designs already saved in it keep their summary. */
export async function deleteRoom2D(id: string): Promise<SaveRoom2DResult> {
  try {
    const session = await getShopSession();
    await requireVisualizer(session.userId, "viz2d");
    if (!z.string().uuid().safeParse(id).success) return { success: false, message: "Room not found." };
    const room = await prisma.roomScene.findUnique({ where: { id }, select: { userId: true, imageUrl: true } });
    if (!room || room.userId !== session.userId) return { success: false, message: "Room not found." };
    await prisma.roomScene.delete({ where: { id } });
    await removeUnreferencedUploads([room.imageUrl, thumbUrlOf(room.imageUrl)]);
    refreshPages();
    return { success: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : "";
    return { success: false, message: isGuardMessage(message) ? message : "Could not delete the room. Please try again." };
  }
}
