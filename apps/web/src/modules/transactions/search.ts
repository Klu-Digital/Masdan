import type { SearchSchemaInput } from "@tanstack/react-router";

export type TransactionSortBy = "amount" | "date";
export type TransactionSortDirection = "asc" | "desc";

export interface TransactionSearch extends Record<string, unknown> {
  accountIds: string[];
  categoryIds: string[];
  dateFrom?: string;
  dateTo?: string;
  includeArchived: boolean;
  page: number;
  pageSize: number;
  paidStatuses: ("paid" | "unpaid")[];
  /** Text to rerun through quick entry, from a chat reply's "finish it in Masdan" link. */
  quickEntry?: string;
  search: string;
  sortBy: TransactionSortBy;
  sortDirection: TransactionSortDirection;
  tagIds: string[];
  types: ("expense" | "income")[];
}

const asString = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined;

const asStringArray = (value: unknown): string[] => {
  const values = Array.isArray(value) ? value : [value];
  return values
    .flatMap((item) => (typeof item === "string" ? item.split(",") : []))
    .map((item) => item.trim())
    .filter(Boolean);
};

const asPositiveInteger = (value: unknown, fallback: number): number => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const asBoolean = (value: unknown): boolean =>
  value === true || value === "true";

export const DEFAULT_TRANSACTION_SEARCH: TransactionSearch = {
  accountIds: [],
  categoryIds: [],
  includeArchived: false,
  page: 1,
  pageSize: 25,
  paidStatuses: [],
  search: "",
  sortBy: "date",
  sortDirection: "desc",
  tagIds: [],
  types: [],
};

export const transactionSearch = (
  search: Record<string, unknown> & SearchSchemaInput
): TransactionSearch => {
  const sortBy = asString(search.sortBy);
  const sortDirection = asString(search.sortDirection);
  const types = asStringArray(search.types).filter(
    (value): value is "expense" | "income" =>
      value === "expense" || value === "income"
  );
  const paidStatuses = asStringArray(search.paidStatuses).filter(
    (value): value is "paid" | "unpaid" =>
      value === "paid" || value === "unpaid"
  );

  return {
    accountIds: asStringArray(search.accountIds),
    categoryIds: asStringArray(search.categoryIds),
    dateFrom: asString(search.dateFrom),
    dateTo: asString(search.dateTo),
    includeArchived: asBoolean(search.includeArchived),
    page: asPositiveInteger(search.page, 1),
    pageSize: Math.min(asPositiveInteger(search.pageSize, 25), 100),
    paidStatuses,
    quickEntry: asString(search.quickEntry)?.slice(0, 300),
    search: asString(search.search)?.slice(0, 120) ?? "",
    sortBy: sortBy === "amount" ? "amount" : "date",
    sortDirection: sortDirection === "asc" ? "asc" : "desc",
    tagIds: asStringArray(search.tagIds),
    types,
  };
};
