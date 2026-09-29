import { daysBetween } from "../reports/periods";
import { FEED_SOURCE } from "./feed";

const FX_STALE_AFTER_DAYS = 7;
const RATE_SCALE = 12;

export interface RateRow {
  fromCurrency: string;
  toCurrency: string;
  rate: string;
  rateDate: string;
}

export interface SelectedRate {
  currencyCode: string;
  rate: string | null;
  rateDate: string | null;
  source: "identity" | "manual" | typeof FEED_SOURCE | null;
  status: "ok" | "stale" | "missing";
  /** Exact numerator and denominator; never round an inverse before conversion. */
  ratio: readonly [bigint, bigint] | null;
}

const decimal = (value: string): readonly [bigint, bigint] => {
  const [whole = "0", fraction = ""] = value.split(".");
  return [BigInt(`${whole}${fraction}`), 10n ** BigInt(fraction.length)];
};

const roundRatio = (numerator: bigint, denominator: bigint): bigint => {
  const absolute = numerator < 0n ? -numerator : numerator;
  const rounded = (absolute * 2n + denominator) / (2n * denominator);
  return numerator < 0n ? -rounded : rounded;
};

const formatFixed = (value: bigint, minorUnits: number): string => {
  if (minorUnits === 0) {
    return String(value);
  }
  const scale = 10n ** BigInt(minorUnits);
  const absolute = value < 0n ? -value : value;
  return `${value < 0n ? "-" : ""}${absolute / scale}.${String(absolute % scale).padStart(minorUnits, "0")}`;
};

const displayRate = ([numerator, denominator]: readonly [
  bigint,
  bigint,
]): string =>
  formatFixed(
    roundRatio(numerator * 10n ** BigInt(RATE_SCALE), denominator),
    RATE_SCALE
  );

interface Candidate {
  rateDate: string;
  ratio: readonly [bigint, bigint];
  source: "manual" | typeof FEED_SOURCE;
}

const latestFeedRate = (
  currencyCode: string,
  defaultCurrency: string,
  today: string,
  feed: RateRow[]
): Candidate | null => {
  const feedByDate = new Map<string, Map<string, string>>();
  for (const row of feed) {
    if (row.fromCurrency !== "EUR" || row.rateDate > today) {
      continue;
    }
    const legs = feedByDate.get(row.rateDate) ?? new Map<string, string>();
    legs.set(row.toCurrency, row.rate);
    feedByDate.set(row.rateDate, legs);
  }
  let newest: Candidate | null = null;
  for (const [rateDate, legs] of feedByDate) {
    if (newest && rateDate <= newest.rateDate) {
      continue;
    }
    const from = currencyCode === "EUR" ? "1" : legs.get(currencyCode);
    const to = defaultCurrency === "EUR" ? "1" : legs.get(defaultCurrency);
    if (from && to) {
      const [toNum, toDen] = decimal(to);
      const [fromNum, fromDen] = decimal(from);
      newest = {
        rateDate,
        ratio: [toNum * fromDen, toDen * fromNum],
        source: FEED_SOURCE,
      };
    }
  }
  return newest;
};

/** Selects a dated direct/inverse manual rate or a same-day EUR cross. */
export const selectRate = (
  currencyCode: string,
  defaultCurrency: string,
  today: string,
  manual: RateRow[],
  feed: RateRow[]
): SelectedRate => {
  if (currencyCode === defaultCurrency) {
    return {
      currencyCode,
      rate: "1",
      rateDate: today,
      ratio: [1n, 1n],
      source: "identity",
      status: "ok",
    };
  }
  const candidates: Candidate[] = [];
  for (const row of manual) {
    if (row.rateDate > today) {
      continue;
    }
    const [numerator, denominator] = decimal(row.rate);
    if (
      row.fromCurrency === currencyCode &&
      row.toCurrency === defaultCurrency
    ) {
      candidates.push({
        rateDate: row.rateDate,
        ratio: [numerator, denominator],
        source: "manual",
      });
    } else if (
      row.fromCurrency === defaultCurrency &&
      row.toCurrency === currencyCode
    ) {
      candidates.push({
        rateDate: row.rateDate,
        ratio: [denominator, numerator],
        source: "manual",
      });
    }
  }
  const cross = latestFeedRate(currencyCode, defaultCurrency, today, feed);
  if (cross) {
    candidates.push(cross);
  }
  const priority = { [FEED_SOURCE]: 1, manual: 0 };
  candidates.sort(
    (a, b) =>
      b.rateDate.localeCompare(a.rateDate) ||
      priority[a.source] - priority[b.source]
  );
  const [best] = candidates;
  if (!best) {
    return {
      currencyCode,
      rate: null,
      rateDate: null,
      ratio: null,
      source: null,
      status: "missing",
    };
  }
  return {
    currencyCode,
    rate: displayRate(best.ratio),
    rateDate: best.rateDate,
    ratio: best.ratio,
    source: best.source,
    status:
      daysBetween(best.rateDate, today) > FX_STALE_AFTER_DAYS ? "stale" : "ok",
  };
};

/** Fixed-point conversion, half away from zero at the destination's minor units. */
export const convertBalance = (
  balance: string,
  ratio: readonly [bigint, bigint],
  minorUnits: number
): string => {
  const [amount, scale] = decimal(balance);
  const [numerator, denominator] = ratio;
  const scaled = roundRatio(
    amount * numerator * 10n ** BigInt(minorUnits),
    scale * denominator
  );
  return formatFixed(scaled, minorUnits);
};

export const sumMoney = (values: string[], minorUnits: number): string => {
  const targetScale = 10n ** BigInt(minorUnits);
  let sum = 0n;
  for (const value of values) {
    const [amount, scale] = decimal(value);
    sum += roundRatio(amount * targetScale, scale);
  }
  return formatFixed(sum, minorUnits);
};
