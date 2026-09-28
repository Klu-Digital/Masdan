import { z } from "zod";

import { positiveAmount, scaledAmount } from "./amounts";
import { TRANSACTION_PAID_STATUSES } from "./constants";

/**
 * The create procedure's input schema. Quick entry runs a parsed payload
 * through this same schema before it may skip the form.
 */

export const isoDate = z.iso.date();

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

export const transactionValues = z
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
  .strict()
  .superRefine((value, context) => {
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
  });

export type TransactionCreateInput = z.output<typeof transactionValues>;
