import type {
  InterestTerm,
  InterestTerms,
  InterestTier,
} from "@masdan/db/reference/interest";

import { formatScaledAmount, scaledAmount } from "../shared/money";
import type { RateVersion } from "./engine";

/** Pure helpers over schedules, shared by the API and the web form. */

export interface ScheduleVersion extends RateVersion {
  term: InterestTerm | null;
}

export const sameTerm = (
  left: InterestTerm | null,
  right: InterestTerm | null
): boolean =>
  left === null || right === null
    ? left === right
    : left.count === right.count && left.unit === right.unit;

const inEffect = (version: RateVersion, date: string): boolean =>
  (version.effectiveFrom === null || version.effectiveFrom <= date) &&
  (version.effectiveTo === null || date <= version.effectiveTo);

/**
 * The schedule for `term` in effect on `date`; failing that the latest one
 * that had started, then the earliest: a placement booked after a weekly
 * rate lapsed still gets the rate it was most likely offered.
 */
export const scheduleOn = <T extends ScheduleVersion>(
  schedules: readonly T[],
  term: InterestTerm | null,
  date: string
): T | null => {
  const matching = schedules
    .filter((schedule) => sameTerm(schedule.term, term))
    .toSorted((left, right) =>
      (left.effectiveFrom ?? "") < (right.effectiveFrom ?? "") ? -1 : 1
    );
  return (
    matching.find((schedule) => inEffect(schedule, date)) ??
    matching.findLast(
      (schedule) =>
        schedule.effectiveFrom === null || schedule.effectiveFrom <= date
    ) ??
    matching[0] ??
    null
  );
};

const approximateDays = (term: InterestTerm): number =>
  term.unit === "day" ? term.count : term.count * 30;

/** The tenors a product is offered in, shortest first. */
export const termsOffered = (
  schedules: readonly ScheduleVersion[]
): InterestTerm[] => {
  const seen = new Map<string, InterestTerm>();
  for (const { term } of schedules) {
    if (term) {
      seen.set(`${term.count}${term.unit}`, term);
    }
  }
  return [...seen.values()].toSorted(
    (left, right) => approximateDays(left) - approximateDays(right)
  );
};

/** Open ends (`null`) lose: the bounded date wins. */
const later = (left: string | null, right: string | null) => {
  if (left === null || right === null) {
    return left ?? right;
  }
  return left > right ? left : right;
};

const earlier = (left: string | null, right: string | null) => {
  if (left === null || right === null) {
    return left ?? right;
  }
  return left < right ? left : right;
};

export interface AccountRateVersion {
  effectiveFrom: string;
  effectiveTo: string | null;
  /** `null` when the version follows its product's schedules. */
  terms: InterestTerms | null;
}

/** The account's history with each follow-the-preset span filled in. */
export const resolveVersions = (
  own: readonly AccountRateVersion[],
  schedules: readonly ScheduleVersion[],
  term: InterestTerm | null
): RateVersion[] =>
  own.flatMap((version) => {
    if (version.terms) {
      return [{ ...version, terms: version.terms }];
    }
    return schedules
      .filter((schedule) => sameTerm(schedule.term, term))
      .map((schedule) => ({
        effectiveFrom: later(version.effectiveFrom, schedule.effectiveFrom),
        effectiveTo: earlier(version.effectiveTo, schedule.effectiveTo),
        terms: schedule.terms,
      }))
      .filter(
        ({ effectiveFrom, effectiveTo }) =>
          effectiveFrom === null ||
          effectiveTo === null ||
          effectiveFrom <= effectiveTo
      );
  });

const canonical = (value: string | null): string | null =>
  value === null ? null : formatScaledAmount(scaledAmount(value));

/** Terms with every amount in one spelling, so `"3.250000"` equals `"3.25"`. */
const canonicalTerms = (terms: InterestTerms): InterestTerms => ({
  bonusAnnualRate: canonical(terms.bonusAnnualRate),
  calculationBasis: terms.calculationBasis,
  conditionSummary: terms.conditionSummary || null,
  creditFrequency: terms.creditFrequency,
  dayCountBasis: terms.dayCountBasis,
  interestCapBalance: canonical(terms.interestCapBalance),
  minimumBalance: canonical(terms.minimumBalance),
  tierMode: terms.tierMode,
  tiers: terms.tiers.map((tier): InterestTier => ({
    annualRate: canonical(tier.annualRate) ?? "0",
    minBalance: canonical(tier.minBalance) ?? "0",
  })),
  withholdingTaxRate: canonical(terms.withholdingTaxRate) ?? "0",
});

export const sameTerms = (
  left: InterestTerms | null,
  right: InterestTerms | null
): boolean =>
  left === null || right === null
    ? left === right
    : JSON.stringify(canonicalTerms(left)) ===
      JSON.stringify(canonicalTerms(right));
