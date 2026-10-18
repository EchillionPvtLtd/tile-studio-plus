import { describe, expect, it } from "vitest";
import { brandImageSrc, driveImageUrl, resolveBrandImageUrl } from "@/lib/tileImageUrl";

const ID = "1AbCdEfGhIjKlMnOpQrStUvWxYz012345";

describe("showroom logo and banner links", () => {
  it("accepts a normal image link as it is", () => {
    expect(resolveBrandImageUrl("https://example.com/logo.png")).toEqual({ ok: true, value: "https://example.com/logo.png" });
  });

  it("turns a Google Drive sharing link into the picture address", () => {
    const drive = { ok: true, value: driveImageUrl(ID) };
    expect(resolveBrandImageUrl(`https://drive.google.com/file/d/${ID}/view?usp=sharing`)).toEqual(drive);
    expect(resolveBrandImageUrl(`https://drive.google.com/open?id=${ID}`)).toEqual(drive);
  });

  it("keeps uploads and empty values, and refuses anything unsafe", () => {
    expect(resolveBrandImageUrl("/uploads/logo.png")).toEqual({ ok: true, value: "/uploads/logo.png" });
    expect(resolveBrandImageUrl("  ")).toEqual({ ok: true, value: null });
    expect(resolveBrandImageUrl("javascript:alert(1)").ok).toBe(false);
    expect(resolveBrandImageUrl("http://example.com/logo.png").ok).toBe(false);
    expect(resolveBrandImageUrl(`https://drive.google.com/drive/folders/${ID}`).ok).toBe(false);
  });

  it("previews a Drive link as its picture and leaves other text alone", () => {
    expect(brandImageSrc(`https://drive.google.com/file/d/${ID}/view`)).toBe(driveImageUrl(ID));
    expect(brandImageSrc("not a link")).toBe("not a link");
  });
});
