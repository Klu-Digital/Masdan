#!/usr/bin/env node
import { parseArgs } from "node:util";

import { sql } from "drizzle-orm";

// See dev-scripts/bootstrap.ts for why this is a call rather than a
// side-effecting import, and why the modules below are dynamically imported.
import { loadEnv, runLifecycle } from "../bootstrap";

const USAGE = `Usage:
  pnpm db:purge --yes [--schema <name>]

Drops and recreates the "<schema>" (default "public") and "drizzle" schemas
— every table and row in the database is gone. There is no undo. For local
resets only; refuses to run when NODE_ENV is "production". After purging,
run "pnpm db:migrate" to rebuild the schema from scratch.
`;

const main = async (): Promise<void> => {
  loadEnv();

  const argv = process.argv.slice(2);
  // Both `pnpm run` and `vp run` forward the "--" literally.
  while (argv[0] === "--") {
    argv.shift();
  }

  const { values } = parseArgs({
    args: argv,
    options: {
      // Override if the app's tables don't live in the "public" schema.
      schema: { default: "public", type: "string" },
      yes: { default: false, type: "boolean" },
    },
  });

  if (!values.yes) {
    console.error(USAGE);
    process.exitCode = 1;
    return;
  }

  const { env } = await import("@k22i/env/shared-server");
  if (env.NODE_ENV === "production") {
    console.error(
      'Refusing to purge: NODE_ENV is "production". This tool has no production use case.'
    );
    process.exitCode = 1;
    return;
  }

  const { createDb, createPool } = await import("../../index");
  const pool = createPool();

  await runLifecycle(
    async () => {
      const db = createDb(pool);
      const schemaName = values.schema;

      const queueSchema = env.PGBOSS_SCHEMA;

      console.log(
        `Purging database: dropping and recreating "${schemaName}", "drizzle" and "${queueSchema}"...`
      );
      await db.execute(
        sql`DROP SCHEMA IF EXISTS ${sql.identifier(schemaName)} CASCADE`
      );
      await db.execute(
        sql`CREATE SCHEMA IF NOT EXISTS ${sql.identifier(schemaName)}`
      );
      await db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`);
      await db.execute(sql`CREATE SCHEMA IF NOT EXISTS drizzle`);
      // Dropped, not recreated — `pnpm queue:migrate` reinstalls it. Left behind,
      // its jobs reference rows that no longer exist and fail one by one.
      await db.execute(
        sql`DROP SCHEMA IF EXISTS ${sql.identifier(queueSchema)} CASCADE`
      );
      console.log("Done. Run `pnpm db:deploy` to rebuild the schema.");

      return 0;
    },
    () => pool.end()
  );
};

main();
