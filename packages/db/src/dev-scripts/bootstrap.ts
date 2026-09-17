// Process bootstrap for the standalone scripts under dev-scripts/. Imports
// nothing from `@masdan/*`.

import path from "node:path";

import dotenv from "dotenv";

/**
 * Fills `process.env` from the server's `.env`, resolved relative to this file.
 * Real environment variables win — `override: false` only fills gaps. Call this
 * before importing anything that reads `@masdan/env/shared-server` at module scope, and
 * reach for `await import(...)` for those: a formatter is free to reorder the
 * static list.
 */
export const loadEnv = (): void => {
  const here = import.meta.dirname;
  const repoRoot = path.resolve(here, "../../../..");
  const envPath = path.join(repoRoot, "apps/server/.env");
  dotenv.config({ override: false, path: envPath, quiet: true });
};

export type ExitCode = 0 | 1;

/** Runs `fn`, then `onSettled` however `fn` finished, then exits. Never returns. */
export const runLifecycle = async (
  fn: () => Promise<ExitCode> | Promise<void>,
  onSettled: () => Promise<void>
): Promise<never> => {
  let code: ExitCode = 0;
  try {
    code = (await fn()) ?? 0;
  } catch (error) {
    console.error(error);
    code = 1;
  }
  try {
    await onSettled();
  } catch (cleanupError) {
    console.error("cleanup failed:", cleanupError);
  }
  process.exit(code);
};
