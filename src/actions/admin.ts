"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcrypt";
import { getSession } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { nextInvoiceNo, openInvoiceIfNone, syncInvoiceToPlan, asDate, todayISO, hasOverdueInvoices, syncShopMeta } from "@/lib/payments";
import { isSafeImageUrl } from "@/lib/loginPosters";
import { removeUnreferencedUploads, uploadUrlsIn } from "@/lib/uploads";
import { asBillingDay, asDurationMonths, expiryAfterMonths, findPackage, firstBillingDate, isCustomPlan, nextBillingDate } from "@/lib/subscriptionPlans";
import { getSubscriptionPlans } from "@/lib/subscriptionPlansServer";
import { VISUALIZER_LABEL, accessStates, planAccessRecord, samePlan, withAccessChange, withPlanDefaults, type VisualizerKind } from "@/lib/visualizerAccess";

/** An uploaded image path, an https link, or (the upload fallback) a small inline image. Anything else is refused. */
function cleanImageUrl(value: string | null | undefined): { ok: true; value: string | null } | { ok: false } {
  const v = (value ?? "").trim();
  if (!v) return { ok: true, value: null };
  if (isSafeImageUrl(v)) return { ok: true, value: v };
  if (v.length < 1_500_000 && /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(v)) return { ok: true, value: v };
  return { ok: false };
}

// Ensure user is admin
async function checkAdmin() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    throw new Error("Unauthorized");
  }
}

const createUserSchema = z.object({
  // Role
  role: z.enum(["ADMIN", "SHOP"]).default("SHOP"),

  // 1. Basic & Business Information
  shopName: z.string().optional(),
  companyRegName: z.string().optional(),
  ownerName: z.string().optional(),
  contactPerson: z.string().optional(),
  phone: z.string().optional(),
  whatsapp: z.string().optional(),
  email: z.string().optional(),
  website: z.string().optional(),
  businessRegNo: z.string().optional(),
  taxVatNo: z.string().optional(),
  logoUrl: z.string().optional(),
  description: z.string().optional(),

  // 2. Shop Address
  addressLine1: z.string().optional(),
  addressLine2: z.string().optional(),
  city: z.string().optional(),
  district: z.string().optional(),
  province: z.string().optional(),
  postalCode: z.string().optional(),

  // 3. Shop Admin Account
  adminName: z.string().optional(),
  adminEmail: z.string().optional(),
  username: z.string().optional(),
  password: z.string().min(6, "Password must be at least 6 characters"),
  accountStatus: z.enum(["Active", "Suspended"]).default("Active"),

  // 4. Subscription & Payment
  plan: z.string().default("Free Trial"),
  tileQuota: z.coerce.number().min(1).default(50),
  startDate: z.string().optional(),
  expiryDate: z.string().optional(),
  duration: z.string().optional(),
  /** 1 to 12: how long the plan runs. With the start date it fixes the expiry date. */
  durationMonths: z.string().optional(),
  billingDay: z.string().optional(),
  planPrice: z.coerce.number().min(0).optional().default(0),
  amountPaid: z.coerce.number().min(0).optional().default(0),
  balance: z.coerce.number().min(0).optional().default(0),
  paymentStatus: z.string().optional().default("Pending"),
  paymentDate: z.string().optional(),
  paymentMethod: z.string().optional().default("Bank Transfer"),
  paymentReference: z.string().optional(),
  notes: z.string().optional(),
});

export type CreateUserState = {
  message?: string;
  errors?: Record<string, string[]>;
  success?: boolean;
};

