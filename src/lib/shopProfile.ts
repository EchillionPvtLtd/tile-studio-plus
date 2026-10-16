import type { ShopProfile } from '@/lib/quotationPdf';
import { readDownloads, type VisualizerDownloads } from '@/lib/visualizerDownloads';
import { effectiveAccess, type VisualizerAccess } from '@/lib/visualizerAccess';

/** What the customer-facing visualizers know about a showroom: its contact details, and which Download buttons it switched on. */
export type PublicShopProfile = ShopProfile & { downloads: VisualizerDownloads; access: VisualizerAccess };

/**
 * The public face of a showroom: what appears on its quotations and in the customer-facing visualizers.
 * Only contact details are included — never owner, plan or payment metadata.
 *
 * A shop's `details` column holds JSON written by the admin; anything that is missing or malformed is simply left out.
 */
export function buildShopProfile(shop: {
  shopName?: string | null;
  logoUrl?: string | null;
  coverPhotoUrl?: string | null;
  coverLinkUrl?: string | null;
  details?: string | null;
  subscriptionPackage?: string | null;
}): PublicShopProfile {
  let meta: Record<string, unknown> = {};
  try {
    const parsed = shop.details ? JSON.parse(shop.details) : {};
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) meta = parsed as Record<string, unknown>;
  } catch {
    meta = {};
  }
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);

  const address = [meta.addressLine1, meta.addressLine2, meta.city, meta.district, meta.postalCode]
    .map(str)
    .filter(Boolean)
    .join(', ')
    .replace(/,\s*,/g, ',');

  return {
    shopName: shop.shopName || 'Showroom',
    logoUrl: shop.logoUrl || null,
    coverPhotoUrl: shop.coverPhotoUrl || null,
    coverLinkUrl: shop.coverLinkUrl || null,
    companyName: str(meta.companyRegName),
    phone: str(meta.phone),
    whatsapp: str(meta.whatsapp),
    email: str(meta.shopEmail),
    website: str(meta.website),
    address: address || null,
    vatNo: str(meta.taxVatNo),
    downloads: readDownloads(shop.details),
    access: effectiveAccess(shop.subscriptionPackage, shop.details),
  };
}
