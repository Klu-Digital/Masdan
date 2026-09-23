import { createFileRoute } from "@tanstack/react-router";

import { HouseholdGate } from "@/components/household-gate";
import { householdToday } from "@/lib/household-date";
import { CategoryManager } from "@/modules/categories/components/category-manager";

const CategoriesPage = () => (
  <HouseholdGate permission={{ category: ["read"] }}>
    {(household) => (
      <CategoryManager
        activeOrganizationId={household.activeOrganizationId}
        canArchive={household.can({ category: ["archive"] })}
        canCreate={household.can({ category: ["create"] })}
        canRestore={household.can({ category: ["restore"] })}
        canUpdate={household.can({ category: ["update"] })}
        currency={
          household.can({ transaction: ["read"] })
            ? (household.currency ?? undefined)
            : undefined
        }
        today={householdToday(household.timezone)}
      />
    )}
  </HouseholdGate>
);

export const Route = createFileRoute("/_auth/categories")({
  component: CategoriesPage,
  head: () => ({ meta: [{ title: "Categories" }] }),
});
