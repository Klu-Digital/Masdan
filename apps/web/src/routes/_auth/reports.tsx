import { createFileRoute } from "@tanstack/react-router";

import { HouseholdGate } from "@/components/household-gate";
import { ReportsPage } from "@/modules/reports/components/reports-page";

const ReportsRoute = () => (
  <HouseholdGate
    permission={{ financialAccount: ["read"], transaction: ["read"] }}
  >
    {(household) => (
      <ReportsPage
        activeOrganizationId={household.activeOrganizationId}
        currency={household.currency}
      />
    )}
  </HouseholdGate>
);

export const Route = createFileRoute("/_auth/reports")({
  component: ReportsRoute,
  head: () => ({ meta: [{ title: "Reports" }] }),
});
