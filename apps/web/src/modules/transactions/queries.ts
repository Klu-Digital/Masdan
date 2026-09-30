import type { TransactionSearch } from "@/modules/transactions/search";
import { householdOrpc } from "@/utils/orpc";

/** The ledger's reads, shared by its route loader and its components. */
export const ledgerQueries = (
  activeOrganizationId: string,
  search: TransactionSearch
) => {
  const orpc = householdOrpc(activeOrganizationId);
  return {
    accounts: orpc.accounts.list.queryOptions({
      input: { includeArchived: true },
    }),
    categories: orpc.categories.list.queryOptions({
      input: { includeArchived: true },
    }),
    tags: orpc.tags.list.queryOptions({ input: { includeArchived: true } }),
    totals: orpc.transactions.totals.queryOptions({
      input: {
        accountIds: search.accountIds,
        categoryIds: search.categoryIds,
        dateFrom: search.dateFrom,
        dateTo: search.dateTo,
        includeArchived: search.includeArchived,
        paidStatuses: search.paidStatuses,
        search: search.search,
        tagIds: search.tagIds,
        types: search.types,
      },
    }),
  };
};

/** Each scroll fetch loads 25 ledger entries; the URL owns filters, not pages. */
export const ledgerInfiniteQuery = (
  activeOrganizationId: string,
  search: TransactionSearch
) =>
  householdOrpc(activeOrganizationId).transactions.list.infiniteOptions({
    getNextPageParam: (last) =>
      last.page < last.totalPages ? last.page + 1 : undefined,
    initialPageParam: 1,
    input: (page: number) => ({ ...search, page, pageSize: 25 }),
  });
