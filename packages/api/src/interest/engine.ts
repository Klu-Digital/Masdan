import type {
  DayCountBasis,
  InterestTerm,
  InterestTerms,
} from "@masdan/db/reference/interest";

import { scaledAmount } from "../shared/money";
import {
  addDays,
  addMonths,
  isLastDayOfMonth,
  isLeapYear,
  lastDayOfMonth,
  nextAnniversary,
} from "./calendar";

/**
 * Interest as estimated from a balance and a set of terms. Pure, and BigInt
 * throughout: amounts and rates are scaled by 1e6 like the ledger, daily
 * accruals are held at 1e18 so rounding happens once, at each credit.
 */

const SCALE = 1_000_000n;
const PERCENT = 100n;

export interface RateVersion {
  effectiveFrom: string | null;
  effectiveTo: string | null;
  terms: InterestTerms;
}

interface ParsedTerms {
  source: InterestTerms;
  tiers: { min: bigint; rate: bigint }[];
  bonus: bigint;
  minimum: bigint | null;
  cap: bigint | null;
  tax: bigint;
}

const parse = (terms: InterestTerms): ParsedTerms => ({
  bonus: terms.bonusAnnualRate ? scaledAmount(terms.bonusAnnualRate) : 0n,
  cap: terms.interestCapBalance ? scaledAmount(terms.interestCapBalance) : null,
  minimum: terms.minimumBalance ? scaledAmount(terms.minimumBalance) : null,
  source: terms,
  tax: scaledAmount(terms.withholdingTaxRate),
  tiers: terms.tiers
    .map((tier) => ({
      min: scaledAmount(tier.minBalance),
      rate: scaledAmount(tier.annualRate),
    }))
    .toSorted((left, right) => (left.min < right.min ? -1 : 1)),
});

/** Balance × percent a year, at 1e12: divide by 100 × 1e6 for money. */
const annualNumerator = (
  terms: ParsedTerms,
  balance: bigint,
  bonusEligible: boolean
): bigint => {
  if (balance <= 0n || (terms.minimum !== null && balance < terms.minimum)) {
    return 0n;
  }
  const earning =
    terms.cap !== null && balance > terms.cap ? terms.cap : balance;
  const bonus = bonusEligible ? terms.bonus : 0n;
  if (terms.source.tierMode === "whole_balance") {
    const tier = terms.tiers.findLast(({ min }) => min <= earning);
    return tier ? earning * (tier.rate + bonus) : 0n;
  }
  let total = 0n;
  for (const [index, tier] of terms.tiers.entries()) {
    const next = terms.tiers[index + 1]?.min ?? null;
    if (earning <= tier.min) {
      break;
    }
    const top = next !== null && earning > next ? next : earning;
    total += (top - tier.min) * (tier.rate + bonus);
  }
  return total;
};

const yearDays = (basis: DayCountBasis, date: string): bigint => {
  if (basis === "360") {
    return 360n;
  }
  if (basis === "365") {
    return 365n;
  }
  return isLeapYear(Number(date.slice(0, 4))) ? 366n : 365n;
};

/** One day's interest at 1e18. */
const dailyAccrual = (
  terms: ParsedTerms,
  balance: bigint,
  bonusEligible: boolean,
  date: string
): bigint =>
  (annualNumerator(terms, balance, bonusEligible) * SCALE) /
  (PERCENT * yearDays(terms.source.dayCountBasis, date));

const roundToMinor = (accrued: bigint, minorUnits: number): bigint => {
  const divisor = 10n ** BigInt(18 - minorUnits);
  const minor = (accrued + divisor / 2n) / divisor;
  return minor * 10n ** BigInt(6 - minorUnits);
};

const taxOn = (gross: bigint, rate: bigint, minorUnits: number): bigint => {
  const unit = 10n ** BigInt(6 - minorUnits);
  const raw = gross * rate;
  const divisor = PERCENT * SCALE * unit;
  return ((raw + divisor / 2n) / divisor) * unit;
};

/** Effective percent a year on `balance`, at 1e6: `3.5` is `3500000n`. */
export const effectiveAnnualRate = (
  terms: InterestTerms,
  balance: bigint,
  bonusEligible: boolean
): bigint =>
  balance <= 0n
    ? 0n
    : annualNumerator(parse(terms), balance, bonusEligible) / balance;

export const maturityFor = (start: string, term: InterestTerm): string =>
  term.unit === "day"
    ? addDays(start, term.count)
    : addMonths(start, term.count);

export interface InterestPeriod {
  /** First and last day that accrued. */
  start: string;
  end: string;
  /** When the bank pays it; `null` for a placement with no maturity. */
  creditDate: string | null;
  /** False when the range stopped before the period's credit. */
  complete: boolean;
  days: number;
  /** Money at 1e6, each rounded to the currency's minor unit. */
  gross: bigint;
  tax: bigint;
  net: bigint;
}

export interface AccrualInput {
  versions: readonly RateVersion[];
  /** Days `from` up to but excluding `to`. */
  from: string;
  to: string;
  /** End-of-day balance at 1e6. */
  balanceOn: (date: string) => bigint;
  /** A placement's start: monthly credits fall on its anniversaries. */
  anchor: string | null;
  maturityDate: string | null;
  /** A placement's amount, for `principal` terms. */
  principal: bigint | null;
  bonusEligible: boolean;
  minorUnits: number;
  /** Add each credit to the balance after it: projections, not the ledger. */
  compound: boolean;
}

