import { createFileRoute, getRouteApi } from "@tanstack/react-router";

import { HouseholdGate } from "@/components/household-gate";
import { BillsPage } from "@/modules/bills/components/bills-page";

const MONTH_PATTERN = /^[12]\d{3}-(?:0[1-9]|1[0-2])$/u;

const routeApi = getRouteApi("/_auth/bills");

const BillsRoute = () => {
  const { month } = routeApi.useSearch();
  const navigate = routeApi.useNavigate();
  return (
    <HouseholdGate permission={{ bill: ["read"] }}>
      {(household) => (
        <BillsPage
          activeOrganizationId={household.activeOrganizationId}
          canConfirm={household.can({
            bill: ["confirm"],
            transaction: ["read"],
          })}
          month={month}
          onMonthChange={(next) =>
            navigate({ search: next ? { month: next } : {} })
          }
        />
      )}
    </HouseholdGate>
  );
};

export const Route = createFileRoute("/_auth/bills")({
  component: BillsRoute,
  head: () => ({ meta: [{ title: "Bills" }] }),
  validateSearch: (search: Record<string, unknown>): { month?: string } =>
    typeof search.month === "string" && MONTH_PATTERN.test(search.month)
      ? { month: search.month }
      : {},
});
