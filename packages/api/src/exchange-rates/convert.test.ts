import { describe, expect, it } from "vite-plus/test";

import { convertBalance, selectRate, sumMoney } from "./convert";

const today = "2026-09-24";
const manual = (
  rate: string,
  rateDate: string,
  fromCurrency = "USD",
  toCurrency = "PHP"
) => ({ fromCurrency, rate, rateDate, toCurrency });
const feed = (rate: string, rateDate: string, toCurrency: string) => ({
  fromCurrency: "EUR",
  rate,
  rateDate,
  toCurrency,
});

describe("FX selection", () => {
  it("chooses the newest dated rate and manual wins ties", () => {
    const result = selectRate(
      "USD",
      "PHP",
      today,
      [manual("50", "2026-09-22"), manual("51", "2026-09-23")],
      [
        feed("2", "2026-09-23", "USD"),
        feed("100", "2026-09-23", "PHP"),
        feed("120", "2026-09-24", "PHP"),
      ]
    );
    expect(result).toMatchObject({
      rate: "51.000000000000",
      rateDate: "2026-09-23",
      source: "manual",
      status: "ok",
    });
  });
  it("inverts a manual rate and crosses feed legs only on the same date", () => {
    expect(
      selectRate("USD", "PHP", today, [manual("2", today, "PHP", "USD")], [])
        .rate
    ).toBe("0.500000000000");
    const result = selectRate(
      "USD",
      "PHP",
      today,
      [],
      [
        feed("2", "2026-09-23", "USD"),
        feed("100", "2026-09-23", "PHP"),
        feed("120", today, "PHP"),
      ]
    );
    expect(result).toMatchObject({
      rate: "50.000000000000",
      rateDate: "2026-09-23",
      source: "ecb",
    });
    expect(
      selectRate("EUR", "PHP", today, [], [feed("60", today, "PHP")]).rate
    ).toBe("60.000000000000");
  });
  it("flags days 8 onward but still converts and reports missing otherwise", () => {
    expect(
      selectRate("USD", "PHP", today, [manual("50", "2026-09-17")], []).status
    ).toBe("ok");
    expect(
      selectRate("USD", "PHP", today, [manual("50", "2026-09-16")], []).status
    ).toBe("stale");
    expect(selectRate("JPY", "PHP", today, [], []).status).toBe("missing");
  });
});

it("rounds per account half away from zero at destination minor units", () => {
  expect(convertBalance("1.25", [1n, 1n], 1)).toBe("1.3");
  expect(convertBalance("-1.25", [1n, 1n], 1)).toBe("-1.3");
  expect(convertBalance("0.5", [1n, 1n], 0)).toBe("1");
  expect(convertBalance("-0.5", [1n, 1n], 0)).toBe("-1");
  expect(convertBalance("1.0005", [1n, 1n], 3)).toBe("1.001");
  expect(convertBalance("0.01", [1n, 3n], 2)).toBe("0.00");
});

it("converts EUR feed crosses to JPY and KWD with destination rounding", () => {
  const rows = [
    feed("1.2", today, "USD"),
    feed("180", today, "JPY"),
    feed("0.33", today, "KWD"),
  ];
  const jpy = selectRate("USD", "JPY", today, [], rows);
  const kwd = selectRate("USD", "KWD", today, [], rows);
  if (!(jpy.ratio && kwd.ratio)) {
    throw new Error("Missing feed cross");
  }
  expect(convertBalance("1.01", jpy.ratio, 0)).toBe("152");
  expect(convertBalance("1.25", kwd.ratio, 3)).toBe("0.344");
  expect(convertBalance("-1.25", kwd.ratio, 3)).toBe("-0.344");
});

it("sums mixed decimal scales exactly at destination minor units", () => {
  expect(sumMoney(["100", "5.5", "0.01", "-2"], 2)).toBe("103.51");
  expect(sumMoney(["1.005", "-0.004", "-1.5"], 2)).toBe("-0.49");
  expect(sumMoney(["0.5", "-0.5", "1.5"], 0)).toBe("2");
});
