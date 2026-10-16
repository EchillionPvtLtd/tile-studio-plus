"use server";

import { z } from "zod";
import { getSession } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import {
  getPlatformSocialLinks,
  savePlatformSocialLinks,
  type PlatformSocialLinks,
} from "@/lib/platformLinks";

async function checkAdmin() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    throw new Error("Unauthorized: Only administrators can update social links");
  }
}

const socialLinksSchema = z.object({
  websiteUrl: z.string().trim().min(1, "Website link is required"),
  instagramUrl: z.string().trim().default("https://instagram.com"),
  facebookUrl: z.string().trim().default("https://facebook.com"),
  whatsappUrl: z.string().trim().default("https://wa.me/"),
  phone: z.string().trim().default("+94771234567"),
});

export async function getPlatformSocialLinksAction(): Promise<{
  success: boolean;
  links: PlatformSocialLinks;
}> {
  try {
    const links = await getPlatformSocialLinks();
    return { success: true, links };
  } catch {
    return {
      success: false,
      links: {
        websiteUrl: "https://echilion.com",
        instagramUrl: "https://instagram.com",
        facebookUrl: "https://facebook.com",
        whatsappUrl: "https://wa.me/94771234567",
        phone: "+94771234567",
      },
    };
  }
}

export async function savePlatformSocialLinksAction(input: unknown): Promise<{
  success: boolean;
  message?: string;
  links?: PlatformSocialLinks;
}> {
  try {
    await checkAdmin();
    const validated = socialLinksSchema.parse(input);
    const saved = await savePlatformSocialLinks(validated);

    if (!saved) {
      throw new Error("Failed to write social links to disk");
    }

    revalidatePath("/admin");
    revalidatePath("/shop");

    return {
      success: true,
      message: "Footer & social media links updated successfully",
      links: validated,
    };
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return { success: false, message: err.issues[0]?.message || "Invalid links" };
    }
    return { success: false, message: err?.message || "Failed to save links" };
  }
}
