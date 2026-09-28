import { describe, expect, it } from "vite-plus/test";

import { savingsRate } from "./savings-rate";

describe("savingsRate", () => {
  it("calculates a percentage from positive outflows", () => {
    expect(savingsRate("100.000000", "75.000000")).toBe(25);
    expect(savingsRate("3.000000", "2.000000")).toBe(33.3);
  });

  it("has no rate without positive income", () => {
    expect(savingsRate("0", "10")).toBeNull();
    expect(savingsRate("-10", "5")).toBeNull();
  });

  it("allows negative rates and zero spending", () => {
    expect(savingsRate("100", "150")).toBe(-50);
    expect(savingsRate("100", "0")).toBe(100);
  });
});
