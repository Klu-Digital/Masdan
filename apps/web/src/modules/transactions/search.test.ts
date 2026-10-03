import { describe, expect, it } from "vite-plus/test";

import { resolveDateRange, transactionSearch } from "./search";
import type { TransactionSearch } from "./search";

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

  it("drops an unknown date preset", () => {
    expect(transactionSearch.parse({ datePreset: "forever" }).datePreset).toBe(
      undefined
    );
  });
});

const parse = (input: Record<string, unknown>) =>
  transactionSearch.parse(input) as TransactionSearch;

describe("resolveDateRange", () => {
  it("moves a preset with today instead of freezing it", () => {
    const search = parse({ datePreset: "this-month" });
    expect(resolveDateRange(search, "2026-10-03")).toEqual({
      dateFrom: "2026-10-01",
      dateTo: "2026-10-03",
    });
    expect(resolveDateRange(search, "2026-10-10")).toEqual({
      dateFrom: "2026-10-01",
      dateTo: "2026-10-10",
    });
  });

  it("resolves the other presets", () => {
    const today = "2026-10-03";
    expect(
      resolveDateRange(parse({ datePreset: "last-month" }), today)
    ).toEqual({ dateFrom: "2026-09-01", dateTo: "2026-09-30" });
    expect(resolveDateRange(parse({ datePreset: "last-30" }), today)).toEqual({
      dateFrom: "2026-09-04",
      dateTo: today,
    });
    expect(resolveDateRange(parse({ datePreset: "this-year" }), today)).toEqual(
      { dateFrom: "2026-01-01", dateTo: today }
    );
  });

  it("keeps a custom range fixed, and lets a preset win over one", () => {
    const today = "2026-10-10";
    expect(
      resolveDateRange(
        parse({ dateFrom: "2026-10-01", dateTo: "2026-10-03" }),
        today
      )
    ).toEqual({ dateFrom: "2026-10-01", dateTo: "2026-10-03" });
    expect(
      resolveDateRange(
        parse({ dateFrom: "2026-01-01", datePreset: "this-month" }),
        today
      )
    ).toEqual({ dateFrom: "2026-10-01", dateTo: today });
  });
});
