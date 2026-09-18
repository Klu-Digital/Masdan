import { Outlet, createFileRoute } from "@tanstack/react-router";

const TransactionsLayout = () => <Outlet />;

export const Route = createFileRoute("/_auth/transactions")({
  component: TransactionsLayout,
  head: () => ({ meta: [{ title: "Transactions" }] }),
});
