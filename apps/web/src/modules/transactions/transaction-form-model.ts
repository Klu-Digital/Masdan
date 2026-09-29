import {
  AMOUNT_SCALE,
  positiveAmount,
  scaledAmount as scaledPositive,
} from "@masdan/api/shared/money";
import { TRANSACTION_PAID_STATUSES } from "@masdan/api/transactions/constants";
import { z } from "zod";

const splitSchema = z.object({
  amount: positiveAmount,
  categoryId: z.string().uuid("Choose a category"),
});

/** Exact decimal arithmetic: split totals must match to the sixth place. */
export const scaledAmount = (value: string): bigint | null =>
  positiveAmount.safeParse(value).success ? scaledPositive(value.trim()) : null;

export const splitTotal = (splits: { amount: string }[]): bigint | null => {
  let total = 0n;
  for (const split of splits) {
    const amount = scaledAmount(split.amount);
    if (amount === null) {
      return null;
    }
    total += amount;
  }
  return total;
};

export const scaledToNumber = (value: bigint): number =>
  Number(value) / 10 ** AMOUNT_SCALE;

/** "300.750000" → "300.75" for editing; the API always sends six places. */
export const trimDecimal = (value: string | undefined): string => {
  if (!value) {
    return "";
  }
  return value.includes(".")
    ? value.replace(/0+$/u, "").replace(/\.$/u, "")
    : value;
};

export const transactionSchema = z
  .object({
    accountId: z.string().uuid("Choose an account"),
    amount: positiveAmount,
    categoryId: z.string().uuid("Choose a category"),
    notes: z.string().max(2000),
    paidStatus: z.enum(TRANSACTION_PAID_STATUSES),
    splits: z.array(splitSchema).max(50),
    tagIds: z.array(z.string().uuid()),
    transactionDate: z.string().min(1, "Choose a date"),
  })
  .superRefine((value, context) => {
    if (value.splits.length === 0) {
      return;
    }
    const amount = scaledAmount(value.amount);
    const total = splitTotal(value.splits);
    if (amount === null || total !== amount) {
      context.addIssue({
        code: "custom",
        message: "Split lines must add up to the amount",
        path: ["splits"],
      });
    }
  });

export type TransactionFormValues = z.infer<typeof transactionSchema>;

export type TransactionKindChoice = "expense" | "income";

export type ReviewField =
  | "accountId"
  | "amount"
  | "categoryId"
  | "paidStatus"
  | "transactionDate";

/** Values quick entry resolved, and what it could not, for the form to finish. */
export interface TransactionPrefill {
  issues: { field: ReviewField; message: string }[];
  values: Partial<
    Pick<
      TransactionFormValues,
      | "accountId"
      | "amount"
      | "categoryId"
      | "notes"
      | "paidStatus"
      | "transactionDate"
    >
  >;
}
