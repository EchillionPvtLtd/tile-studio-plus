import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs/promises';
import { getSession } from '@/lib/auth';

export const runtime = 'nodejs';

const MAX_BYTES = 8 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'Image is too large (max 8 MB)' }, { status: 413 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const sharp = (await import('sharp')).default;

    // Trust the decoded image, not the file name: sharp rejects anything that isn't a real raster image.
    let format: string | undefined;
    try {
      format = (await sharp(buffer).metadata()).format;
    } catch {
      format = undefined;
    }
    if (!format || !['jpeg', 'png', 'webp'].includes(format)) {
      return NextResponse.json({ error: 'Upload a JPG, PNG or WebP image' }, { status: 415 });
    }

    const filename = `poster-${Date.now()}.webp`;
    const webpBuffer = await sharp(buffer)
      .rotate()
      .resize({ width: 1600, height: 2000, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();

    let imageUrl: string;
    const { isR2Configured, uploadToR2 } = await import('@/lib/r2');
    if (isR2Configured()) {
      imageUrl = await uploadToR2({
        key: `posters/${filename}`,
        buffer: webpBuffer,
        contentType: 'image/webp',
      });
    } else {
      const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
      await fs.mkdir(uploadsDir, { recursive: true });
      await fs.writeFile(path.join(uploadsDir, filename), webpBuffer);
      imageUrl = `/uploads/${filename}`;
    }

    return NextResponse.json({ imageUrl, success: true }, { status: 200 });
  } catch {
    return NextResponse.json({ error: 'Could not process that image. Try a different file.' }, { status: 500 });
  }
}
