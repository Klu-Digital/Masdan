import {
  Card,
  CardDescription,
  CardHeader,
  CardPanel,
  CardTitle,
} from "@masdan/ui/components/card";
import { Skeleton } from "@masdan/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, getRouteApi } from "@tanstack/react-router";

import { activeOrganizationQueryOptions } from "@/lib/organization";
import { orpc } from "@/utils/orpc";

// `getRouteApi` rather than `Route.useRouteContext()` so the component does not
// have to reference `Route`, which is declared below it.
const routeApi = getRouteApi("/_auth/dashboard");

const RouteComponent = () => {
  const { activeOrganizationId, session } = routeApi.useRouteContext();

  const privateData = useQuery(orpc.privateData.queryOptions());
  const organization = useQuery(
    activeOrganizationQueryOptions(activeOrganizationId)
  );

  return (
    <div className="mx-auto w-full space-y-6 p-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">Dashboard</h1>
        <p className="text-muted-foreground text-sm">
          Welcome back, {session.user.name}.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Organization</CardTitle>
            <CardDescription>
              The workspace everything on this page belongs to.
            </CardDescription>
          </CardHeader>
          <CardPanel>
            {organization.isPending ? (
              <Skeleton className="h-5 w-40" />
            ) : (
              <p className="text-sm">
                {organization.data?.name ?? "No active organization"}
              </p>
            )}
          </CardPanel>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>API</CardTitle>
            <CardDescription>
              A round trip through an authenticated procedure.
            </CardDescription>
          </CardHeader>
          <CardPanel>
            {privateData.isPending ? (
              <Skeleton className="h-5 w-40" />
            ) : (
              <p className="text-sm">{privateData.data?.message}</p>
            )}
          </CardPanel>
        </Card>
      </div>
    </div>
  );
};

export const Route = createFileRoute("/_auth/dashboard")({
  component: RouteComponent,
  head: () => ({ meta: [{ title: "Dashboard" }] }),
});
