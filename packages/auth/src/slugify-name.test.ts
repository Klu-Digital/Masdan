import { describe, expect, it } from "vite-plus/test";

import { slugifyName } from "./index";

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
