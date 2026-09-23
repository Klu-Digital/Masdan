import { describe, expect, it } from "vite-plus/test";

import { MINUS, formatMoney, moneyParts, speakMoney } from "./money";

describe("formatMoney", () => {
  it("uses the currency's own minor units", () => {
    expect(formatMoney("1234.5", "USD")).toBe("$1,234.50");
    expect(formatMoney("1234", "JPY")).toBe("¥1,234");
  });

  it("prints a typographic minus for negatives and outflows", () => {
    expect(formatMoney("-20", "USD")).toBe(`${MINUS}$20.00`);
    expect(formatMoney("20", "USD", { sign: "out" })).toBe(`${MINUS}$20.00`);
    expect(formatMoney("20", "USD", { sign: "in" })).toBe("+$20.00");
    expect(formatMoney("-20", "USD", { sign: "none" })).toBe("$20.00");
  });

  it("compacts large figures for chart axes", () => {
    expect(formatMoney(12_500, "USD", { compact: true })).toBe("$12.5K");
  });

  it("still renders an unknown currency code legibly", () => {
    expect(formatMoney("5", "XYZ")).toContain("5");
  });
});

describe("moneyParts", () => {
  it("splits symbol, integer and fraction so large sizes can style them", () => {
    expect(moneyParts("1234.5", "USD")).toEqual({
      currency: "$",
      fraction: ".50",
      integer: "1,234",
      negative: false,
      trailingCurrency: false,
    });
  });
});

describe("speakMoney", () => {
  it("says the sign in words for screen readers", () => {
    expect(speakMoney("20", "USD", "out")).toBe("minus $20.00");
    expect(speakMoney("20", "USD", "in")).toBe("plus $20.00");
    expect(speakMoney("-20", "USD")).toBe("minus $20.00");
  });
});