export async function createUser(
  prevState: CreateUserState | null | undefined,
  formData: FormData
): Promise<CreateUserState> {
  try {
    await checkAdmin();
  } catch (e) {
    return { message: "Unauthorized. Admin session required." };
  }

  const rawEntries = Object.fromEntries(formData);
  const result = createUserSchema.safeParse(rawEntries);

  if (!result.success) {
    return { errors: result.error.flatten().fieldErrors };
  }

  const data = result.data;
  const role = data.role;

  // Resolve login email: adminEmail takes precedence, fallback to email
  const loginEmail = (data.adminEmail || data.email || "").trim().toLowerCase();
  if (!loginEmail || !z.string().email().safeParse(loginEmail).success) {
    return {
      errors: {
        adminEmail: ["A valid Admin Login Email is required."],
      },
    };
  }

  const logo = cleanImageUrl(data.logoUrl);
  if (!logo.ok) {
    return { errors: { logoUrl: ["Use an uploaded image or an https:// image link."] } };
  }

  // If SHOP, validate critical required fields
  if (role === "SHOP") {
    const shopErrors: Record<string, string[]> = {};
    if (!data.shopName || data.shopName.trim().length < 2) {
      shopErrors.shopName = ["Shop Name must be at least 2 characters."];
    }
    if (!data.ownerName || data.ownerName.trim().length < 2) {
      shopErrors.ownerName = ["Owner Name is required."];
    }
    if (!data.phone || data.phone.trim().length < 5) {
      shopErrors.phone = ["Valid Phone Number is required."];
    }
    if (!data.addressLine1 || data.addressLine1.trim().length < 3) {
      shopErrors.addressLine1 = ["Address Line 1 is required."];
    }
    if (!data.city || data.city.trim().length < 2) {
      shopErrors.city = ["City is required."];
    }
    if (!data.adminName || data.adminName.trim().length < 2) {
      shopErrors.adminName = ["Admin Name is required."];
    }

    if (Object.keys(shopErrors).length > 0) {
      return { errors: shopErrors };
    }
  }

  try {
    const existingUser = await prisma.user.findUnique({ where: { email: loginEmail } });
    if (existingUser) {
      return { 
        message: `An account with email "${loginEmail}" already exists. Please use a unique email.`,
        errors: { adminEmail: ["Email already in use."] }
      };
    }

    const durationMonths = data.plan === "Free Trial" ? null : asDurationMonths(data.durationMonths);

    // Build structured details metadata
    const shopMetadata = {
      companyRegName: data.companyRegName?.trim() || null,
      ownerName: data.ownerName?.trim() || null,
      contactPerson: data.contactPerson?.trim() || data.ownerName?.trim() || null,
      phone: data.phone?.trim() || null,
      whatsapp: data.whatsapp?.trim() || data.phone?.trim() || null,
      shopEmail: data.email?.trim() || loginEmail,
      website: data.website?.trim() || null,
      addressLine1: data.addressLine1?.trim() || null,
      addressLine2: data.addressLine2?.trim() || null,
      city: data.city?.trim() || null,
      district: data.district?.trim() || null,
      province: data.province?.trim() || null,
      postalCode: data.postalCode?.trim() || null,
      businessRegNo: data.businessRegNo?.trim() || null,
      taxVatNo: data.taxVatNo?.trim() || null,
      description: data.description?.trim() || null,
      adminName: data.adminName?.trim() || null,
      username: data.username?.trim() || null,
      accountStatus: data.accountStatus,
      plan: data.plan,
      duration: data.duration || "Monthly",
      ...(durationMonths !== null ? { durationMonths } : {}),
      billingDay: asBillingDay(data.billingDay),
      planPrice: Number(data.planPrice) || 0,
      amountPaid: Number(data.amountPaid) || 0,
      balance: Math.max(0, (Number(data.planPrice) || 0) - (Number(data.amountPaid) || 0)),
      paymentStatus: data.paymentStatus || (data.plan === "Free Trial" ? "Waived" : "Pending"),
      paymentDate: data.paymentDate || new Date().toISOString().split("T")[0],
      paymentMethod: data.paymentMethod || "Bank Transfer",
      paymentReference: data.paymentReference?.trim() || null,
      notes: data.notes?.trim() || null,
      // Visualizer access starts as the plan's defaults: Starter 2D only, Professional both, Custom Plan both (the agreement is then set per showroom)
      visualizerAccess: planAccessRecord(data.plan),
    };

    const isFreeTrial = data.plan === "Free Trial";
    const startISO = data.startDate || todayISO();
    const startDate = new Date(startISO);
    
    let subscriptionEnd: Date | null = null;
    let trialEndsAt: Date | null = null;

    if (isFreeTrial) {
      trialEndsAt = data.expiryDate ? new Date(data.expiryDate) : new Date(startDate.getTime() + 14 * 24 * 60 * 60 * 1000);
      subscriptionEnd = null;
    } else {
      const byDuration = durationMonths !== null ? expiryAfterMonths(startISO, durationMonths) : "";
      subscriptionEnd = byDuration ? new Date(byDuration) : data.expiryDate ? new Date(data.expiryDate) : new Date(startDate.getTime() + 30 * 24 * 60 * 60 * 1000);
      trialEndsAt = null;
    }

    const created = await prisma.user.create({
      data: {
        email: loginEmail,
        password: await bcrypt.hash(data.password, 10),
        role,
        shopName: role === "SHOP" ? (data.shopName?.trim() || null) : null,
        logoUrl: logo.ok ? logo.value : null,
        tileQuota: role === "SHOP" ? (Number(data.tileQuota) || 50) : 0,
        subscriptionPackage: role === "SHOP" ? data.plan : "Platform Admin",
        subscriptionStart: startDate,
        subscriptionEnd: subscriptionEnd,
        trialEndsAt: trialEndsAt,
        subscriptionActive: data.accountStatus === "Active",
        details: role === "SHOP" ? JSON.stringify(shopMetadata) : null,
      },
    });

    // The first invoice: collected now if the form says so, otherwise waiting as Pending
    const fee = Number(data.planPrice) || 0;
    if (role === "SHOP" && !isFreeTrial && fee > 0 && shopMetadata.paymentStatus !== "Waived") {
      const received = shopMetadata.paymentStatus === "Paid" || shopMetadata.paymentStatus === "Received";
      await prisma.payment.create({
        data: {
          invoiceNo: await nextInvoiceNo(),
          shopId: created.id,
          plan: data.plan,
          amount: received ? Number(data.amountPaid) || fee : fee,
          status: received ? "Received" : "Pending",
          dueDate: asDate(firstBillingDate(startISO, asBillingDay(data.billingDay))) ?? startDate,
          paidAt: received ? asDate(data.paymentDate) ?? startDate : null,
          method: received ? shopMetadata.paymentMethod : null,
          reference: received ? shopMetadata.paymentReference : null,
          notes: shopMetadata.notes,
        },
      });
      if (received && !isCustomPlan(data.plan)) {
        const firstDue = firstBillingDate(startISO, asBillingDay(data.billingDay));
        const nextDue = asDate(nextBillingDate(firstDue, asBillingDay(data.billingDay)));
        if (nextDue) await openInvoiceIfNone({ shopId: created.id, plan: data.plan, amount: fee, dueDate: nextDue });
      }
    }

    revalidatePath("/admin");
    return { 
      success: true, 
      message: `Showroom "${data.shopName || loginEmail}" successfully registered and provisioned on ${data.plan} plan!` 
    };
  } catch (error: any) {
    return { message: "Failed to create user: " + (error?.message || "Unknown error") };
  }
}

