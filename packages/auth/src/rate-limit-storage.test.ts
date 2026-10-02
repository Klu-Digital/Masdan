import { resetLocalRateLimits } from "@masdan/redis";
import { createFakeRedis } from "@masdan/redis/fake";
import type { FakeRedis } from "@masdan/redis/fake";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const state = vi.hoisted(() => ({ client: null as unknown }));

vi.mock("@masdan/redis/client", () => ({
  redis: { client: () => state.client, isConfigured: () => true },
}));

const { resolveRateLimitStorage } = await import("./rate-limit-storage");

/** Points the mocked `redis` singleton at a fresh fake and returns it. */
const useFakeRedis = (): FakeRedis => {
  const fake = createFakeRedis();
  state.client = fake;
  return fake;
};

beforeEach(() => {
  resetLocalRateLimits();
});

describe("resolveRateLimitStorage", () => {
  it("allows exactly `rule.max` calls to the same key", async () => {
    const fake = useFakeRedis();
    const storage = resolveRateLimitStorage();

    const rule = { max: 3, window: 10 };
    for (let i = 0; i < rule.max; i += 1) {
      await expect(storage.consume("ip:1.2.3.4", rule)).resolves.toEqual({
        allowed: true,
        retryAfter: null,
      });
    }
    expect(fake.store.get("auth-rl:ip:1.2.3.4")?.value).toBe("3");
  });

  it("rejects the call after `rule.max` is reached", async () => {
    useFakeRedis();
    const storage = resolveRateLimitStorage();

    const rule = { max: 2, window: 10 };
    await storage.consume("ip:1.2.3.4", rule);
    await storage.consume("ip:1.2.3.4", rule);

    await expect(storage.consume("ip:1.2.3.4", rule)).resolves.toEqual({
      allowed: false,
      retryAfter: rule.window,
    });
  });

  it("still limits when Redis is unconfigured", async () => {
    state.client = null;
    const storage = resolveRateLimitStorage();

    const rule = { max: 1, window: 10 };
    await storage.consume("ip:1.2.3.4", rule);
    await expect(storage.consume("ip:1.2.3.4", rule)).resolves.toEqual({
      allowed: false,
      retryAfter: rule.window,
    });
  });

  it("still limits, never throws, when the Redis command rejects", async () => {
    const fake = useFakeRedis();
    fake.failNext(2);
    const storage = resolveRateLimitStorage();

    const rule = { max: 1, window: 10 };
    await expect(storage.consume("ip:1.2.3.4", rule)).resolves.toEqual({
      allowed: true,
      retryAfter: null,
    });
    await expect(storage.consume("ip:1.2.3.4", rule)).resolves.toEqual({
      allowed: false,
      retryAfter: rule.window,
    });
  });
});
