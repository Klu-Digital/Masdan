import { describe, expect, it } from "vite-plus/test";

import { formatDisplayMoney } from "./money";

describe("formatDisplayMoney", () => {
  it("uses each currency's minor units for display", () => {
    expect(formatDisplayMoney("1234.000000", "JPY", "en-US")).toBe("¥1,234");
    expect(formatDisplayMoney("1234.567000", "KWD", "en-US")).toBe(
      "KWD 1,234.567"
    );
    expect(formatDisplayMoney("1234.500000", "USD", "en-US")).toBe("$1,234.50");
  });

  it("preserves decimal-string precision without converting to a float", () => {
    expect(
      formatDisplayMoney("12345678901234567890.125000", "USD", "en-US")
    ).toBe("$12,345,678,901,234,567,890.13");
  });

  it("lets chat omit zero fractions but keeps fractional minor units", () => {
    expect(formatDisplayMoney("400.000000", "PHP", "en-PH", true)).toBe("₱400");
    expect(formatDisplayMoney("1.500000", "KWD", "en-PH", true)).toBe(
      "KWD 1.500"
    );
    expect(formatDisplayMoney("1.500000", "JPY", "en-PH", true)).toBe("¥2");
  });

  it("labels invalid currency codes without dropping the amount", () => {
    expect(formatDisplayMoney("1234.5", "BAD!", "en-US")).toBe("BAD! 1,234.50");
  });
});
