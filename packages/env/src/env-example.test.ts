import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vite-plus/test";

/**
 * .env.example falls out of date silently, so every variable declared by the
 * backend schemas must appear in at least one app example.
 */

const repoRoot = path.join(import.meta.dirname, "..", "..", "..");

const EXAMPLES = ["apps/server/.env.example", "apps/workers/.env.example"];

/**
 * Reads the names out of the schema's source, not the `env` object: t3-env's
 * proxy throws on an unset optional.
 */
const declaredServerVars = (): string[] => {
  const sources = ["shared-server.ts", "server.ts", "workers.ts"].map((file) =>
    readFileSync(path.join(repoRoot, "packages/env/src", file), "utf-8")
  );
  const names = sources.flatMap((source) => [
    ...source.matchAll(/^ {4}(?<name>[A-Z][A-Z0-9_]*):/gmu),
  ]);
  return [...new Set(names.map((m) => m.groups?.name ?? ""))];
};

const documentedVars = (): Set<string> => {
  const documented = new Set<string>();
  for (const examplePath of EXAMPLES) {
    const source = readFileSync(path.join(repoRoot, examplePath), "utf-8");
    // Matches both `NAME=value` and a commented default `# NAME=value`.
    for (const match of source.matchAll(/^#?\s*(?<name>[A-Z][A-Z0-9_]*)=/gmu)) {
      documented.add(match.groups?.name ?? "");
    }
  }
  return documented;
};

describe(".env.example coverage", () => {
  it("finds variables to check, so a broken regex fails loudly rather than passing vacuously", () => {
    expect(declaredServerVars().length).toBeGreaterThan(10);
    expect(documentedVars().size).toBeGreaterThan(20);
  });

  it("documents every variable @k22i/env/server declares", () => {
    const documented = documentedVars();

    const undocumented = declaredServerVars().filter(
      (name) => !documented.has(name)
    );

    expect(undocumented, `add these to one of: ${EXAMPLES.join(", ")}`).toEqual(
      []
    );
  });

  it("documents the required variables uncommented, so copying the file yields a usable .env", () => {
    const source = readFileSync(
      path.join(repoRoot, "apps/server/.env.example"),
      "utf-8"
    );

    const uncommented = new Set(
      [...source.matchAll(/^(?<name>[A-Z][A-Z0-9_]*)=/gmu)].map(
        (match) => match.groups?.name ?? ""
      )
    );

    // Exactly the vars with no schema default: commenting one out turns
    // `cp .env.example .env` into a server that refuses to boot.
    for (const required of [
      "BETTER_AUTH_SECRET",
      "BETTER_AUTH_URL",
      "CORS_ORIGIN",
      "DATABASE_URL",
    ]) {
      expect(uncommented, `${required} must not be commented out`).toContain(
        required
      );
    }
  });
});
