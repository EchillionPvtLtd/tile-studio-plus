import { NextRequest, NextResponse } from 'next/server';
import { assertPublic } from '@/lib/ssrf';

export const runtime = 'nodejs';

/**
 * Image proxy for tile textures hosted on other sites (so the 3D view can read them without CORS problems).
 * It is public, so it only ever fetches ordinary public images:
 *   - http/https on the standard ports only
 *   - never a private, loopback or link-local address (checked on every redirect hop too)
 *   - raster image types only, capped in size and time
 */
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 12_000;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];

const fail = (message: string, status: number) => NextResponse.json({ error: message }, { status });

const DRIVE_HELP = 'Google Drive would not share that file. Open it in Drive, click Share, set General access to “Anyone with the link” (Viewer) and try again.';
const isGoogle = (host: string) => /(^|\.)(google\.[a-z.]+|googleusercontent\.com)$/.test(host);

/** A plain-language reason for an upstream answer that was not a picture. */
function refusal(status: number, host: string): string {
  if (isGoogle(host)) return DRIVE_HELP;
  if (status === 401 || status === 403) return 'That image is private or blocks other sites from using it. Use a link anyone can open.';
  if (status === 404 || status === 410) return 'No image was found at that link. Check the address.';
  return `The image server answered ${status}`;
}

export async function GET(req: NextRequest) {
  const raw = new URL(req.url).searchParams.get('url');
  if (!raw) return fail('Missing url query parameter', 400);

  let current: URL;
  try {
    current = new URL(raw);
  } catch {
    return fail('Invalid URL format', 400);
  }

  const startHost = current.hostname.toLowerCase();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    let upstream: Response | null = null;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      try {
        await assertPublic(current);
      } catch (e) {
        return fail(e instanceof Error ? e.message : 'That address is not allowed', 400);
      }
      upstream = await fetch(current, {
        signal: controller.signal,
        redirect: 'manual',
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; TileVisualizer/1.0)',
          Accept: 'image/avif,image/webp,image/png,image/jpeg,image/gif;q=0.9,*/*;q=0.1',
        },
      });
      if (upstream.status >= 300 && upstream.status < 400 && upstream.headers.get('location')) {
        current = new URL(upstream.headers.get('location')!, current);
        upstream = null;
        continue;
      }
      break;
    }
    if (!upstream) return fail('Too many redirects', 400);
    if (!upstream.ok) return fail(refusal(upstream.status, startHost), 502);

    const type = (upstream.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!IMAGE_TYPES.includes(type)) {
      if (isGoogle(startHost) && (type === 'text/html' || type === '')) return fail(DRIVE_HELP, 415);
      if (type === 'text/html') return fail('That link opens a web page, not an image. Right-click the picture and choose “Copy image address”.', 415);
      return fail('That link is not a JPG, PNG, WebP, GIF or AVIF image', 415);
    }

    const declared = Number(upstream.headers.get('content-length') || 0);
    if (declared > MAX_BYTES) return fail('Image is too large (max 10 MB)', 413);

    // Read at most MAX_BYTES, whatever the server claims
    const reader = upstream.body?.getReader();
    if (!reader) return fail('The image server sent no data', 502);
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BYTES) {
        controller.abort();
        return fail('Image is too large (max 10 MB)', 413);
      }
      chunks.push(value);
    }

    return new Response(Buffer.concat(chunks), {
      status: 200,
      headers: {
        'Content-Type': type,
        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
      },
    });
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError';
    return fail(aborted ? 'The image server took too long' : 'Could not fetch that image', 502);
  } finally {
    clearTimeout(timer);
  }
}
