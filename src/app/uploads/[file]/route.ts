import { NextRequest } from 'next/server';
import path from 'path';
import fs from 'fs/promises';

export const runtime = 'nodejs';

const TYPES: Record<string, string> = {
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
};

/**
 * Serves images uploaded while the site is running.
 * In production Next.js only serves files that were in /public when the server started, so a logo or poster
 * uploaded afterwards would 404. Files that already existed are still served directly by Next.js before this runs.
 * Only plain image files from public/uploads are ever returned (no sub-folders, no other types).
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const type = TYPES[path.extname(file).toLowerCase()];
  if (!type || !/^[\w.-]+$/.test(file) || file.includes('..')) {
    return new Response('Not found', { status: 404 });
  }

  try {
    const data = await fs.readFile(path.join(process.cwd(), 'public', 'uploads', file));
    return new Response(new Uint8Array(data), {
      status: 200,
      headers: {
        'Content-Type': type,
        'Cache-Control': 'public, max-age=3600',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
      },
    });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}
