import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { postMigrationsDir } from "./discover";
import { renderPostMigrationTemplate } from "./template";

const pad = (n: number) => String(n).padStart(2, "0");

/** `YYYYMMDDHHMMSS` in UTC — pure digits, so filenames sort chronologically. */
const timestamp = (now: Date): string =>
  String(now.getUTCFullYear()) +
  pad(now.getUTCMonth() + 1) +
  pad(now.getUTCDate()) +
  pad(now.getUTCHours()) +
  pad(now.getUTCMinutes()) +
  pad(now.getUTCSeconds());

const slugify = (description: string): string => {
  const slug = description
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, "_")
    .replaceAll(/^_+|_+$/gu, "");
  if (!slug) {
    throw new Error("Description must contain at least one letter or digit.");
  }
  return slug;
};

const exists = async (filePath: string): Promise<boolean> => {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
};

/** Scaffolds a new post-migration script and returns its absolute path. */
export const createPostMigration = async (
  description: string,
  now = new Date()
): Promise<string> => {
  const trimmed = description.trim();
  if (!trimmed) {
    throw new Error('Usage: pnpm db:post-migrate:new "<description>"');
  }

  const name = `${timestamp(now)}_${slugify(trimmed)}`;
  const filePath = path.join(postMigrationsDir, `${name}.ts`);

  await mkdir(postMigrationsDir, { recursive: true });
  if (await exists(filePath)) {
    throw new Error(`${name}.ts already exists — wait a second and try again.`);
  }

  await writeFile(filePath, renderPostMigrationTemplate(trimmed), "utf-8");
  return filePath;
};
