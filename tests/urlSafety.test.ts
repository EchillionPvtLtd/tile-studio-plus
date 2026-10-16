import { describe, expect, it } from "vitest";
import { assertPublic, isPrivateIp } from "@/lib/ssrf";
import { isSafeImageUrl, isSafeLinkUrl, isSafeTextureUrl } from "@/lib/loginPosters";

describe("isPrivateIp", () => {
  it.each([
    "127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "0.0.0.0",
    "100.64.0.1", "224.0.0.1", "::1", "::", "fc00::1", "fd12::1", "fe80::1", "::ffff:127.0.0.1", "::ffff:10.0.0.5",
  ])("blocks %s", (ip) => expect(isPrivateIp(ip)).toBe(true));

  it.each(["8.8.8.8", "93.184.216.34", "172.32.0.1", "2001:4860:4860::8888", "::ffff:8.8.8.8"])("allows %s", (ip) =>
    expect(isPrivateIp(ip)).toBe(false)
  );

  it("treats anything that is not an IP as private", () => expect(isPrivateIp("example.com")).toBe(true));
});

describe("assertPublic (image proxy guard)", () => {
  const blocked = [
    "http://localhost/a.png",
    "http://api.localhost/a.png",
    "http://printer.local/a.png",
    "http://metadata.internal/a.png",
    "http://127.0.0.1/a.png",
    "http://169.254.169.254/latest/meta-data",
    "http://10.0.0.8/a.png",
    "http://[::1]/a.png",
    "http://93.184.216.34:8080/a.png",
    "http://user:pass@93.184.216.34/a.png",
    "ftp://93.184.216.34/a.png",
    "file:///etc/passwd",
  ];
  it.each(blocked)("rejects %s", async (url) => {
    await expect(assertPublic(new URL(url))).rejects.toThrow();
  });

  it("accepts a public address on the standard ports", async () => {
    await expect(assertPublic(new URL("https://93.184.216.34/a.png"))).resolves.toBeUndefined();
    await expect(assertPublic(new URL("http://93.184.216.34:80/a.png"))).resolves.toBeUndefined();
  });
});

describe("saved link validators", () => {
  it("image links: our uploads or https only", () => {
    expect(isSafeImageUrl("/uploads/logo-1.webp")).toBe(true);
    expect(isSafeImageUrl("https://cdn.example.com/a.png")).toBe(true);
    for (const bad of ["http://example.com/a.png", "javascript:alert(1)", "data:image/png;base64,AAAA", "/uploads/../x", "//evil.com/a.png"]) {
      expect(isSafeImageUrl(bad)).toBe(false);
    }
  });

  it("button links: site paths or http(s) only", () => {
    expect(isSafeLinkUrl("/login")).toBe(true);
    expect(isSafeLinkUrl("https://example.com")).toBe(true);
    for (const bad of ["javascript:alert(1)", "data:text/html,x", "//evil.com", "mailto:a@b.co"]) expect(isSafeLinkUrl(bad)).toBe(false);
  });

  it("tile textures: uploads or http(s) only", () => {
    expect(isSafeTextureUrl("/uploads/tile.webp")).toBe(true);
    expect(isSafeTextureUrl("http://example.com/t.jpg")).toBe(true);
    for (const bad of ["data:image/png;base64,AAAA", "javascript:alert(1)", "ftp://x/t.jpg", "https://exa mple.com/t.jpg"]) {
      expect(isSafeTextureUrl(bad)).toBe(false);
    }
  });
});
