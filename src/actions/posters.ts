"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import path from "path";
import fs from "fs/promises";
import { isSafeImageUrl, isSafeLinkUrl } from "@/lib/loginPosters";

async function checkAdmin() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    throw new Error("Unauthorized");
  }
}

const posterSchema = z
  .object({
    imageUrl: z.string().trim().refine(isSafeImageUrl, "Upload an image or paste an https:// image link"),
    tag: z.string().trim().max(40, "Tag is too long (max 40)").default(""),
    title: z.string().trim().min(1, "Headline is required").max(120, "Headline is too long (max 120)"),
    body: z.string().trim().max(220, "Description is too long (max 220)").default(""),
    buttonLabel: z.string().trim().max(32, "Button text is too long (max 32)").default(""),
    buttonUrl: z.string().trim().max(500).default(""),
    active: z.boolean().default(true),
  })
  .refine((v) => !v.buttonUrl || v.buttonLabel, {
    path: ["buttonLabel"],
    message: "Add button text, or clear the link",
  })
  .refine((v) => !v.buttonUrl || isSafeLinkUrl(v.buttonUrl), {
    path: ["buttonUrl"],
    message: "Link must start with https://, http:// or /",
  });

export type PosterInput = z.input<typeof posterSchema>;
export type PosterResult = { success: boolean; message?: string; fieldErrors?: Record<string, string[]> };

function refreshPages() {
  revalidatePath("/admin");
  revalidatePath("/login");
}

function fail(error: unknown): PosterResult {
  if (error instanceof z.ZodError) {
    return {
      success: false,
      message: error.issues[0]?.message ?? "Invalid poster",
      fieldErrors: error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  return { success: false, message: error instanceof Error ? error.message : "Something went wrong" };
}

export async function createPoster(input: PosterInput): Promise<PosterResult> {
  try {
    await checkAdmin();
    const data = posterSchema.parse(input);
    const last = await prisma.loginPoster.aggregate({ _max: { sortOrder: true } });
    await prisma.loginPoster.create({
      data: { ...data, sortOrder: (last._max.sortOrder ?? -1) + 1 },
    });
    refreshPages();
    return { success: true };
  } catch (error) {
    return fail(error);
  }
}

export async function updatePoster(id: string, input: PosterInput): Promise<PosterResult> {
  try {
    await checkAdmin();
    const data = posterSchema.parse(input);
    await prisma.loginPoster.update({ where: { id }, data });
    refreshPages();
    return { success: true };
  } catch (error) {
    return fail(error);
  }
}

export async function setPosterActive(id: string, active: boolean): Promise<PosterResult> {
  try {
    await checkAdmin();
    await prisma.loginPoster.update({ where: { id }, data: { active } });
    refreshPages();
    return { success: true };
  } catch (error) {
    return fail(error);
  }
}

export async function deletePoster(id: string): Promise<PosterResult> {
  try {
    await checkAdmin();
    const poster = await prisma.loginPoster.delete({ where: { id } });
    // Remove the uploaded file too (only ones this feature created; never external or logo files).
    const match = /^\/uploads\/(poster-[\w.-]+)$/.exec(poster.imageUrl);
    if (match) {
      await fs.unlink(path.join(process.cwd(), "public", "uploads", match[1])).catch(() => {});
    }
    refreshPages();
    return { success: true };
  } catch (error) {
    return fail(error);
  }
}

/** Persist a new display order; `orderedIds` is the full list, first = shown first. */
export async function reorderPosters(orderedIds: string[]): Promise<PosterResult> {
  try {
    await checkAdmin();
    await prisma.$transaction(
      orderedIds.map((id, index) => prisma.loginPoster.update({ where: { id }, data: { sortOrder: index } }))
    );
    refreshPages();
    return { success: true };
  } catch (error) {
    return fail(error);
  }
}
