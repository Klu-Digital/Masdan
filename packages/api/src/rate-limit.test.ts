import { resetLocalRateLimits } from "@masdan/redis";
import { createFakeRedis } from "@masdan/redis/fake";
import { call, ORPCError, os } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { Context } from "./context";
import { rateLimit } from "./rate-limit";

const caught = async (p: Promise<unknown>): Promise<unknown> => {
  try {
    return await p;
  } catch (error) {
    return error;
  }
};

const redisMock = vi.hoisted(() => ({ client: vi.fn() }));

vi.mock("@masdan/redis/client", () => ({
  redis: { client: redisMock.client, isConfigured: () => true },
}));

beforeEach(() => {
  resetLocalRateLimits();
});

/** Mirrors the fake context in `routers/feature-flags.test.ts`. */
const makeContext = (overrides: Partial<Context> = {}): Context =>
  ({
    auth: null,
    db: {},
    ip: undefined,
    log: undefined,
    session: null,
    ...overrides,
  }) as unknown as Context;

const o = os.$context<Context>();

const procedure = (options: Parameters<typeof rateLimit>[0]) =>
  o.use(rateLimit(options)).handler(() => "reached");

const callAt = (
  proc: ReturnType<typeof procedure>,
  context: Context,
  path: readonly string[] = ["test", "procedure"]
) => call(proc, undefined, { context, path });

describe("rateLimit", () => {
  it("counts in-process when redis.client() returns null", async () => {
    redisMock.client.mockReturnValue(null);
    const proc = procedure({ limit: 1, window: 60 });
    const context = makeContext({ ip: "203.0.113.7" });

    await expect(callAt(proc, context)).resolves.toBe("reached");
    const error = await caught(callAt(proc, context));
    expect(error).toBeInstanceOf(ORPCError);
  });

  it("lets an unattributable caller through uncounted", async () => {
    redisMock.client.mockReturnValue(createFakeRedis());
    const proc = procedure({ limit: 1, window: 60 });
    const context = makeContext();

    await expect(callAt(proc, context)).resolves.toBe("reached");
    await expect(callAt(proc, context)).resolves.toBe("reached");
  });

  it("allows exactly `limit` calls, counted in Redis", async () => {
    const fake = createFakeRedis();
    redisMock.client.mockReturnValue(fake);
    const proc = procedure({ limit: 2, window: 60 });
    const context = makeContext({ ip: "203.0.113.7" });

    await expect(callAt(proc, context)).resolves.toBe("reached");
    await expect(callAt(proc, context)).resolves.toBe("reached");
    expect(fake.store.get("rl:test.procedure:ip:203.0.113.7")?.value).toBe("2");
  });

  it("throws ORPCError TOO_MANY_REQUESTS on the (limit + 1)th call", async () => {
    redisMock.client.mockReturnValue(createFakeRedis());
    const proc = procedure({ limit: 2, window: 60 });
    const context = makeContext({ ip: "203.0.113.7" });

    await callAt(proc, context);
    await callAt(proc, context);
    const error = await caught(callAt(proc, context));

    expect(error).toBeInstanceOf(ORPCError);
    if (error instanceof ORPCError) {
      expect(error.code).toBe("TOO_MANY_REQUESTS");
    }
  });

  it("gives two identities independent buckets", async () => {
    redisMock.client.mockReturnValue(createFakeRedis());
    const proc = procedure({ limit: 1, window: 60 });
    const first = makeContext({ ip: "203.0.113.7" });
    const second = makeContext({ ip: "198.51.100.9" });

    await expect(callAt(proc, first)).resolves.toBe("reached");
    // Second identity has not used its budget yet, even though the first has.
    await expect(callAt(proc, second)).resolves.toBe("reached");

    const error = await caught(callAt(proc, first));
    expect(error).toBeInstanceOf(ORPCError);
  });

  it("gives two procedure paths independent buckets", async () => {
    redisMock.client.mockReturnValue(createFakeRedis());
    const proc = procedure({ limit: 1, window: 60 });
    const context = makeContext({ ip: "203.0.113.7" });

    await expect(callAt(proc, context, ["procedureA"])).resolves.toBe(
      "reached"
    );
    // Same identity, different procedure path — separate budget.
    await expect(callAt(proc, context, ["procedureB"])).resolves.toBe(
      "reached"
    );

    const error = await caught(callAt(proc, context, ["procedureA"]));
    expect(error).toBeInstanceOf(ORPCError);
  });

  it("lets a custom `key` override the default session/IP identity", async () => {
    redisMock.client.mockReturnValue(createFakeRedis());
    const proc = procedure({ key: () => "shared-key", limit: 1, window: 60 });
    // Two contexts that would otherwise be independent identities...
    const first = makeContext({ ip: "203.0.113.7" });
    const second = makeContext({ ip: "198.51.100.9" });

    await expect(callAt(proc, first)).resolves.toBe("reached");
    // ...share one bucket once `key` pins them to the same identity.
    const error = await caught(callAt(proc, second));
    expect(error).toBeInstanceOf(ORPCError);
  });

  it("counts in-process when the increment itself throws", async () => {
    const fake = createFakeRedis();
    fake.failNext(2);
    redisMock.client.mockReturnValue(fake);
    const proc = procedure({ limit: 1, window: 60 });
    const context = makeContext({ ip: "203.0.113.7" });

    await expect(callAt(proc, context)).resolves.toBe("reached");
    const error = await caught(callAt(proc, context));
    expect(error).toBeInstanceOf(ORPCError);
  });
});
