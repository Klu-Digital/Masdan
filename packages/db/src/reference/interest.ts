export const INSTITUTION_TYPES = [
  "digital_bank",
  "bank",
  "savings_bank",
  "rural_bank",
  "channel",
] as const;
export type InstitutionType = (typeof INSTITUTION_TYPES)[number];

export const INTEREST_PRODUCT_TYPES = [
  "savings",
  "goal_savings",
  "time_deposit",
] as const;
export type InterestProductType = (typeof INTEREST_PRODUCT_TYPES)[number];

/** `marginal`: each slice earns its tier's rate. `whole_balance`: one rate. */
export const TIER_MODES = ["marginal", "whole_balance"] as const;
export type TierMode = (typeof TIER_MODES)[number];

/** End-of-day balance, average daily balance, or a fixed placement. */
export const CALCULATION_BASES = ["eod", "adb", "principal"] as const;
export type CalculationBasis = (typeof CALCULATION_BASES)[number];

/** `actual`: 366 in a leap year, 365 otherwise. */
export const DAY_COUNT_BASES = ["actual", "365", "360"] as const;
export type DayCountBasis = (typeof DAY_COUNT_BASES)[number];

export const CREDIT_FREQUENCIES = ["daily", "monthly", "maturity"] as const;
export type CreditFrequency = (typeof CREDIT_FREQUENCIES)[number];

export const TERM_UNITS = ["day", "month"] as const;
export type TermUnit = (typeof TERM_UNITS)[number];

/** A tier starts at `minBalance`; it ends where the next one starts. */
export interface InterestTier {
  minBalance: string;
  /** Percent per annum: `"3.25"`. */
  annualRate: string;
}

/** The Philippines' final tax on deposit interest. */
export const DEFAULT_WITHHOLDING_TAX_RATE = "20";

/** One version of how a product or an account earns interest. */
export interface InterestTerms {
  tierMode: TierMode;
  tiers: InterestTier[];
  calculationBasis: CalculationBasis;
  dayCountBasis: DayCountBasis;
  creditFrequency: CreditFrequency;
  /** Percent of gross interest. */
  withholdingTaxRate: string;
  /** Below this, nothing earns. */
  minimumBalance: string | null;
  /** Balance above this earns nothing. */
  interestCapBalance: string | null;
  /** Added to every tier while the account meets `conditionSummary`. */
  bonusAnnualRate: string | null;
  conditionSummary: string | null;
}

export interface InterestTerm {
  count: number;
  unit: TermUnit;
}
