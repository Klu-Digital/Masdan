import { user } from "@masdan/db/schema/auth";
import { env } from "@masdan/env/shared-server";
import { getTestDb } from "@masdan/testing";
import { getTestRedis } from "@masdan/testing/redis";
import { describe, expect, it } from "vite-plus/test";

// Regression test for the module-load ordering bug in `setup/db.ts`: a static
// `@masdan/*` import there used to freeze `@masdan/env/shared-server` against the
// placeholder DATABASE_URL, so every test ran against `127.0.0.1:1`. Same for
// REDIS_URL.
describe("test harness module-load ordering", () => {
  it("resolves @masdan/env/shared-server's env.DATABASE_URL to this worker's real database URL", () => {
    expect(env.DATABASE_URL).toBe(process.env.DATABASE_URL);
  });

  it("resolves @masdan/env/shared-server's env.REDIS_URL to this worker's real Redis URL", () => {
    expect(env.REDIS_URL).toBe(process.env.REDIS_URL);
  });

  it("points at a per-worker database, never the template or the dev database", () => {
    expect(env.DATABASE_URL).toContain("masdan_test_w");
    // The dev database on :4400 holds real data; the suite must never reach it.
    expect(env.DATABASE_URL).not.toContain("4400");
  });

  it("points at a per-worker Redis logical database, never database 0", () => {
    const url = new URL(String(env.REDIS_URL));
    // Worker ids start at 1, so landing on database 0 means the id was lost.
    expect(url.pathname).toBe(`/${process.env.VITEST_POOL_ID ?? "1"}`);
    expect(url.pathname).not.toBe("/0");
  });
});

// These two pass in this order only if `beforeEach(truncateAll)` actually runs
// between them — the isolation `setup/db.ts` promises, proven rather than assumed.
describe("truncateAll isolation between tests", () => {
  it("inserts a row into the user table", async () => {
    const db = getTestDb();

    await db
      .insert(user)
      .values({ email: "harness@example.com", name: "Harness User" });

    const rows = await db.select().from(user);
    expect(rows).toHaveLength(1);
  });

  it("starts with an empty user table, proving truncateAll ran before this test", async () => {
    const db = getTestDb();

    const rows = await db.select().from(user);
    expect(rows).toHaveLength(0);
  });
});

// The same proof, for `beforeEach(flushTestRedis)`.
describe("flushTestRedis isolation between tests", () => {
  it("writes a key into this worker's Redis database", async () => {
    const redis = getTestRedis();

    await redis.set("harness-probe", "1");

    expect(await redis.get("harness-probe")).toBe("1");
  });

  it("starts with no probe key, proving flushTestRedis ran before this test", async () => {
    const redis = getTestRedis();

    expect(await redis.get("harness-probe")).toBeNull();
  });
});
