import { createFileRoute, getRouteApi } from "@tanstack/react-router";

import { HouseholdGate } from "@/components/household-gate";
import { NewImportPage } from "@/modules/imports/components/new-import-page";

const routeApi = getRouteApi("/_auth/imports/");

const ImportsPage = () => {
  const { accountId } = routeApi.useSearch();
  return (
    <HouseholdGate permission={{ transaction: ["create"] }}>
      {(household) => (
        <NewImportPage
          accountId={accountId}
          activeOrganizationId={household.activeOrganizationId}
        />
      )}
    </HouseholdGate>
  );
};

export const Route = createFileRoute("/_auth/imports/")({
  component: ImportsPage,
  head: () => ({ meta: [{ title: "Import" }] }),
  validateSearch: (search: Record<string, unknown>): { accountId?: string } =>
    typeof search.accountId === "string" ? { accountId: search.accountId } : {},
});
