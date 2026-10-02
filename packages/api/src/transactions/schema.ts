import { z } from "zod";

import { CATEGORY_TYPES } from "../categories/constants";
import { isoDate } from "../shared/dates";
import { positiveAmount, scaledAmount } from "../shared/money";
import { TRANSACTION_PAID_STATUSES } from "./constants";

const splitTotal = (splits: { amount: string }[]): bigint => {
  let total = 0n;
  for (const split of splits) {
    total += scaledAmount(split.amount);
  }
  return total;
};

const splitValues = z.object({
  amount: positiveAmount,
  categoryId: z.uuid(),
});

const transactionFields = z
  .object({
    accountId: z.uuid(),
    amount: positiveAmount,
    categoryId: z.uuid(),
    notes: z.string().trim().max(2000).nullable().optional(),
    paidStatus: z.enum(TRANSACTION_PAID_STATUSES),
    splits: z.array(splitValues).max(50).optional(),
    tagIds: z
      .array(z.uuid())
      .max(50)
      .default([])
      .refine((ids) => new Set(ids).size === ids.length, "Duplicate tag"),
    transactionDate: isoDate,
  })
  .strict();

const validateSplitTotal = (
  value: { amount: string; splits?: { amount: string }[] },
  context: z.RefinementCtx
) => {
  if (!value.splits || value.splits.length === 0) {
    return;
  }

  const total = splitTotal(value.splits);
  if (total !== scaledAmount(value.amount)) {
    context.addIssue({
      code: "custom",
      message: "Split amounts must equal the transaction amount",
      path: ["splits"],
    });
  }
};

export const transactionValues =
  transactionFields.superRefine(validateSplitTotal);

export type TransactionCreateInput = z.output<typeof transactionValues>;

export const transactionUpdateValues = transactionFields
  .extend({
    accountId: z.uuid().nullable(),
    transactionId: z.uuid(),
  })
  .superRefine(validateSplitTotal);

export type TransactionUpdateInput = z.output<typeof transactionUpdateValues>;

const dateRangeOrder = (
  value: { dateFrom?: string; dateTo?: string },
  context: z.RefinementCtx
): void => {
  if (value.dateFrom && value.dateTo && value.dateFrom > value.dateTo) {
    context.addIssue({
      code: "custom",
      message: "The start date must be before the end date",
      path: ["dateFrom"],
    });
  }
};

const transactionFilterFields = {
  accountIds: z.array(z.uuid()).max(50).default([]),
  categoryIds: z.array(z.uuid()).max(50).default([]),
  dateFrom: isoDate.optional(),
  dateTo: isoDate.optional(),
  includeArchived: z.boolean().default(false),
  // Defaults on so Ask Masdan and other callers keep counting interest.
  includeInterest: z.boolean().default(true),
  paidStatuses: z.array(z.enum(TRANSACTION_PAID_STATUSES)).max(2).default([]),
  search: z.string().trim().max(120).default(""),
  tagIds: z.array(z.uuid()).max(50).default([]),
  types: z.array(z.enum(CATEGORY_TYPES)).max(2).default([]),
};

export const transactionFilterValues = z
  .object(transactionFilterFields)
  .superRefine(dateRangeOrder);

export const transactionListValues = z
  .object({
    ...transactionFilterFields,
    page: z.number().int().min(1).default(1),
    pageSize: z.number().int().min(1).max(100).default(25),
    sortBy: z.enum(["date", "amount"]).default("date"),
    sortDirection: z.enum(["asc", "desc"]).default("desc"),
  })
  .superRefine(dateRangeOrder);

export type TransactionFilterInput = z.output<typeof transactionFilterValues>;
export type TransactionListInput = z.output<typeof transactionListValues>;

export const transactionSummaryValues = z
  .object({
    accountIds: z.array(z.uuid()).max(50).default([]),
    dateFrom: isoDate,
    dateTo: isoDate,
  })
  .superRefine(dateRangeOrder);
