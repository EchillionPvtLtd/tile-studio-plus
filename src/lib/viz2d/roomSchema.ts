import { z } from 'zod';
import { isConvexQuad, planeMapping } from './geometry';
import { ROOM_KIND_IDS } from './roomKinds';
import type { Calibration, PolygonShape, RoomScene, SurfaceDef } from './types';
import { MAX_TILED_SURFACES } from './types';

/**
 * What a showroom may store for a room it added. Everything is bounded and checked here, because the server will
 * not trust the browser: a surface is a handful of outlines (never a link to a file) plus a perspective that must
 * describe a real plane.
 */

const unit = z.number().min(-0.5).max(1.5);
const point = z.tuple([unit, unit]);
const ring = z.array(point).min(3).max(600);
const shape = z.object({ outer: ring, holes: z.array(ring).max(40).optional() });
const mm = z.number().min(-200_000).max(200_000);

const calibration = z.object({
  image: z.tuple([point, point, point, point]),
  planeMm: z.tuple([z.tuple([mm, mm]), z.tuple([mm, mm]), z.tuple([mm, mm]), z.tuple([mm, mm])]),
});

const surface = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/i, 'Surface ids use letters, numbers and dashes'),
  group: z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/i).optional(),
  name: z.string().trim().min(1, 'Every surface needs a name').max(60),
  kind: z.enum(['floor', 'wall', 'backsplash', 'countertop', 'other']),
  priority: z.number().int().min(0).max(99),
  mask: z.object({ kind: z.literal('polygons'), shapes: z.array(shape).min(1, 'Outline each surface on the photo').max(40) }),
  calibration,
  areaSqFt: z.number().min(0).max(1_000_000).optional(),
  wallSide: z.enum(['north', 'south', 'east', 'west']).optional(),
});

export const roomDataSchema = z.object({
  surfaces: z.array(surface).min(1, 'Add at least one surface').max(MAX_TILED_SURFACES, `A room can have up to ${MAX_TILED_SURFACES} surface pieces`),
  occluders: z.array(shape).max(80).optional(),
});

export const roomMetaSchema = z.object({
  name: z.string().trim().min(1, 'Give the room a name').max(80),
  roomType: z.enum(ROOM_KIND_IDS as [string, ...string[]]),
});

export type RoomData = z.infer<typeof roomDataSchema>;

export interface RoomValidation {
  ok: boolean;
  /** The first problem, in words a showroom owner can act on. */
  message?: string;
  data?: RoomData;
}

/** Checks a room's surfaces: shape, bounds, and that each perspective is a plane the renderer can use. */
export function validateRoomData(input: unknown): RoomValidation {
  const parsed = roomDataSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, message: issue?.message ?? 'The room is not valid.' };
  }
  const ids = new Set<string>();
  for (const s of parsed.data.surfaces) {
    if (ids.has(s.id)) return { ok: false, message: `Two surfaces share the id “${s.id}”.` };
    ids.add(s.id);
    if (!isConvexQuad(s.calibration.image) || !planeMapping(s.calibration as Calibration)) {
      return { ok: false, message: `“${s.name}”: the four perspective corners do not describe a flat surface. Move them onto the corners of a real rectangle.` };
    }
    const [a, b, c] = s.calibration.planeMm;
    const area = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]));
    if (area < 1) return { ok: false, message: `“${s.name}”: enter the real size of the measured rectangle.` };
  }
  return { ok: true, data: parsed.data };
}

/** A stored row back into the scene the visualizer uses. */
export function sceneFromRow(row: { id: string; name: string; roomType: string; imageUrl: string; width: number; height: number; data: string }): RoomScene | null {
  let json: unknown;
  try {
    json = JSON.parse(row.data);
  } catch {
    return null;
  }
  const checked = validateRoomData(json);
  if (!checked.ok || !checked.data) return null;
  return {
    id: row.id,
    name: row.name,
    roomType: row.roomType as RoomScene['roomType'],
    source: 'custom',
    image: { src: row.imageUrl, width: row.width, height: row.height, thumb: thumbUrlOf(row.imageUrl) },
    surfaces: checked.data.surfaces as SurfaceDef[],
    occluders: checked.data.occluders as PolygonShape[] | undefined,
    version: 1,
  };
}

/** The thumbnail made beside a room photo: "/uploads/room-1.webp" → "/uploads/room-1-t.webp". */
export const thumbUrlOf = (imageUrl: string) => imageUrl.replace(/\.webp$/, '-t.webp');

/** Room photos are only ever the files this app wrote itself. */
export const isRoomImageUrl = (url: string) => /^\/uploads\/room-[0-9a-f-]{36}\.webp$/.test(url);
