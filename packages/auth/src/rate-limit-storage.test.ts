import type * as TypeImport__masdan_redis from "@masdan/redis";
import { createFakeRedis } from "@masdan/redis/fake";
import type { FakeRedis } from "@masdan/redis/fake";
import type Redis from "ioredis";
import { describe, expect, it, vi } from "vite-plus/test";

/**
 * Both "Redis off" and "Redis up" run in this file, so `vi.hoisted` gives the
 * mock factory a mutable box. `incrementWithTtl` stays real — it runs against
 * the fake exactly as against ioredis.
 */
const state = vi.hoisted(() => ({ client: null as unknown }));

vi.mock("@masdan/redis", async (importOriginal) => {
  const actual = await importOriginal<typeof TypeImport__masdan_redis>();
  return {
    ...actual,
    redis: {
      client: () => state.client,
      quit: async () => {},
    },
  };
});

const { resolveRateLimitStorage } = await import("./rate-limit-storage");

/** Points the mocked `redis` singleton at a fresh fake and returns it. */
const useFakeRedis = (): FakeRedis => {
  const fake = createFakeRedis();
  state.client = fake as unknown as Redis;
  return fake;
};

describe("resolveRateLimitStorage", () => {
  it("returns undefined when Redis is unconfigured — the 'Redis is optional' contract", () => {
    state.client = null;

    expect(resolveRateLimitStorage()).toBeUndefined();
  });

  it("allows exactly `rule.max` calls to the same key", async () => {
    useFakeRedis();
    const storage = resolveRateLimitStorage();
    if (!storage) {
      throw new Error("expected storage — fake client was set");
    }

    const rule = { max: 3, window: 10 };
    for (let i = 0; i < rule.max; i += 1) {
      await expect(storage.consume("ip:1.2.3.4", rule)).resolves.toEqual({
        allowed: true,
        retryAfter: null,
      });
    }
  });

  it("rejects the call after `rule.max` is reached", async () => {
    useFakeRedis();
    const storage = resolveRateLimitStorage();
    if (!storage) {
      throw new Error("expected storage — fake client was set");
    }

    const rule = { max: 2, window: 10 };
    await storage.consume("ip:1.2.3.4", rule);
    await storage.consume("ip:1.2.3.4", rule);

    await expect(storage.consume("ip:1.2.3.4", rule)).resolves.toEqual({
      allowed: false,
      retryAfter: rule.window,
    });
  });

  it("fails open when the Redis command rejects", async () => {
    const fake = useFakeRedis();
    fake.failNext();
    const storage = resolveRateLimitStorage();
    if (!storage) {
      throw new Error("expected storage — fake client was set");
    }

    // Resolves `{ allowed: true }`, never rejects: a Redis blip must not become
    // a 500, or a lockout, on every sign-in.
    await expect(
      storage.consume("ip:1.2.3.4", { max: 1, window: 10 })
    ).resolves.toEqual({
      allowed: true,
      retryAfter: null,
    });
  });
});
