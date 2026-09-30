import type {
  CalculationBasis,
  CreditFrequency,
  DayCountBasis,
  InterestTerm,
  InterestTerms,
  TierMode,
} from "@masdan/api/interest/constants";
import { DEFAULT_WITHHOLDING_TAX_RATE } from "@masdan/api/interest/constants";
import { accountInterestValues } from "@masdan/api/interest/schema";
import type { AccountInterestValues } from "@masdan/api/interest/schema";

import { trimDecimal } from "@/modules/transactions/transaction-form-model";
import type { RouterOutputs } from "@/utils/orpc";

import { termKey } from "./interest";
import type { CatalogProduct } from "./interest";

/** What the interest section edits: strings, the way inputs hold them. */
export interface TermsDraft {
  bonusAnnualRate: string;
  calculationBasis: CalculationBasis;
  conditionSummary: string;
  creditFrequency: CreditFrequency;
  dayCountBasis: DayCountBasis;
  interestCapBalance: string;
  minimumBalance: string;
  tierMode: TierMode;
  tiers: { annualRate: string; minBalance: string }[];
  withholdingTaxRate: string;
}

export interface InterestDraft {
  autoPost: boolean;
  bonusEligible: boolean;
  /** A preset's rate replaced for this account only. */
  customize: boolean;
  maturityDate: string;
  mode: "none" | "preset" | "custom";
  productId: string | null;
  startDate: string;
  termKey: string;
  terms: TermsDraft;
}

export const EMPTY_TERMS: TermsDraft = {
  bonusAnnualRate: "",
  calculationBasis: "eod",
  conditionSummary: "",
  creditFrequency: "monthly",
  dayCountBasis: "365",
  interestCapBalance: "",
  minimumBalance: "",
  tierMode: "marginal",
  tiers: [{ annualRate: "", minBalance: "0" }],
  withholdingTaxRate: DEFAULT_WITHHOLDING_TAX_RATE,
};

const NO_INTEREST: InterestDraft = {
  autoPost: true,
  bonusEligible: false,
  customize: false,
  maturityDate: "",
  mode: "none",
  productId: null,
  startDate: "",
  termKey: "",
  terms: EMPTY_TERMS,
};

export const draftTerms = (terms: InterestTerms): TermsDraft => ({
  bonusAnnualRate: trimDecimal(terms.bonusAnnualRate ?? ""),
  calculationBasis: terms.calculationBasis,
  conditionSummary: terms.conditionSummary ?? "",
  creditFrequency: terms.creditFrequency,
  dayCountBasis: terms.dayCountBasis,
  interestCapBalance: trimDecimal(terms.interestCapBalance ?? ""),
  minimumBalance: trimDecimal(terms.minimumBalance ?? ""),
  tierMode: terms.tierMode,
  tiers: terms.tiers.map((tier) => ({
    annualRate: trimDecimal(tier.annualRate),
    minBalance: trimDecimal(tier.minBalance) || "0",
  })),
  withholdingTaxRate: trimDecimal(terms.withholdingTaxRate) || "0",
});

type SavedInterest = RouterOutputs["accounts"]["get"]["interest"];

export const interestDraftOf = (saved: SavedInterest): InterestDraft => {
  if (!saved) {
    return NO_INTEREST;
  }
  const custom = saved.customTerms;
  return {
    autoPost: saved.autoPost,
    bonusEligible: saved.bonusEligible,
    customize: custom !== null && saved.productId !== null,
    maturityDate: saved.maturityDate ?? "",
    mode: saved.productId ? "preset" : "custom",
    productId: saved.productId,
    startDate: saved.startDate ?? "",
    termKey: termKey(saved.term),
    terms: custom ? draftTerms(custom) : EMPTY_TERMS,
  };
};

export const termOfKey = (key: string): InterestTerm | null => {
  const [count, unit] = key.split("-");
  return count && (unit === "day" || unit === "month")
    ? { count: Number(count), unit }
    : null;
};

const optional = (value: string): string | null => value.trim() || null;

const termsOfDraft = (draft: TermsDraft) => ({
  bonusAnnualRate: optional(draft.bonusAnnualRate),
  calculationBasis: draft.calculationBasis,
  conditionSummary: optional(draft.conditionSummary),
  creditFrequency: draft.creditFrequency,
  dayCountBasis: draft.dayCountBasis,
  interestCapBalance: optional(draft.interestCapBalance),
  minimumBalance: optional(draft.minimumBalance),
  tierMode: draft.tierMode,
  tiers: draft.tiers.map((tier) => ({
    annualRate: tier.annualRate.trim(),
    minBalance: tier.minBalance.trim() || "0",
  })),
  withholdingTaxRate: draft.withholdingTaxRate.trim(),
});

export type InterestPayload =
  | { ok: true; value: AccountInterestValues | null }
  | { message: string; ok: false };

/** The API's shape, or the first thing wrong with the draft. */
export const interestPayload = (
  draft: InterestDraft,
  product: CatalogProduct | null
): InterestPayload => {
  if (draft.mode === "none") {
    return { ok: true, value: null };
  }
  const preset = draft.mode === "preset";
  if (preset && !product) {
    return { message: "Choose a product, or a custom rate", ok: false };
  }
  const hasTenors = preset && product?.schedules.some(({ term }) => term);
  if (hasTenors && !draft.termKey) {
    return { message: "Choose a tenor", ok: false };
  }
  const ownTerms =
    !preset || draft.customize || product?.schedules.length === 0;
  const parsed = accountInterestValues.safeParse({
    autoPost: draft.autoPost,
    bonusEligible: draft.bonusEligible,
    maturityDate: optional(draft.maturityDate),
    productId: preset ? draft.productId : null,
    startDate: optional(draft.startDate),
    term: termOfKey(draft.termKey),
    terms: ownTerms ? termsOfDraft(draft.terms) : null,
  });
  if (!parsed.success) {
    return {
      message: parsed.error.issues[0]?.message ?? "Check the interest details",
      ok: false,
    };
  }
  return { ok: true, value: parsed.data };
};