export async function toggleSubscription(userId: string, active: boolean) {
  try {
    await checkAdmin();
    const shop = await prisma.user.findUnique({ where: { id: userId }, select: { role: true, subscriptionStart: true } });
    if (!shop || shop.role !== "SHOP") {
      return { success: false, message: "Showroom not found." };
    }

    if (active && (await hasOverdueInvoices(userId))) {
      // The automatic check would switch it straight back off, so say what to do instead
      return {
        success: false,
        message: "This showroom is suspended because a payment date has passed. Record the payment, or give extra time, on the Payments tab.",
      };
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        subscriptionActive: active,
        // Keep the plan's real start date; only set one if the showroom never had it
        ...(active && !shop.subscriptionStart ? { subscriptionStart: new Date() } : {}),
      },
    });
    if (active) await syncShopMeta(userId, { suspendedForNonPayment: false, suspendedReason: null });
    revalidatePath("/admin");
    return { success: true };
  } catch (error) {
    return { success: false, message: "Failed to update subscription" };
  }
}

export async function updateQuota(userId: string, tileQuota: number) {
  try {
    await checkAdmin();
    if (!Number.isInteger(tileQuota) || tileQuota < 0 || tileQuota > 1_000_000) {
      return { success: false, message: "Enter a whole number of tile slots (0 or more)." };
    }
    await prisma.user.update({
      where: { id: userId },
      data: { tileQuota },
    });
    revalidatePath("/admin");
    return { success: true };
  } catch (error) {
    return { success: false, message: "Failed to update quota" };
  }
}

