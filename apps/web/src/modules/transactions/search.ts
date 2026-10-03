import { z } from "zod";

import { addDays, addMonths, endOfMonth, startOfMonth } from "@/lib/dates";

export type TransactionSortBy = "amount" | "date";
export type TransactionSortDirection = "asc" | "desc";

export const DATE_PRESETS = [
  "this-month",
  "last-month",
  "last-30",
  "this-year",
] as const;
export type DatePreset = (typeof DATE_PRESETS)[number];

export const presetRange = (preset: DatePreset, today: string) => {
  if (preset === "this-month") {
    return { dateFrom: startOfMonth(today), dateTo: today };
  }
  if (preset === "last-month") {
    const start = addMonths(startOfMonth(today), -1);
    return { dateFrom: start, dateTo: endOfMonth(start) };
  }
  if (preset === "last-30") {
    return { dateFrom: addDays(today, -29), dateTo: today };
  }
  return { dateFrom: `${today.slice(0, 4)}-01-01`, dateTo: today };
};

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

export const transactionSearch = z.object({
  accountIds: stringArray,
  categoryIds: stringArray,
  dateFrom: optionalString,
  // A preset is resolved against today on every load, so it never goes stale.
  datePreset: z
    .preprocess(
      (value) => DATE_PRESETS.find((preset) => preset === value),
      z.enum(DATE_PRESETS).optional()
    )
    .optional(),
  dateTo: optionalString,
  includeArchived: z
    .preprocess((value) => value === true || value === "true", z.boolean())
    .optional()
    .default(false),
  // Interest credits clutter the ledger, so they stay hidden until asked for.
  includeInterest: z
    .preprocess((value) => value === true || value === "true", z.boolean())
    .optional()
    .default(false),
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
  includeInterest: false,
  paidStatuses: [],
  quickEntry: undefined,
  search: "",
  sortBy: "date",
  sortDirection: "desc",
  tagIds: [],
  types: [],
};

/** The dates the ledger filters by: the preset's, else the custom range. */
export const resolveDateRange = (
  search: Pick<TransactionSearch, "dateFrom" | "datePreset" | "dateTo">,
  today: string
): { dateFrom?: string; dateTo?: string } =>
  search.datePreset
    ? presetRange(search.datePreset, today)
    : { dateFrom: search.dateFrom, dateTo: search.dateTo };
