import { globSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vite-plus/test";

const SRC = import.meta.dirname;

// A figure that isn't an `<Amount>` goes through `useFormattedMoney()`, which masks it in privacy mode.
const components = globSync("**/*.tsx", { cwd: SRC }).filter(
  (file) => !file.includes(".test.")
);

describe("privacy mode", () => {
  it("keeps formatMoney out of components", () => {
    const offenders = components.filter((file) =>
      /\bformatMoney\b/u.test(readFileSync(path.join(SRC, file), "utf-8"))
    );
    expect(offenders).toEqual([]);
  });
});
