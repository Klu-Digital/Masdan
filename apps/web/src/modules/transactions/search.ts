import { z } from "zod";

export type TransactionSortBy = "amount" | "date";
export type TransactionSortDirection = "asc" | "desc";

const optionalString = z
  .preprocess(
    (value) =>
      typeof value === "string" && value.length > 0 ? value : undefined,
    z.string().optional()
  )
  .optional();

const stringArray = z
  .preprocess(
    (value) => (Array.isArray(value) ? value : [value]),
    z.array(z.unknown()).transform((values) =>
      values
        .flatMap((value) => (typeof value === "string" ? value.split(",") : []))
        .map((value) => value.trim())
        .filter(Boolean)
    )
  )
  .optional()
  .default([]);

const positiveInteger = (fallback: number) =>
  z
    .preprocess(
      Number,
      z
        .number()
        .int()
        .positive()
        .or(z.unknown().transform(() => fallback))
    )
    .optional()
    .default(fallback);

export const transactionSearch = z.object({
  accountIds: stringArray,
  categoryIds: stringArray,
  dateFrom: optionalString,
  dateTo: optionalString,
  includeArchived: z
    .preprocess((value) => value === true || value === "true", z.boolean())
    .optional()
    .default(false),
  page: positiveInteger(1),
  pageSize: positiveInteger(25).transform((value) => Math.min(value, 100)),
  paidStatuses: stringArray.transform((values) =>
    values.filter(
      (value): value is "paid" | "unpaid" =>
        value === "paid" || value === "unpaid"
    )
  ),
  quickEntry: optionalString.transform((value) => value?.slice(0, 300)),
  search: optionalString.transform((value) => value?.slice(0, 120) ?? ""),
  sortBy: z
    .enum(["amount", "date"])
    .or(z.unknown().transform(() => "date" as const))
    .optional()
    .default("date"),
  sortDirection: z
    .enum(["asc", "desc"])
    .or(z.unknown().transform(() => "desc" as const))
    .optional()
    .default("desc"),
  tagIds: stringArray,
  types: stringArray.transform((values) =>
    values.filter(
      (value): value is "expense" | "income" =>
        value === "expense" || value === "income"
    )
  ),
});

export type TransactionSearch = z.output<typeof transactionSearch> &
  Record<string, unknown>;

export const DEFAULT_TRANSACTION_SEARCH: TransactionSearch = {
  accountIds: [],
  categoryIds: [],
  includeArchived: false,
  page: 1,
  pageSize: 25,
  paidStatuses: [],
  quickEntry: undefined,
  search: "",
  sortBy: "date",
  sortDirection: "desc",
  tagIds: [],
  types: [],
};
