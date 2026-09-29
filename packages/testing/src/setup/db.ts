/**
 * Points `process.env.DATABASE_URL` / `REDIS_URL` at this worker's own Postgres
 * database and Redis logical database, before any "db" project test file loads
 * `@masdan/*`. Keep the static imports here limited to `pg`, `vite-plus/test` and
 * `./env`: static imports evaluate first, so anything reaching
 * `@masdan/env/shared-server` freezes its `env` against the dead placeholders for the
 * rest of the worker's life. Load `@masdan/*` with a dynamic `import()` below —
 * and at the top level, since `beforeAll` runs after the module graph has
 * resolved.
 */
import "./env";
import { Client } from "pg";
import { afterAll, beforeEach, inject } from "vite-plus/test";

const base = inject("postgresUri");

// One database per Vitest worker so test files parallelise without sharing state.
const workerDbName = `masdan_test_w${process.env.VITEST_POOL_ID ?? "1"}`;

const maintenanceUrl = new URL(base);
maintenanceUrl.pathname = "/postgres";

const maintenanceClient = new Client({
  connectionString: maintenanceUrl.toString(),
});
await maintenanceClient.connect();

try {
  const existing = await maintenanceClient.query(
    "SELECT 1 FROM pg_database WHERE datname = $1",
    [workerDbName]
  );

  if (existing.rows.length === 0) {
    try {
      await maintenanceClient.query(
        `CREATE DATABASE "${workerDbName}" TEMPLATE masdan_template`
      );
    } catch (error) {
      // Setup files run once per test FILE, not per worker, so two files can race
      // to create this database. `42P04` is `duplicate_database` — it already exists.
      const code =
        error && typeof error === "object" && "code" in error
          ? error.code
          : undefined;
      if (code !== "42P04") {
        throw error;
      }
    }
  }
} finally {
  await maintenanceClient.end();
}

const workerUrl = new URL(base);
workerUrl.pathname = `/${workerDbName}`;
process.env.DATABASE_URL = workerUrl.toString();

// One numbered Redis logical database per worker. Ids start at 1, so an
// accidental default-database connection is obvious. Kept in sync with
// setup/global-redis.ts by hand.
const REDIS_TEST_DATABASES = 64;
const poolId = Number(process.env.VITEST_POOL_ID ?? "1");
if (!Number.isInteger(poolId) || poolId < 1 || poolId >= REDIS_TEST_DATABASES) {
  throw new Error(
    `VITEST_POOL_ID ${poolId} has no Redis logical database. The test container is ` +
      `started with --databases ${REDIS_TEST_DATABASES} in setup/global-redis.ts; ` +
      `raise that flag (in both places) or cap --maxWorkers.`
  );
}
const redisWorkerUrl = new URL(inject("redisUri"));
redisWorkerUrl.pathname = `/${poolId}`;
process.env.REDIS_URL = redisWorkerUrl.toString();

// Safe to touch `@masdan/*` only now — and only dynamically; see the file header.
const { truncateAll, closeTestPool } = await import("../db");
const { flushTestRedis, closeTestRedis } = await import("../redis");

// Fail loudly if a static `@masdan/*` import creeps back in. Every Redis-backed
// path degrades quietly, so a frozen `undefined` REDIS_URL throws nothing — the
// suite just goes green while covering nothing.
const { env } = await import("@masdan/env/shared-server");
if (
  env.DATABASE_URL !== process.env.DATABASE_URL ||
  env.REDIS_URL !== process.env.REDIS_URL
) {
  throw new Error(
    `Module-load-ordering regression in packages/testing/src/setup/db.ts: frozen ` +
      `env.DATABASE_URL (${JSON.stringify(env.DATABASE_URL)}) / env.REDIS_URL ` +
      `(${JSON.stringify(env.REDIS_URL)}) does not match process.env ` +
      `(${JSON.stringify(process.env.DATABASE_URL)} / ` +
      `${JSON.stringify(process.env.REDIS_URL)}). Something in this file's module ` +
      `graph reached @masdan/env/shared-server statically, before the assignments above. ` +
      `Make it a dynamic \`await import(...)\`.`
  );
}

beforeEach(truncateAll);
beforeEach(flushTestRedis);

afterAll(closeTestPool);
afterAll(closeTestRedis);
