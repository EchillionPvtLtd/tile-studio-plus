import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";

const session = vi.hoisted(() => ({ current: null as null | { userId: string; email: string; role: "ADMIN" | "SHOP" } }));
const refs = vi.hoisted(() => ({ used: new Set<string>() }));

vi.mock("@/lib/auth", () => ({ getSession: async () => session.current }));
vi.mock("@/lib/prisma", () => {
  const count = async ({ where }: { where: { OR?: Record<string, unknown>[]; imageUrl?: string } }) => {
    const urls = (where.OR ?? [where]).flatMap((c) => Object.values(c).map((v) => (typeof v === "string" ? v : (v as { contains: string }).contains)));
    return urls.some((u) => refs.used.has(u)) ? 1 : 0;
  };
  return { prisma: { user: { count }, tile: { count }, loginPoster: { count }, roomScene: { count } } };
});

import { POST as uploadLogo } from "@/app/api/upload/logo/route";
import { GET as serveUpload } from "@/app/uploads/[file]/route";
import { removeUnreferencedUploads, uploadFileName, uploadUrlsIn } from "@/lib/uploads";

let dir: string;
let uploadsDir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "tv-uploads-"));
  uploadsDir = path.join(dir, "public", "uploads");
  vi.spyOn(process, "cwd").mockReturnValue(dir);
  session.current = { userId: "u1", email: "a@b.co", role: "SHOP" };
  refs.used.clear();
});
afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(dir, { recursive: true, force: true });
});

const png = () => sharp({ create: { width: 40, height: 20, channels: 3, background: "#c33" } }).png().toBuffer();
const upload = (bytes: Buffer | string, name = "file.png", type = "image/png") => {
  const fd = new FormData();
  fd.set("file", new File([new Uint8Array(Buffer.from(bytes))], name, { type }));
  return new Request("http://localhost/api/upload", { method: "POST", body: fd }) as never;
};

describe("logo upload", () => {
  it("requires a signed-in user", async () => {
    session.current = null;
    const res = await uploadLogo(upload(await png()));
    expect(res.status).toBe(401);
  });

  it("re-encodes a real image to a random-named WebP inside public/uploads", async () => {
    const res = await uploadLogo(upload(await png()));
    expect(res.status).toBe(200);
    const { logoUrl } = await res.json();
    expect(logoUrl).toMatch(/^\/uploads\/logo-[0-9a-f-]{36}\.webp$/);
    const saved = await fs.readFile(path.join(uploadsDir, path.basename(logoUrl)));
    expect((await sharp(saved).metadata()).format).toBe("webp");
  });

  it("rejects a non-image even when it claims to be a PNG", async () => {
    const res = await uploadLogo(upload("<html><script>alert(1)</script></html>", "evil.png", "image/png"));
    expect(res.status).toBe(415);
    await expect(fs.readdir(uploadsDir)).rejects.toThrow(); // nothing was written
  });

  it("rejects files over 8 MB", async () => {
    const res = await uploadLogo(upload(Buffer.alloc(8 * 1024 * 1024 + 1)));
    expect(res.status).toBe(413);
  });

  it("rejects a request with no file", async () => {
    const res = await uploadLogo(new Request("http://localhost/api/upload", { method: "POST", body: new FormData() }) as never);
    expect(res.status).toBe(400);
  });
});

describe("serving uploads", () => {
  const get = (file: string) => serveUpload(new Request("http://localhost/uploads/x") as never, { params: Promise.resolve({ file }) });

  it("serves an uploaded image with safe headers", async () => {
    await fs.mkdir(uploadsDir, { recursive: true });
    await fs.writeFile(path.join(uploadsDir, "logo-1.webp"), await png());
    const res = await get("logo-1.webp");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/webp");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("content-security-policy")).toContain("sandbox");
  });

  it("refuses non-image extensions, traversal and missing files", async () => {
    await fs.mkdir(uploadsDir, { recursive: true });
    await fs.writeFile(path.join(uploadsDir, "page.html"), "<script>alert(1)</script>");
    expect((await get("page.html")).status).toBe(404);
    expect((await get("..%2Fsecret.png")).status).toBe(404);
    expect((await get("..png")).status).toBe(404);
    expect((await get("missing.png")).status).toBe(404);
  });
});

describe("upload helpers", () => {
  it("uploadFileName only accepts links to our own uploads", () => {
    expect(uploadFileName("/uploads/logo-1.webp")).toBe("logo-1.webp");
    expect(uploadFileName("https://cdn.example.com/uploads/logo-1.webp")).toBeNull();
    expect(uploadFileName("/uploads/../.env")).toBeNull();
    expect(uploadFileName("/uploads/a/b.png")).toBeNull();
    expect(uploadFileName(null)).toBeNull();
  });

  it("uploadUrlsIn finds upload links inside a JSON blob", () => {
    expect(uploadUrlsIn('{"a":"/uploads/x.webp","b":["/uploads/y.png"],"c":"https://e.com/z.png"}')).toEqual(["/uploads/x.webp", "/uploads/y.png"]);
    expect(uploadUrlsIn(null)).toEqual([]);
  });

  it("removeUnreferencedUploads deletes orphans but keeps files still in use", async () => {
    await fs.mkdir(uploadsDir, { recursive: true });
    for (const f of ["orphan.webp", "shared.webp", "unrelated.webp"]) await fs.writeFile(path.join(uploadsDir, f), "x");
    refs.used.add("/uploads/shared.webp");

    const removed = await removeUnreferencedUploads(["/uploads/orphan.webp", "/uploads/shared.webp", "https://e.com/a.png", null, "/uploads/gone.webp"]);

    expect(removed).toBe(1);
    expect((await fs.readdir(uploadsDir)).sort()).toEqual(["shared.webp", "unrelated.webp"]);
  });
});
