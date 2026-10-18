"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcrypt";
import { getShopSession } from "@/lib/shopSession";
import { revalidatePath } from "next/cache";
import { isSafeLinkUrl } from "@/lib/loginPosters";
import { resolveBrandImageUrl, resolveTileImageUrl } from "@/lib/tileImageUrl";
import { withDownloads, type VisualizerDownloads } from "@/lib/visualizerDownloads";
import { keepStoredAccess } from "@/lib/visualizerAccess";

const addTileSchema = z.object({
  sku: z.string().min(1),
  name: z.string().min(1),
  widthMm: z.coerce.number().min(1),
  heightMm: z.coerce.number().min(1),
  // Tile pictures are added by link: a direct image address or a Google Drive sharing link (turned into an image address here)
  textureUrl: z.string().transform((value, ctx) => {
    const resolved = resolveTileImageUrl(value);
    if (resolved.ok) return resolved.url;
    ctx.addIssue({ code: "custom", message: resolved.error });
    return z.NEVER;
  }),
  pricePerSqFt: z.coerce.number().min(0).optional().default(0),
  category: z.string().optional().default("both"),
  finish: z.string().optional().default("Matt"),
  collectionId: z.string().optional(),
});

export async function addTile(prevState: any, formData: FormData) {
  try {
    const session = await getShopSession();
    
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      include: { _count: { select: { tiles: true } } }
    });

    if (!user) return { success: false, message: "User not found" };

    if (user._count.tiles >= user.tileQuota) {
      return { success: false, message: `Quota reached! You can only add up to ${user.tileQuota} tiles.` };
    }

    const result = addTileSchema.safeParse(Object.fromEntries(formData));
    if (!result.success) {
       const errors = result.error.flatten().fieldErrors;
       // The texture link is the one field with a message written for people; the rest are covered by the form itself
       return { success: false, message: errors.textureUrl?.[0] ?? "Invalid form data.", errors };
    }

    const newTile = await prisma.tile.create({
      data: {
        sku: result.data.sku,
        name: result.data.name,
        widthMm: result.data.widthMm,
        heightMm: result.data.heightMm,
        textureUrl: result.data.textureUrl,
        pricePerSqFt: result.data.pricePerSqFt,
        category: result.data.category,
        finish: result.data.finish,
        userId: user.id,
        previewUrl: result.data.textureUrl,
      }
    });

    revalidatePath("/shop");
    return { success: true, message: "Tile added successfully!", tileId: newTile.id };
  } catch (e: any) {
    // A showroom cannot use the same SKU twice: say so plainly instead of showing a database error
    if (e?.code === "P2002") {
      return { success: false, message: "You already have a tile with that SKU. Choose a different SKU.", errors: { sku: ["SKU already in use"] } };
    }
    return { success: false, message: e?.message === "Unauthorized" || /suspended/.test(e?.message ?? "") ? e.message : "Could not add the tile. Please try again." };
  }
}

export async function deleteTile(tileId: string) {
  try {
    const session = await getShopSession();
    
    const tile = await prisma.tile.findUnique({
      where: { id: tileId }
    });

    if (!tile || tile.userId !== session.userId) {
      return { success: false, message: "Unauthorized or tile not found" };
    }

    await prisma.tile.delete({
      where: { id: tileId }
    });

    revalidatePath("/shop");
    return { success: true, message: "Tile removed successfully" };
  } catch (e: any) {
    return { success: false, message: "Failed to delete tile" };
  }
}

const editTileSchema = z.object({
  sku: z.string().trim().min(1, "Enter a SKU.").max(60, "The SKU is too long."),
  name: z.string().trim().min(1, "Enter a tile name.").max(120, "The name is too long."),
  widthMm: z.coerce.number().int("Enter whole millimetres.").min(10, "The width must be at least 10 mm.").max(5000, "The width must be 5000 mm or less."),
  heightMm: z.coerce.number().int("Enter whole millimetres.").min(10, "The height must be at least 10 mm.").max(5000, "The height must be 5000 mm or less."),
  // Checked below, and only when it changed: a tile saved under older rules keeps its picture
  textureUrl: z.string().trim().min(1, "Enter the texture image link."),
  pricePerSqFt: z.coerce.number().min(0, "The price cannot be negative.").max(10_000_000, "The price is too high."),
  category: z.enum(["both", "floor", "wall"]),
  // Not a fixed list: showrooms have saved finishes such as "Rustic"
  finish: z.string().trim().min(1).max(40),
});

export type EditTileInput = z.input<typeof editTileSchema>;
export type EditTileResult = {
  success: boolean;
  message: string;
  errors?: Record<string, string[] | undefined>;
};

