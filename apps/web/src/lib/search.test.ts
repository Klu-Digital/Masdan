import { describe, expect, it } from "vite-plus/test";

import { monthSearch, optionalSearchString } from "./search";

describe("search schemas", () => {
  it("drops malformed optional values", () => {
    expect(monthSearch.parse({ month: "2026-13" })).toEqual({
      month: undefined,
    });
    expect(optionalSearchString.parse(["repeated", "value"])).toBeUndefined();
  });
});
