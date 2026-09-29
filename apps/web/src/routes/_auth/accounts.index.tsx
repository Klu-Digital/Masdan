import { createFileRoute } from "@tanstack/react-router";

import { HouseholdGate } from "@/components/household-gate";
import { AccountsOverview } from "@/modules/accounts/components/accounts-overview";
import { accountsQueries } from "@/modules/accounts/queries";
import { prefetch } from "@/utils/prefetch";

const AccountsPage = () => (
  <HouseholdGate permission={{ financialAccount: ["read"] }}>
    {(household) => <AccountsOverview household={household} />}
  </HouseholdGate>
);

export const Route = createFileRoute("/_auth/accounts/")({
  component: AccountsPage,
  head: () => ({ meta: [{ title: "Accounts" }] }),
  loader: ({ context }) => {
    if (context.activeOrganizationId) {
      prefetch(
        context.queryClient,
        accountsQueries(context.activeOrganizationId)
      );
    }
  },
});
