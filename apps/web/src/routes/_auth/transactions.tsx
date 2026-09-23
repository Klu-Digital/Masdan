import {
  Outlet,
  createFileRoute,
  getRouteApi,
  useMatch,
} from "@tanstack/react-router";
import { useCallback } from "react";

import { HouseholdGate } from "@/components/household-gate";
import { TransactionsPage } from "@/modules/transactions/components/transactions-page";
import {
  DEFAULT_TRANSACTION_SEARCH,
  transactionSearch,
} from "@/modules/transactions/search";
import type { TransactionSearch } from "@/modules/transactions/search";

const routeApi = getRouteApi("/_auth/transactions");

/**
 * The ledger stays mounted while a row's detail opens over it, so the list,
 * its filters and its scroll position survive opening and closing entries.
 */
const TransactionsLayout = () => {
  const search = routeApi.useSearch();
  const navigate = routeApi.useNavigate();
  const detail = useMatch({
    from: "/_auth/transactions/$transactionId",
    shouldThrow: false,
  });

  const updateSearch = useCallback(
    (updates: Partial<TransactionSearch>, resetPage = true) => {
      navigate({
        search: (previous) => ({
          ...previous,
          ...updates,
          page: resetPage ? 1 : (updates.page ?? previous.page),
        }),
      });
    },
    [navigate]
  );
  const clearFilters = useCallback(() => {
    navigate({
      search: (previous) => ({
        ...DEFAULT_TRANSACTION_SEARCH,
        pageSize: previous.pageSize,
        sortBy: previous.sortBy,
        sortDirection: previous.sortDirection,
      }),
    });
  }, [navigate]);

  return (
    <HouseholdGate permission={{ transaction: ["read"] }}>
      {(household) => (
        <>
          <TransactionsPage
            household={household}
            onClearFilters={clearFilters}
            onSearchChange={updateSearch}
            search={search}
            selectedId={detail?.params.transactionId}
          />
          <Outlet />
        </>
      )}
    </HouseholdGate>
  );
};

export const Route = createFileRoute("/_auth/transactions")({
  component: TransactionsLayout,
  head: () => ({ meta: [{ title: "Transactions" }] }),
  validateSearch: transactionSearch,
});
