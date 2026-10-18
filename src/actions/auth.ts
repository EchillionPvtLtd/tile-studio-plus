"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcrypt";
import { createSession, deleteSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { enforceOverdueSuspensions } from "@/lib/payments";

const loginSchema = z.object({
  email: z.string().trim().email({ message: "Invalid email address" }),
  password: z.string().min(6, { message: "Password must be at least 6 characters" }),
});

export type LoginFormState = {
  message?: string;
  errors?: {
    email?: string[];
    password?: string[];
  };
};

/** One message for every failed sign-in, so it never says whether the email exists. */
const INVALID_LOGIN: LoginFormState = { message: "Invalid email or password. Please try again." };

export async function login(prevState: LoginFormState | null | undefined, formData: FormData): Promise<LoginFormState> {
  try {
    const result = loginSchema.safeParse(Object.fromEntries(formData));

    if (!result.success) {
      return {
        errors: result.error.flatten().fieldErrors,
      };
    }

    // Emails are stored lower-case; people type them with capitals and stray spaces
    const email = result.data.email.trim().toLowerCase();
    const { password } = result.data;

    // Database User Lookup (Super Admins & Showrooms)
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return INVALID_LOGIN;
    }

    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch) {
      return INVALID_LOGIN;
    }

    // Super Admin Login
    if (user.role === "ADMIN") {
      await createSession({ userId: user.id, email: user.email, role: "ADMIN" });
      redirect("/admin");
    }

    // Shop Login
    if (user.role !== "SHOP") {
      return INVALID_LOGIN;
    }

    // Suspend the showroom if a payment date has passed (and any extra time given by the admin has run out)
    await enforceOverdueSuspensions(user.id);
    const current = await prisma.user.findUnique({ where: { id: user.id }, select: { subscriptionActive: true } });
    user.subscriptionActive = !!current?.subscriptionActive;

    if (!user.subscriptionActive) {
      return {
        message: "Subscription Payment Delay. Please contact Administrator."
      };
    }

    await createSession({ userId: user.id, email: user.email, role: "SHOP" });
    redirect("/shop");
  } catch (err: any) {
    if (err?.message === "NEXT_REDIRECT" || err?.digest?.startsWith?.("NEXT_REDIRECT")) {
      throw err;
    }
    console.error("Sign-in error:", err);
    return {
      message: `Sign-in error: ${err?.message || "Internal server error"}`,
    };
  }
}

export async function logout() {
  await deleteSession();
  redirect("/login");
}
