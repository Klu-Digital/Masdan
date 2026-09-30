import { describe, expect, it } from "vite-plus/test";

import {
  activeTierIndex,
  formatEffectiveRate,
  headlineRate,
  termFacts,
  tierRows,
} from "./interest";

const base = {
  bonusAnnualRate: null,
  calculationBasis: "eod" as const,
  conditionSummary: null,
  creditFrequency: "monthly" as const,
  dayCountBasis: "365" as const,
  interestCapBalance: null,
  minimumBalance: null,
  tierMode: "marginal" as const,
  tiers: [{ annualRate: "3.000000", minBalance: "0.000000" }],
  withholdingTaxRate: "20.000000",
};

const eastWest = {
  ...base,
  calculationBasis: "principal" as const,
  creditFrequency: "maturity" as const,
  dayCountBasis: "360" as const,
  minimumBalance: "10000",
  tierMode: "whole_balance" as const,
  tiers: [
    { annualRate: "0.725", minBalance: "0" },
    { annualRate: "3.28", minBalance: "100000" },
    { annualRate: "3.5", minBalance: "10000000" },
  ],
};

describe("interest presentation", () => {
  it("labels whole-balance tiers as compact ranges", () => {
    expect(tierRows(eastWest, "PHP")).toEqual([
      { label: "Below ₱100K", rate: "0.725%" },
      { label: "₱100K – ₱10M", rate: "3.28%" },
      { label: "₱10M and up", rate: "3.5%" },
    ]);
  });

  it("labels marginal tiers by the portion each covers", () => {
    expect(
      tierRows(
        {
          ...base,
          tiers: [
            { annualRate: "3.25", minBalance: "0" },
            { annualRate: "3.75", minBalance: "1000000" },
          ],
        },
        "PHP"
      )
    ).toEqual([
      { label: "First ₱1M", rate: "3.25%" },
      { label: "₱1M and up", rate: "3.75%" },
    ]);
    expect(tierRows(base, "PHP")).toEqual([
      { label: "Any balance", rate: "3%" },
    ]);
  });

  it("finds the tier a balance sits in", () => {
    expect(activeTierIndex(eastWest, "250000.000000")).toBe(1);
    expect(activeTierIndex(eastWest, "100000")).toBe(1);
    expect(activeTierIndex(eastWest, "0")).toBeNull();
    const marginal = { ...eastWest, tierMode: "marginal" as const };
    // The ₱100,000th peso is still in the first tier's slice.
    expect(activeTierIndex(marginal, "100000")).toBe(0);
    expect(
      activeTierIndex({ ...marginal, interestCapBalance: "200000" }, "50000000")
    ).toBe(1);
  });

  it("headlines the best rate with any bonus", () => {
    expect(headlineRate(base)).toBe("3%");
    expect(headlineRate({ ...base, bonusAnnualRate: "1.00" })).toBe("Up to 4%");
    expect(headlineRate(eastWest)).toBe("Up to 3.5%");
  });

  it("states the rules as label and value", () => {
    expect(termFacts(eastWest, "PHP")).toEqual([
      { label: "Credited", value: "At maturity" },
      { label: "Earned on", value: "Amount placed" },
      { label: "Year", value: "360 days" },
      { label: "Tax", value: "20% withheld" },
      { label: "Earns from", value: "₱10,000" },
    ]);
  });

  it("rounds an effective rate to two places", () => {
    expect(formatEffectiveRate("3.416666")).toBe("3.42%");
    expect(formatEffectiveRate("5.000000")).toBe("5%");
  });
});
