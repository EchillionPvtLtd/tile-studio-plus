import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { buildShopProfile } from '@/lib/shopProfile';

/**
 * Public showroom identity for the customer-facing visualizer and its quotation PDF.
 * Only contact details are exposed — never owner, plan or payment metadata.
 */
export async function GET(req: NextRequest) {
  let shopId = req.nextUrl.searchParams.get('shopId') ?? '';

  if (!shopId) {
    const session = await getSession();
    if (session?.role === 'SHOP') shopId = session.userId;
  }
  // An anonymous demo has no showroom: nothing to show, and nothing to report as an error
  if (!shopId) return NextResponse.json(null);

  const shop = await prisma.user.findFirst({
    where: { id: shopId, role: 'SHOP' },
    select: { shopName: true, logoUrl: true, coverPhotoUrl: true, coverLinkUrl: true, details: true, subscriptionPackage: true },
  });
  if (!shop) return NextResponse.json({ error: 'Showroom not found' }, { status: 404 });

  return NextResponse.json(buildShopProfile(shop));
}
