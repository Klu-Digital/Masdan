import { transactionSearch } from "./search";
import type { TransactionSearch } from "./search";

export type SavedFilters = Pick<
  TransactionSearch,
  | "accountIds"
  | "categoryIds"
  | "dateFrom"
  | "dateTo"
  | "includeArchived"
  | "includeInterest"
  | "paidStatuses"
  | "sortBy"
  | "sortDirection"
  | "tagIds"
  | "types"
>;

const storageKey = (householdId: string) =>
  `masdan.transactions.filters.${householdId}`;

const pick = (search: TransactionSearch): SavedFilters => ({
  accountIds: search.accountIds,
  categoryIds: search.categoryIds,
  dateFrom: search.dateFrom,
  dateTo: search.dateTo,
  includeArchived: search.includeArchived,
  includeInterest: search.includeInterest,
  paidStatuses: search.paidStatuses,
  sortBy: search.sortBy,
  sortDirection: search.sortDirection,
  tagIds: search.tagIds,
  types: search.types,
});

const DEFAULTS = pick(transactionSearch.parse({}) as TransactionSearch);

// The router writes schema defaults into every link, so compare to defaults.
export const isDefaultSearch = (search: TransactionSearch): boolean =>
  !search.search &&
  !search.quickEntry &&
  JSON.stringify(pick(search)) === JSON.stringify(DEFAULTS);

export const saveFilters = (
  householdId: string,
  search: TransactionSearch
): void => {
  try {
    window.localStorage.setItem(
      storageKey(householdId),
      JSON.stringify(pick(search))
    );
  } catch {
    // Storage may be blocked or full; the URL still carries the filters.
  }
};

// Stored JSON goes back through the URL schema, so bad values degrade.
export const loadSavedFilters = (householdId: string): SavedFilters | null => {
  try {
    const raw = window.localStorage.getItem(storageKey(householdId));
    if (!raw) {
      return null;
    }
    const saved = pick(
      transactionSearch.parse(JSON.parse(raw)) as TransactionSearch
    );
    return JSON.stringify(saved) === JSON.stringify(DEFAULTS) ? null : saved;
  } catch {
    return null;
  }
};
