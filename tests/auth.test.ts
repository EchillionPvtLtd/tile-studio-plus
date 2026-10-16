import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SignJWT } from "jose";

vi.mock("next/headers", () => ({ cookies: vi.fn() }));

const SECRET = "a-test-secret-that-is-comfortably-longer-than-32-chars";

/** Fresh copy of the module so the cached signing key is re-read from the environment. */
async function loadAuth() {
  vi.resetModules();
  return import("@/lib/auth");
}

describe("session tokens", () => {
  beforeEach(() => {
    vi.stubEnv("JWT_SECRET", SECRET);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("round-trips a session", async () => {
    const { encrypt, decrypt } = await loadAuth();
    const token = await encrypt({ userId: "u1", email: "a@b.co", role: "SHOP" });
    expect(await decrypt(token)).toMatchObject({ userId: "u1", email: "a@b.co", role: "SHOP" });
  });

  it("rejects garbage and tampered tokens", async () => {
    const { encrypt, decrypt } = await loadAuth();
    expect(await decrypt("not-a-token")).toBeNull();
    const token = await encrypt({ userId: "u1", email: "a@b.co", role: "SHOP" });
    const [h, p, s] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ userId: "u1", email: "a@b.co", role: "ADMIN" })).toString("base64url");
    expect(await decrypt(`${h}.${forged}.${s}`)).toBeNull();
    expect(await decrypt(`${h}.${p}.x${s}`)).toBeNull();
  });

  it("rejects a token signed with a different secret", async () => {
    const { decrypt } = await loadAuth();
    const other = new TextEncoder().encode("some-other-secret-that-is-also-longer-than-32-chars");
    const token = await new SignJWT({ userId: "u1", email: "a@b.co", role: "ADMIN" })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("1h")
      .sign(other);
    expect(await decrypt(token)).toBeNull();
  });

  it("rejects a correctly signed token whose payload is not a session", async () => {
    const { decrypt } = await loadAuth();
    const key = new TextEncoder().encode(SECRET);
    const sign = (payload: Record<string, unknown>) =>
      new SignJWT(payload).setProtectedHeader({ alg: "HS256" }).setExpirationTime("1h").sign(key);
    expect(await decrypt(await sign({ userId: "u1", email: "a@b.co", role: "SUPERUSER" }))).toBeNull();
    expect(await decrypt(await sign({ email: "a@b.co", role: "ADMIN" }))).toBeNull();
  });

  it("rejects an expired token", async () => {
    const { decrypt } = await loadAuth();
    const key = new TextEncoder().encode(SECRET);
    const token = await new SignJWT({ userId: "u1", email: "a@b.co", role: "SHOP" })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(key);
    expect(await decrypt(token)).toBeNull();
  });
});

describe("JWT_SECRET handling", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("refuses to sign in production without a strong secret", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("JWT_SECRET", "too-short");
    const { encrypt } = await loadAuth();
    await expect(encrypt({ userId: "u1", email: "a@b.co", role: "ADMIN" })).rejects.toThrow(/JWT_SECRET/);
  });

  it("falls back to a development secret (with a warning) outside production", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("JWT_SECRET", "");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { encrypt, decrypt } = await loadAuth();
    const token = await encrypt({ userId: "u1", email: "a@b.co", role: "SHOP" });
    expect(await decrypt(token)).not.toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
