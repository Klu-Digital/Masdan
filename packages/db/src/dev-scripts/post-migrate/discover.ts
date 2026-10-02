import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import type { PostMigrationDefinition } from "./define";

const here = import.meta.dirname;
export const postMigrationsDir = path.resolve(
  here,
  "../../post-migration-scripts"
);

/** `YYYYMMDDHHMMSS_snake_case_description.ts` — digits sort chronologically. */
const FILENAME_PATTERN = /^(?<timestamp>\d{14})_(?<slug>[a-z0-9_]+)\.ts$/u;

export interface DiscoveredPostMigration {
  /** Filename without extension — the unique key stored in `post_migration.name`. */
  name: string;
  path: string;
  checksum: string;
  definition: PostMigrationDefinition;
}

export const discoverPostMigrations = async (): Promise<
  DiscoveredPostMigration[]
> => {
  let entries: string[];
  try {
    entries = await readdir(postMigrationsDir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }

  const files = entries.filter((entry) => entry.endsWith(".ts")).toSorted();
  const discovered: DiscoveredPostMigration[] = [];

  for (const file of files) {
    if (!FILENAME_PATTERN.test(file)) {
      throw new Error(
        `post-migration-scripts/${file} doesn't match "<14-digit timestamp>_<snake_case description>.ts" — ` +
          `rename it, or generate scripts with "pnpm db:post-migrate:new" so this can't happen.`
      );
    }

    const filePath = path.join(postMigrationsDir, file);
    const contents = await readFile(filePath, "utf-8");
    const checksum = createHash("sha256").update(contents).digest("hex");

    const mod = (await import(pathToFileURL(filePath).href)) as {
      default?: PostMigrationDefinition;
    };
    const definition = mod.default;
    if (!definition || typeof definition.up !== "function") {
      throw new Error(
        `post-migration-scripts/${file} has no default export from definePostMigration(...) — ` +
          `see packages/db/src/dev-scripts/post-migrate/README.md.`
      );
    }

    discovered.push({
      checksum,
      definition,
      name: file.slice(0, -3),
      path: filePath,
    });
  }

  return discovered;
};
