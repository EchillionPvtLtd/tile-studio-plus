export interface SubscriptionPlanItem {
  id: string;
  name: string;
  price: number;
  currency: string;
  billingCycle: "monthly" | "yearly";
  /** The package's usual term, 1 to 12 months. Packages saved before this existed use their billing cycle (yearly = 12). */
  durationMonths?: number;
  tileQuota: number;
  quotaLabel: string;
  features: string[];
  isPopular?: boolean;
  isCustomPrice?: boolean;
  customPriceLabel?: string;
  description?: string;
  active: boolean;
  sortOrder: number;
}

export const DEFAULT_SUBSCRIPTION_PLANS: SubscriptionPlanItem[] = [
  {
    id: "starter",
    name: "Starter",
    price: 5000,
    currency: "LKR",
    billingCycle: "monthly",
    tileQuota: 50,
    quotaLabel: "50 Tiles",
    features: [
      "Full 3D WebGL Engine",
      "In-Store QR Kiosk",
      "50 Tile Storage Slots",
      "Basic Support",
    ],
    isPopular: false,
    isCustomPrice: false,
    active: true,
    sortOrder: 1,
  },
  {
    id: "pro-studio",
    name: "Pro Studio",
    price: 10000,
    currency: "LKR",
    billingCycle: "monthly",
    tileQuota: 100,
    quotaLabel: "100 Tiles",
    features: [
      "Everything in Starter",
      "100 Tile Storage Slots",
      "Priority Texture Compilation",
      "Custom Cover Banner",
      "Dedicated Account Manager",
    ],
    isPopular: true,
    isCustomPrice: false,
    active: true,
    sortOrder: 2,
  },
  {
    id: "custom-plan",
    name: "Custom Plan",
    price: 15000,
    currency: "LKR",
    billingCycle: "monthly",
    tileQuota: 150,
    quotaLabel: "150 Tiles",
    features: [
      "Full 3D WebGL Engine",
      "In-Store QR Kiosk",
      "150 Tile Storage Slots",
    ],
    isPopular: false,
    isCustomPrice: false,
    customPriceLabel: "",
    active: true,
    sortOrder: 3,
  },
];
