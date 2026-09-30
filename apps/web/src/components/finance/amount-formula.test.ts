import { describe, expect, it } from "vite-plus/test";

import { evaluateFormula, isFormula, sanitizeFormula } from "./amount-formula";

describe("evaluateFormula", () => {
  it("respects precedence and parentheses", () => {
    expect(evaluateFormula("2+3*4")).toBe("14");
    expect(evaluateFormula("(2+3)*4")).toBe("20");
    expect(evaluateFormula("100 ÷ 8")).toBe("12.5");
    expect(evaluateFormula("12.5×2")).toBe("25");
  });

  it("rounds away float noise", () => {
    expect(evaluateFormula("0.1+0.2")).toBe("0.3");
    expect(evaluateFormula("10/3")).toBe("3.333333");
  });

  it("rejects incomplete, malformed and non-positive-result input", () => {
    for (const bad of ["12+", "(1+2", "1+2)", "1/0", "5-9", "", "*3", "1..2"]) {
      expect(evaluateFormula(bad)).toBeNull();
    }
  });

  it("accepts unary signs that still land above zero", () => {
    expect(evaluateFormula("-2+5")).toBe("3");
  });
});

describe("helpers", () => {
  it("tells formulas from plain numbers", () => {
    expect(isFormula("12.50")).toBe(false);
    expect(isFormula("12+3")).toBe(true);
  });

  it("strips characters a formula can't hold", () => {
    expect(sanitizeFormula("12a+3,5$")).toBe("12+3.5");
  });
});
