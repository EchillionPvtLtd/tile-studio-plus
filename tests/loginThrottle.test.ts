import { describe, expect, it, vi } from "vitest";
import { createLoginThrottle } from "@/lib/loginThrottle";
import { FallbackStore, MemoryStore, RedisStore, type RedisLike } from "@/lib/throttleStore";

const MIN = 60_000;

function setup() {
  let now = 1_000_000;
  const store = new MemoryStore(() => now);
  const throttle = createLoginThrottle(() => store);
  return { throttle, advance: (ms: number) => (now += ms) };
}

describe("login throttle (in memory)", () => {
  it("counts down attempts and locks the email on the 5th failure", async () => {
    const { throttle } = setup();
    const left: number[] = [];
    for (let i = 0; i < 4; i++) left.push((await throttle.registerFailure("a@b.co", null)).attemptsLeft);
    expect(left).toEqual([4, 3, 2, 1]);
    expect(await throttle.getLockSeconds("a@b.co", null)).toBe(0);

    const fifth = await throttle.registerFailure("a@b.co", null);
    expect(fifth.attemptsLeft).toBe(0);
    expect(fifth.lockedSeconds).toBe(15 * 60);
    expect(await throttle.getLockSeconds("a@b.co", null)).toBe(15 * 60);
  });

  it("treats emails case-insensitively and does not lock other emails", async () => {
    const { throttle } = setup();
    for (let i = 0; i < 5; i++) await throttle.registerFailure("Owner@Shop.com", null);
    expect(await throttle.getLockSeconds("owner@shop.com", null)).toBeGreaterThan(0);
    expect(await throttle.getLockSeconds("other@shop.com", null)).toBe(0);
  });

  it("unlocks after 15 minutes", async () => {
    const { throttle, advance } = setup();
    for (let i = 0; i < 5; i++) await throttle.registerFailure("a@b.co", null);
    advance(14 * MIN);
    expect(await throttle.getLockSeconds("a@b.co", null)).toBeGreaterThan(0);
    advance(2 * MIN);
    expect(await throttle.getLockSeconds("a@b.co", null)).toBe(0);
  });

  it("forgets old failures once the 15 minute window passes", async () => {
    const { throttle, advance } = setup();
    for (let i = 0; i < 4; i++) await throttle.registerFailure("a@b.co", null);
    advance(16 * MIN);
    expect((await throttle.registerFailure("a@b.co", null)).attemptsLeft).toBe(4);
  });

  it("a successful sign-in clears the email counter", async () => {
    const { throttle } = setup();
    for (let i = 0; i < 4; i++) await throttle.registerFailure("a@b.co", null);
    await throttle.registerSuccess("a@b.co");
    expect((await throttle.registerFailure("a@b.co", null)).attemptsLeft).toBe(4);
  });

  it("locks an IP after 20 failures across different emails, but only when an IP is known", async () => {
    const { throttle } = setup();
    for (let i = 0; i < 20; i++) await throttle.registerFailure(`user${i}@x.co`, "203.0.113.9");
    expect(await throttle.getLockSeconds("fresh@x.co", "203.0.113.9")).toBeGreaterThan(0);
    expect(await throttle.getLockSeconds("fresh@x.co", "203.0.113.10")).toBe(0);
    expect(await throttle.getLockSeconds("fresh@x.co", null)).toBe(0);
  });
});

describe("RedisStore", () => {
  const fake = () => {
    const calls: unknown[][] = [];
    const redis: RedisLike = {
      pttl: vi.fn(async () => 90_000),
      del: vi.fn(async (...keys: string[]) => (calls.push(["del", ...keys]), keys.length)),
      eval: vi.fn(async (...args: unknown[]) => (calls.push(["eval", ...args]), [3, 0])),
    };
    return { redis, calls };
  };

  it("reads the remaining lock time and treats missing keys as unlocked", async () => {
    const { redis } = fake();
    expect(await new RedisStore(redis).lockRemainingMs("email:a")).toBe(90_000);
    vi.mocked(redis.pttl).mockResolvedValueOnce(-2);
    expect(await new RedisStore(redis).lockRemainingMs("email:a")).toBe(0);
  });

  it("counts failures with one atomic script and namespaced keys", async () => {
    const { redis, calls } = fake();
    const res = await new RedisStore(redis).fail("email:a", 5, 900_000, 900_000);
    expect(res).toEqual({ fails: 3, lockMs: 0 });
    const [, , numKeys, failKey, lockKey, windowMs, lockMs, max] = calls[0];
    expect([numKeys, failKey, lockKey, windowMs, lockMs, max]).toEqual([
      2, "login-throttle:fail:email:a", "login-throttle:lock:email:a", 900_000, 900_000, 5,
    ]);
  });

  it("clear removes both the counter and the lock", async () => {
    const { redis, calls } = fake();
    await new RedisStore(redis).clear("email:a");
    expect(calls[0]).toEqual(["del", "login-throttle:fail:email:a", "login-throttle:lock:email:a"]);
  });
});

describe("FallbackStore", () => {
  it("keeps limiting from memory when Redis is down, and warns once", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const down: RedisLike = {
      pttl: async () => { throw new Error("ECONNREFUSED"); },
      del: async () => { throw new Error("ECONNREFUSED"); },
      eval: async () => { throw new Error("ECONNREFUSED"); },
    };
    const store = new FallbackStore(new RedisStore(down), new MemoryStore());
    const throttle = createLoginThrottle(() => store);
    for (let i = 0; i < 5; i++) await throttle.registerFailure("a@b.co", null);
    expect(await throttle.getLockSeconds("a@b.co", null)).toBeGreaterThan(0);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});
