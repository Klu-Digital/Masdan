#!/usr/bin/env node
import path from "node:path";
import { parseArgs } from "node:util";

// Must run before the imports below: they read env at module scope.
import { loadEnv, runLifecycle } from "../bootstrap";
// Type-only, so it is erased and carries none of that ordering risk.
import type { StatusRow } from "./runner";

const USAGE = `Usage:
  pnpm db:post-migrate [run] [--dry-run] [--only <name>] [--force] [--allow-modified] [--lock-timeout <ms>]
  pnpm db:post-migrate status
  pnpm db:post-migrate new "<description>"
`;

const COMMANDS = ["run", "status", "new"] as const;

const printStatusTable = (rows: StatusRow[]): void => {
  if (rows.length === 0) {
    console.log(
      "No post-migrations found in packages/db/src/post-migration-scripts/."
    );
    return;
  }

  const header = ["NAME", "STATUS", "STARTED", "DURATION", "DESCRIPTION"];
  const data = rows.map((row) => [
    row.name,
    row.status,
    row.startedAt ? row.startedAt.toISOString() : "-",
    row.durationMs === null ? "-" : `${row.durationMs}ms`,
    row.description,
  ]);

  const widths = header.map((title, col) =>
    Math.max(title.length, ...data.map((row) => (row[col] ?? "").length))
  );
  const printRow = (cells: string[]) =>
    console.log(cells.map((cell, i) => cell.padEnd(widths[i] ?? 0)).join("  "));

  printRow(header);
  printRow(widths.map((width) => "-".repeat(width)));
  for (const row of data) {
    printRow(row);
  }
};

const main = async (): Promise<void> => {
  loadEnv();

  const argv = process.argv.slice(2);
  // Both `pnpm run` and `vp run` forward the "--" literally rather than
  // stripping it, so a stray one (or two) is a normal arrival, not a command.
  while (argv[0] === "--") {
    argv.shift();
  }

  const command = (COMMANDS as readonly string[]).includes(argv[0] ?? "")
    ? (argv.shift() as (typeof COMMANDS)[number])
    : "run";
  const rest = argv;

  if (command === "new") {
    const description = rest.join(" ");
    if (!description.trim()) {
      console.error(USAGE);
      process.exitCode = 1;
      return;
    }
    // Scaffolding a file needs no env or database — keep this path independent
    // of the imports below.
    const { createPostMigration } = await import("./create");
    const filePath = await createPostMigration(description);
    console.log(`created ${path.relative(process.cwd(), filePath)}`);
    return;
  }

  const { values } = parseArgs({
    args: rest,
    options: {
      "allow-modified": { default: false, type: "boolean" },
      "dry-run": { default: false, type: "boolean" },
      force: { default: false, type: "boolean" },
      "lock-timeout": { type: "string" },
      only: { type: "string" },
    },
  });

  // Dynamic, not top-of-file: see the `loadEnv` comment above.
  const { createObservability } = await import("@masdan/observability");
  const observability = createObservability({ service: "masdan-post-migrate" });

  await runLifecycle(
    async () => {
      if (command === "status") {
        const { getStatusReport } = await import("./runner");
        printStatusTable(await getStatusReport());
        return 0;
      }
      const { runPostMigrations } = await import("./runner");
      return runPostMigrations({
        allowModified: values["allow-modified"],
        dryRun: values["dry-run"],
        force: values.force,
        lockTimeoutMs: values["lock-timeout"]
          ? Number(values["lock-timeout"])
          : undefined,
        only: values.only,
      });
    },
    () => observability.flush()
  );
};
main();
