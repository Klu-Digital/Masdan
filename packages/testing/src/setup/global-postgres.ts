import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { PostgreSqlContainer } from "@testcontainers/postgresql";
import type { TestProject } from "vite-plus/test/node";

const execFileAsync = promisify(execFile);

/** Resolved relative to this file rather than hardcoded. */
const dbPackageDir = fileURLToPath(new URL("../../../db", import.meta.url));

/** Owns the `pg-boss` bin the schema install below runs. */
const queuePackageDir = fileURLToPath(
  new URL("../../../queue", import.meta.url)
);

declare module "vite-plus/test" {
  interface ProvidedContext {
    postgresUri: string;
  }
}

/**
 * Starts one postgres container per `vp test` invocation and migrates it into a
 * template database; `setup/db.ts` clones a database off the template per
 * worker.
 */
export default async function setup(
  project: TestProject
): Promise<() => Promise<void>> {
  // Postgres 18 is mandatory: every id column defaults to `uuidv7()`, a native
  // PG18 function with no extension polyfill.
  const container = await new PostgreSqlContainer("postgres:18")
    .withDatabase("masdan_template")
    // Per-run on purpose (no .withReuse()), pairing with the unconditional stop()
    // below. For reuse: TESTCONTAINERS_REUSE_ENABLE=true and a conditional teardown.
    .start();

  const uri = container.getConnectionUri();

  // drizzle-kit rather than drizzle-orm's programmatic `migrate()`: the migrations
  // use v1's folder-per-migration layout, with no `meta/_journal.json` to read.
  try {
    await execFileAsync("pnpm", ["exec", "drizzle-kit", "migrate"], {
      cwd: dbPackageDir,
      env: { ...process.env, DATABASE_URL: uri },
    });
  } catch (error) {
    const stdout =
      error && typeof error === "object" && "stdout" in error
        ? error.stdout
        : "";
    const stderr =
      error && typeof error === "object" && "stderr" in error
        ? error.stderr
        : "";
    throw new Error(
      `Failed to migrate the postgres test template database via drizzle-kit (cwd: ${dbPackageDir}).\n` +
        `--- stdout ---\n${String(stdout)}\n--- stderr ---\n${String(stderr)}`,
      { cause: error }
    );
  }

  // Into the template, so every clone has it. On demand via `queue.start()` would
  // race N workers to install the same schema, and production issues no DDL either.
  try {
    await execFileAsync("pnpm", ["exec", "pg-boss", "migrate"], {
      cwd: queuePackageDir,
      env: {
        ...process.env,
        PGBOSS_DATABASE_URL: uri,
        PGBOSS_SCHEMA: process.env.PGBOSS_SCHEMA ?? "pgboss",
      },
    });
  } catch (error) {
    const stdout =
      error && typeof error === "object" && "stdout" in error
        ? error.stdout
        : "";
    const stderr =
      error && typeof error === "object" && "stderr" in error
        ? error.stderr
        : "";
    throw new Error(
      `Failed to install the pg-boss schema into the postgres test template database (cwd: ${queuePackageDir}).\n` +
        `--- stdout ---\n${String(stdout)}\n--- stderr ---\n${String(stderr)}`,
      { cause: error }
    );
  }

  project.provide("postgresUri", uri);

  return async () => {
    await container.stop();
  };
}
