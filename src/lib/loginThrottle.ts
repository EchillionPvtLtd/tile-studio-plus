/**
 * Brute-force protection for the login action.
 *
 * Failures are counted per email and, when a trusted client IP is known, per IP. Reaching the limit locks that key for
 * LOCK_MS. Counters live in Redis when REDIS_URL is set (shared by every server instance) and in memory otherwise.
 * See throttleStore.ts for the storage and clientIp.ts for how the IP is read.
 */
import { FallbackStore, MemoryStore, RedisStore, type ThrottleStore } from "./throttleStore";

const WINDOW_MS = 15 * 60 * 1000;
const LOCK_MS = 15 * 60 * 1000;
const MAX_FAILS_PER_EMAIL = 5;
const MAX_FAILS_PER_IP = 20;

const emailKey = (email: string) => `email:${email.trim().toLowerCase()}`;
const ipKey = (ip: string) => `ip:${ip}`;
const toSeconds = (ms: number) => Math.ceil(ms / 1000);

export function createLoginThrottle(getStore: () => ThrottleStore) {
  return {
    /** Seconds the caller must wait before trying again, or 0 if sign-in is allowed. */
    async getLockSeconds(email: string, ip: string | null): Promise<number> {
      const store = getStore();
      const [byEmail, byIp] = await Promise.all([
        store.lockRemainingMs(emailKey(email)),
        ip ? store.lockRemainingMs(ipKey(ip)) : Promise.resolve(0),
      ]);
      return toSeconds(Math.max(byEmail, byIp));
    },

    /**
     * Record a failed attempt. Returns the lock duration in seconds if this failure triggered a lock,
     * otherwise the number of attempts left for this email.
     */
    async registerFailure(email: string, ip: string | null): Promise<{ lockedSeconds: number; attemptsLeft: number }> {
      const store = getStore();
      const [byEmail, byIp] = await Promise.all([
        store.fail(emailKey(email), MAX_FAILS_PER_EMAIL, WINDOW_MS, LOCK_MS),
        ip ? store.fail(ipKey(ip), MAX_FAILS_PER_IP, WINDOW_MS, LOCK_MS) : Promise.resolve({ fails: 0, lockMs: 0 }),
      ]);
      return {
        lockedSeconds: toSeconds(Math.max(byEmail.lockMs, byIp.lockMs)),
        attemptsLeft: Math.max(0, MAX_FAILS_PER_EMAIL - byEmail.fails),
      };
    },

    /** Clear the per-email counter after a successful sign-in. */
    async registerSuccess(email: string): Promise<void> {
      await getStore().clear(emailKey(email));
    },
  };
}

// ── Default instance used by the app ─────────────────────────────────────────────────────────────

type Globals = { __throttleStore?: ThrottleStore };
const g = globalThis as Globals;

function buildStore(): ThrottleStore {
  // globalThis keeps one store (and one Redis connection) across dev hot reloads
  const memory = new MemoryStore();
  const url = process.env.REDIS_URL?.trim();
  if (!url) return memory;

  // ioredis is only loaded when Redis is actually configured
  const redisPromise = import("ioredis").then(({ default: Redis }) => {
    const client = new Redis(url, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: 2000,
    });
    client.on("error", () => {}); // failures surface per call and trigger the in-memory fallback
    return client;
  });

  const lazyRedis = {
    async pttl(key: string) {
      return (await redisPromise).pttl(key);
    },
    async del(...keys: string[]) {
      return (await redisPromise).del(...keys);
    },
    async eval(script: string, numKeys: number, ...args: (string | number)[]) {
      return (await redisPromise).eval(script, numKeys, ...args);
    },
  };
  return new FallbackStore(new RedisStore(lazyRedis), memory);
}

const defaultThrottle = createLoginThrottle(() => (g.__throttleStore ??= buildStore()));

export const getLockSeconds = defaultThrottle.getLockSeconds;
export const registerFailure = defaultThrottle.registerFailure;
export const registerSuccess = defaultThrottle.registerSuccess;
