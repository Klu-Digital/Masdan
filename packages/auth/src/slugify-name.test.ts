import { describe, expect, it } from "vite-plus/test";

import { slugifyName } from "./index";

// Importing `./index` builds a `betterAuth` instance and a `pg.Pool` at module
// load, which is safe under the test env floor: `pg.Pool` opens no socket until
// a query.

describe("slugifyName", () => {
  const cases: [name: string, expected: string][] = [
    ["Ada Lovelace", "ada-lovelace"],
    ["  --Ada Lovelace--  ", "ada-lovelace"],
    ["Ada   ,,  Lovelace", "ada-lovelace"],
    ["ADA LOVELACE", "ada-lovelace"],
    ["Agent 007", "agent-007"],
    ["!!! 🚀 ???", "household"],
    ["", "household"],
  ];

  it.each(cases)("slugifyName(%j) -> %j", (name, expected) => {
    expect(slugifyName(name)).toBe(expected);
  });
});
