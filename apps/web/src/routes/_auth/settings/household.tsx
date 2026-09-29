import { createFileRoute } from "@tanstack/react-router";

import { HouseholdSettingsPage } from "@/modules/household/components/household-settings-page";

export const Route = createFileRoute("/_auth/settings/household")({
  component: HouseholdSettingsPage,
  head: () => ({ meta: [{ title: "Household" }] }),
});
