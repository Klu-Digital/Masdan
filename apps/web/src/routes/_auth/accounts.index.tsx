import { createFileRoute } from "@tanstack/react-router";

import { HouseholdGate } from "@/components/household-gate";
import { AccountsOverview } from "@/modules/accounts/components/accounts-overview";

const AccountsPage = () => (
  <HouseholdGate permission={{ financialAccount: ["read"] }}>
    {(household) => <AccountsOverview household={household} />}
  </HouseholdGate>
);

export const Route = createFileRoute("/_auth/accounts/")({
  component: AccountsPage,
  head: () => ({ meta: [{ title: "Accounts" }] }),
});
