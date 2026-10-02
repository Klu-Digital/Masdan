import type { sql } from "drizzle-orm";

import type { Database } from "../../index";

/** What a script's `up()` gets for logging. Pre-tagged with the script's own name. */
export interface PostMigrationLogger {
  info: (message: string, fields?: Record<string, unknown>) => void;
  warn: (message: string, fields?: Record<string, unknown>) => void;
  error: (message: string, fields?: Record<string, unknown>) => void;
  debug: (message: string, fields?: Record<string, unknown>) => void;
}

export interface PostMigrationContext {
  /** By default a live transaction — every write in `up` commits, or none do. */
  db: Database;
  /** Re-exported so raw statements need no second import. */
  sql: typeof sql;
  log: PostMigrationLogger;
  /** True under `--dry-run`. A script with `transaction: false` must check it. */
  dryRun: boolean;
}

export interface PostMigrationDefinition {
  /** Shown by `pnpm db:post-migrate:status`; also seeds the scaffold's field. */
  description: string;
  /** The work. Throw to fail the run — a transactional script rolls back automatically. */
  up: (ctx: PostMigrationContext) => Promise<void>;
  /** Default `true`. `false` for `CREATE INDEX CONCURRENTLY` or self-batching. */
  transaction?: boolean;
  /** `statement_timeout` for the run, in ms. Default 300_000 (5 minutes). */
  timeoutMs?: number;
}

/** Identity function, so a script types `ctx` without importing anything else. */
export const definePostMigration = (
  definition: PostMigrationDefinition
): PostMigrationDefinition => definition;