const versionOn = (
  versions: readonly {
    from: string | null;
    to: string | null;
    terms: ParsedTerms;
  }[],
  date: string
) =>
  versions.find(
    ({ from, to }) =>
      (from === null || from <= date) && (to === null || date <= to)
  )?.terms ?? null;

/** The credit a period whose last day is `date` is paid on, or `undefined` if it runs on. */
const creditAfter = (
  terms: ParsedTerms,
  date: string,
  input: Pick<AccrualInput, "anchor" | "maturityDate">
): string | null | undefined => {
  const next = addDays(date, 1);
  if (input.maturityDate !== null && next === input.maturityDate) {
    return input.maturityDate;
  }
  switch (terms.source.creditFrequency) {
    case "daily": {
      return date;
    }
    case "monthly": {
      if (input.anchor === null) {
        return isLastDayOfMonth(date) ? date : undefined;
      }
      return nextAnniversary(input.anchor, date) === next ? next : undefined;
    }
    default: {
      return undefined;
    }
  }
};

/** Where an unfinished period will be paid. */
const pendingCredit = (
  terms: ParsedTerms,
  date: string,
  input: Pick<AccrualInput, "anchor" | "maturityDate">
): string | null => {
  let credit: string | null = null;
  if (terms.source.creditFrequency === "daily") {
    credit = date;
  } else if (terms.source.creditFrequency === "monthly") {
    credit =
      input.anchor === null
        ? lastDayOfMonth(date)
        : nextAnniversary(input.anchor, date);
  }
  if (
    input.maturityDate !== null &&
    (credit === null || credit > input.maturityDate)
  ) {
    return input.maturityDate;
  }
  return credit;
};

interface Bucket {
  days: { date: string; balance: bigint; terms: ParsedTerms }[];
}

const bucketAccrual = (bucket: Bucket, bonusEligible: boolean): bigint => {
  const [first] = bucket.days;
  if (!first) {
    return 0n;
  }
  let average: bigint | null = null;
  if (first.terms.source.calculationBasis === "adb") {
    let total = 0n;
    for (const day of bucket.days) {
      total += day.balance;
    }
    average = total / BigInt(bucket.days.length);
  }
  let accrued = 0n;
  for (const day of bucket.days) {
    accrued += dailyAccrual(
      day.terms,
      average ?? day.balance,
      bonusEligible,
      day.date
    );
  }
  return accrued;
};

/** Every credit period touched by `[from, to)`, oldest first. */
export const accrue = (input: AccrualInput): InterestPeriod[] => {
  const versions = input.versions.map((version) => ({
    from: version.effectiveFrom,
    terms: parse(version.terms),
    to: version.effectiveTo,
  }));
  const periods: InterestPeriod[] = [];
  let carried = 0n;
  let bucket: Bucket = { days: [] };

  const close = (creditDate: string | null, complete: boolean) => {
    const [first] = bucket.days;
    const last = bucket.days.at(-1);
    if (!(first && last)) {
      return;
    }
    const gross = roundToMinor(
      bucketAccrual(bucket, input.bonusEligible),
      input.minorUnits
    );
    const tax = taxOn(gross, last.terms.tax, input.minorUnits);
    periods.push({
      complete,
      creditDate,
      days: bucket.days.length,
      end: last.date,
      gross,
      net: gross - tax,
      start: first.date,
      tax,
    });
    if (complete && input.compound) {
      carried += gross - tax;
    }
    bucket = { days: [] };
  };

  let lastTerms: ParsedTerms | null = null;
  for (let date = input.from; date < input.to; date = addDays(date, 1)) {
    if (input.maturityDate !== null && date >= input.maturityDate) {
      break;
    }
    const terms = versionOn(versions, date);
    if (!terms) {
      close(
        lastTerms ? pendingCredit(lastTerms, addDays(date, -1), input) : null,
        false
      );
      continue;
    }
    // ADB and the credit cadence are per set of terms: a change starts afresh.
    if (
      lastTerms &&
      lastTerms !== terms &&
      (lastTerms.source.calculationBasis !== terms.source.calculationBasis ||
        lastTerms.source.creditFrequency !== terms.source.creditFrequency)
    ) {
      close(pendingCredit(lastTerms, addDays(date, -1), input), false);
    }
    lastTerms = terms;
    const balance =
      terms.source.calculationBasis === "principal"
        ? (input.principal ?? input.balanceOn(date))
        : input.balanceOn(date) + carried;
    bucket.days.push({ balance, date, terms });
    const credit = creditAfter(terms, date, input);
    if (credit !== undefined) {
      close(credit, true);
    }
  }
  const last = bucket.days.at(-1);
  if (last) {
    close(pendingCredit(last.terms, last.date, input), false);
  }
  return periods;
};

export interface InterestTotals {
  gross: bigint;
  tax: bigint;
  net: bigint;
}

export const totalOf = (periods: readonly InterestPeriod[]): InterestTotals => {
  const totals = { gross: 0n, net: 0n, tax: 0n };
  for (const period of periods) {
    totals.gross += period.gross;
    totals.net += period.net;
    totals.tax += period.tax;
  }
  return totals;
};
