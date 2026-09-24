import { describe, expect, it } from "vite-plus/test";

import { budgetArithmetic, netRemaining } from "./arithmetic";

describe("budgetArithmetic", () => {
  it("reports what is left while spending is under the budget", () => {
    expect(budgetArithmetic("8000.000000", "4500.500000")).toEqual({
      overBy: "0.000000",
      percentUsed: 56,
      remaining: "3499.500000",
      status: "within",
    });
  });

  it("treats spending exactly the budget as within it", () => {
    expect(budgetArithmetic("1500", "1500.000000")).toEqual({
      overBy: "0.000000",
      percentUsed: 100,
      remaining: "0.000000",
      status: "within",
    });
  });

  it("exposes the amount over budget once spending passes it", () => {
    expect(budgetArithmetic("1000", "1000.000001")).toEqual({
      overBy: "0.000001",
      percentUsed: 100,
      remaining: "0.000000",
      status: "overspent",
    });
    expect(budgetArithmetic("1000", "2500.25")).toMatchObject({
      overBy: "1500.250000",
      percentUsed: 250,
      status: "overspent",
    });
  });

  it("floors the percentage so near-limit never reads as full", () => {
    expect(budgetArithmetic("3", "2.999999").percentUsed).toBe(99);
    expect(budgetArithmetic("3", "0.000001").percentUsed).toBe(0);
  });

  it("keeps six-place precision where floats would drift", () => {
    expect(budgetArithmetic("0.3", "0.1").remaining).toBe("0.200000");
  });

  it("nets totals across categories", () => {
    expect(netRemaining(10_000_000n, 12_500_000n)).toEqual({
      overBy: "2.500000",
      remaining: "0.000000",
    });
    expect(netRemaining(10_000_000n, 2_500_000n)).toEqual({
      overBy: "0.000000",
      remaining: "7.500000",
    });
  });
});
