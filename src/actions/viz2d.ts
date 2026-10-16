"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getShopSession } from "@/lib/shopSession";
import { isGuardMessage, requireVisualizer } from "@/lib/visualizerGuard";
import { isSafeTextureUrl } from "@/lib/loginPosters";
import { BUILTIN_ROOMS } from "@/data/rooms2d";
import { sanitizeDesign, groupIdOf } from "@/lib/viz2d/design";
import { sceneFromRow } from "@/lib/viz2d/roomSchema";
import type { Design, RoomScene } from "@/lib/viz2d/types";

/** A thumbnail is a small JPEG; the limit keeps the request well inside the 1 MB a server action accepts. */
const THUMBNAIL = /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/;
const MAX_THUMBNAIL_CHARS = 300_000;
const MAX_DESIGNS_PER_SHOP = 5000;

const inputSchema = z.object({
  roomId: z.string().min(1).max(120),
  name: z.string().trim().max(80).optional().default(""),
  thumbnail: z.string().max(MAX_THUMBNAIL_CHARS).regex(THUMBNAIL, "The preview image is not valid").optional(),
  design: z.unknown(),
});

export type SaveDesign2DInput = z.input<typeof inputSchema>;
export interface SaveDesign2DResult {
  success: boolean;
  message?: string;
}

/**
 * The room a design was made in. The client names a room, the server finds it: nobody can supply their own geometry.
 * A showroom's own rooms are only found for that showroom.
 */
async function resolveRoom(roomId: string, userId: string): Promise<RoomScene | null> {
  const builtin = BUILTIN_ROOMS.find((r) => r.id === roomId);
  if (builtin) return builtin;
  const row = await prisma.roomScene.findFirst({ where: { id: roomId, userId } });
  return row ? sceneFromRow(row) : null;
}

/**
 * Records a 2D design in the showroom's account, so the dashboard counts it among the designs made with its tiles.
 * The columns of SavedDesign were made for the 3D rooms, so the 2D design is summarised into them: the room type,
 * the tile on the floor and on each wall, and the laying (pattern, grout) of the first tiled surface.
 */
export async function saveDesign2D(input: SaveDesign2DInput): Promise<SaveDesign2DResult> {
  try {
    const session = await getShopSession();
    await requireVisualizer(session.userId, "viz2d");
    const parsed = inputSchema.safeParse(input);
    if (!parsed.success) return { success: false, message: parsed.error.issues[0]?.message ?? "Invalid design." };
    const { roomId, thumbnail } = parsed.data;

    const room = await resolveRoom(roomId, session.userId);
    if (!room) return { success: false, message: "That room is not available." };

    // Keep only what is valid for this room, and only tile pictures this app would load itself
    const design: Design = sanitizeDesign(parsed.data.design, room);
    for (const [id, s] of Object.entries(design.surfaces)) {
      if (!s.tile || !isSafeTextureUrl(s.tile.textureUrl)) delete design.surfaces[id];
    }
    const tiled = Object.entries(design.surfaces);
    if (tiled.length === 0) return { success: false, message: "Tile at least one surface before saving." };

    const count = await prisma.savedDesign.count({ where: { userId: session.userId } });
    if (count >= MAX_DESIGNS_PER_SHOP) return { success: false, message: "This showroom has reached the saved design limit." };

    // Summarise into the 3D-shaped columns
    const tileOfKind = (kind: string) => tiled.find(([id]) => room.surfaces.some((s) => groupIdOf(s) === id && s.kind === kind))?.[1].tile?.id ?? null;
    const tileOfSide = (side: string) => {
      for (const s of room.surfaces) {
        const set = s.wallSide === side ? design.surfaces[groupIdOf(s)] : undefined;
        if (set?.tile) return set.tile.id;
      }
      return null;
    };
    const lead = tiled.find(([id]) => room.surfaces.some((s) => groupIdOf(s) === id && s.kind === "floor")) ?? tiled[0];
    const laying = lead[1];

    await prisma.savedDesign.create({
      data: {
        sessionId: `viz2d-${session.userId}`,
        roomType: room.roomType,
        lengthFt: room.dims?.lengthFt ?? 0,
        widthFt: room.dims?.widthFt ?? 0,
        heightFt: room.dims?.heightFt ?? 0,
        floorTileId: tileOfKind("floor"),
        wallNTileId: tileOfSide("north"),
        wallSTileId: tileOfSide("south"),
        wallETileId: tileOfSide("east"),
        wallWTileId: tileOfSide("west"),
        layout: laying.layout,
        groutWidthMm: Math.round(laying.groutMm),
        groutColor: laying.groutColor,
        thumbnail: thumbnail ?? null,
        sceneId: room.id,
        // The whole design, so it can be reopened on any device
        data: JSON.stringify({ name: parsed.data.name || null, design }),
        userId: session.userId,
      },
    });

    revalidatePath("/shop");
    return { success: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : "";
    return { success: false, message: isGuardMessage(message) ? message : "Could not record the design. Please try again." };
  }
}
