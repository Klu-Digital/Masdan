import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { z } from "zod";

import { HouseholdGate } from "@/components/household-gate";
import { optionalSearchString } from "@/lib/search";
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
  validateSearch: z.object({ accountId: optionalSearchString }),
});
