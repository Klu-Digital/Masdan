import { createFileRoute, getRouteApi } from "@tanstack/react-router";

import { HouseholdGate } from "@/components/household-gate";
import { AccountDetailPage } from "@/modules/accounts/components/account-detail";
import { householdOrpc } from "@/utils/orpc";

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
    const orpc = householdOrpc(context.activeOrganizationId);
    try {
      const account = await context.queryClient.ensureQueryData(
        orpc.accounts.get.queryOptions({
          input: { accountId: params.accountId },
        })
      );
      // Started here rather than when the card panel mounts; only cards have
      // statements, so it cannot start alongside the account read.
      if (account.accountType === "credit_card") {
        void context.queryClient.prefetchQuery(
          orpc.accounts.listStatements.queryOptions({
            input: { accountId: account.id },
          })
        );
      }
      return account;
    } catch {
      return null;
    }
  },
  head: ({ loaderData }) => ({
    meta: [{ title: loaderData?.name ?? "Account" }],
  }),
});
/* oxlint-enable sort-keys */
