import {
  Outlet,
  createFileRoute,
  getRouteApi,
  redirect,
  useLocation,
  useMatch,
} from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";

import { HouseholdGate } from "@/components/household-gate";
import { TransactionsPage } from "@/modules/transactions/components/transactions-page";
import {
  ledgerInfiniteQuery,
  ledgerQueries,
} from "@/modules/transactions/queries";
import {
  isDefaultSearch,
  loadSavedFilters,
  saveFilters,
} from "@/modules/transactions/saved-filters";
import {
  DEFAULT_TRANSACTION_SEARCH,
  transactionSearch,
} from "@/modules/transactions/search";
import type { TransactionSearch } from "@/modules/transactions/search";
import { prefetch } from "@/utils/prefetch";

declare module "@tanstack/react-router" {
  interface HistoryState {
    /** Set by the redirect that puts last visit's filters back in the URL. */
    filtersRestored?: boolean;
  }
}

const routeApi = getRouteApi("/_auth/transactions");

/**
 * The ledger stays mounted while a row's detail opens over it, so the list,
 * its filters and its scroll position survive opening and closing entries.
 */
const TransactionsLayout = () => {
  const search = routeApi.useSearch();
  const navigate = routeApi.useNavigate();
  const { activeOrganizationId } = routeApi.useRouteContext();
  const arrivedRestored = useLocation({
    select: (location) => location.state.filtersRestored === true,
  });
  const [restored, setRestored] = useState(arrivedRestored);
  const detail = useMatch({
    from: "/_auth/transactions/$transactionId",
    shouldThrow: false,
  });

  const updateSearch = useCallback(
    (updates: Partial<TransactionSearch>) => {
      navigate({ search: (previous) => ({ ...previous, ...updates }) });
    },
    [navigate]
  );
  // Whatever is on screen is what to come back to, a cleared ledger included.
  useEffect(() => {
    if (activeOrganizationId) {
      saveFilters(activeOrganizationId, search);
    }
  }, [activeOrganizationId, search]);
  const clearFilters = useCallback(() => {
    setRestored(false);
    navigate({
      search: (previous) => ({
        ...DEFAULT_TRANSACTION_SEARCH,
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
            restoredFilters={restored}
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

/* oxlint-disable sort-keys */
export const Route = createFileRoute("/_auth/transactions")({
  component: TransactionsLayout,
  head: () => ({ meta: [{ title: "Transactions" }] }),
  // `validateSearch` and `loaderDeps` above `loader`, or `deps` infers as `{}`.
  validateSearch: transactionSearch,
  // A bare `/transactions` opens on the filters last used here, only when entering the
  // route: clearing filters while on it is also a default search. Any search in
  // the URL (a shared link, a drill-down from another page) wins over storage.
  beforeLoad: ({ cause, context, location, search }) => {
    if (
      cause !== "enter" ||
      !context.activeOrganizationId ||
      !isDefaultSearch(search) ||
      !/^\/transactions\/?$/u.test(location.pathname)
    ) {
      return;
    }
    const saved = loadSavedFilters(context.activeOrganizationId);
    if (saved) {
      throw redirect({
        replace: true,
        search: saved,
        state: { filtersRestored: true },
        to: "/transactions",
      });
    }
  },
  loaderDeps: ({ search }) => ({ search }),
  loader: ({ context, deps }) => {
    if (context.activeOrganizationId) {
      prefetch(
        context.queryClient,
        ledgerQueries(context.activeOrganizationId, deps.search)
      );
      void context.queryClient.prefetchInfiniteQuery(
        ledgerInfiniteQuery(context.activeOrganizationId, deps.search)
      );
    }
  },
});
/* oxlint-enable sort-keys */
