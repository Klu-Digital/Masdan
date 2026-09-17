import os from "node:os";
import { setTimeout as sleep } from "node:timers/promises";

import { log } from "@masdan/observability";
import { eq, sql, TransactionRollbackError } from "drizzle-orm";
import type { Pool, PoolClient } from "pg";

import { createDb, createPool } from "../../index";
import type { Database } from "../../index";
import { postMigration } from "../../schema/post-migration";
import type { PostMigrationLogger } from "./define";
import { discoverPostMigrations } from "./discover";
import type { DiscoveredPostMigration } from "./discover";

export interface RunOptions {
  /** Execute everything, then roll back (or skip writing tracking rows) instead of keeping it. */
  dryRun?: boolean;
  /** Run a single named script, ignoring pending/applied status unless combined with `force`. */
  only?: string;
  /** Re-run a script that already succeeded. Requires `only` — never applies to a whole run. */
  force?: boolean;
  /** Proceed past a checksum mismatch on an already-applied script instead of aborting. */
  allowModified?: boolean;
  /** How long to wait for the advisory lock before giving up. Default 30_000. */
  lockTimeoutMs?: number;
}

export interface StatusRow {
  name: string;
  description: string;
  status: "success" | "failed" | "running" | "pending";
  startedAt: Date | null;
  durationMs: number | null;
}

/**
 * Fixed `pg_try_advisory_lock` key, so two runs cannot double-apply a backfill.
 */
const ADVISORY_LOCK_KEY = 894_201_736;

type Queryable = Pick<Database, "insert" | "update">;

const formatError = (error: unknown): string => {
  if (error instanceof Error) {
    return error.stack ?? error.message;
  }
  return String(error);
};

const getAppliedBy = (): string => {
  try {
    return `${os.userInfo().username}@${os.hostname()}`;
  } catch {
    return "unknown";
  }
};

const createScriptLogger = (name: string): PostMigrationLogger => {
  const event = (
    fields: Record<string, unknown> | undefined,
    message: string
  ) => ({
    message,
    script: name,
    ...fields,
  });
  return {
    debug: (message, fields) => log.debug(event(fields, message)),
    error: (message, fields) => log.error(event(fields, message)),
    info: (message, fields) => log.info(event(fields, message)),
    warn: (message, fields) => log.warn(event(fields, message)),
  };
};

const checkDrift = (
  d: DiscoveredPostMigration,
  appliedChecksum: string,
  allowModified?: boolean
): void => {
  if (appliedChecksum === d.checksum || allowModified) {
    return;
  }
  throw new Error(
    `post-migration-scripts/${d.name}.ts has changed since it ran successfully ` +
      `(recorded ${appliedChecksum.slice(0, 12)}, now ${d.checksum.slice(0, 12)}). ` +
      `Editing an applied script is almost always a mistake — write a new one instead. ` +
      `If this edit is intentional, re-run with --allow-modified.`
  );
};

const ensureTrackingTableExists = async (db: Database): Promise<void> => {
  const result = await db.execute<{ reg: string | null }>(
    sql`select to_regclass('public.post_migration') as reg`
  );
  if (!result.rows[0]?.reg) {
    throw new Error(
      `"post_migration" table not found — run "pnpm db:migrate" first.`
    );
  }
};

const loadAppliedChecksums = async (
  db: Database
): Promise<Map<string, string>> => {
  const rows = await db
    .select({ checksum: postMigration.checksum, name: postMigration.name })
    .from(postMigration)
    .where(eq(postMigration.status, "success"));
  return new Map(rows.map((row) => [row.name, row.checksum]));
};

const selectTargets = (
  discovered: DiscoveredPostMigration[],
  applied: Map<string, string>,
  options: RunOptions
): DiscoveredPostMigration[] => {
  if (options.only) {
    const target = discovered.find((d) => d.name === options.only);
    if (!target) {
      throw new Error(
        `No post-migration named "${options.only}" in post-migration-scripts/.`
      );
    }
    const appliedChecksum = applied.get(target.name);
    if (appliedChecksum !== undefined) {
      if (!options.force) {
        throw new Error(
          `"${target.name}" has already run. Pass --force to re-run it.`
        );
      }
      checkDrift(target, appliedChecksum, options.allowModified);
    }
    return [target];
  }

  if (options.force) {
    throw new Error(
      "--force requires --only <name> — it never blanket re-runs every script."
    );
  }

  const pending: DiscoveredPostMigration[] = [];
  for (const d of discovered) {
    const appliedChecksum = applied.get(d.name);
    if (appliedChecksum !== undefined) {
      checkDrift(d, appliedChecksum, options.allowModified);
      continue;
    }
    pending.push(d);
  }
  return pending;
};

const upsertRunning = async (
  db: Queryable,
  d: DiscoveredPostMigration,
  appliedBy: string,
  startedAt: Date
): Promise<void> => {
  await db
    .insert(postMigration)
    .values({
      appliedBy,
      checksum: d.checksum,
      description: d.definition.description,
      name: d.name,
      startedAt,
      status: "running",
    })
    .onConflictDoUpdate({
      set: {
        appliedBy,
        checksum: d.checksum,
        description: d.definition.description,
        durationMs: null,
        error: null,
        finishedAt: null,
        startedAt,
        status: "running",
      },
      target: postMigration.name,
    });
};

const finalizeRow = async (
  db: Queryable,
  name: string,
  status: "success" | "failed",
  startedAt: Date,
  error?: unknown
): Promise<void> => {
  const finishedAt = new Date();
  await db
    .update(postMigration)
    .set({
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      error: error ? formatError(error) : null,
      finishedAt,
      status,
    })
    .where(eq(postMigration.name, name));
};

