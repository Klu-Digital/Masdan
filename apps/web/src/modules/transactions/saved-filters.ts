import { transactionSearch } from "./search";
import type { TransactionSearch } from "./search";

/**
 * The ledger's filters and sort remembered per household in this browser.
 * Free-text search and a linked `quickEntry` line are left out: they describe
 * one visit, not a way of looking at the ledger.
 */
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

/**
 * Whether the URL asks for nothing in particular. The router writes the
 * schema's defaults into every `/transactions` link, so a bare visit is not an
 * empty search string but one that equals the defaults.
 */
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

/**
 * What to restore, or `null` when nothing is saved or what is saved is just
 * the defaults. Stored JSON goes back through the URL schema, so a stale or
 * hand-edited value degrades to defaults instead of breaking the page.
 */
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
