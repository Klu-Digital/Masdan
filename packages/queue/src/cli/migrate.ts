#!/usr/bin/env node
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import dotenv from "dotenv";

const execFileAsync = promisify(execFile);

const USAGE = `Usage:
  pnpm queue:migrate [migrate|create|version|doctor|plans|rollback]

Applies pg-boss's own schema migrations. Defaults to "migrate", which creates the
schema if it does not exist. Runs as part of "pnpm db:deploy"; the app processes
themselves boot with migrate/createSchema disabled and never issue DDL.
`;

const COMMANDS = [
  "migrate",
  "create",
  "version",
  "doctor",
  "plans",
  "rollback",
] as const;

/**
 * Must finish before `@masdan/env/shared-server` is imported below: t3-env freezes `env`
 * at module load.
 */
const loadEnv = (): void => {
  const here = import.meta.dirname;
  const repoRoot = path.resolve(here, "../../../..");
  dotenv.config({
    override: false,
    path: path.join(repoRoot, "apps/server/.env"),
    quiet: true,
  });
};

loadEnv();

const argv = process.argv.slice(2);
// Both `pnpm run` and `vp run` forward the "--" literally rather than stripping
// it — see packages/db/src/dev-scripts/post-migrate/cli.ts.
while (argv[0] === "--") {
  argv.shift();
}

if (argv[0] === "--help" || argv[0] === "-h") {
  console.log(USAGE);
  process.exit(0);
}

const command = argv[0] ?? "migrate";

if (!(COMMANDS as readonly string[]).includes(command)) {
  console.error(`Unknown command "${command}".\n\n${USAGE}`);
  process.exit(1);
}

const { env } = await import("@masdan/env/shared-server");

try {
  const { stdout, stderr } = await execFileAsync(
    "pnpm",
    ["exec", "pg-boss", ...(argv.length ? argv : [command])],
    {
      // Resolves the `pg-boss` bin from this package's own node_modules.
      cwd: path.resolve(import.meta.dirname, "../.."),
      env: {
        ...process.env,
        PGBOSS_DATABASE_URL: env.DATABASE_URL,
        PGBOSS_SCHEMA: env.PGBOSS_SCHEMA,
      },
    }
  );
  if (stdout) {
    process.stdout.write(stdout);
  }
  if (stderr) {
    process.stderr.write(stderr);
  }
} catch (error) {
  const stdout =
    error && typeof error === "object" && "stdout" in error ? error.stdout : "";
  const stderr =
    error && typeof error === "object" && "stderr" in error ? error.stderr : "";
  console.error(
    `pg-boss ${command} failed.\n--- stdout ---\n${String(stdout)}\n--- stderr ---\n${String(stderr)}`
  );
  process.exit(1);
}
