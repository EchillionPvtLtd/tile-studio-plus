/**
 * Storage behind the sign-in rate limit.
 *
 * - MemoryStore: per server process. Fine for one instance and for local development, but the counters reset on every
 *   restart and are not shared, so with several instances each one would allow its own full set of attempts.
 * - RedisStore: shared by every instance. Used automatically when REDIS_URL is set.
 *
 * If Redis is unreachable the limit keeps working from memory instead of letting every attempt through.
 */

export interface ThrottleStore {
  /** Milliseconds left on the lock for `key`, or 0 if it is not locked. */
  lockRemainingMs(key: string): Promise<number>;
  /** Count one failure. Reaching `max` failures inside `windowMs` locks the key for `lockMs`. */
  fail(key: string, max: number, windowMs: number, lockMs: number): Promise<{ fails: number; lockMs: number }>;
  /** Forget everything about `key`. */
  clear(key: string): Promise<void>;
}

type Entry = { fails: number; windowStart: number; lockedUntil: number };

export class MemoryStore implements ThrottleStore {
  private entries = new Map<string, Entry>();

  constructor(private now: () => number = Date.now) {}

  private read(key: string, windowMs: number): Entry | undefined {
    const e = this.entries.get(key);
    if (!e) return undefined;
    const now = this.now();
    if (e.lockedUntil <= now && now - e.windowStart >= windowMs) {
      this.entries.delete(key);
      return undefined;
    }
    return e;
  }

  async lockRemainingMs(key: string): Promise<number> {
    const e = this.entries.get(key);
    const left = e ? e.lockedUntil - this.now() : 0;
    return left > 0 ? left : 0;
  }

  async fail(key: string, max: number, windowMs: number, lockMs: number) {
    const now = this.now();
    const e = this.read(key, windowMs) ?? { fails: 0, windowStart: now, lockedUntil: 0 };
    e.fails += 1;
    if (e.fails >= max) e.lockedUntil = now + lockMs;
    this.entries.set(key, e);
    return { fails: e.fails, lockMs: Math.max(0, e.lockedUntil - now) };
  }

  async clear(key: string) {
    this.entries.delete(key);
  }
}

/** Minimal slice of the ioredis client that RedisStore uses (keeps the store easy to fake in tests). */
export interface RedisLike {
  pttl(key: string): Promise<number>;
  del(...keys: string[]): Promise<number>;
  eval(script: string, numKeys: number, ...args: (string | number)[]): Promise<unknown>;
}

// Atomic: count the failure, start the window on the first one, and lock once the limit is reached.
const FAIL_SCRIPT = `
local n = redis.call('INCR', KEYS[1])
if n == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
if n >= tonumber(ARGV[3]) then redis.call('SET', KEYS[2], '1', 'PX', ARGV[2]) end
local ttl = redis.call('PTTL', KEYS[2])
if ttl < 0 then ttl = 0 end
return {n, ttl}
`;

export class RedisStore implements ThrottleStore {
  constructor(private redis: RedisLike, private prefix = "login-throttle:") {}

  async lockRemainingMs(key: string): Promise<number> {
    const ttl = await this.redis.pttl(`${this.prefix}lock:${key}`);
    return ttl > 0 ? ttl : 0; // -2 = no such key, -1 = no expiry
  }

  async fail(key: string, max: number, windowMs: number, lockMs: number) {
    const res = (await this.redis.eval(
      FAIL_SCRIPT,
      2,
      `${this.prefix}fail:${key}`,
      `${this.prefix}lock:${key}`,
      windowMs,
      lockMs,
      max
    )) as [number, number];
    return { fails: Number(res[0]), lockMs: Number(res[1]) };
  }

  async clear(key: string) {
    await this.redis.del(`${this.prefix}fail:${key}`, `${this.prefix}lock:${key}`);
  }
}

/** Uses `primary`, and falls back to `fallback` (with a one-time warning) whenever the primary throws. */
export class FallbackStore implements ThrottleStore {
  private warned = false;

  constructor(private primary: ThrottleStore, private fallback: ThrottleStore) {}

  private async run<T>(op: (s: ThrottleStore) => Promise<T>): Promise<T> {
    try {
      return await op(this.primary);
    } catch (err) {
      if (!this.warned) {
        this.warned = true;
        console.warn("[login-throttle] Redis is unavailable, using in-memory limits for now:", (err as Error)?.message);
      }
      return op(this.fallback);
    }
  }

  lockRemainingMs(key: string) {
    return this.run((s) => s.lockRemainingMs(key));
  }
  fail(key: string, max: number, windowMs: number, lockMs: number) {
    return this.run((s) => s.fail(key, max, windowMs, lockMs));
  }
  clear(key: string) {
    return this.run((s) => s.clear(key));
  }
}
