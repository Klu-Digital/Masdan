// Production entry: migrates the database, then starts the server.
import path from "node:path";

// Must load before @masdan/db, hence the dynamic imports below.
import { log, observability, parseError } from "@masdan/observability";
import { migrateQueueSchema } from "@masdan/queue";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import postMigrationScripts from "virtual:post-migration-scripts";

const migrationsFolder = path.resolve(import.meta.dirname, "../migrations");

const { createDb, createPool } = await import("@masdan/db");
const { runPostMigrations } =
  await import("@masdan/db/dev-scripts/post-migrate/runner");

try {
  const pool = createPool({ max: 1 });
  try {
    await migrate(createDb(pool), { migrationsFolder });
  } finally {
    await pool.end();
  }
  await migrateQueueSchema();
  log.info({ action: "server.migrated" });
} catch (error) {
  log.error({ action: "server.migrate_failed", ...parseError(error) });
  await observability.flush();
  process.exit(1);
}

await import("./index");

// Not awaited, so a long backfill doesn't hold the healthcheck.
void (async () => {
  const outcome = await runPostMigrations({}, () =>
    Promise.resolve(postMigrationScripts)
  );
  if (outcome !== 0) {
    log.error({ action: "server.post_migrate_failed" });
  }
})();
