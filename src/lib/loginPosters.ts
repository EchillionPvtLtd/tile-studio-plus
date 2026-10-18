/** Client-safe poster types and fallback content (no database access in this file). */

export type LoginPosterData = {
  id: string;
  imageUrl: string;
  tag: string;
  title: string;
  body: string;
  buttonLabel: string;
  buttonUrl: string;
  sortOrder: number;
  active: boolean;
};

/** Shown on the login page until an admin publishes at least one poster of their own. */
export const DEFAULT_LOGIN_POSTERS: LoginPosterData[] = [
  {
    id: "default-1",
    imageUrl: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?q=80&w=1600&auto=format&fit=crop",
    tag: "New · Visualizer",
    title: "See every tile in the room before you cut a single one.",
    body: "Photorealistic PBR rendering lets clients walk through their finished space.",
    buttonLabel: "",
    buttonUrl: "",
    sortOrder: 0,
    active: true,
  },
  {
    id: "default-2",
    imageUrl: "https://images.unsplash.com/photo-1615873968403-89e068629265?q=80&w=1600&auto=format&fit=crop",
    tag: "Quotations",
    title: "From tile choice to PDF quote in under a minute.",
    body: "Areas, wastage and pricing are calculated for you, ready to send to the client.",
    buttonLabel: "",
    buttonUrl: "",
    sortOrder: 1,
    active: true,
  },
  {
    id: "default-3",
    imageUrl: "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?q=80&w=1600&auto=format&fit=crop",
    tag: "Your catalogue",
    title: "Your whole catalogue, one tap away on the showroom floor.",
    body: "Upload textures once and present them on any screen, in any room.",
    buttonLabel: "",
    buttonUrl: "",
    sortOrder: 2,
    active: true,
  },
];

/** A poster image must be one we uploaded, or an https URL. */
export function isSafeImageUrl(url: string) {
  return /^\/uploads\/[\w.-]+$/.test(url) || /^https:\/\/\S+$/i.test(url);
}

/** The Google Drive sharing link behind a stored poster picture address, so editing shows what was pasted. */
export function driveLinkFromImageUrl(url: string): string | null {
  const id = /^https:\/\/lh3\.googleusercontent\.com\/d\/([\w-]+)/.exec(url)?.[1];
  return id ? `https://drive.google.com/file/d/${id}/view` : null;
}

/** A button link must be a site-relative path or an http(s) URL — never javascript: or data:. */
export function isSafeLinkUrl(url: string) {
  return /^\/(?!\/)\S*$/.test(url) || /^https?:\/\/\S+$/i.test(url);
}

/** A tile texture: an https/http link, or a file uploaded to this app. Anything else (data:, javascript:, ftp:) is refused. */
export function isSafeTextureUrl(url: string): boolean {
  return /^\/uploads\/[\w.-]+$/.test(url) || /^https?:\/\/[^\s]+$/i.test(url);
}
