import { createFileRoute } from "@tanstack/react-router";

import { HouseholdGate } from "@/components/household-gate";
import { TagManager } from "@/modules/tags/components/tag-manager";

const TagsPage = () => (
  <HouseholdGate permission={{ tag: ["read"] }}>
    {(household) => (
      <TagManager
        activeOrganizationId={household.activeOrganizationId}
        canArchive={household.can({ tag: ["archive"] })}
        canCreate={household.can({ tag: ["create"] })}
        canRestore={household.can({ tag: ["restore"] })}
        canUpdate={household.can({ tag: ["update"] })}
      />
    )}
  </HouseholdGate>
);

export const Route = createFileRoute("/_auth/tags")({
  component: TagsPage,
  head: () => ({ meta: [{ title: "Tags" }] }),
});
