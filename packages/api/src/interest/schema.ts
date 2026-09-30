import {
  CALCULATION_BASES,
  CREDIT_FREQUENCIES,
  DAY_COUNT_BASES,
  TERM_UNITS,
  TIER_MODES,
} from "@masdan/db/reference/interest";
import { z } from "zod";

import { isoDate } from "../shared/dates";
import {
  nonNegativeAmount,
  positiveAmount,
  scaledAmount,
} from "../shared/money";

/** Account types a bank pays interest on. */
export const INTEREST_ACCOUNT_TYPES = [
  "bank",
  "e_wallet",
  "investment",
] as const;

const MAX_PERCENT = scaledAmount("100");

const percentValue = z
  .string()
  .trim()
  .regex(/^\d{1,3}(?<fraction>\.\d{1,6})?$/u, "Use a rate like 3.25")
  .refine((value) => scaledAmount(value) <= MAX_PERCENT, "Use at most 100%");

const interestTermValues = z.object({
  count: z.number().int().min(1).max(3650),
  unit: z.enum(TERM_UNITS),
});

const interestTermsValues = z
  .object({
    bonusAnnualRate: percentValue.nullable().default(null),
    calculationBasis: z.enum(CALCULATION_BASES),
    conditionSummary: z.string().trim().max(500).nullable().default(null),
    creditFrequency: z.enum(CREDIT_FREQUENCIES),
    dayCountBasis: z.enum(DAY_COUNT_BASES),
    interestCapBalance: positiveAmount.nullable().default(null),
    minimumBalance: nonNegativeAmount.nullable().default(null),
    tierMode: z.enum(TIER_MODES),
    tiers: z
      .array(
        z.object({ annualRate: percentValue, minBalance: nonNegativeAmount })
      )
      .min(1, "Add a rate")
      .max(20),
    withholdingTaxRate: percentValue,
  })
  .superRefine((value, context) => {
    const mins = value.tiers.map((tier) => scaledAmount(tier.minBalance));
    if (mins[0] !== 0n) {
      context.addIssue({
        code: "custom",
        message: "The first tier starts at zero",
        path: ["tiers", 0, "minBalance"],
      });
    }
    for (const [index, min] of mins.entries()) {
      const previous = mins[index - 1];
      if (previous !== undefined && min <= previous) {
        context.addIssue({
          code: "custom",
          message: "Each tier starts above the one before",
          path: ["tiers", index, "minBalance"],
        });
      }
    }
  });

export const accountInterestValues = z
  .object({
    /** Post each estimated credit to the ledger on its credit date. */
    autoPost: z.boolean().default(true),
    bonusEligible: z.boolean().default(false),
    maturityDate: isoDate.nullable().default(null),
    /** The preset it was chosen from; `null` for a custom rate. */
    productId: z.uuid().nullable().default(null),
    startDate: isoDate.nullable().default(null),
    term: interestTermValues.nullable().default(null),
    /** `null` follows the preset; set, the account keeps these terms. */
    terms: interestTermsValues.nullable().default(null),
  })
  .superRefine((value, context) => {
    if (value.productId === null && value.terms === null) {
      context.addIssue({
        code: "custom",
        message: "Choose a preset or enter a rate",
        path: ["productId"],
      });
    }
    if (
      value.startDate !== null &&
      value.maturityDate !== null &&
      value.maturityDate <= value.startDate
    ) {
      context.addIssue({
        code: "custom",
        message: "Maturity comes after the placement date",
        path: ["maturityDate"],
      });
    }
  });

export type AccountInterestValues = z.output<typeof accountInterestValues>;
