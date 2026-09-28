import { describe, expect, it } from "vite-plus/test";

import { allocations } from "./net-worth";
import type { AllocationAccount } from "./net-worth";

const account = (
  id: string,
  balance: string,
  overrides: Partial<AllocationAccount> = {}
) => ({
  accountClass: "asset" as const,
  accountType: "bank",
  archivedAt: null,
  balance,
  currencyCode: "PHP",
  id,
  includeInNetWorth: true,
  ...overrides,
});

describe("allocations", () => {
  it("uses the classification total per currency for accounts and groups", () => {
    const result = allocations([
      account("bank", "75"),
      account("investment", "25", { accountType: "investment" }),
      account("dollars", "10", { currencyCode: "USD" }),
      account("card", "30", {
        accountClass: "liability",
        accountType: "credit_card",
      }),
      account("loan", "70", {
        accountClass: "liability",
        accountType: "personal_loan",
      }),
    ]);

    expect(result.multiCurrency).toBe(true);
    expect(result.accountShare("bank")).toEqual({
      accountClass: "asset",
      currencyCode: "PHP",
      share: 0.75,
    });
    expect(result.accountShare("dollars")?.share).toBe(1);
    expect(result.accountShare("card")?.share).toBe(0.3);
    expect(result.groupShares("cash")).toEqual([
      { accountClass: "asset", currencyCode: "PHP", share: 0.75 },
      { accountClass: "asset", currencyCode: "USD", share: 1 },
    ]);
    expect(result.groupShares("credit")?.[0]?.share).toBe(0.3);
    expect(result.accountAllocation("bank")?.label).toBe("75% of PHP assets");
    expect(
      result.groupAllocations("cash").map((allocation) => allocation.label)
    ).toEqual(["75% of PHP assets", "100% of USD assets"]);
  });

  it("excludes archived and opted-out accounts from every share", () => {
    const result = allocations([
      account("included", "30"),
      account("excluded", "70", { includeInNetWorth: false }),
      account("archived", "70", { archivedAt: new Date() }),
      account("usd-excluded", "70", {
        currencyCode: "USD",
        includeInNetWorth: false,
      }),
    ]);

    expect(result.multiCurrency).toBe(false);
    expect(result.accountShare("included")?.share).toBe(1);
    expect(result.accountShare("excluded")).toBeNull();
    expect(result.accountShare("archived")).toBeNull();
    expect(result.groupShares("cash")).toEqual([
      { accountClass: "asset", currencyCode: "PHP", share: 1 },
    ]);
    expect(result.accountAllocation("included")?.label).toBe("100% of assets");
    expect(result.accountAllocation("excluded")).toBeNull();
  });

  it("omits nonpositive or nonfinite shares while retaining negative balances in totals", () => {
    const result = allocations([
      account("negative", "-25"),
      account("positive", "100"),
      account("zero", "0", { currencyCode: "USD" }),
      account("negative-total", "-4", { currencyCode: "EUR" }),
      account("infinite", "Infinity", { currencyCode: "GBP" }),
    ]);

    expect(result.accountShare("negative")).toBeNull();
    expect(result.accountShare("positive")?.share).toBeCloseTo(4 / 3);
    expect(result.accountShare("zero")).toBeNull();
    expect(result.accountShare("negative-total")).toBeNull();
    expect(result.accountShare("infinite")).toBeNull();
    expect(result.groupShares("cash")).toEqual([
      { accountClass: "asset", currencyCode: "PHP", share: 1 },
    ]);
    expect(result.groupShares("investments")).toEqual([]);
    expect(result.accountAllocation("infinite")).toBeNull();
    expect(result.groupAllocations("investments")).toEqual([]);
  });

  it("does not return an infinite share when finite balances nearly cancel", () => {
    const result = allocations([
      account("huge", "1e308"),
      account("offset", "-1e308", { accountType: "investment" }),
      account("tiny", "1e-300", { accountType: "property" }),
    ]);

    expect(result.accountShare("huge")).toBeNull();
    expect(result.groupShares("cash")).toEqual([]);
    expect(result.accountShare("tiny")?.share).toBe(1);
  });

  it("hides a negative group sum even when its classification total is positive", () => {
    const result = allocations([
      account("cash", "-10"),
      account("investment", "30", { accountType: "investment" }),
    ]);

    expect(result.groupShares("cash")).toEqual([]);
    expect(result.accountShare("investment")?.share).toBe(1.5);
  });
});
