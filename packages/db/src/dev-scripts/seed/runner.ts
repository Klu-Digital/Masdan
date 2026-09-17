import { faker as sharedFaker } from "@faker-js/faker";
import type { Pool } from "pg";

import { createDb } from "../../index";
import type { Database } from "../../index";
import type { SeedContext, SeedOptions } from "./define";
import { usersSeeder } from "./seeders/users";

/** Ordered; a future seeder is appended here, not inserted arbitrarily. */
const SEEDERS = [usersSeeder];

export interface RunOptions extends SeedOptions {
  dryRun?: boolean;
  /** Faker seed — same value, same generated data. */
  seed: number;
}

/** Runs every seeder's `plan` → `conflicts` preflight, then `apply`, or reports why it stopped. */
const makeContext = (
  db: Database,
  auth: SeedContext["auth"],
  opts: SeedOptions,
  seederName: string
): SeedContext => ({
  auth,
  db,
  faker: sharedFaker,
  log: (message) => console.log(`[${seederName}] ${message}`),
  opts,
});

/** Best-effort one-liner for `--dry-run` output — works for any plan shaped like `{ <key>: unknown[] }`. */
const describePlan = (plan: unknown): string => {
  if (plan && typeof plan === "object") {
    const parts = Object.entries(plan as Record<string, unknown>).map(
      ([key, value]) => (Array.isArray(value) ? `${value.length} ${key}` : key)
    );
    if (parts.length > 0) {
      return parts.join(", ");
    }
  }
  return "planned";
};

export const runSeed = async (
  pool: Pool,
  options: RunOptions
): Promise<0 | 1> => {
  const db = createDb(pool);
  const { createAuth } = await import("@k22i/auth");
  const auth = createAuth();

  sharedFaker.seed(options.seed);

  const planned = await Promise.all(
    SEEDERS.map(async (seeder) => {
      const ctx = makeContext(db, auth, options, seeder.name);
      const plan = await seeder.plan(ctx);
      return { ctx, plan, seeder };
    })
  );

  const conflictsBySeeder = await Promise.all(
    planned.map(async ({ seeder, ctx, plan }) => ({
      conflicts: await seeder.conflicts(ctx, plan),
      name: seeder.name,
    }))
  );

  const anyConflicts = conflictsBySeeder.some((c) => c.conflicts.length > 0);
  if (anyConflicts) {
    console.error("Refusing to seed — some rows already exist:\n");
    for (const { name, conflicts } of conflictsBySeeder) {
      if (conflicts.length === 0) {
        continue;
      }
      console.error(`  ${name}:`);
      for (const conflict of conflicts) {
        console.error(`    - ${conflict}`);
      }
    }
    console.error(
      '\nNothing was written. Reset with "pnpm db:purge --yes && pnpm db:migrate", then seed again.'
    );
    return 1;
  }

  if (options.dryRun) {
    console.log("Dry run — nothing written. Plan:\n");
    for (const { seeder, plan } of planned) {
      console.log(`  ${seeder.name}: ${describePlan(plan)}`);
    }
    return 0;
  }

  for (const { seeder, ctx, plan } of planned) {
    await seeder.apply(ctx, plan);
  }

  console.log("\nSeed complete.");
  return 0;
};
