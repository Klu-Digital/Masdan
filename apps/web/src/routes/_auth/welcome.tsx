import { Navigate, createFileRoute, getRouteApi } from "@tanstack/react-router";
import { z } from "zod";

import { HouseholdGate } from "@/components/household-gate";
import {
  ONBOARDING_STEPS,
  OnboardingPage,
} from "@/modules/onboarding/components/onboarding-page";

const routeApi = getRouteApi("/_auth/welcome");

const WelcomePage = () => {
  const { step = "household" } = routeApi.useSearch();
  const navigate = routeApi.useNavigate();

  return (
    <HouseholdGate>
      {(household) =>
        // Setup edits the household; anyone who cannot has nothing to set up.
        household.profile && household.can({ organization: ["update"] }) ? (
          <OnboardingPage
            activeOrganizationId={household.activeOrganizationId}
            householdName={household.organization?.name ?? ""}
            onStep={(next) => navigate({ search: { step: next } })}
            profile={household.profile}
            step={step}
          />
        ) : (
          <Navigate replace to="/dashboard" />
        )
      }
    </HouseholdGate>
  );
};

export const Route = createFileRoute("/_auth/welcome")({
  component: WelcomePage,
  head: () => ({ meta: [{ title: "Welcome" }] }),
  validateSearch: z.object({
    // An unknown step starts over rather than failing the route.
    step: z
      .enum(ONBOARDING_STEPS)
      .optional()
      .or(z.unknown().transform((): undefined => undefined))
      .optional(),
  }),
});
