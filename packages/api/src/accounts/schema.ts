import { CARD_PRODUCT_KEY_PATTERN } from "@masdan/card-catalog/catalog";
import { z } from "zod";

import { TAILWIND_COLORS } from "../colors";
import { isoDate } from "../shared/dates";
import { nonNegativeAmount, signedAmount } from "../shared/money";
import {
  ACCOUNT_CLASSES,
  ACCOUNT_TYPES,
  ASSET_ACCOUNT_TYPES,
  LIABILITY_ACCOUNT_TYPES,
  LIQUIDITY_TYPES,
  SNAPSHOT_SOURCES,
} from "./constants";

export const accountValues = z
  .object({
    accountClass: z.enum(ACCOUNT_CLASSES),
    accountType: z.enum(ACCOUNT_TYPES),
    cardLastFour: z
      .string()
      .trim()
      .regex(/^\d{4}$/u, "Use the last four digits")
      .nullable()
      .optional(),
    cardNetwork: z.string().trim().max(40).nullable().optional(),
    cardProductKey: z
      .string()
      .trim()
      .max(80)
      .regex(CARD_PRODUCT_KEY_PATTERN, "Choose a card from the list")
      .nullable()
      .optional(),
    color: z.enum(TAILWIND_COLORS).nullable().optional(),
    creditLimit: nonNegativeAmount.nullable().optional(),
    currencyCode: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{3}$/u, "Use a three-letter currency code")
      .optional(),
    icon: z.string().trim().max(80).nullable().optional(),
    includeInNetWorth: z.boolean().default(true),
    institution: z.string().trim().max(120).nullable().optional(),
    liquidity: z.enum(LIQUIDITY_TYPES).nullable().optional(),
    name: z.string().trim().min(1, "Name is required").max(120),
    notes: z.string().trim().max(2000).nullable().optional(),
    openingBalance: signedAmount.default("0"),
    openingBalanceDate: isoDate.optional(),
    ownerMemberIds: z
      .array(z.uuid())
      .max(20)
      .default([])
      .refine((ids) => new Set(ids).size === ids.length, "Duplicate owner"),
    paymentDueDay: z.number().int().min(1).max(31).nullable().optional(),
    statementClosingDay: z.number().int().min(1).max(31).nullable().optional(),
  })
  .superRefine((value, context) => {
    const assetType = ASSET_ACCOUNT_TYPES.includes(
      value.accountType as (typeof ASSET_ACCOUNT_TYPES)[number]
    );
    const liabilityType = LIABILITY_ACCOUNT_TYPES.includes(
      value.accountType as (typeof LIABILITY_ACCOUNT_TYPES)[number]
    );

    if (value.accountClass === "asset" && !assetType) {
      context.addIssue({
        code: "custom",
        message: "Choose an asset account type",
        path: ["accountType"],
      });
    }
    if (value.accountClass === "liability" && !liabilityType) {
      context.addIssue({
        code: "custom",
        message: "Choose a liability account type",
        path: ["accountType"],
      });
    }
    if (
      value.accountClass === "liability" &&
      value.liquidity !== null &&
      value.liquidity !== undefined
    ) {
      context.addIssue({
        code: "custom",
        message: "Liability accounts cannot have a liquidity classification",
        path: ["liquidity"],
      });
    }

    const cardFields = [
      value.cardLastFour,
      value.cardNetwork,
      value.cardProductKey,
      value.creditLimit,
      value.paymentDueDay,
      value.statementClosingDay,
    ];
    if (
      value.accountType !== "credit_card" &&
      cardFields.some((field) => field !== null && field !== undefined)
    ) {
      context.addIssue({
        code: "custom",
        message: "Card metadata requires a credit-card account",
        path: ["accountType"],
      });
    }
  });

export type AccountValues = z.output<typeof accountValues>;

export const statementValues = z
  .object({
    accountId: z.uuid(),
    dueDate: isoDate.nullable().optional(),
    minimumAmountDue: nonNegativeAmount.nullable().optional(),
    periodEnd: isoDate,
    periodStart: isoDate,
    statementBalance: signedAmount,
    statementDate: isoDate,
  })
  .superRefine((value, context) => {
    if (value.periodStart > value.periodEnd) {
      context.addIssue({
        code: "custom",
        message: "Statement period must end on or after it starts",
        path: ["periodEnd"],
      });
    }
  });

export type StatementValues = z.output<typeof statementValues>;

export const snapshotValues = z.object({
  accountId: z.uuid(),
  balance: signedAmount,
  effectiveDate: isoDate,
  importReference: z.string().trim().max(200).nullable().optional(),
  source: z.enum(SNAPSHOT_SOURCES).default("manual"),
});

export type SnapshotValues = z.output<typeof snapshotValues>;
