#!/usr/bin/env node
import { parseArgs } from "node:util";

// See bootstrap.ts: this must run before the `await import(...)`s below,
// `@masdan/auth` included — it reads validated env at module scope.
import { loadEnv, runLifecycle } from "../bootstrap";

const USAGE = `Usage:
  pnpm db:seed [--users <n>] [--seed <n>] [--dry-run]

  --users <n>   random users to generate on top of the fixed ones (default 5)
  --seed <n>    faker seed, for reproducible output (default 22)
  --dry-run     plan and check for conflicts, then stop without writing

Every seeded email is checked against the database first. If any already
exist, nothing is written — see packages/db/src/dev-scripts/seed/README.md.
`;

const main = async (): Promise<void> => {
  loadEnv();

  const argv = process.argv.slice(2);
  // Both `pnpm run` and `vp run` forward the literal "--" instead of stripping
  // it.
  while (argv[0] === "--") {
    argv.shift();
  }

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(USAGE);
    return;
  }

  const { values } = parseArgs({
    args: argv,
    options: {
      "dry-run": { default: false, type: "boolean" },
      seed: { default: "22", type: "string" },
      users: { default: "5", type: "string" },
    },
  });

  const userCount = Number(values.users);
  const seed = Number(values.seed);
  if (
    !Number.isInteger(userCount) ||
    userCount < 0 ||
    !Number.isInteger(seed)
  ) {
    console.error(USAGE);
    process.exitCode = 1;
    return;
  }

  const { env } = await import("@masdan/env/shared-server");
  if (env.NODE_ENV === "production") {
    console.error(
      'Refusing to seed: NODE_ENV is "production". This tool has no production use case.'
    );
    process.exitCode = 1;
    return;
  }

  const { createPool } = await import("../../index");
  const { runSeed } = await import("./runner");
  const pool = createPool();

  await runLifecycle(
    () => runSeed(pool, { dryRun: values["dry-run"], seed, userCount }),
    () => pool.end()
  );
};

main();
