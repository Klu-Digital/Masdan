import type {
  CalculationBasis,
  CreditFrequency,
  DayCountBasis,
  InterestTerm,
  InterestTerms,
  TierMode,
} from "@masdan/api/interest/constants";
import {
  formatDisplayMoney,
  formatScaledAmount,
  scaledAmount,
} from "@masdan/api/shared/money";

import { orpc } from "@/utils/orpc";
import type { RouterOutputs } from "@/utils/orpc";

export type InterestCatalog = RouterOutputs["interest"]["catalog"];
export type CatalogInstitution = InterestCatalog["institutions"][number];
export type CatalogProduct = InterestCatalog["products"][number];

/** Never changes between deploys, so one fetch serves the session. */
export const interestCatalogQuery = () =>
  orpc.interest.catalog.queryOptions({ staleTime: Number.POSITIVE_INFINITY });

export const CREDIT_LABELS: Record<CreditFrequency, string> = {
  daily: "Credited daily",
  maturity: "Paid at maturity",
  monthly: "Credited monthly",
};

export const BASIS_LABELS: Record<CalculationBasis, string> = {
  adb: "Average daily balance",
  eod: "End-of-day balance",
  principal: "Amount placed",
};

export const DAY_COUNT_LABELS: Record<DayCountBasis, string> = {
  "360": "360-day year",
  "365": "365-day year",
  actual: "Actual days (366 in leap years)",
};

export const TIER_MODE_LABELS: Record<TierMode, string> = {
  marginal: "Each portion at its tier's rate",
  whole_balance: "Whole balance at one tier's rate",
};

export const PRODUCT_TYPE_LABELS: Record<
  CatalogProduct["productType"],
  string
> = {
  goal_savings: "Goal savings",
  savings: "Savings",
  time_deposit: "Time deposit",
};

const TRAILING_ZEROS = /\.?0+$/u;

/** `"3.250000"` → `"3.25%"`. */
export const formatPercent = (value: string): string =>
  `${value.includes(".") ? value.replace(TRAILING_ZEROS, "") : value}%`;

/** An effective rate to two places: `"3.416666"` → `"3.42%"`. */
export const formatEffectiveRate = (value: string): string => {
  const step = 10_000n;
  const rounded = ((scaledAmount(value) + step / 2n) / step) * step;
  return formatPercent(formatScaledAmount(rounded));
};

export const termLabel = (term: InterestTerm): string => {
  const unit = term.unit === "day" ? "day" : "month";
  return `${term.count} ${unit}${term.count === 1 ? "" : "s"}`;
};

export const termKey = (term: InterestTerm | null): string =>
  term ? `${term.count}-${term.unit}` : "";

const { locale } = new Intl.NumberFormat().resolvedOptions();

const amount = (value: string, currency: string) =>
  formatDisplayMoney(value, currency, locale, true);

const compact = (value: string, currency: string): string => {
  try {
    return new Intl.NumberFormat(locale, {
      currency,
      currencyDisplay: "narrowSymbol",
      maximumFractionDigits: 2,
      notation: "compact",
      style: "currency",
    }).format(Number(value));
  } catch {
    return amount(value, currency);
  }
};

export interface TierRow {
  label: string;
  rate: string;
}

/** Each tier's balance range, compact: "Below ₱100K", "₱100K – ₱10M". */
export const tierRows = (terms: InterestTerms, currency: string): TierRow[] => {
  const { tiers } = terms;
  const whole = terms.tierMode === "whole_balance";
  return tiers.map((tier, index) => {
    const next = tiers[index + 1];
    const from = compact(tier.minBalance, currency);
    let label = `${from} – ${next ? compact(next.minBalance, currency) : ""}`;
    if (!next) {
      label = tiers.length === 1 ? "Any balance" : `${from} and up`;
    } else if (index === 0) {
      label = `${whole ? "Below" : "First"} ${compact(next.minBalance, currency)}`;
    }
    return { label, rate: formatPercent(tier.annualRate) };
  });
};

/** The tier the balance's last peso falls in, or null with nothing in it. */
export const activeTierIndex = (
  terms: InterestTerms,
  balance: string | null
): number | null => {
  if (balance === null || balance.startsWith("-")) {
    return null;
  }
  const scaled = scaledAmount(balance);
  if (scaled <= 0n) {
    return null;
  }
  const capped = terms.interestCapBalance
    ? scaledAmount(terms.interestCapBalance)
    : null;
  const top = capped !== null && scaled > capped ? capped : scaled;
  let active = 0;
  for (const [index, tier] of terms.tiers.entries()) {
    const min = scaledAmount(tier.minBalance);
    const reached = terms.tierMode === "whole_balance" ? min <= top : min < top;
    if (reached) {
      active = index;
    }
  }
  return active;
};

export const TIER_MODE_NOTES: Record<TierMode, string> = {
  marginal: "Each portion of the balance earns its own tier’s rate.",
  whole_balance: "The whole balance earns the rate of the tier it reaches.",
};

const CREDITED: Record<CreditFrequency, string> = {
  daily: "Daily",
  maturity: "At maturity",
  monthly: "Monthly",
};

const YEAR: Record<DayCountBasis, string> = {
  "360": "360 days",
  "365": "365 days",
  actual: "Actual days",
};

export interface TermFact {
  label: string;
  value: string;
}

/** The terms under the rate, as label and value. */
export const termFacts = (terms: InterestTerms, currency: string): TermFact[] =>
  [
    { label: "Credited", value: CREDITED[terms.creditFrequency] },
    { label: "Earned on", value: BASIS_LABELS[terms.calculationBasis] },
    { label: "Year", value: YEAR[terms.dayCountBasis] },
    {
      label: "Tax",
      value: `${formatPercent(terms.withholdingTaxRate)} withheld`,
    },
    terms.minimumBalance && scaledAmount(terms.minimumBalance) > 0n
      ? { label: "Earns from", value: amount(terms.minimumBalance, currency) }
      : null,
    terms.interestCapBalance
      ? {
          label: "Earns up to",
          value: amount(terms.interestCapBalance, currency),
        }
      : null,
  ].filter((fact): fact is TermFact => fact !== null);

/** "Up to 3.75%": the best a set of terms can pay, bonus included. */
export const headlineRate = (terms: InterestTerms): string => {
  let best = 0n;
  for (const tier of terms.tiers) {
    const rate = scaledAmount(tier.annualRate);
    if (rate > best) {
      best = rate;
    }
  }
  const bonus = scaledAmount(terms.bonusAnnualRate ?? "0");
  const label = formatPercent(formatScaledAmount(best + bonus));
  return terms.tiers.length > 1 || bonus > 0n ? `Up to ${label}` : label;
};
