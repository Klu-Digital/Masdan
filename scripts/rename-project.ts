#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

const REPO_ROOT = path.join(import.meta.dirname, "..");

const USAGE = `Usage:
  pnpm rename <new-name> [--dry-run] [--force]

Renames the project throughout the repo: the npm scope (@k22i/*), the workspace
package names, the Compose project and container names, the Postgres database,
the Expo app slug and deep-link scheme, and every mention in documentation and
comments.

The current name is read from the root package.json, so this is re-runnable
rather than a one-shot from the template's original name.

<new-name> must match /^[a-z][a-z0-9-]*$/ — the intersection of what an npm
scope, a URI scheme, a Docker container name and a Postgres identifier will all
accept. If it contains a hyphen, the Android package and iOS bundle identifier
get a hyphen-free variant, since neither permits one.

Only whole-token occurrences are replaced: an occurrence flanked by another
letter or digit is left alone, so "k22i-postgres" and "@k22i/db" are renamed
while a word that merely contains the name is not.

Options:
  --dry-run   List the files that would change, and how many occurrences each
              holds, without writing anything.
  --force     Proceed even though the working tree has uncommitted changes.
              Refused by default: a clean tree is what makes "git checkout ."
              an undo for a rename that went wrong.
`;

const NAME_PATTERN = /^[a-z][a-z0-9-]*$/u;

/**
 * `.env` files are untracked by design but carry the database name and bucket.
 */
const UNTRACKED_CANDIDATES = [
  ".env",
  "apps/server/.env",
  "apps/web/.env",
  "apps/native/.env",
  "apps/workers/.env",
];

interface Leftover {
  path: string;
  line: number;
  text: string;
}
interface ScanResult {
  changed: { path: string; count: number }[];
  leftovers: Leftover[];
  skippedBinary: number;
}

const git = (args: string[]): string =>
  execFileSync("git", args, { cwd: REPO_ROOT, encoding: "utf-8" });

const currentName = (): string => {
  const pkg = JSON.parse(
    readFileSync(path.join(REPO_ROOT, "package.json"), "utf-8")
  ) as {
    name?: string;
  };
  if (!pkg.name) {
    throw new Error("root package.json has no `name` field to rename from");
  }
  return pkg.name;
};

/**
 * Everything git considers part of the project, plus the deliberately-ignored
 * `.env` files. `--others --exclude-standard` is load-bearing: a bare
 * `ls-files` lists only the index, so a rename with work in progress would skip
 * every new file.
 */
const filesToScan = (): string[] => {
  const known = git([
    "ls-files",
    "-z",
    "--cached",
    "--others",
    "--exclude-standard",
  ])
    .split("\0")
    .filter(Boolean);
  const ignoredButOurs = UNTRACKED_CANDIDATES.filter((candidate) =>
    existsSync(path.join(REPO_ROOT, candidate))
  );
  return [...new Set([...known, ...ignoredButOurs])];
};

/** Same heuristic git uses: a NUL byte early in the file means "not text". */
const isBinary = (buffer: Buffer): boolean =>
  buffer.subarray(0, 8000).includes(0);

