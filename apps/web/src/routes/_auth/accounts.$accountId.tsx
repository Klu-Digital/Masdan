import { createFileRoute, getRouteApi } from "@tanstack/react-router";

import { HouseholdGate } from "@/components/household-gate";
import { AccountDetailPage } from "@/modules/accounts/components/account-detail";
import { accountQueryOptions } from "@/modules/accounts/queries";

const routeApi = getRouteApi("/_auth/accounts/$accountId");

const AccountPage = () => {
  const { accountId } = routeApi.useParams();
  return (
    <HouseholdGate permission={{ financialAccount: ["read"] }}>
      {(household) => (
        <AccountDetailPage accountId={accountId} household={household} />
      )}
    </HouseholdGate>
  );
};

/* oxlint-disable sort-keys */
export const Route = createFileRoute("/_auth/accounts/$accountId")({
  component: AccountPage,
  // A missing account renders its own not-found state instead of the error page.
  loader: async ({ context, params }) => {
    try {
      return await context.queryClient.ensureQueryData(
        accountQueryOptions(params.accountId)
      );
    } catch {
      return null;
    }
  },
  head: ({ loaderData }) => ({
    meta: [{ title: loaderData?.name ?? "Account" }],
  }),
});
/* oxlint-enable sort-keys */
