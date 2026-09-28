import { isPlatformAdmin } from "@masdan/auth/permissions";
import { cardCountriesFor } from "@masdan/card-catalog/countries";
import { Button } from "@masdan/ui/components/button";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Outlet,
  createFileRoute,
  getRouteApi,
  redirect,
  useRouter,
} from "@tanstack/react-router";
import { useEffect } from "react";

import { AppActionsProvider } from "@/components/app-actions";
import { AppShell } from "@/components/shell/app-shell";
import { useHousehold } from "@/hooks/use-household";
import { authClient } from "@/lib/auth-client";
import { invalidateSession } from "@/lib/session";
import { loadCardCountries } from "@/modules/accounts/card-catalog";

const routeApi = getRouteApi("/_auth");

/**
 * `impersonatedBy` is set for the whole impersonation session, which is
 * otherwise invisible on screen.
 */
const ImpersonationBanner = () => {
  const queryClient = useQueryClient();
  const router = useRouter();

  const stopImpersonating = useMutation({
    mutationFn: async () => {
      await authClient.admin.stopImpersonating();
    },
    onSuccess: async () => {
      await invalidateSession(queryClient);
      await router.invalidate();
    },
  });

  return (
    <output className="bg-warning-soft text-warning-foreground flex items-center justify-between gap-3 px-4 py-2 text-xs font-medium">
      You are viewing Masdan as someone else.
      <Button
        loading={stopImpersonating.isPending}
        onClick={() => stopImpersonating.mutate()}
        size="xs"
        variant="secondary"
      >
        Stop impersonating
      </Button>
    </output>
  );
};

const AuthLayout = () => {
  const { activeOrganizationId, session } = routeApi.useRouteContext();
  const impersonating = Boolean(session.session.impersonatedBy);
  const { currency } = useHousehold();
  // The home country's cards load with the shell, not when the first card
  // mounts, so a household's own cards never flash generic.
  useEffect(() => {
    void loadCardCountries(cardCountriesFor([currency]));
  }, [currency]);

  return (
    <AppActionsProvider>
      <AppShell
        activeOrganizationId={activeOrganizationId}
        banner={impersonating ? <ImpersonationBanner /> : null}
        isPlatformAdmin={isPlatformAdmin(session.user.role)}
      >
        <Outlet />
      </AppShell>
    </AppActionsProvider>
  );
};
export const Route = createFileRoute("/_auth")({
  beforeLoad: ({ context, location }) => {
    if (!context.session) {
      // `location.href` carries search and hash, so a deep link survives
      // sign-in.
      throw redirect({ search: { redirect: location.href }, to: "/login" });
    }

    return {
      activeOrganizationId:
        context.session.session.activeOrganizationId ?? null,
      // Re-exported so children see `Session` rather than `Session | null`; the
      // guard above has already ruled out the null.
      session: context.session,
    };
  },
  component: AuthLayout,
});