const tokenPattern = (name: string): RegExp => {
  const escaped = name.replaceAll(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(`(?<![A-Za-z0-9])${escaped}(?![A-Za-z0-9])`, "gu");
};

/**
 * Occurrences the token rule walked past because they are glued to another
 * letter or digit — the project name inside a camelCase identifier. Reported
 * rather than guessed at: substituting gives a valid identifier for a
 * single-word name and an invalid one for a hyphenated name.
 */
const findLeftovers = (
  filePath: string,
  content: string,
  oldName: string
): Leftover[] => {
  if (!content.includes(oldName)) {
    return [];
  }

  return content
    .split("\n")
    .map((text, index) => ({
      line: index + 1,
      path: filePath,
      text: text.trim(),
    }))
    .filter((entry) => entry.text.includes(oldName));
};

const scanAndReplace = (
  pattern: RegExp,
  oldName: string,
  newName: string,
  dryRun: boolean
): ScanResult => {
  const changed: { path: string; count: number }[] = [];
  const leftovers: Leftover[] = [];
  let skippedBinary = 0;

  for (const filePath of filesToScan()) {
    const absolute = path.join(REPO_ROOT, filePath);
    if (!(existsSync(absolute) && statSync(absolute).isFile())) {
      continue;
    }

    const buffer = readFileSync(absolute);
    if (isBinary(buffer)) {
      skippedBinary += 1;
      continue;
    }

    const before = buffer.toString("utf-8");
    const after = before.replace(pattern, newName);

    const matches = before.match(pattern);
    if (matches) {
      changed.push({ count: matches.length, path: filePath });
      if (!dryRun) {
        writeFileSync(absolute, after);
      }
    }

    leftovers.push(...findLeftovers(filePath, after, oldName));
  }

  return { changed, leftovers, skippedBinary };
};

const reportLeftovers = (
  leftovers: Leftover[],
  oldName: string,
  newName: string
): void => {
  if (leftovers.length === 0) {
    return;
  }

  console.log(
    `\n${leftovers.length} occurrence${leftovers.length === 1 ? "" : "s"} of ` +
      `"${oldName}" left in place, each one joined to a surrounding word where ` +
      `"${newName}" cannot be dropped in verbatim. Rename these by hand:`
  );

  for (const { path: filePath, line, text } of leftovers.slice(0, 20)) {
    console.log(`  ${filePath}:${line}  ${text.slice(0, 90)}`);
  }
  if (leftovers.length > 20) {
    console.log(`  ... and ${leftovers.length - 20} more`);
  }
};

/**
 * The blanket replacement leaves an invalid `com.anonymous.<new-name>` for a
 * hyphenated name, and Gradle rejects the build rather than warning. Returns
 * the substituted identifier when repaired.
 */
const fixBundleIdentifiers = (newName: string): string | undefined => {
  if (!newName.includes("-")) {
    return undefined;
  }

  const appJsonPath = path.join(REPO_ROOT, "apps/native/app.json");
  if (!existsSync(appJsonPath)) {
    return undefined;
  }

  const safe = newName.replaceAll("-", "");
  const source = readFileSync(appJsonPath, "utf-8");
  const repaired = source.replaceAll(`.${newName}"`, `.${safe}"`);
  if (repaired !== source) {
    writeFileSync(appJsonPath, repaired);
  }

  return safe;
};

const printNextSteps = (
  bundleId: string | undefined,
  newName: string
): void => {
  console.log(
    "\nNext:\n" +
      "  1. pnpm install          — the workspace package names changed, so the\n" +
      "                             lockfile's link: entries need re-resolving.\n" +
      "  2. docker compose down -v — the Postgres volume still holds a database\n" +
      "                             named after the old project; -v drops it so the\n" +
      "                             container recreates it under the new name.\n" +
      "  3. pnpm db:deploy        — rebuild the schema in the new database.\n" +
      "  4. Search for anything the token rule could not reach: an icon, a\n" +
      "     display name in apps/native/app.json, the description in\n" +
      "     apps/web/src/routes/__root.tsx."
  );

  if (bundleId) {
    console.log(
      `\nNote: Android packages and iOS bundle identifiers cannot contain hyphens,\n` +
        `so those were set to "${bundleId}" rather than "${newName}".`
    );
  }
};

/** Parses argv and applies every guard; returns null (after printing why) if the run should stop. */
const resolveRename = (
  argv: string[]
): { oldName: string; newName: string; dryRun: boolean } | null => {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    args: argv,
    options: {
      "dry-run": { default: false, type: "boolean" },
      force: { default: false, type: "boolean" },
    },
  });

  const [newName] = positionals;
  if (!newName) {
    console.error(USAGE);
    return null;
  }

  if (!NAME_PATTERN.test(newName)) {
    console.error(
      `Invalid name ${JSON.stringify(newName)}: must match ${NAME_PATTERN}.`
    );
    return null;
  }

  const oldName = currentName();
  if (oldName === newName) {
    console.error(`Already named ${JSON.stringify(newName)}; nothing to do.`);
    return null;
  }

  const dryRun = values["dry-run"];
  if (!(dryRun || values.force) && git(["status", "--porcelain"]).trim()) {
    console.error(
      "Working tree has uncommitted changes.\n" +
        "Commit or stash first so `git checkout .` can undo this, or pass --force."
    );
    return null;
  }

  return { dryRun, newName, oldName };
};

const main = (): void => {
  const argv = process.argv.slice(2);
  // `pnpm run rename -- foo` forwards the "--" literally.
  while (argv[0] === "--") {
    argv.shift();
  }

  const resolved = resolveRename(argv);
  if (!resolved) {
    process.exitCode = 1;
    return;
  }
  const { oldName, newName, dryRun } = resolved;

  const { changed, leftovers, skippedBinary } = scanAndReplace(
    tokenPattern(oldName),
    oldName,
    newName,
    dryRun
  );

  const total = changed.reduce((sum, file) => sum + file.count, 0);

  for (const { path: filePath, count } of changed.toSorted(
    (a, b) => b.count - a.count
  )) {
    console.log(`  ${String(count).padStart(4)}  ${filePath}`);
  }

  console.log(
    `\n${dryRun ? "Would rename" : "Renamed"} ${oldName} -> ${newName}: ` +
      `${total} occurrence${total === 1 ? "" : "s"} across ${changed.length} file${
        changed.length === 1 ? "" : "s"
      } (${skippedBinary} binary file${skippedBinary === 1 ? "" : "s"} skipped).`
  );

  reportLeftovers(leftovers, oldName, newName);

  if (dryRun) {
    return;
  }

  printNextSteps(fixBundleIdentifiers(newName), newName);
};

main();
