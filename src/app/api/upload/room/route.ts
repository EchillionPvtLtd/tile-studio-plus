import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs/promises';
import { randomUUID } from 'crypto';
import { getSession } from '@/lib/auth';
import { shopAccess } from '@/lib/visualizerGuard';
import { RESTRICTED_MESSAGE } from '@/lib/visualizerAccess';

export const runtime = 'nodejs';

const MAX_BYTES = 12 * 1024 * 1024;
const ALLOWED_FORMATS = ['jpeg', 'png', 'webp'];
/** The photo is kept at a size that looks sharp on a big screen without taking long to load or to process. */
const MAX_SIDE = 2048;
const MIN_SIDE = 480;

/**
 * Upload of a room photo for the 2D visualizer, for signed-in showrooms.
 * As with the logo upload, nothing the browser says about the file is trusted: the bytes must decode as a real image,
 * and what is saved is a re-encoded WebP (plus a small thumbnail) under a random name.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== 'SHOP') {
    return NextResponse.json({ error: 'Please sign in to your showroom to add a room photo.' }, { status: 401 });
  }
  // Adding rooms belongs to the 2D visualizer: refused with 403 when this showroom does not have it
  if (!(await shopAccess(session.userId))?.viz2d) return NextResponse.json({ error: RESTRICTED_MESSAGE }, { status: 403 });

  try {
    const file = (await req.formData()).get('file');
    if (!(file instanceof File)) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ error: 'The photo is too large (max 12 MB)' }, { status: 413 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const sharp = (await import('sharp')).default;

    let meta: { format?: string; width?: number; height?: number } = {};
    try {
      meta = await sharp(buffer, { limitInputPixels: 80_000_000 }).metadata();
    } catch {
      meta = {};
    }
    if (!meta.format || !ALLOWED_FORMATS.includes(meta.format)) {
      return NextResponse.json({ error: 'Upload a JPG, PNG or WebP photo' }, { status: 415 });
    }

    const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
    await fs.mkdir(uploadsDir, { recursive: true });
    const id = randomUUID();
    const name = `room-${id}.webp`;

    // .rotate() applies the camera's orientation, so a phone photo is the right way up
    const main = await sharp(buffer, { limitInputPixels: 80_000_000 })
      .rotate()
      .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 88 })
      .toBuffer({ resolveWithObject: true });
    if (Math.min(main.info.width, main.info.height) < MIN_SIDE) {
      return NextResponse.json({ error: `The photo is too small: it must be at least ${MIN_SIDE} pixels on its short side` }, { status: 422 });
    }
    const thumb = await sharp(main.data)
      .resize({ width: 480, withoutEnlargement: true })
      .webp({ quality: 78 })
      .toBuffer();

    let imageUrl: string;
    const { isR2Configured, uploadToR2 } = await import('@/lib/r2');
    if (isR2Configured()) {
      imageUrl = await uploadToR2({
        key: `rooms/${name}`,
        buffer: main.data,
        contentType: 'image/webp',
      });
      await uploadToR2({
        key: `rooms/room-${id}-t.webp`,
        buffer: thumb,
        contentType: 'image/webp',
      });
    } else {
      const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
      await fs.mkdir(uploadsDir, { recursive: true });
      await fs.writeFile(path.join(uploadsDir, name), main.data);
      await fs.writeFile(path.join(uploadsDir, `room-${id}-t.webp`), thumb);
      imageUrl = `/uploads/${name}`;
    }

    return NextResponse.json({ success: true, imageUrl, width: main.info.width, height: main.info.height }, { status: 200 });
  } catch {
    return NextResponse.json({ error: 'Could not process that photo. Try a different file.' }, { status: 500 });
  }
}