export async function updateSubscription(
  userId: string,
  subscriptionPackage: string,
  subscriptionStart: string,
  subscriptionEnd: string,
  trialEndsAt: string,
  active: boolean,
  /** Monthly price in LKR. The Custom Plan is custom-priced, so the admin sets it; other packages use their fixed price. */
  planPrice?: number,
  /** When the full monthly fee is collected: start of month, end of month, or the plan's start day. */
  billingDay?: string,
  /** How long the plan runs, 1 to 12 months. With a start date it fixes the expiry date; it is saved with the showroom. */
  durationMonths?: number | null,
) {
  try {
    await checkAdmin();
    const before = await prisma.user.findUnique({ where: { id: userId }, select: { subscriptionPackage: true, details: true } });

    // The package as it is saved in the dashboard now: its price and tile allowance are the saved ones, never the ones
    // the browser sent, so a package edited a moment ago is what gets applied
    const saved = await getSubscriptionPlans().then((plans) => findPackage(subscriptionPackage, plans)).catch(() => null);
    const packageChanged = !!before && !samePlan(before.subscriptionPackage, subscriptionPackage);
    if (typeof planPrice === "number" && saved && !isCustomPlan(subscriptionPackage) && !saved.isCustomPrice) planPrice = saved.price;

    // Start date + duration decide the expiry date (a trial has no duration; it ends on its own trial date)
    const months = subscriptionPackage === "Free Trial" ? null : asDurationMonths(durationMonths);
    if (months !== null && subscriptionStart) subscriptionEnd = expiryAfterMonths(subscriptionStart, months);

    let details: string | undefined;
    if ((typeof planPrice === "number" && Number.isFinite(planPrice) && planPrice >= 0) || billingDay || months !== null) {
      const shop = await prisma.user.findUnique({ where: { id: userId }, select: { details: true } });
      let meta: any = {};
      if (shop?.details) {
        try { meta = JSON.parse(shop.details); } catch { meta = {}; }
      }
      const amountPaid = Number(meta.amountPaid) || 0;
      const price = typeof planPrice === "number" && Number.isFinite(planPrice) ? planPrice : Number(meta.planPrice) || 0;
      details = JSON.stringify({
        ...meta,
        plan: subscriptionPackage,
        planPrice: price,
        balance: Math.max(0, price - amountPaid),
        ...(billingDay ? { billingDay: asBillingDay(billingDay) } : {}),
        ...(months !== null ? { durationMonths: months, duration: months === 1 ? "Monthly" : `${months} Months` } : {}),
      });
    }

    // A different plan means different entitlements: the visualizer switches go back to that plan's defaults, so a switch
    // saved under the old plan can never carry a feature over to a plan that does not include it
    if (before && !samePlan(before.subscriptionPackage, subscriptionPackage)) {
      details = withPlanDefaults(details ?? before.details, subscriptionPackage);
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        ...(details !== undefined ? { details } : {}),
        subscriptionPackage,
        subscriptionStart: subscriptionStart ? new Date(`${subscriptionStart}T00:00:00Z`) : null,
        subscriptionEnd: subscriptionEnd ? new Date(`${subscriptionEnd}T00:00:00Z`) : null,
        trialEndsAt: trialEndsAt ? new Date(`${trialEndsAt}T00:00:00Z`) : null,
        subscriptionActive: active,
        // A different package brings its own tile allowance
        ...(packageChanged && saved ? { tileQuota: saved.tileQuota } : {}),
      },
    });

    // Picking a paid plan bills it: an unpaid invoice appears under Payments until the money is collected
    if (typeof planPrice === "number" && planPrice > 0 && before?.subscriptionPackage !== subscriptionPackage) {
      const startISO = subscriptionStart || todayISO();
      const due = asDate(firstBillingDate(startISO, asBillingDay(billingDay))) ?? new Date();
      await syncInvoiceToPlan(userId, subscriptionPackage, planPrice, due);
    }
    revalidatePath("/admin");
    revalidatePath("/shop");
    return { success: true };
  } catch (error) {
    return { success: false, message: "Failed to update subscription" };
  }
}

export async function deleteShop(shopId: string) {
  try {
    await checkAdmin();

    const user = await prisma.user.findUnique({
      where: { id: shopId },
      select: { id: true, role: true, shopName: true, logoUrl: true, coverPhotoUrl: true, details: true },
    });

    if (!user) {
      return { success: false, message: "Showroom tenant not found." };
    }

    if (user.role !== "SHOP") {
      return { success: false, message: "Only showroom accounts can be removed." };
    }

    // Note which uploaded images the showroom owned before they disappear with it
    const tiles = await prisma.tile.findMany({ where: { userId: shopId }, select: { textureUrl: true, previewUrl: true } });
    const ownedUploads = [
      user.logoUrl,
      user.coverPhotoUrl,
      ...uploadUrlsIn(user.details),
      ...tiles.flatMap((t) => [t.textureUrl, t.previewUrl]),
    ];

    // Associated tiles and savedDesigns are deleted by cascade in Prisma schema
    await prisma.user.delete({
      where: { id: shopId },
    });

    // Then delete the image files, unless something else still uses them
    await removeUnreferencedUploads(ownedUploads);

    revalidatePath("/admin");
    return { success: true, message: "Showroom tenant removed successfully." };
  } catch (error) {
    console.error("Error deleting showroom tenant:", error);
    return { success: false, message: "Failed to remove showroom tenant." };
  }
}

