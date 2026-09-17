import Redis from "ioredis";
import { afterAll, describe, expect, it } from "vite-plus/test";

import { redis } from "./client";
import { incrementWithTtl } from "./increment";

/**
 * Against a real server rather than `fake.ts`, for the one thing the fake
 * cannot prove: atomicity under real concurrency. The client is built inline
 * rather than via `@k22i/testing`, which depends on `@k22i/auth` ->
 * `@k22i/redis` and would close a workspace cycle.
 */
const client = new Redis(process.env.REDIS_URL as string);

// An ioredis client with no `error` listener crashes the process on a connection
// error. Swallowed: every command below already asserts on its own result.
client.on("error", () => {
  /* empty */
});

afterAll(async () => {
  try {
    await client.quit();
  } catch {
    client.disconnect();
  }
});

describe("redis (real container)", () => {
  it("incrementWithTtl returns 1, 2, 3 on successive calls and sets the TTL only on the first", async () => {
    const key = "counter";

    expect(await incrementWithTtl(client, key, 30)).toBe(1);
    const ttlAfterFirst = await client.ttl(key);
    expect(ttlAfterFirst).toBeGreaterThan(0);
    expect(ttlAfterFirst).toBeLessThanOrEqual(30);

    expect(await incrementWithTtl(client, key, 30)).toBe(2);
    expect(await incrementWithTtl(client, key, 30)).toBe(3);

    // Must not have reset or extended the first call's TTL — the whole reason
    // `INCREMENT_WITH_TTL` guards its `EXPIRE` with `if n == 1`.
    const ttlAfterThird = await client.ttl(key);
    expect(ttlAfterThird).toBeGreaterThan(0);
    expect(ttlAfterThird).toBeLessThanOrEqual(ttlAfterFirst);
  });

  it("increments atomically under concurrency: exactly 1..50, no duplicates or gaps", async () => {
    const key = "concurrent-counter";

    const results = await Promise.all(
      Array.from({ length: 50 }, () => incrementWithTtl(client, key, 30))
    );

    // The assertion `fake.ts` cannot make: its shim runs `incr` + `expire` as
    // two separate, non-atomic JS calls.
    expect([...results].toSorted((a, b) => a - b)).toEqual(
      Array.from({ length: 50 }, (_, i) => i + 1)
    );
  });

  it("redis.quit() is idempotent", async () => {
    // Force the singleton to actually dial, so this exercises quitting an
    // established connection rather than the "never dialled" short-circuit.
    const singletonClient = redis.client();
    expect(singletonClient).not.toBeNull();
    await singletonClient?.set("quit-idempotent-probe", "1");

    await redis.quit();
    // `quit()` clears its memoised client before awaiting, so this sees none.
    await expect(redis.quit()).resolves.toBeUndefined();
  });
});
