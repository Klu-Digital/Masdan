import { createFileRoute } from "@tanstack/react-router";

import { HouseholdGate } from "@/components/household-gate";
import { ScheduleManager } from "@/modules/recurring/components/schedule-manager";

const RecurringPage = () => (
  <HouseholdGate permission={{ recurringTransaction: ["read"] }}>
    {(household) => (
      <ScheduleManager
        activeOrganizationId={household.activeOrganizationId}
        householdCurrency={household.currency ?? "PHP"}
        permissions={{
          canCreate: household.can({
            recurringTransaction: ["create"],
            transaction: ["create"],
          }),
          canStop: household.can({ recurringTransaction: ["stop"] }),
          canUpdate: household.can({ recurringTransaction: ["update"] }),
        }}
        timezone={household.timezone}
      />
    )}
  </HouseholdGate>
);

export const Route = createFileRoute("/_auth/recurring")({
  component: RecurringPage,
  head: () => ({ meta: [{ title: "Recurring" }] }),
});
