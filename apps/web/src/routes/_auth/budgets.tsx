import { createFileRoute, getRouteApi } from "@tanstack/react-router";

import { HouseholdGate } from "@/components/household-gate";
import { monthSearch } from "@/lib/search";
import { BudgetsPage } from "@/modules/budgets/components/budgets-page";

const routeApi = getRouteApi("/_auth/budgets");

const BudgetsRoute = () => {
  const { month } = routeApi.useSearch();
  const navigate = routeApi.useNavigate();
  return (
    <HouseholdGate permission={{ budget: ["read"], transaction: ["read"] }}>
      {(household) => (
        <BudgetsPage
          activeOrganizationId={household.activeOrganizationId}
          month={month}
          onMonthChange={(next) =>
            navigate({ search: next ? { month: next } : {} })
          }
          permissions={{
            canClear: household.can({ budget: ["delete"] }),
            canUpdate: household.can({ budget: ["update"] }),
          }}
        />
      )}
    </HouseholdGate>
  );
};

export const Route = createFileRoute("/_auth/budgets")({
  component: BudgetsRoute,
  head: () => ({ meta: [{ title: "Budgets" }] }),
  validateSearch: monthSearch,
});
