import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  user: null as null | { id: string; email: string; password: string; role: string; subscriptionActive: boolean },
  compare: async (_plain: string, _hash: string) => false,
  sessions: [] as unknown[],
}));

vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { digest: `NEXT_REDIRECT;replace;${to};307;` });
  },
}));
vi.mock("bcrypt", () => ({ default: { compare: (p: string, h: string) => state.compare(p, h) } }));
vi.mock("@/lib/auth", () => ({
  createSession: async (payload: unknown) => {
    state.sessions.push(payload);
  },
  deleteSession: async () => {},
}));
vi.mock("@/lib/payments", () => ({ enforceOverdueSuspensions: async () => [] }));
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: async () => state.user } },
}));

import { login } from "@/actions/auth";

const form = (email: string, password: string) => {
  const fd = new FormData();
  fd.set("email", email);
  fd.set("password", password);
  return fd;
};

const MESSAGE = "Invalid email or password. Please try again.";

beforeEach(() => {
  state.user = { id: "u1", email: "shop@x.co", password: "hash", role: "SHOP", subscriptionActive: true };
  state.compare = async (plain) => plain === "right-password";
  state.sessions = [];
});

describe("sign-in", () => {
  it("answers a wrong password with one plain message and no counter or timer", async () => {
    const res = await login(null, form("shop@x.co", "wrong-password"));
    expect(res.message).toBe(MESSAGE);
    expect(res).not.toHaveProperty("retryAfterSec");
  });

  it("gives the same message for an unknown email, so it never says whether an account exists", async () => {
    state.user = null;
    const res = await login(null, form("nobody@x.co", "wrong-password"));
    expect(res.message).toBe(MESSAGE);
  });

  it("is never locked: many wrong passwords in a row still allow the next try", async () => {
    for (let i = 0; i < 30; i++) {
      const res = await login(null, form("shop@x.co", "wrong-password"));
      expect(res.message).toBe(MESSAGE);
    }
    await expect(login(null, form("shop@x.co", "right-password"))).rejects.toMatchObject({ digest: expect.stringContaining("/shop") });
    expect(state.sessions).toEqual([{ userId: "u1", email: "shop@x.co", role: "SHOP" }]);
  });

  it("still sends an administrator to the admin dashboard", async () => {
    state.user = { id: "a1", email: "admin@x.co", password: "hash", role: "ADMIN", subscriptionActive: true };
    await expect(login(null, form("admin@x.co", "right-password"))).rejects.toMatchObject({ digest: expect.stringContaining("/admin") });
  });
});
