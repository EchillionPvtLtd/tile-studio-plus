import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

type Role = "ADMIN" | "SHOP";

/**
 * The key that signs session cookies. It must be private: anyone who knows it can mint an admin cookie.
 * Set JWT_SECRET (a long random string) in the environment. Production refuses to start without it;
 * development falls back to a throw-away value and warns, so a fresh checkout still runs.
 */
function resolveSecret(): string {
  const fromEnv = process.env.JWT_SECRET;
  if (fromEnv && fromEnv.length >= 32) return fromEnv;
  if (process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET is missing or shorter than 32 characters. Set a long random value before starting in production.");
  }
  console.warn("[auth] JWT_SECRET is not set (or too short): using an insecure development secret. Add JWT_SECRET to .env.local.");
  return "dev-only-insecure-secret-do-not-use-in-production-0000";
}
let cachedKey: Uint8Array | null = null;
/** Resolved on first use, so `next build` does not need the secret but a running production server does. */
function getKey() {
  return (cachedKey ??= new TextEncoder().encode(resolveSecret()));
}

export type SessionPayload = {
  userId: string;
  email: string;
  role: Role;
};

export async function encrypt(payload: SessionPayload) {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(getKey());
}

export async function decrypt(input: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(input, getKey(), {
      algorithms: ["HS256"],
    });
    // Only accept a payload shaped like one we issued
    if (typeof payload.userId !== "string" || typeof payload.email !== "string" || (payload.role !== "ADMIN" && payload.role !== "SHOP")) {
      return null;
    }
    return payload as unknown as SessionPayload;
  } catch (error) {
    return null;
  }
}

export async function getSession() {
  const session = (await cookies()).get("session")?.value;
  if (!session) return null;
  return await decrypt(session);
}

export async function createSession(payload: SessionPayload) {
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
  const session = await encrypt(payload);

  (await cookies()).set("session", session, {
    expires,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });
}

export async function deleteSession() {
  (await cookies()).set("session", "", {
    expires: new Date(0),
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });
}