/** Changes the details of one of the signed-in showroom's own tiles. Another showroom's tile is never found. */
export async function updateTile(tileId: string, input: EditTileInput): Promise<EditTileResult> {
  try {
    const session = await getShopSession();
    if (typeof tileId !== "string" || !tileId) return { success: false, message: "Tile not found." };

    const tile = await prisma.tile.findUnique({ where: { id: tileId }, select: { userId: true, textureUrl: true } });
    if (!tile || tile.userId !== session.userId) return { success: false, message: "Tile not found." };

    const result = editTileSchema.safeParse(input);
    if (!result.success) {
      const errors = result.error.flatten().fieldErrors;
      const first = Object.values(errors).flat()[0];
      return { success: false, message: first ?? "Check the tile details and try again.", errors };
    }

    const data = result.data;
    if (data.textureUrl !== tile.textureUrl) {
      // A new picture must be an image link (or Google Drive sharing link); the one already saved is kept as it is
      const resolved = resolveTileImageUrl(data.textureUrl);
      if (!resolved.ok) return { success: false, message: resolved.error, errors: { textureUrl: [resolved.error] } };
      data.textureUrl = resolved.url;
    }
    await prisma.tile.update({
      where: { id: tileId },
      data: {
        ...data,
        // The picture shown in lists follows the texture whenever the texture changes
        ...(data.textureUrl !== tile.textureUrl ? { previewUrl: data.textureUrl } : {}),
      },
    });

    revalidatePath("/shop");
    return { success: true, message: "Tile updated." };
  } catch (e: any) {
    if (e?.code === "P2002") {
      return { success: false, message: "You already have a tile with that SKU. Choose a different SKU.", errors: { sku: ["SKU already in use"] } };
    }
    return { success: false, message: e?.message === "Unauthorized" || /suspended/.test(e?.message ?? "") ? e.message : "Could not update the tile. Please try again." };
  }
}

export async function updateShopProfileSettings({
  shopName,
  details,
  logoUrl,
  coverPhotoUrl,
  coverLinkUrl,
  currentPassword,
  newPassword,
}: {
  shopName?: string;
  details?: string;
  logoUrl?: string | null;
  coverPhotoUrl?: string | null;
  coverLinkUrl?: string | null;
  currentPassword?: string;
  newPassword?: string;
}) {
  try {
    const session = await getShopSession();
    const user = await prisma.user.findUnique({ where: { id: session.userId } });
    if (!user) return { success: false, message: "Showroom account not found." };

    const updateData: any = {};
    if (shopName !== undefined) updateData.shopName = shopName.trim();
    // A showroom edits its own details, never its own permissions: the visualizer access the administrator set is kept as stored
    if (details !== undefined) updateData.details = keepStoredAccess(user.details, details);
    // Logo and banner links may be normal image links or Google Drive sharing links (saved as the picture address)
    for (const [label, value, field] of [["logo", logoUrl, "logoUrl"], ["cover", coverPhotoUrl, "coverPhotoUrl"]] as const) {
      if (value === undefined) continue;
      const image = resolveBrandImageUrl(value);
      if (!image.ok) return { success: false, message: `The ${label} link: ${image.error}` };
      updateData[field] = image.value;
    }
    if (coverLinkUrl && !isSafeLinkUrl(coverLinkUrl.trim())) {
      return { success: false, message: "The banner link must start with https:// (or http://)." };
    }
    if (coverLinkUrl !== undefined) updateData.coverLinkUrl = coverLinkUrl ? coverLinkUrl.trim() : null;

    if (newPassword && newPassword.trim().length > 0) {
      if (!currentPassword) {
        return { success: false, message: "Please provide your current password to set a new password." };
      }
      const isValid = await bcrypt.compare(currentPassword, user.password);
      if (!isValid) {
        return { success: false, message: "Current password does not match our records." };
      }
      if (newPassword.trim().length < 6) {
        return { success: false, message: "New password must be at least 6 characters long." };
      }
      updateData.password = await bcrypt.hash(newPassword.trim(), 10);
    }

    const updated = await prisma.user.update({
      where: { id: session.userId },
      data: updateData,
    });

    revalidatePath("/shop");
    return { 
      success: true, 
      message: "Showroom settings saved successfully!",
      user: {
        shopName: updated.shopName,
        details: updated.details,
        logoUrl: updated.logoUrl,
        coverPhotoUrl: updated.coverPhotoUrl,
        coverLinkUrl: updated.coverLinkUrl,
      }
    };
  } catch (error: any) {
    return { success: false, message: error?.message === "Unauthorized" || /suspended/.test(error?.message ?? "") ? error.message : "Failed to update showroom settings." };
  }
}

/**
 * Switches the Download button of the 2D and / or 3D visualizer on or off for the signed-in showroom, and for no other.
 * Only the keys that are given change; the rest of the showroom's `details` is left as it was.
 */
export async function setVisualizerDownloads(input: { viz2d?: boolean; viz3d?: boolean }): Promise<{ success: boolean; message?: string; downloads?: VisualizerDownloads }> {
  try {
    const session = await getShopSession();
    const patch: Partial<VisualizerDownloads> = {};
    if (typeof input?.viz2d === "boolean") patch.viz2d = input.viz2d;
    if (typeof input?.viz3d === "boolean") patch.viz3d = input.viz3d;
    if (patch.viz2d === undefined && patch.viz3d === undefined) return { success: false, message: "Nothing to change." };

    const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { details: true } });
    if (!user) return { success: false, message: "Showroom account not found." };

    const { details, downloads } = withDownloads(user.details, patch);
    await prisma.user.update({ where: { id: session.userId }, data: { details } });
    revalidatePath("/shop");

    const [key, label] = patch.viz2d !== undefined ? (["viz2d", "2D"] as const) : (["viz3d", "3D"] as const);
    const on = downloads[key];
    return { success: true, message: `The ${label} Visualizer Download button is now ${on ? "shown" : "hidden"}.`, downloads };
  } catch (error: any) {
    return { success: false, message: error?.message === "Unauthorized" || /suspended/.test(error?.message ?? "") ? error.message : "Could not save this setting. Please try again." };
  }
}
