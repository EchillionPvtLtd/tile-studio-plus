import fs from "fs/promises";
import path from "path";
import { PlatformSocialLinks, DEFAULT_SOCIAL_LINKS } from "./platformLinksTypes";

export * from "./platformLinksTypes";

const DATA_FILE_PATH = path.join(process.cwd(), "data", "platformLinks.json");

let memoryCache: PlatformSocialLinks | null = null;

async function ensureDataFile(): Promise<PlatformSocialLinks> {
  try {
    const dir = path.dirname(DATA_FILE_PATH);
    await fs.mkdir(dir, { recursive: true });

    try {
      const data = await fs.readFile(DATA_FILE_PATH, "utf-8");
      const parsed = JSON.parse(data);
      if (parsed && typeof parsed === "object") {
        const merged: PlatformSocialLinks = { ...DEFAULT_SOCIAL_LINKS, ...parsed };
        memoryCache = merged;
        return merged;
      }
    } catch {
      // File does not exist or invalid JSON
    }

    const fallback: PlatformSocialLinks = { ...DEFAULT_SOCIAL_LINKS };
    await fs.writeFile(DATA_FILE_PATH, JSON.stringify(fallback, null, 2), "utf-8");
    memoryCache = fallback;
    return fallback;
  } catch (err) {
    console.error("Failed to read platformLinks.json, using defaults:", err);
    return memoryCache ?? { ...DEFAULT_SOCIAL_LINKS };
  }
}

export async function getPlatformSocialLinks(): Promise<PlatformSocialLinks> {
  return await ensureDataFile();
}

export async function savePlatformSocialLinks(links: PlatformSocialLinks): Promise<boolean> {
  try {
    const dir = path.dirname(DATA_FILE_PATH);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(DATA_FILE_PATH, JSON.stringify(links, null, 2), "utf-8");
    memoryCache = links;
    return true;
  } catch (err) {
    console.error("Failed to save platformLinks.json:", err);
    memoryCache = links;
    return false;
  }
}
