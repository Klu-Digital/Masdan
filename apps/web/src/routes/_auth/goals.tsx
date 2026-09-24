import { createFileRoute } from "@tanstack/react-router";

import { HouseholdGate } from "@/components/household-gate";
import { GoalsPage } from "@/modules/goals/components/goals-page";

const GoalsRoute = () => (
  <HouseholdGate permission={{ savingsGoal: ["read"] }}>
    {(household) => (
      <GoalsPage
        activeOrganizationId={household.activeOrganizationId}
        householdCurrency={household.currency ?? "PHP"}
        permissions={{
          canArchive: household.can({ savingsGoal: ["archive"] }),
          canCreate: household.can({
            financialAccount: ["read"],
            savingsGoal: ["create"],
          }),
          canRestore: household.can({ savingsGoal: ["restore"] }),
          canUpdate: household.can({
            financialAccount: ["read"],
            savingsGoal: ["update"],
          }),
        }}
      />
    )}
  </HouseholdGate>
);

export const Route = createFileRoute("/_auth/goals")({
  component: GoalsRoute,
  head: () => ({ meta: [{ title: "Goals" }] }),
});
