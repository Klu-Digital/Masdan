import { resolveDateRange } from "@/modules/transactions/search";
import type { TransactionSearch } from "@/modules/transactions/search";
import { householdOrpc } from "@/utils/orpc";

/** The ledger's reads, shared by its route loader and its components. */
export const ledgerQueries = (
  activeOrganizationId: string,
  search: TransactionSearch,
  today: string
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
        ...resolveDateRange(search, today),
        includeArchived: search.includeArchived,
        includeInterest: search.includeInterest,
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
  search: TransactionSearch,
  today: string
) =>
  householdOrpc(activeOrganizationId).transactions.list.infiniteOptions({
    getNextPageParam: (last) =>
      last.page < last.totalPages ? last.page + 1 : undefined,
    initialPageParam: 1,
    input: (page: number) => ({
      ...search,
      ...resolveDateRange(search, today),
      page,
      pageSize: 25,
    }),
  });
