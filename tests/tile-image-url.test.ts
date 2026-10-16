import { describe, expect, it } from "vitest";
import { driveImageUrl, resolveTileImageUrl } from "@/lib/tileImageUrl";

const ID = "1AbCdEfGhIjKlMnOpQrStUvWxYz012345";
const ok = (input: string) => {
  const r = resolveTileImageUrl(input);
  if (!r.ok) throw new Error(r.error);
  return r;
};
const error = (input: unknown) => {
  const r = resolveTileImageUrl(input);
  if (r.ok) throw new Error(`expected an error for ${String(input)}`);
  return r.error;
};

describe("Google Drive links", () => {
  it.each([
    `https://drive.google.com/file/d/${ID}/view?usp=sharing`,
    `https://drive.google.com/file/d/${ID}/view`,
    `https://drive.google.com/file/u/0/d/${ID}/edit`,
    `https://drive.google.com/open?id=${ID}`,
    `https://drive.google.com/uc?export=view&id=${ID}`,
    `https://drive.google.com/uc?id=${ID}&export=download`,
    `https://drive.google.com/thumbnail?id=${ID}&sz=w1000`,
    `https://drive.usercontent.google.com/download?id=${ID}&export=view`,
    `https://lh3.googleusercontent.com/d/${ID}=w600`,
  ])("%s becomes a direct picture address", (link) => {
    expect(ok(link)).toEqual({ ok: true, kind: "google-drive", url: driveImageUrl(ID) });
  });

  it("explains folders, documents and links with no file", () => {
    expect(error(`https://drive.google.com/drive/folders/${ID}`)).toMatch(/folder/i);
    expect(error("https://drive.google.com/drive/u/0/my-drive")).toMatch(/folder/i);
    expect(error(`https://docs.google.com/document/d/${ID}/edit`)).toMatch(/not an image/i);
    expect(error("https://drive.google.com/file/d/short/view")).toMatch(/could not find a file/i);
    expect(error("https://drive.google.com/")).toMatch(/could not find a file/i);
  });
});

describe("direct and Google Images links", () => {
  it("takes an ordinary https address as the picture itself", () => {
    expect(ok("  https://cdn.example.com/tiles/marble.jpg?w=800  ")).toEqual({ ok: true, kind: "direct", url: "https://cdn.example.com/tiles/marble.jpg?w=800" });
  });

  it("recognises Google's own picture hosts and the picture inside a Google Images result address", () => {
    expect(ok("https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQabc")).toMatchObject({ kind: "google-images" });
    const inner = "https://example.com/floor/oak.png";
    const result = ok(`https://www.google.com/imgres?imgurl=${encodeURIComponent(inner)}&imgrefurl=https%3A%2F%2Fexample.com&tbnid=x`);
    expect(result).toEqual({ ok: true, kind: "google-images", url: inner });
  });

  it("refuses Google result pages and result addresses that name nothing", () => {
    expect(error("https://www.google.com/search?q=tiles&tbm=isch")).toMatch(/search page/i);
    expect(error("https://www.google.com/imgres?tbnid=x")).toMatch(/does not name a picture/i);
    expect(error("https://www.google.com/imgres?imgurl=" + encodeURIComponent("http://example.com/a.jpg"))).toMatch(/https/);
  });
});

describe("invalid links", () => {
  it.each([
    ["", /paste an image link/i],
    ["   ", /paste an image link/i],
    [null, /paste an image link/i],
    ["not a link", /spaces/i],
    ["notalink", /not a valid link/i],
    ["http://example.com/a.jpg", /secure/i],
    ["javascript:alert(1)", /not a web link/i],
    ["ftp://example.com/a.jpg", /not a web link/i],
    ["data:image/png;base64,AAAA", /pasted image data/i],
    ["https://user:pass@example.com/a.jpg", /login/i],
    [`https://example.com/${"a".repeat(2100)}.jpg`, /too long/i],
  ])("%s is refused with a clear message", (input, message) => {
    expect(error(input)).toMatch(message);
  });
});
