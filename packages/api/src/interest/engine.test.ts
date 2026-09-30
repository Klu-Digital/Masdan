import type { InterestTerms } from "@masdan/db/reference/interest";
import { describe, expect, it } from "vite-plus/test";

import { fixedAmountText, scaledAmount } from "../shared/money";
import { nextAnniversary } from "./calendar";
import { accrue, effectiveAnnualRate, maturityFor, totalOf } from "./engine";
import type { AccrualInput, RateVersion } from "./engine";

const terms = (overrides: Partial<InterestTerms>): InterestTerms => ({
  bonusAnnualRate: null,
  calculationBasis: "eod",
  conditionSummary: null,
  creditFrequency: "monthly",
  dayCountBasis: "365",
  interestCapBalance: null,
  minimumBalance: null,
  tierMode: "marginal",
  tiers: [{ annualRate: "3.65", minBalance: "0" }],
  withholdingTaxRate: "20",
  ...overrides,
});

const always = (value: InterestTerms): RateVersion[] => [
  { effectiveFrom: null, effectiveTo: null, terms: value },
];

const run = (
  input: Partial<AccrualInput> & {
    balance?: string;
    versions: RateVersion[];
    from: string;
    to: string;
  }
) =>
  accrue({
    anchor: null,
    balanceOn: () => scaledAmount(input.balance ?? "0"),
    bonusEligible: false,
    compound: false,
    maturityDate: null,
    minorUnits: 2,
    principal: null,
    ...input,
  });

const money = (periods: ReturnType<typeof accrue>) => {
  const total = totalOf(periods);
  return {
    gross: fixedAmountText(total.gross),
    net: fixedAmountText(total.net),
    tax: fixedAmountText(total.tax),
  };
};

const rate = (value: InterestTerms, balance: string) =>
  fixedAmountText(effectiveAnnualRate(value, scaledAmount(balance), false));

/** ₱40,000 for the first half of November, ₱70,000 after. */
const halfMonthBalances = (date: string) =>
  scaledAmount(date < "2026-11-16" ? "40000" : "70000");

const MARIBANK = terms({
  creditFrequency: "daily",
  dayCountBasis: "actual",
  tiers: [
    { annualRate: "3.25", minBalance: "0" },
    { annualRate: "3.75", minBalance: "1000000" },
  ],
});

