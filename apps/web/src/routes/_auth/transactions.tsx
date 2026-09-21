import { Outlet, createFileRoute } from "@tanstack/react-router";

import { transactionSearch } from "@/modules/transactions/search";

const TransactionsLayout = () => <Outlet />;

export const Route = createFileRoute("/_auth/transactions")({
  component: TransactionsLayout,
  head: () => ({ meta: [{ title: "Transactions" }] }),
  validateSearch: transactionSearch,
});