export interface UpdateShopDetailsInput {
  shopId: string;
  shopName?: string;
  email?: string;
  password?: string;
  logoUrl?: string;
  coverPhotoUrl?: string;
  tileQuota?: number;
  subscriptionPackage?: string;
  subscriptionActive?: boolean;
  subscriptionStart?: string | null;
  subscriptionEnd?: string | null;
  trialEndsAt?: string | null;
  
  // Metadata fields
  companyRegName?: string | null;
  ownerName?: string | null;
  contactPerson?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  shopEmail?: string | null;
  website?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  district?: string | null;
  province?: string | null;
  postalCode?: string | null;
  businessRegNo?: string | null;
  taxVatNo?: string | null;
  description?: string | null;
  adminName?: string | null;
  username?: string | null;
  duration?: string | null;
  /** How long the plan runs, 1 to 12 months; with the start date it fixes the expiry date. */
  durationMonths?: number | null;
  billingDay?: string | null;
  planPrice?: number;
  amountPaid?: number;
  paymentStatus?: string | null;
  paymentDate?: string | null;
  paymentMethod?: string | null;
  paymentReference?: string | null;
  notes?: string | null;
}

export async function updateShopDetailsByAdmin(input: UpdateShopDetailsInput) {
  try {
    await checkAdmin();

    const { shopId } = input;
    if (!shopId) {
      return { success: false, message: "Shop ID is required." };
    }

    const shop = await prisma.user.findUnique({
      where: { id: shopId },
    });

    if (!shop) {
      return { success: false, message: "Showroom account not found." };
    }

    if (shop.role !== "SHOP") {
      return { success: false, message: "Only showroom accounts can be edited here." };
    }

    // Check unique email if email is being changed
    if (input.email && input.email.trim().toLowerCase() !== shop.email.toLowerCase()) {
      const existing = await prisma.user.findUnique({
        where: { email: input.email.trim().toLowerCase() },
      });
      if (existing && existing.id !== shopId) {
        return { success: false, message: `Email "${input.email}" is already used by another account.` };
      }
    }

    // Parse and merge existing details metadata
    let existingMeta: any = {};
    if (shop.details) {
      try {
        existingMeta = JSON.parse(shop.details);
      } catch {
        existingMeta = {};
      }
    }

    const planPrice = typeof input.planPrice === "number" ? input.planPrice : (existingMeta.planPrice ?? 0);
    const amountPaid = typeof input.amountPaid === "number" ? input.amountPaid : (existingMeta.amountPaid ?? 0);
    const balance = Math.max(0, planPrice - amountPaid);

    // Start date + duration decide the expiry date, calculated here so every screen agrees
    const months = input.subscriptionPackage === "Free Trial" ? null : asDurationMonths(input.durationMonths);
    const startForExpiry = input.subscriptionStart !== undefined ? input.subscriptionStart : shop.subscriptionStart?.toISOString().slice(0, 10);
    if (months !== null && startForExpiry) input.subscriptionEnd = expiryAfterMonths(startForExpiry, months);

    const mergedMeta = {
      ...existingMeta,
      ...(input.companyRegName !== undefined ? { companyRegName: input.companyRegName?.trim() || null } : {}),
      ...(input.ownerName !== undefined ? { ownerName: input.ownerName?.trim() || null } : {}),
      ...(input.contactPerson !== undefined ? { contactPerson: input.contactPerson?.trim() || null } : {}),
      ...(input.phone !== undefined ? { phone: input.phone?.trim() || null } : {}),
      ...(input.whatsapp !== undefined ? { whatsapp: input.whatsapp?.trim() || null } : {}),
      ...(input.shopEmail !== undefined ? { shopEmail: input.shopEmail?.trim() || null } : {}),
      ...(input.website !== undefined ? { website: input.website?.trim() || null } : {}),
      ...(input.addressLine1 !== undefined ? { addressLine1: input.addressLine1?.trim() || null } : {}),
      ...(input.addressLine2 !== undefined ? { addressLine2: input.addressLine2?.trim() || null } : {}),
      ...(input.city !== undefined ? { city: input.city?.trim() || null } : {}),
      ...(input.district !== undefined ? { district: input.district?.trim() || null } : {}),
      ...(input.province !== undefined ? { province: input.province?.trim() || null } : {}),
      ...(input.postalCode !== undefined ? { postalCode: input.postalCode?.trim() || null } : {}),
      ...(input.businessRegNo !== undefined ? { businessRegNo: input.businessRegNo?.trim() || null } : {}),
      ...(input.taxVatNo !== undefined ? { taxVatNo: input.taxVatNo?.trim() || null } : {}),
      ...(input.description !== undefined ? { description: input.description?.trim() || null } : {}),
      ...(input.adminName !== undefined ? { adminName: input.adminName?.trim() || null } : {}),
      ...(input.username !== undefined ? { username: input.username?.trim() || null } : {}),
      ...(input.duration !== undefined ? { duration: input.duration || "Monthly" } : {}),
      ...(months !== null ? { durationMonths: months, duration: months === 1 ? "Monthly" : `${months} Months` } : {}),
      ...(input.billingDay ? { billingDay: asBillingDay(input.billingDay) } : {}),
      plan: input.subscriptionPackage || existingMeta.plan || shop.subscriptionPackage,
      planPrice,
      amountPaid,
      balance,
      ...(input.paymentStatus !== undefined ? { paymentStatus: input.paymentStatus } : {}),
      ...(input.paymentDate !== undefined ? { paymentDate: input.paymentDate } : {}),
      ...(input.paymentMethod !== undefined ? { paymentMethod: input.paymentMethod } : {}),
      ...(input.paymentReference !== undefined ? { paymentReference: input.paymentReference?.trim() || null } : {}),
      ...(input.notes !== undefined ? { notes: input.notes?.trim() || null } : {}),
    };

    // The same rule when the plan is changed from the showroom's details screen
    if (input.subscriptionPackage !== undefined && !samePlan(input.subscriptionPackage, shop.subscriptionPackage)) {
      (mergedMeta as Record<string, unknown>).visualizerAccess = planAccessRecord(input.subscriptionPackage);
    }

    const updateData: any = {
      details: JSON.stringify(mergedMeta),
    };

    if (input.shopName !== undefined) {
      updateData.shopName = input.shopName.trim() || null;
    }
    if (input.email) {
      updateData.email = input.email.trim().toLowerCase();
    }
    if (input.password && input.password.trim().length >= 6) {
      updateData.password = await bcrypt.hash(input.password.trim(), 10);
    }
    if (input.logoUrl !== undefined) {
      const logo = cleanImageUrl(input.logoUrl);
      if (!logo.ok) return { success: false, message: "The logo must be an uploaded image or an https:// image link." };
      updateData.logoUrl = logo.value;
    }
    if (input.coverPhotoUrl !== undefined) {
      const cover = cleanImageUrl(input.coverPhotoUrl);
      if (!cover.ok) return { success: false, message: "The cover photo must be an uploaded image or an https:// image link." };
      updateData.coverPhotoUrl = cover.value;
    }
    if (input.tileQuota !== undefined) {
      updateData.tileQuota = Math.max(1, Number(input.tileQuota));
    }
    if (input.subscriptionPackage !== undefined) {
      updateData.subscriptionPackage = input.subscriptionPackage;
    }
    if (input.subscriptionActive !== undefined) {
      updateData.subscriptionActive = input.subscriptionActive;
    }
    if (input.subscriptionStart !== undefined) {
      updateData.subscriptionStart = input.subscriptionStart ? new Date(input.subscriptionStart) : null;
    }
    if (input.subscriptionEnd !== undefined) {
      updateData.subscriptionEnd = input.subscriptionEnd ? new Date(input.subscriptionEnd) : null;
    }
    if (input.trialEndsAt !== undefined) {
      updateData.trialEndsAt = input.trialEndsAt ? new Date(input.trialEndsAt) : null;
    }

    const updatedUser = await prisma.user.update({
      where: { id: shopId },
      data: updateData,
      include: {
        _count: {
          select: { tiles: true, savedDesigns: true },
        },
      },
    });

    // A newly chosen paid plan gets an invoice (or updates the open one) so the fee shows under Payments
    if (input.subscriptionPackage && input.subscriptionPackage !== shop.subscriptionPackage && planPrice > 0) {
      const startISO = updatedUser.subscriptionStart ? updatedUser.subscriptionStart.toISOString().slice(0, 10) : todayISO();
      const due = asDate(firstBillingDate(startISO, asBillingDay(input.billingDay ?? mergedMeta.billingDay))) ?? new Date();
      await syncInvoiceToPlan(shopId, input.subscriptionPackage, planPrice, due);
    }

    revalidatePath("/admin");
    revalidatePath("/shop");
    return {
      success: true,
      message: `Showroom "${updatedUser.shopName || updatedUser.email}" updated successfully.`,
      shop: updatedUser,
    };
  } catch (error: any) {
    console.error("Error updating shop details:", error);
    return { success: false, message: error?.message || "Failed to update showroom details." };
  }
}

