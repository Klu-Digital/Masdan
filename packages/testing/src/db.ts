import { createDb } from "@masdan/db";
import type { Database } from "@masdan/db";
import { Pool } from "pg";

let pool: Pool | undefined;
let db: Database | undefined;

/** Comma-joined quoted table list for `TRUNCATE`; `undefined` = not discovered. */
let cachedTableList: string | undefined;

/** pg-boss job table, `""` when not installed, `undefined` = not discovered. */
let cachedQueueTable: string | undefined;

/**
 * Reads `process.env.DATABASE_URL` at call time: `setup/db.ts` sets it per
 * worker, possibly after this module was imported.
 */
export const getTestPool = (): Pool => {
  if (!pool) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
  }
  return pool;
};

/** Lazily creates and memoises a `Database` bound to {@link getTestPool}. */
export const getTestDb = (): Database => {
  if (!db) {
    db = createDb(getTestPool());
  }
  return db;
};

/**
 * Seeded by a migration and shared by every test, the same way pg-boss's
 * `queue` and `schedule` are: reference rows are schema, not fixtures, and
 * truncating them breaks the `organization.default_currency` foreign key for
 * every test that signs a user up.
 */
const REFERENCE_TABLES = ["currency"];

/**
 * Only the job table. `queue` and `schedule` are schema-shaped rather than
 * data, and every test needs them.
 */
const truncateQueueJobs = async (client: Pool): Promise<void> => {
  if (cachedQueueTable === undefined) {
    const schema = process.env.PGBOSS_SCHEMA ?? "pgboss";
    // to_regclass returns null rather than throwing, so this doubles as the
    // "is pg-boss installed at all?" probe.
    const result = await client.query<{ reg: string | null }>(
      "SELECT to_regclass($1) AS reg",
      [`${schema}.job`]
    );
    cachedQueueTable = result.rows[0]?.reg ? `"${schema}".job` : "";
  }

  if (!cachedQueueTable) {
    return;
  }

  await client.query(`TRUNCATE ${cachedQueueTable} CASCADE`);
};

/**
 * Truncates every `public` table — drizzle's migration bookkeeping lives in its
 * own schema — plus pg-boss's jobs, which the `public`-only discovery misses.
 * Quoting goes through Postgres's own `format('%I', ...)` so reserved words
 * like `"user"` come out right. {@link REFERENCE_TABLES} is held back.
 */
export const truncateAll = async (): Promise<void> => {
  const client = getTestPool();

  if (cachedTableList === undefined) {
    const result = await client.query<{ tables: string | null }>(
      `SELECT string_agg(format('%I', tablename), ', ') AS tables
       FROM pg_tables WHERE schemaname = 'public' AND tablename <> ALL($1)`,
      [REFERENCE_TABLES]
    );
    cachedTableList = result.rows[0]?.tables ?? "";
  }

  if (cachedTableList) {
    await client.query(`TRUNCATE ${cachedTableList} RESTART IDENTITY CASCADE`);
  }

  await truncateQueueJobs(client);
};

/** Ends the pool and clears every memoised value. */
export const closeTestPool = async (): Promise<void> => {
  if (pool) {
    await pool.end();
  }
  pool = undefined;
  db = undefined;
  cachedTableList = undefined;
  cachedQueueTable = undefined;
};
