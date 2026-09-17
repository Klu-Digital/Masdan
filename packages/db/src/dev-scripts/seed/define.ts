import type { Faker } from "@faker-js/faker";
import type { createAuth } from "@masdan/auth";

import type { Database } from "../../index";

/** CLI flags every seeder reads. New knobs go here, not into a bespoke env var. */
export interface SeedOptions {
  /** Random users to generate on top of the fixed ones. From `--users`. */
  userCount: number;
}

/** What every seeder gets, whether it's only planning or actually writing. */
export interface SeedContext {
  db: Database;
  auth: ReturnType<typeof createAuth>;
  /** Seeded once per run (see `--seed`), so the same flags produce the same data. */
  faker: Faker;
  opts: SeedOptions;
  /** Pre-tagged with the seeder's own name. */
  log: (message: string) => void;
}

export interface Seeder<TPlan> {
  /** Shown in conflict/summary output and as the log prefix. */
  name: string;
  /** Build everything this seeder intends to create. Must not touch the database. */
  plan: (ctx: SeedContext) => Promise<TPlan>;
  /**
   * Rows that already exist and would collide with `plan`, as human-readable
   * keys. Empty means `apply` is safe.
   */
  conflicts: (ctx: SeedContext, plan: TPlan) => Promise<string[]>;
  /** Write `plan` to the database. Only called once every seeder reports zero conflicts. */
  apply: (ctx: SeedContext, plan: TPlan) => Promise<void>;
}

/** Identity function, so a seeder types itself without importing anything else. */
export const defineSeeder = <TPlan>(seeder: Seeder<TPlan>): Seeder<TPlan> =>
  seeder;
