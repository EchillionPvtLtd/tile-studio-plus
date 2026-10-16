import { describe, expect, it } from "vitest";
import { trustedClientIp } from "@/lib/clientIp";

const headers = (h: Record<string, string>) => ({ get: (n: string) => h[n.toLowerCase()] ?? null });

describe("trustedClientIp", () => {
  it("ignores every header unless a trusted one is configured", () => {
    const h = headers({ "x-forwarded-for": "6.6.6.6", "x-real-ip": "7.7.7.7" });
    expect(trustedClientIp(h, {})).toBeNull();
    expect(trustedClientIp(h, { TRUSTED_PROXY_HEADER: "  " })).toBeNull();
  });

  it("reads a single-value header from the configured proxy", () => {
    const h = headers({ "cf-connecting-ip": "203.0.113.9" });
    expect(trustedClientIp(h, { TRUSTED_PROXY_HEADER: "CF-Connecting-IP" })).toBe("203.0.113.9");
  });

  it("takes x-forwarded-for from the right, so a client-supplied prefix cannot spoof it", () => {
    const h = headers({ "x-forwarded-for": "6.6.6.6, 198.51.100.7" });
    expect(trustedClientIp(h, { TRUSTED_PROXY_HEADER: "x-forwarded-for" })).toBe("198.51.100.7");
    expect(trustedClientIp(h, { TRUSTED_PROXY_HEADER: "x-forwarded-for", TRUSTED_PROXY_HOPS: "2" })).toBe("6.6.6.6");
  });

  it("returns null when the chain is shorter than the trusted hops or the header is missing", () => {
    const h = headers({ "x-forwarded-for": "198.51.100.7" });
    expect(trustedClientIp(h, { TRUSTED_PROXY_HEADER: "x-forwarded-for", TRUSTED_PROXY_HOPS: "3" })).toBeNull();
    expect(trustedClientIp(headers({}), { TRUSTED_PROXY_HEADER: "x-real-ip" })).toBeNull();
  });

  it("rejects values that are not IP addresses", () => {
    const h = headers({ "x-real-ip": "<script>alert(1)</script>" });
    expect(trustedClientIp(h, { TRUSTED_PROXY_HEADER: "x-real-ip" })).toBeNull();
  });

  it("strips ports and unwraps IPv4-mapped IPv6", () => {
    const env = { TRUSTED_PROXY_HEADER: "x-real-ip" };
    expect(trustedClientIp(headers({ "x-real-ip": "203.0.113.9:51234" }), env)).toBe("203.0.113.9");
    expect(trustedClientIp(headers({ "x-real-ip": "[2001:db8::1]:443" }), env)).toBe("2001:db8::1");
    expect(trustedClientIp(headers({ "x-real-ip": "::ffff:203.0.113.9" }), env)).toBe("203.0.113.9");
  });
});
