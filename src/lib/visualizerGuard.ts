import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { RESTRICTED_MESSAGE, effectiveAccess, type VisualizerAccess, type VisualizerKind } from '@/lib/visualizerAccess';

/**
 * The server's answer to "may this request use that visualizer?". Used by the proxy (page routes), the pages themselves, the
 * API routes and the server actions, so every door asks the same question of the same data and a hidden button is never the
 * only protection.
 */
export type GateResult =
  | { ok: true; shopId: string | null; viewer: 'admin' | 'owner' | 'visitor' }
  | { ok: false; reason: 'restricted' | 'other-shop' | 'unknown-shop' };

/** What a showroom can use now, from the database (plan and the administrator's switches); null when there is no such showroom. */
export async function shopAccess(shopId: string): Promise<VisualizerAccess | null> {
  const shop = await prisma.user.findFirst({ where: { id: shopId, role: 'SHOP' }, select: { subscriptionPackage: true, details: true } });
  return shop ? effectiveAccess(shop.subscriptionPackage, shop.details) : null;
}

/**
 * Decides one request. `requestedShopId` is the showroom named in the address (`?shopId=`), if any.
 *   - the main administrator may look at any showroom's visualizer;
 *   - a signed-in showroom may only use its own: another showroom's is refused;
 *   - a visitor (a customer scanning the showroom's QR code) may use the showroom named in the address, if it has access;
 *   - with no showroom at all it is the public demo, which holds no showroom's data.
 * `kind` 'any' asks for at least one visualizer (the tile catalogue serves both).
 */
export async function checkVisualizer(kind: VisualizerKind | 'any', requestedShopId?: string | null): Promise<GateResult> {
  const session = await getSession();
  if (session?.role === 'ADMIN') return { ok: true, shopId: requestedShopId || null, viewer: 'admin' };

  const own = session?.role === 'SHOP' ? session.userId : null;
  const shopId = requestedShopId || own;
  if (!shopId) return { ok: true, shopId: null, viewer: 'visitor' };
  if (own && own !== shopId) return { ok: false, reason: 'other-shop' };

  const access = await shopAccess(shopId);
  if (!access) return { ok: false, reason: 'unknown-shop' };
  const allowed = kind === 'any' ? access.viz2d || access.viz3d : access[kind];
  if (!allowed) return { ok: false, reason: 'restricted' };
  return { ok: true, shopId, viewer: own ? 'owner' : 'visitor' };
}

/** For server actions: the signed-in showroom must have the visualizer, or this throws the message to show. */
export async function requireVisualizer(userId: string, kind: VisualizerKind): Promise<void> {
  const access = await shopAccess(userId);
  if (!access || !access[kind]) throw new Error(RESTRICTED_MESSAGE);
}

/** What the actions' catch blocks pass on to the person: their own messages, never an internal error. */
export const isGuardMessage = (message: string) => message === 'Unauthorized' || /suspended/.test(message) || message === RESTRICTED_MESSAGE;
