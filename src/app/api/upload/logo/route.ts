import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs/promises';
import { randomUUID } from 'crypto';
import { getSession } from '@/lib/auth';

export const runtime = 'nodejs';

const MAX_BYTES = 8 * 1024 * 1024;
/** What sharp can actually decode. SVG is allowed but is always rasterised, so a script inside it never runs. */
const ALLOWED_FORMATS = ['jpeg', 'png', 'webp', 'gif', 'svg'];

/**
 * Logo / avatar upload for signed-in showrooms and admins.
 * The file name and type the browser claims are ignored: the bytes must decode as a real image, and what is
 * saved is a re-encoded WebP with a random name, so nothing uploaded can be served back as HTML or a script.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Please sign in to upload a logo.' }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'Image is too large (max 8 MB)' }, { status: 413 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const sharp = (await import('sharp')).default;

    let format: string | undefined;
    try {
      format = (await sharp(buffer, { limitInputPixels: 50_000_000 }).metadata()).format;
    } catch {
      format = undefined;
    }
    if (!format || !ALLOWED_FORMATS.includes(format)) {
      return NextResponse.json({ error: 'Upload a JPG, PNG, WebP or SVG image' }, { status: 415 });
    }

    const filename = `logo-${randomUUID()}.webp`;
    const webpBuffer = await sharp(buffer, { limitInputPixels: 50_000_000 })
      .rotate()
      .resize({ width: 800, height: 400, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 88 })
      .toBuffer();

    let logoUrl: string;
    const { isR2Configured, uploadToR2 } = await import('@/lib/r2');
    if (isR2Configured()) {
      logoUrl = await uploadToR2({
        key: `logos/${filename}`,
        buffer: webpBuffer,
        contentType: 'image/webp',
      });
    } else {
      const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
      await fs.mkdir(uploadsDir, { recursive: true });
      await fs.writeFile(path.join(uploadsDir, filename), webpBuffer);
      logoUrl = `/uploads/${filename}`;
    }

    return NextResponse.json({ logoUrl, success: true }, { status: 200 });
  } catch {
    return NextResponse.json({ error: 'Could not process that image. Try a different file.' }, { status: 500 });
  }
}
