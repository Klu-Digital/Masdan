import { createFileRoute } from "@tanstack/react-router";

import { HouseholdGate } from "@/components/household-gate";
import { OverviewPage } from "@/modules/overview/components/overview-page";

const DashboardPage = () => (
  <HouseholdGate>
    {(household) => <OverviewPage household={household} />}
  </HouseholdGate>
);

export const Route = createFileRoute("/_auth/dashboard")({
  component: DashboardPage,
  head: () => ({ meta: [{ title: "Overview" }] }),
});
