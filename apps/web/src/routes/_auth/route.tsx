import { isPlatformAdmin } from "@k22i/auth/permissions";
import {
  Alert,
  AlertAction,
  AlertDescription,
} from "@k22i/ui/components/alert";
import { Button } from "@k22i/ui/components/button";
import { Separator } from "@k22i/ui/components/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@k22i/ui/components/sidebar";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Outlet,
  createFileRoute,
  getRouteApi,
  redirect,
  useRouter,
} from "@tanstack/react-router";

import AppBreadcrumbs from "@/components/app-breadcrumbs";
import AppSidebar from "@/components/app-sidebar";
import { authClient } from "@/lib/auth-client";
import { invalidateSession } from "@/lib/session";

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
    <Alert variant="warning">
      <AlertDescription>
        You are viewing this account as someone else.
      </AlertDescription>
      <AlertAction>
        <Button
          loading={stopImpersonating.isPending}
          onClick={() => stopImpersonating.mutate()}
          size="sm"
          variant="outline"
        >
          Stop impersonating
        </Button>
      </AlertAction>
    </Alert>
  );
};

const AuthLayout = () => {
  const { activeOrganizationId, session } = routeApi.useRouteContext();
  const impersonating = Boolean(session.session.impersonatedBy);

  return (
    // `bg-sidebar` hoists the page surface here so the tone runs edge to edge —
    // the provider is the centred max-width box. `h-svh` pins the shell to the
    // viewport so only the content pane scrolls.
    <div className="bg-sidebar h-svh overflow-hidden">
      <SidebarProvider className="mx-auto h-full max-w-400">
        <AppSidebar
          activeOrganizationId={activeOrganizationId}
          isPlatformAdmin={isPlatformAdmin(session.user.role)}
        />
        <SidebarInset className="overflow-hidden">
          {impersonating ? <ImpersonationBanner /> : null}
          <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
            <SidebarTrigger className="-ms-1" />
            <Separator className="me-2 h-4" orientation="vertical" />
            <AppBreadcrumbs />
          </header>
          {/* `min-h-0` is what makes `overflow-y-auto` bite. A flex child's
              default `min-height: auto` floors it at its content height, so
              without this it grows past the pane instead of scrolling inside
              it — and the overflow reappears on the window. */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            <Outlet />
          </div>
        </SidebarInset>
      </SidebarProvider>
    </div>
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
