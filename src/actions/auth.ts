"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcrypt";
import { createSession, deleteSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getLockSeconds, registerFailure, registerSuccess } from "@/lib/loginThrottle";
import { enforceOverdueSuspensions } from "@/lib/payments";
import { trustedClientIp } from "@/lib/clientIp";

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
  /** Set when sign-in is locked; seconds until the next attempt is allowed. */
  retryAfterSec?: number;
};

/** Only trusted when TRUSTED_PROXY_HEADER is configured; otherwise null and sign-in is limited per email only. */
async function getClientIp() {
  return trustedClientIp(await headers());
}

function lockedState(seconds: number): LoginFormState {
  const mins = Math.ceil(seconds / 60);
  return {
    message: `Too many failed attempts. Try again in ${mins} minute${mins === 1 ? "" : "s"}.`,
    retryAfterSec: seconds,
  };
}

/** Count a bad credential and build the error to show. */
async function invalidCredentials(email: string, ip: string | null): Promise<LoginFormState> {
  const { lockedSeconds, attemptsLeft } = await registerFailure(email, ip);
  if (lockedSeconds > 0) return lockedState(lockedSeconds);
  return {
    message:
      attemptsLeft <= 2
        ? `Invalid credentials. ${attemptsLeft} attempt${attemptsLeft === 1 ? "" : "s"} left before sign-in is locked.`
        : "Invalid credentials.",
  };
}

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

    const ip = await getClientIp();
    const lockSeconds = await getLockSeconds(email, ip);
    if (lockSeconds > 0) return lockedState(lockSeconds);

    // Database User Lookup (Super Admins & Showrooms)
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return await invalidCredentials(email, ip);
    }

    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch) {
      return await invalidCredentials(email, ip);
    }

    await registerSuccess(email);

    // Super Admin Login
    if (user.role === "ADMIN") {
      await createSession({ userId: user.id, email: user.email, role: "ADMIN" });
      redirect("/admin");
    }

    // Shop Login
    if (user.role !== "SHOP") {
      return await invalidCredentials(email, ip);
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