describe("interest engine", () => {
  it("splits MariBank's balance across marginal tiers", () => {
    const periods = run({
      balance: "1500000",
      from: "2026-10-01",
      to: "2026-10-04",
      versions: always(MARIBANK),
    });

    expect(periods).toHaveLength(3);
    expect(periods[0]).toMatchObject({
      complete: true,
      creditDate: "2026-10-01",
      days: 1,
    });
    // 1M × 3.25% + 0.5M × 3.75% = 51,250 a year, over 365 days.
    expect(fixedAmountText(periods[0]?.gross ?? 0n)).toBe("140.410000");
    expect(money(periods)).toEqual({
      gross: "421.230000",
      net: "336.990000",
      tax: "84.240000",
    });
    expect(rate(MARIBANK, "1500000")).toBe("3.416666");
  });

  it("divides by 366 in a leap year on an actual-day basis", () => {
    const leap = run({
      balance: "1500000",
      from: "2028-03-01",
      to: "2028-03-02",
      versions: always(MARIBANK),
    });
    const fixed = run({
      balance: "1500000",
      from: "2028-03-01",
      to: "2028-03-02",
      versions: always({ ...MARIBANK, dayCountBasis: "365" }),
    });

    expect(money(leap).gross).toBe("140.030000");
    expect(money(fixed).gross).toBe("140.410000");
  });

  it("caps Maya Personal Goals at ₱100,000 across its ₱20,000 tiers", () => {
    const goals = terms({
      interestCapBalance: "100000",
      tiers: [
        { annualRate: "4.00", minBalance: "0" },
        { annualRate: "4.50", minBalance: "20000" },
        { annualRate: "5.00", minBalance: "40000" },
        { annualRate: "6.50", minBalance: "60000" },
        { annualRate: "8.00", minBalance: "80000" },
      ],
    });

    const periods = run({
      balance: "150000",
      from: "2026-10-01",
      to: "2026-11-01",
      versions: always(goals),
    });

    expect(periods).toEqual([
      expect.objectContaining({
        complete: true,
        creditDate: "2026-10-31",
        days: 31,
      }),
    ]);
    // 800 + 900 + 1,000 + 1,300 + 1,600 = 5,600 a year on the first ₱100k.
    expect(money(periods)).toEqual({
      gross: "475.620000",
      net: "380.500000",
      tax: "95.120000",
    });
    expect(rate(goals, "30000")).toBe("4.166666");
  });

  it("gives UNOready's whole balance the rate of the tier it reaches", () => {
    const uno = terms({
      tierMode: "whole_balance",
      tiers: [
        { annualRate: "3.00", minBalance: "0" },
        { annualRate: "3.50", minBalance: "5000" },
        { annualRate: "1.00", minBalance: "5000000" },
      ],
    });

    expect(rate(uno, "4999.99")).toBe("3.000000");
    expect(rate(uno, "5000")).toBe("3.500000");
    expect(rate(uno, "4999999.99")).toBe("3.500000");
    expect(rate(uno, "6000000")).toBe("1.000000");
  });

  it("pays BanKo nothing below ₱5,000 and 0.0625% on the excess over ₱1M", () => {
    const banko = terms({
      minimumBalance: "5000",
      tiers: [
        { annualRate: "5.00", minBalance: "0" },
        { annualRate: "0.0625", minBalance: "1000000" },
      ],
    });

    expect(rate(banko, "4999")).toBe("0.000000");
    expect(rate(banko, "5000")).toBe("5.000000");
    // 50,000 + 312.50 a year.
    expect(rate(banko, "1500000")).toBe("3.354166");
  });

  it("credits the same interest daily or once at month end", () => {
    const base = { balance: "100000", from: "2026-10-01", to: "2026-11-01" };
    const daily = run({
      ...base,
      versions: always(terms({ creditFrequency: "daily" })),
    });
    const monthly = run({ ...base, versions: always(terms({})) });

    expect(daily).toHaveLength(31);
    expect(monthly).toHaveLength(1);
    expect(money(daily).gross).toBe("310.000000");
    expect(money(monthly).gross).toBe("310.000000");
  });

  it("compounds projected daily credits into the next day's balance", () => {
    const periods = run({
      balance: "100000",
      compound: true,
      from: "2026-10-01",
      to: "2026-10-03",
      versions: always(
        terms({
          creditFrequency: "daily",
          tiers: [{ annualRate: "36.5", minBalance: "0" }],
        })
      ),
    });

    // Day one: 100.00 gross, 80.00 net, earning on 100,080 the next day.
    expect(periods.map((period) => fixedAmountText(period.gross))).toEqual([
      "100.000000",
      "100.080000",
    ]);
  });

  it("marks the month still running as incomplete, with its credit date", () => {
    const periods = run({
      balance: "100000",
      from: "2026-10-01",
      to: "2026-10-16",
      versions: always(terms({})),
    });

    expect(periods).toEqual([
      expect.objectContaining({
        complete: false,
        creditDate: "2026-10-31",
        days: 15,
        gross: scaledAmount("150"),
      }),
    ]);
  });

  it("averages the daily balance before tiering an ADB account", () => {
    const yaniSaver = terms({
      tierMode: "whole_balance",
      tiers: [
        { annualRate: "0", minBalance: "0" },
        { annualRate: "0.05", minBalance: "50000" },
      ],
    });
    const window = {
      balanceOn: halfMonthBalances,
      from: "2026-11-01",
      to: "2026-12-01",
    };

    const adb = run({
      ...window,
      versions: always({ ...yaniSaver, calculationBasis: "adb" }),
    });
    const eod = run({ ...window, versions: always(yaniSaver) });

    // ADB 55,000 earns 0.05% all month; end-of-day earns only on 70,000 days.
    expect(money(adb).gross).toBe("2.260000");
    expect(money(eod).gross).toBe("1.440000");
  });

  it("pays a time deposit's principal once, at maturity", () => {
    const deposit = terms({
      calculationBasis: "principal",
      creditFrequency: "maturity",
      tierMode: "whole_balance",
      tiers: [{ annualRate: "5.50", minBalance: "0" }],
    });
    const maturityDate = maturityFor("2026-01-15", {
      count: 12,
      unit: "month",
    });

    const periods = run({
      anchor: "2026-01-15",
      balanceOn: () => scaledAmount("999999"),
      from: "2026-01-15",
      maturityDate,
      principal: scaledAmount("100000"),
      to: "2027-06-01",
      versions: always(deposit),
    });

    expect(maturityDate).toBe("2027-01-15");
    expect(periods).toEqual([
      expect.objectContaining({
        complete: true,
        creditDate: "2027-01-15",
        days: 365,
        end: "2027-01-14",
      }),
    ]);
    expect(money(periods)).toEqual({
      gross: "5500.000000",
      net: "4400.000000",
      tax: "1100.000000",
    });
  });

  it("pays a monthly-payout deposit on the placement's anniversaries", () => {
    const earn = terms({
      calculationBasis: "principal",
      tiers: [{ annualRate: "4.75", minBalance: "0" }],
    });

    const periods = run({
      anchor: "2026-01-31",
      from: "2026-01-31",
      maturityDate: "2027-01-31",
      principal: scaledAmount("100000"),
      to: "2027-02-01",
      versions: always(earn),
    });

    expect(periods.map(({ creditDate }) => creditDate)).toEqual([
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
      "2026-05-31",
      "2026-06-30",
      "2026-07-31",
      "2026-08-31",
      "2026-09-30",
      "2026-10-31",
      "2026-11-30",
      "2026-12-31",
      "2027-01-31",
    ]);
    expect(periods.every(({ complete }) => complete)).toBe(true);
    expect(nextAnniversary("2026-01-31", "2026-02-28")).toBe("2026-03-31");
  });

  it("reads each day's rate from the schedule in effect that day", () => {
    const versions: RateVersion[] = [
      { effectiveFrom: null, effectiveTo: "2026-10-15", terms: terms({}) },
      {
        effectiveFrom: "2026-10-16",
        effectiveTo: null,
        terms: terms({ tiers: [{ annualRate: "7.30", minBalance: "0" }] }),
      },
    ];

    const periods = run({
      balance: "100000",
      from: "2026-10-01",
      to: "2026-11-01",
      versions,
    });

    // 15 days at 10.00 and 16 days at 20.00.
    expect(money(periods).gross).toBe("470.000000");
  });

  it("adds a conditional bonus only while the account qualifies", () => {
    const tonik = always(
      terms({
        bonusAnnualRate: "1.00",
        calculationBasis: "principal",
        creditFrequency: "maturity",
        tiers: [{ annualRate: "4.00", minBalance: "0" }],
      })
    );
    const placement = {
      anchor: "2026-01-01",
      from: "2026-01-01",
      maturityDate: "2026-07-01",
      principal: scaledAmount("100000"),
      to: "2026-07-01",
      versions: tonik,
    };

    // 181 days: 100,000 × 4% × 181/365 and × 5%.
    expect(money(run(placement)).gross).toBe("1983.560000");
    expect(money(run({ ...placement, bonusEligible: true })).gross).toBe(
      "2479.450000"
    );
  });

  it("earns nothing on days no schedule covers", () => {
    const periods = run({
      balance: "100000",
      from: "2026-10-01",
      to: "2026-11-01",
      versions: [
        { effectiveFrom: "2026-10-22", effectiveTo: null, terms: terms({}) },
      ],
    });

    expect(periods).toEqual([
      expect.objectContaining({ days: 10, start: "2026-10-22" }),
    ]);
  });
});