export async function updateAdminProfile({
  name,
  email,
  logoUrl,
  currentPassword,
  newPassword,
}: {
  name?: string;
  email?: string;
  logoUrl?: string;
  currentPassword?: string;
  newPassword?: string;
}) {
  try {
    await checkAdmin();
    const session = await getSession();
    if (!session) {
      return { success: false, message: "Session expired, please log in again." };
    }

    const admin = await prisma.user.findUnique({
      where: { id: session.userId },
    });

    if (!admin) {
      return { success: false, message: "Admin user not found." };
    }

    const updateData: {
      shopName?: string;
      email?: string;
      logoUrl?: string;
      password?: string;
    } = {};

    if (name !== undefined) {
      updateData.shopName = name.trim();
    }

    if (email && email.trim() !== admin.email) {
      const trimmedEmail = email.trim().toLowerCase();
      const existing = await prisma.user.findUnique({ where: { email: trimmedEmail } });
      if (existing && existing.id !== admin.id) {
        return { success: false, message: "This email address is already in use." };
      }
      updateData.email = trimmedEmail;
    }

    if (logoUrl !== undefined) {
      const logo = cleanImageUrl(logoUrl);
      if (!logo.ok) return { success: false, message: "The avatar must be an uploaded image or an https:// image link." };
      updateData.logoUrl = logo.value ?? "";
    }

    if (newPassword && newPassword.trim().length > 0) {
      if (!currentPassword) {
        return { success: false, message: "Please provide your current password to set a new password." };
      }
      const isMatch = await bcrypt.compare(currentPassword, admin.password);
      if (!isMatch) {
        return { success: false, message: "Current password does not match our records." };
      }
      if (newPassword.trim().length < 6) {
        return { success: false, message: "New password must be at least 6 characters long." };
      }
      updateData.password = await bcrypt.hash(newPassword.trim(), 10);
    }

    const updated = await prisma.user.update({
      where: { id: admin.id },
      data: updateData,
    });

    revalidatePath("/admin");
    return { 
      success: true, 
      message: "Admin profile updated successfully!",
      user: {
        id: updated.id,
        email: updated.email,
        name: updated.shopName || "Platform Admin",
        logoUrl: updated.logoUrl,
      }
    };
  } catch (error) {
    console.error("Error updating admin profile:", error);
    return { success: false, message: "An unexpected error occurred while updating profile." };
  }
}