const recordFailure = async (
  pool: Pool,
  d: DiscoveredPostMigration,
  appliedBy: string,
  startedAt: Date,
  error: unknown
): Promise<void> => {
  const db = createDb(pool);
  await upsertRunning(db, d, appliedBy, startedAt);
  await finalizeRow(db, d.name, "failed", startedAt, error);
};

const runOne = async (
  pool: Pool,
  d: DiscoveredPostMigration,
  options: RunOptions
): Promise<"applied" | "dry-run"> => {
  const { definition } = d;
  const useTransaction = definition.transaction ?? true;
  const timeoutMs = definition.timeoutMs ?? 300_000;
  const dryRun = !!options.dryRun;
  const appliedBy = getAppliedBy();
  const startedAt = new Date();
  const scriptLog = createScriptLogger(d.name);

  if (useTransaction) {
    const scopedDb = createDb(pool);
    try {
      await scopedDb.transaction(async (tx) => {
        await tx.execute(sql.raw(`set local statement_timeout = ${timeoutMs}`));
        if (!dryRun) {
          await upsertRunning(tx, d, appliedBy, startedAt);
        }
        await definition.up({
          db: tx as unknown as Database,
          dryRun,
          log: scriptLog,
          sql,
        });
        if (dryRun) {
          tx.rollback();
        }
        await finalizeRow(tx, d.name, "success", startedAt);
      });
      return dryRun ? "dry-run" : "applied";
    } catch (error) {
      if (error instanceof TransactionRollbackError) {
        return "dry-run";
      }
      // Drizzle already rolled back the transaction, "running" row included, so
      // the failure record has to be a separate write on its own connection.
      if (!dryRun) {
        await recordFailure(pool, d, appliedBy, startedAt, error);
      }
      throw error;
    }
  }

  // transaction: false — no BEGIN/COMMIT, no automatic rollback. The script must
  // honor `dryRun` itself; the runner only guarantees no tracking row is written.
  const db = createDb(pool);
  try {
    if (!dryRun) {
      await upsertRunning(db, d, appliedBy, startedAt);
    }
    await definition.up({ db, dryRun, log: scriptLog, sql });
    if (!dryRun) {
      await finalizeRow(db, d.name, "success", startedAt);
    }
    return dryRun ? "dry-run" : "applied";
  } catch (error) {
    if (!dryRun) {
      await finalizeRow(db, d.name, "failed", startedAt, error);
    }
    throw error;
  }
};

const acquireLock = async (
  pool: Pool,
  timeoutMs: number
): Promise<PoolClient> => {
  const client = await pool.connect();
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const { rows } = await client.query<{ locked: boolean }>(
      "select pg_try_advisory_lock($1) as locked",
      [ADVISORY_LOCK_KEY]
    );
    if (rows[0]?.locked) {
      return client;
    }
    if (Date.now() >= deadline) {
      client.release();
      throw new Error(
        `Could not acquire the post-migration lock within ${timeoutMs}ms — another run is probably in progress.`
      );
    }
    await sleep(500);
  }
};

const releaseLock = async (client: PoolClient): Promise<void> => {
  try {
    await client.query("select pg_advisory_unlock($1)", [ADVISORY_LOCK_KEY]);
  } finally {
    client.release();
  }
};

/** Runs every pending post-migration in order, stopping at the first failure. */
export const runPostMigrations = async (
  options: RunOptions = {}
): Promise<0 | 1> => {
  const pool = createPool();
  try {
    const db = createDb(pool);
    await ensureTrackingTableExists(db);

    const discovered = await discoverPostMigrations();
    const applied = await loadAppliedChecksums(db);
    const targets = selectTargets(discovered, applied, options);

    if (targets.length === 0) {
      log.info({ message: "no pending post-migrations" });
      return 0;
    }

    const lockClient = await acquireLock(pool, options.lockTimeoutMs ?? 30_000);
    try {
      for (const target of targets) {
        log.info({
          dryRun: !!options.dryRun,
          message: `running ${target.name}`,
          script: target.name,
        });
        try {
          const outcome = await runOne(pool, target, options);
          log.info({
            message: `${outcome}: ${target.name}`,
            outcome,
            script: target.name,
          });
        } catch (error) {
          log.error({
            error: formatError(error),
            message: `failed: ${target.name}`,
            script: target.name,
          });
          throw error;
        }
      }
    } finally {
      await releaseLock(lockClient);
    }
    return 0;
  } catch (error) {
    console.error(error);
    return 1;
  } finally {
    await pool.end();
  }
};

/** Merges the scripts on disk with their recorded state, for `pnpm db:post-migrate:status`. */
export const getStatusReport = async (): Promise<StatusRow[]> => {
  const pool = createPool();
  try {
    const db = createDb(pool);
    await ensureTrackingTableExists(db);

    const [discovered, rows] = await Promise.all([
      discoverPostMigrations(),
      db.select().from(postMigration),
    ]);
    const byName = new Map(rows.map((row) => [row.name, row]));

    return discovered.map((d): StatusRow => {
      const row = byName.get(d.name);
      return {
        description: d.definition.description,
        durationMs: row?.durationMs ?? null,
        name: d.name,
        startedAt: row?.startedAt ?? null,
        status: (row?.status as StatusRow["status"]) ?? "pending",
      };
    });
  } finally {
    await pool.end();
  }
};
