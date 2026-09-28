import { createFileRoute } from "@tanstack/react-router";

import { HouseholdGate } from "@/components/household-gate";
import { useFeatureFlag } from "@/hooks/use-feature-flag";
import { AskMasdan } from "@/modules/ask/components/ask-masdan";
import { ReportsPage } from "@/modules/reports/components/reports-page";

const ReportsRoute = () => {
  // Cosmetic: the procedure itself is behind `requireFlag`.
  const askEnabled = useFeatureFlag("FF__ASK_MASDAN");
  return (
    <HouseholdGate
      permission={{ financialAccount: ["read"], transaction: ["read"] }}
    >
      {(household) => (
        <ReportsPage
          activeOrganizationId={household.activeOrganizationId}
          ask={askEnabled ? <AskMasdan /> : null}
          currency={household.currency}
        />
      )}
    </HouseholdGate>
  );
};

export const Route = createFileRoute("/_auth/reports")({
  component: ReportsRoute,
  head: () => ({ meta: [{ title: "Reports" }] }),
});
