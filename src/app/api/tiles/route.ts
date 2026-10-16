import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { checkVisualizer } from '@/lib/visualizerGuard';
import { RESTRICTED_MESSAGE } from '@/lib/visualizerAccess';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const search   = searchParams.get('search') ?? '';
  const category = searchParams.get('category') ?? '';
  const finish   = searchParams.get('finish') ?? '';
  let shopId     = searchParams.get('shopId') ?? '';

  // Multi-tenant isolation:
  const session = await getSession();
  if (!shopId && session && session.role === 'SHOP') {
    shopId = session.userId;
  }

  // The catalogue serves the visualizers: a showroom's tiles are only given to a visualizer the showroom has (403 otherwise),
  // and a showroom cannot read another showroom's
  const viz = searchParams.get('viz');
  const gate = await checkVisualizer(viz === '2d' ? 'viz2d' : viz === '3d' ? 'viz3d' : 'any', shopId || null);
  if (!gate.ok) return NextResponse.json({ error: RESTRICTED_MESSAGE }, { status: 403 });

  let userCondition: any = {};
  if (shopId) {
    userCondition = {
      OR: [
        { userId: shopId },
        { isBuiltIn: true },
      ],
    };
  } else if (!session || session.role !== 'ADMIN') {
    // Untargeted/anonymous queries never leak other shops' custom tiles
    userCondition = { isBuiltIn: true };
  }

  let categoryCondition: any = {};
  if (category && category.toLowerCase() !== 'all') {
    const cat = category.toLowerCase();
    if (cat === 'floor') {
      categoryCondition = { category: { in: ['floor', 'both'] } };
    } else if (cat === 'wall') {
      categoryCondition = { category: { in: ['wall', 'both'] } };
    } else if (cat === 'both') {
      categoryCondition = { category: { in: ['both', 'floor', 'wall'] } };
    } else {
      categoryCondition = { category: { equals: cat } };
    }
  }

  let searchCondition: any = {};
  if (search.trim()) {
    const s = search.trim();
    searchCondition = {
      OR: [
        { name: { contains: s } },
        { sku: { contains: s } },
        { material: { contains: s } },
        { colorName: { contains: s } },
        { brand: { contains: s } },
      ],
    };
  }

  let finishCondition: any = {};
  if (finish && finish.toLowerCase() !== 'all') {
    finishCondition = { finish: { equals: finish } };
  }

  const tiles = await prisma.tile.findMany({
    where: {
      AND: [
        userCondition,
        searchCondition,
        categoryCondition,
        finishCondition,
      ],
    },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json(tiles);
}
