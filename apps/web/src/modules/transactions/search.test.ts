import { describe, expect, it } from "vite-plus/test";

import { transactionSearch } from "./search";

describe("transactionSearch", () => {
  it("normalizes URL values and falls back from invalid values", () => {
    expect(
      transactionSearch.parse({
        accountIds: ["first, second", 3],
        includeArchived: "true",
        paidStatuses: ["paid", "unknown"],
        search: "x".repeat(130),
        sortBy: "unknown",
        types: "expense,income,transfer",
      })
    ).toMatchObject({
      accountIds: ["first", "second"],
      includeArchived: true,
      paidStatuses: ["paid"],
      search: "x".repeat(120),
      sortBy: "date",
      types: ["expense", "income"],
    });
  });
});
