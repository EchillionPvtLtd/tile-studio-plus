"use server";

import { z } from "zod";
import { getSession } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import {
  getSubscriptionPlans,
  saveSubscriptionPlans,
  resetDefaultPlans,
} from "@/lib/subscriptionPlansServer";
import type { SubscriptionPlanItem } from "@/lib/subscriptionPlanTypes";

async function checkAdmin() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    throw new Error("Unauthorized: Only administrators can modify subscription plans");
  }
}

const planSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1, "Plan name is required").max(60, "Plan name too long"),
  price: z.coerce.number().min(0, "Price cannot be negative"),
  currency: z.string().trim().default("LKR"),
  billingCycle: z.enum(["monthly", "yearly"]).default("monthly"),
  durationMonths: z.number().int().min(1, "Duration is 1 to 12 months").max(12, "Duration is 1 to 12 months").optional(),
  tileQuota: z.coerce.number().min(1, "Quota must be at least 1 tile"),
  quotaLabel: z.string().trim().min(1, "Quota label is required"),
  features: z.array(z.string().trim().min(1)).min(1, "Add at least one feature"),
  isPopular: z.boolean().optional().default(false),
  isCustomPrice: z.boolean().optional().default(false),
  customPriceLabel: z.string().trim().optional(),
  description: z.string().trim().optional(),
  active: z.boolean().default(true),
  sortOrder: z.coerce.number().default(0),
});

export async function getSubscriptionPlansAction(): Promise<{
  success: boolean;
  plans: SubscriptionPlanItem[];
  message?: string;
}> {
  try {
    const plans = await getSubscriptionPlans();
    return { success: true, plans };
  } catch (err: any) {
    return { success: false, plans: [], message: err?.message || "Failed to load plans" };
  }
}

export async function saveSubscriptionPlanAction(input: unknown): Promise<{
  success: boolean;
  message?: string;
  plans?: SubscriptionPlanItem[];
  fieldErrors?: Record<string, string[]>;
}> {
  try {
    await checkAdmin();
    const validated = planSchema.parse(input);

    const plans = await getSubscriptionPlans();
    const existingIndex = plans.findIndex((p) => p.id === validated.id);

    let updatedPlans: SubscriptionPlanItem[];
    if (existingIndex >= 0) {
      updatedPlans = [...plans];
      updatedPlans[existingIndex] = {
        ...validated,
        sortOrder: plans[existingIndex].sortOrder,
      };
    } else {
      const maxSort = plans.reduce((max, p) => Math.max(max, p.sortOrder || 0), 0);
      updatedPlans = [
        ...plans,
        {
          ...validated,
          sortOrder: maxSort + 1,
        },
      ];
    }

    const saved = await saveSubscriptionPlans(updatedPlans);
    if (!saved) {
      throw new Error("Failed to write subscription plans to storage");
    }

    revalidatePath("/admin");
    revalidatePath("/shop");

    return {
      success: true,
      message: `Plan "${validated.name}" saved successfully`,
      plans: updatedPlans,
    };
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return {
        success: false,
        message: err.issues[0]?.message || "Validation error",
        fieldErrors: err.flatten().fieldErrors as Record<string, string[]>,
      };
    }
    return { success: false, message: err?.message || "Failed to save plan" };
  }
}

export async function deleteSubscriptionPlanAction(planId: string): Promise<{
  success: boolean;
  message?: string;
  plans?: SubscriptionPlanItem[];
}> {
  try {
    await checkAdmin();
    const plans = await getSubscriptionPlans();
    if (plans.length <= 1) {
      return { success: false, message: "Cannot delete the only remaining plan" };
    }

    const updated = plans.filter((p) => p.id !== planId);
    await saveSubscriptionPlans(updated);

    revalidatePath("/admin");
    revalidatePath("/shop");

    return {
      success: true,
      message: "Plan deleted successfully",
      plans: updated,
    };
  } catch (err: any) {
    return { success: false, message: err?.message || "Failed to delete plan" };
  }
}

export async function resetSubscriptionPlansAction(): Promise<{
  success: boolean;
  message?: string;
  plans?: SubscriptionPlanItem[];
}> {
  try {
    await checkAdmin();
    const reset = await resetDefaultPlans();

    revalidatePath("/admin");
    revalidatePath("/shop");

    return {
      success: true,
      message: "Subscription plans reset to platform defaults",
      plans: reset,
    };
  } catch (err: any) {
    return { success: false, message: err?.message || "Failed to reset plans" };
  }
}