export async function extendSubscription(userId: string, days: number = 30) {
  try {
    await checkAdmin();
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return { success: false, message: "Showroom account not found." };

    const baseDate = user.subscriptionEnd && new Date(user.subscriptionEnd) > new Date()
      ? new Date(user.subscriptionEnd)
      : user.trialEndsAt && new Date(user.trialEndsAt) > new Date()
      ? new Date(user.trialEndsAt)
      : new Date();

    const newEnd = new Date(baseDate.getTime() + days * 24 * 60 * 60 * 1000);

    await prisma.user.update({
      where: { id: userId },
      data: {
        subscriptionEnd: newEnd,
        subscriptionActive: true,
      },
    });

    revalidatePath("/admin");
    return { success: true, message: `Subscription extended by ${days} days.` };
  } catch (error) {
    return { success: false, message: "Failed to extend subscription." };
  }
}

export async function quickReactivateSubscription(userId: string) {
  try {
    await checkAdmin();
    const now = new Date();
    const newEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    await prisma.user.update({
      where: { id: userId },
      data: {
        subscriptionActive: true,
        subscriptionStart: now,
        subscriptionEnd: newEnd,
      },
    });

    revalidatePath("/admin");
    return { success: true, message: "Subscription reactivated for 30 days." };
  } catch (error) {
    return { success: false, message: "Failed to reactivate subscription." };
  }
}

