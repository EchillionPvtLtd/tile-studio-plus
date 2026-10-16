/**
 * Tile pictures are added by link only. A link is either a direct image address (what "Copy image address"
 * gives on Google Images or any website) or a Google Drive sharing link, which is turned into an address a
 * browser can show as a picture. Pure functions, so the form and the server apply exactly the same rules.
 */

export type TileImageKind = "direct" | "google-images" | "google-drive";

export type TileImageResolution =
  | { ok: true; url: string; kind: TileImageKind }
  | { ok: false; error: string };

export const TILE_IMAGE_KIND_LABEL: Record<TileImageKind, string> = {
  direct: "Direct image link",
  "google-images": "Google Images link",
  "google-drive": "Google Drive link",
};

/** The formats a tile texture can be (the 3D and 2D visualizers read these). */
export const TILE_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

const MAX_LENGTH = 2048;
const DRIVE_ID = /^[\w-]{10,}$/;

const fail = (error: string): TileImageResolution => ({ ok: false, error });

/** The address a browser can show for a public Google Drive file (resized so the picture stays a sensible size). */
export function driveImageUrl(fileId: string): string {
  return `https://lh3.googleusercontent.com/d/${fileId}=w2048`;
}

const isGoogleHost = (host: string) => /(^|\.)google\.[a-z.]+$/.test(host);

/** The Drive file a link names, "folder" / "document" for links that are not a picture, or null if it is not a Drive link. */
function parseDrive(u: URL): { id: string } | { problem: "folder" | "document" | "no-file" } | null {
  const host = u.hostname.toLowerCase();
  const isDrive = host === "drive.google.com" || host === "docs.google.com" || host === "drive.usercontent.google.com";
  const isPhotoHost = host === "lh3.googleusercontent.com" && /^\/d\//.test(u.pathname);
  if (!isDrive && !isPhotoHost) return null;

  const path = u.pathname;
  if (/\/folders\//.test(path) || /^\/drive\/(u\/\d+\/)?(my-drive|shared-with-me|recent|starred|trash|computers)/.test(path)) {
    return { problem: "folder" };
  }
  if (host === "docs.google.com" && /^\/(document|spreadsheets|presentation|forms|drawings)\//.test(path)) {
    return { problem: "document" };
  }

  const fromPath = /\/(?:file\/(?:u\/\d+\/)?)?d\/([\w-]+)/.exec(path)?.[1];
  const fromQuery = u.searchParams.get("id") ?? undefined;
  const id = fromPath ?? fromQuery;
  return id && DRIVE_ID.test(id) ? { id } : { problem: "no-file" };
}

/**
 * Works out what a pasted link points at.
 *  - Google Drive sharing links (file/d/…, open?id=, uc?id=, thumbnail?id=) become a direct picture address.
 *  - A Google Images result address (google.com/imgres?imgurl=…) gives the picture it names.
 *  - Any other https address is taken as the picture itself; the preview then checks it really is one.
 */
export function resolveTileImageUrl(input: unknown): TileImageResolution {
  const raw = typeof input === "string" ? input.trim() : "";
  if (!raw) return fail("Paste an image link to continue.");
  if (/^data:/i.test(raw)) {
    return fail("Pasted image data is not supported. On Google Images open the picture, right-click it and choose “Copy image address”, then paste that link.");
  }
  if (/\s/.test(raw)) return fail("That link contains spaces. Paste one complete link, with nothing else around it.");
  if (raw.length > MAX_LENGTH) return fail("That link is too long to be an image address.");

  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return fail("That is not a valid link. It should look like https://example.com/tile.jpg");
  }
  if (u.protocol === "http:") return fail("Only secure links are supported. Use an address that starts with https://");
  if (u.protocol !== "https:") return fail("That is not a web link. Use an address that starts with https://");
  if (u.username || u.password) return fail("Links that contain a login are not supported.");

  const host = u.hostname.toLowerCase();

  const drive = parseDrive(u);
  if (drive) {
    if ("id" in drive) return { ok: true, url: driveImageUrl(drive.id), kind: "google-drive" };
    if (drive.problem === "folder") return fail("That is a Google Drive folder. Open the image file itself, click Share, and copy its link.");
    if (drive.problem === "document") return fail("That is a Google Docs file, not an image. Share an image file from Google Drive instead.");
    return fail("Could not find a file in that Google Drive link. Use the “Copy link” button in Drive’s Share window.");
  }

  if (isGoogleHost(host)) {
    // google.com/imgres?imgurl=<picture>&imgrefurl=<page> is what a Google Images result opens as
    if (u.pathname === "/imgres") {
      const inner = u.searchParams.get("imgurl");
      if (!inner) return fail("That Google Images link does not name a picture. Open the picture and use “Copy image address”.");
      const next = resolveTileImageUrl(inner);
      return next.ok ? { ok: true, url: next.url, kind: "google-images" } : next;
    }
    if (u.pathname === "/search" || u.pathname === "/images" || u.pathname === "/url" || u.pathname === "/") {
      return fail("That is a Google search page, not an image. Click the picture, right-click it and choose “Copy image address”.");
    }
  }

  const kind: TileImageKind = host.endsWith(".gstatic.com") || host.endsWith(".googleusercontent.com") ? "google-images" : "direct";
  return { ok: true, url: u.toString(), kind };
}
