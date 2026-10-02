import { createDb } from "@masdan/db";
import type { Database } from "@masdan/db";
import { Pool } from "pg";

let pool: Pool | undefined;
let db: Database | undefined;

/** Comma-joined quoted table list for `TRUNCATE`; `undefined` = not discovered. */
let cachedTableList: string | undefined;

/** pg-boss job table, `""` when not installed, `undefined` = not discovered. */
let cachedQueueTable: string | undefined;

// Read at call time: `setup/db.ts` sets it per worker after import.
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

// Truncating these breaks `organization.default_currency` for every sign-up.
const REFERENCE_TABLES = [
  "currency",
  "financial_institution",
  "interest_product",
  "interest_rate_schedule",
];

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

// pg-boss's jobs live outside `public`, so they are truncated separately.
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
