import { createFileRoute, getRouteApi } from "@tanstack/react-router";

import { HouseholdGate } from "@/components/household-gate";
import { ImportDetailPage } from "@/modules/imports/components/import-detail-page";
import { householdOrpc } from "@/utils/orpc";

const routeApi = getRouteApi("/_auth/imports/$importId");

const ImportPage = () => {
  const { importId } = routeApi.useParams();
  return (
    <HouseholdGate permission={{ transaction: ["read"] }}>
      {(household) => (
        <ImportDetailPage
          activeOrganizationId={household.activeOrganizationId}
          canImport={household.can({ transaction: ["create"] })}
          importId={importId}
        />
      )}
    </HouseholdGate>
  );
};

/* oxlint-disable sort-keys */
export const Route = createFileRoute("/_auth/imports/$importId")({
  component: ImportPage,
  // A missing import renders its own not-found state instead of the error page.
  loader: async ({ context, params }) => {
    try {
      return await context.queryClient.ensureQueryData(
        householdOrpc(context.activeOrganizationId).imports.get.queryOptions({
          input: { importId: params.importId },
        })
      );
    } catch {
      return null;
    }
  },
  head: ({ loaderData }) => ({
    meta: [{ title: loaderData?.fileName ?? "Import" }],
  }),
});
/* oxlint-enable sort-keys */
