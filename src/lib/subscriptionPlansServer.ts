import fs from "fs/promises";
import path from "path";
import { SubscriptionPlanItem, DEFAULT_SUBSCRIPTION_PLANS } from "./subscriptionPlanTypes";

const DATA_FILE_PATH = path.join(process.cwd(), "data", "subscriptionPlans.json");

let memoryCache: SubscriptionPlanItem[] | null = null;

async function ensureDataFile(): Promise<SubscriptionPlanItem[]> {
  try {
    const dir = path.dirname(DATA_FILE_PATH);
    await fs.mkdir(dir, { recursive: true });

    try {
      const data = await fs.readFile(DATA_FILE_PATH, "utf-8");
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed) && parsed.length > 0) {
        memoryCache = parsed;
        return parsed;
      }
    } catch {
      // File does not exist or invalid JSON, initialize with defaults
    }

    await fs.writeFile(DATA_FILE_PATH, JSON.stringify(DEFAULT_SUBSCRIPTION_PLANS, null, 2), "utf-8");
    memoryCache = [...DEFAULT_SUBSCRIPTION_PLANS];
    return memoryCache;
  } catch (err) {
    console.error("Failed to access subscriptionPlans.json, falling back to memory/defaults:", err);
    return memoryCache || [...DEFAULT_SUBSCRIPTION_PLANS];
  }
}

export async function getSubscriptionPlans(): Promise<SubscriptionPlanItem[]> {
  const plans = await ensureDataFile();
  return plans.sort((a, b) => a.sortOrder - b.sortOrder);
}

export async function saveSubscriptionPlans(plans: SubscriptionPlanItem[]): Promise<boolean> {
  try {
    const dir = path.dirname(DATA_FILE_PATH);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(DATA_FILE_PATH, JSON.stringify(plans, null, 2), "utf-8");
    memoryCache = plans;
    return true;
  } catch (err) {
    console.error("Failed to save subscriptionPlans.json:", err);
    memoryCache = plans;
    return false;
  }
}

export async function resetDefaultPlans(): Promise<SubscriptionPlanItem[]> {
  await saveSubscriptionPlans(DEFAULT_SUBSCRIPTION_PLANS);
  return [...DEFAULT_SUBSCRIPTION_PLANS];
}