// ── SUPER ADMIN APPOINTMENT & MANAGEMENT ─────────────────────────────────────

export async function getSuperAdmins() {
  try {
    await checkAdmin();
    const admins = await prisma.user.findMany({
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
    return { success: true, admins };
  } catch (error: any) {
    return { success: false, message: error?.message || "Failed to fetch super admins.", admins: [] };
  }
}

export async function createSuperAdmin(data: { name: string; email: string; password: string }) {
  try {
    await checkAdmin();

    const name = data.name?.trim() || "Super Administrator";
    const email = data.email?.trim().toLowerCase();
    const password = data.password?.trim();

    if (!email || !z.string().email().safeParse(email).success) {
      return { success: false, message: "A valid email address is required." };
    }
    if (!password || password.length < 6) {
      return { success: false, message: "Password must be at least 6 characters long." };
    }

    const existing = await prisma.user.findUnique({
      where: { email },
    });
    if (existing) {
      return { success: false, message: "A user account with this email address already exists." };
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newAdmin = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        role: "ADMIN",
        shopName: name,
        subscriptionPackage: "Super Administrator",
        subscriptionActive: true,
        tileQuota: 999999,
      },
      select: {
        id: true,
        email: true,
        shopName: true,
        logoUrl: true,
        createdAt: true,
      },
    });

    revalidatePath("/admin");
    return {
      success: true,
      message: `Super Administrator ${name} (${email}) appointed successfully.`,
      admin: {
        ...newAdmin,
        createdAt: newAdmin.createdAt.toISOString(),
      },
    };
  } catch (error: any) {
    return { success: false, message: error?.message || "Failed to appoint super administrator." };
  }
}

export async function deleteSuperAdmin(adminId: string) {
  try {
    const session = await getSession();
    if (!session || session.role !== "ADMIN") {
      return { success: false, message: "Unauthorized." };
    }

    if (session.userId === adminId) {
      return {
        success: false,
        message: "Action restricted: You cannot delete your currently active Super Admin account.",
      };
    }

    // Safety check: Ensure at least one admin remains
    const adminCount = await prisma.user.count({
      where: { role: "ADMIN" },
    });
    if (adminCount <= 1) {
      return {
        success: false,
        message: "Cannot delete the sole remaining Super Administrator on the platform.",
      };
    }

    const target = await prisma.user.findUnique({
      where: { id: adminId },
      select: { id: true, role: true, email: true, shopName: true },
    });

    if (!target || target.role !== "ADMIN") {
      return { success: false, message: "Super Administrator not found." };
    }

    await prisma.user.delete({
      where: { id: adminId },
    });

    revalidatePath("/admin");
    return {
      success: true,
      message: `Super Administrator ${target.shopName || target.email} has been revoked and removed.`,
    };
  } catch (error: any) {
    return { success: false, message: error?.message || "Failed to delete super administrator." };
  }
}

/**
 * Turns the 2D or 3D visualizer on or off for ONE showroom. Only the main administrator may call this, and only what the
 * showroom's plan includes can be turned on. It saves to the database; the showroom's dashboard and every visualizer address
 * follow on their next request.
 */
export async function setVisualizerAccess(shopId: string, kind: VisualizerKind, enabled: boolean) {
  try {
    await checkAdmin();
    if (typeof shopId !== "string" || !shopId || (kind !== "viz2d" && kind !== "viz3d") || typeof enabled !== "boolean") {
      return { success: false, message: "That request is not valid." };
    }
    const shop = await prisma.user.findUnique({ where: { id: shopId }, select: { role: true, shopName: true, email: true, subscriptionPackage: true, details: true } });
    if (!shop || shop.role !== "SHOP") return { success: false, message: "Showroom not found." };

    const change = withAccessChange(shop.details, shop.subscriptionPackage, kind, enabled);
    if (!change.ok) return { success: false, message: change.message };

    await prisma.user.update({ where: { id: shopId }, data: { details: change.details } });
    revalidatePath("/admin");
    revalidatePath("/shop");
    return {
      success: true,
      message: `${VISUALIZER_LABEL[kind]} ${enabled ? "enabled" : "disabled"} for ${shop.shopName || shop.email}.`,
      access: change.access,
      states: accessStates(shop.subscriptionPackage, change.details),
      details: change.details,
    };
  } catch (error: any) {
    return { success: false, message: error?.message === "Unauthorized" ? "Only the main administrator can change visualizer access." : "Could not save this change. Please try again." };
  }
}
