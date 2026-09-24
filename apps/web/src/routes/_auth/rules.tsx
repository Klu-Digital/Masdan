import { createFileRoute } from "@tanstack/react-router";

import { HouseholdGate } from "@/components/household-gate";
import { RuleManager } from "@/modules/rules/components/rule-manager";

const RulesPage = () => (
  <HouseholdGate permission={{ rule: ["read"] }}>
    {(household) => (
      <RuleManager
        activeOrganizationId={household.activeOrganizationId}
        canCreate={household.can({ rule: ["create"] })}
        canDelete={household.can({ rule: ["delete"] })}
        canUpdate={household.can({ rule: ["update"] })}
      />
    )}
  </HouseholdGate>
);

export const Route = createFileRoute("/_auth/rules")({
  component: RulesPage,
  head: () => ({ meta: [{ title: "Rules" }] }),
});
