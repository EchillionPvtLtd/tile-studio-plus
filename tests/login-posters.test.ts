import { describe, expect, it } from "vitest";
import { driveLinkFromImageUrl } from "@/lib/loginPosters";
import { driveImageUrl, resolveTileImageUrl } from "@/lib/tileImageUrl";

const ID = "1AbCdEfGhIjKlMnOpQrStUvWxYz012345";

describe("poster picture links", () => {
  it("a Drive sharing link is stored as the same picture address the tile forms save", () => {
    const r = resolveTileImageUrl(`https://drive.google.com/file/d/${ID}/view?usp=sharing`);
    expect(r).toEqual({ ok: true, kind: "google-drive", url: driveImageUrl(ID) });
  });

  it("saving an already converted address changes nothing, so editing a poster is stable", () => {
    const stored = driveImageUrl(ID);
    expect(resolveTileImageUrl(stored)).toEqual({ ok: true, kind: "google-drive", url: stored });
  });

  it("editing shows the Drive link back from the stored address, and nothing for other links", () => {
    expect(driveLinkFromImageUrl(driveImageUrl(ID))).toBe(`https://drive.google.com/file/d/${ID}/view`);
    expect(driveLinkFromImageUrl("https://cdn.example.com/poster.jpg")).toBeNull();
    expect(driveLinkFromImageUrl("/uploads/poster-1.webp")).toBeNull();
  });

  it("refuses links that are not pictures, with the tile forms' wording", () => {
    const folder = resolveTileImageUrl("https://drive.google.com/drive/folders/abc123");
    expect(folder.ok).toBe(false);
    const http = resolveTileImageUrl("http://example.com/a.jpg");
    expect(http.ok).toBe(false);
    expect(resolveTileImageUrl("")).toEqual({ ok: false, error: "Paste an image link to continue." });
  });
});
