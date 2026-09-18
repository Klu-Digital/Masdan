import { Outlet, createFileRoute } from "@tanstack/react-router";

const AccountsLayout = () => <Outlet />;

export const Route = createFileRoute("/_auth/accounts")({
  component: AccountsLayout,
  head: () => ({ meta: [{ title: "Accounts" }] }),
});
