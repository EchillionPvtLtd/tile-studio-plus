import net from "node:net";

type HeaderReader = { get(name: string): string | null };
type Env = Record<string, string | undefined>;

/**
 * The visitor's IP address, but only when we can actually trust where it came from.
 *
 * Headers such as X-Forwarded-For are written by the client unless a proxy in front of the app overwrites them,
 * so reading them blindly lets anyone dodge a rate limit (send a new fake IP each time) or lock out someone else.
 * Set these on the host once the site sits behind a proxy or CDN you control:
 *   TRUSTED_PROXY_HEADER  the header your proxy sets, e.g. "cf-connecting-ip", "x-real-ip" or "x-forwarded-for"
 *   TRUSTED_PROXY_HOPS    only for x-forwarded-for: how many trusted proxies append to it (default 1)
 * With no header configured this returns null and callers must not rely on the IP.
 */
export function trustedClientIp(headers: HeaderReader, env: Env = process.env): string | null {
  const name = env.TRUSTED_PROXY_HEADER?.trim().toLowerCase();
  if (!name) return null;

  const raw = headers.get(name);
  if (!raw) return null;

  const parts = raw.split(",").map((p) => p.trim()).filter(Boolean);
  const hops = Math.max(1, Number.parseInt(env.TRUSTED_PROXY_HOPS ?? "1", 10) || 1);
  // Count from the right: the entries on the left were supplied by the client and can be anything
  const candidate = parts[parts.length - hops];
  return candidate ? normalizeIp(candidate) : null;
}

function normalizeIp(value: string): string | null {
  let ip = value.trim();
  const bracketed = ip.match(/^\[([^\]]+)\](?::\d+)?$/); // [::1]:8080
  if (bracketed) ip = bracketed[1];
  else if (/^\d+\.\d+\.\d+\.\d+:\d+$/.test(ip)) ip = ip.slice(0, ip.lastIndexOf(":")); // 1.2.3.4:8080
  const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (mapped) ip = mapped[1];
  return net.isIP(ip) ? ip.toLowerCase() : null;
}
