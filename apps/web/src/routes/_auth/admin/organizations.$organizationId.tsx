import { Badge } from "@masdan/ui/components/badge";
import {
  Card,
  CardDescription,
  CardHeader,
  CardPanel,
  CardTitle,
} from "@masdan/ui/components/card";
import {
  Empty,
  EmptyDescription,
  EmptyTitle,
} from "@masdan/ui/components/empty";
import { Skeleton } from "@masdan/ui/components/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@masdan/ui/components/table";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, getRouteApi } from "@tanstack/react-router";

import { formatDate } from "@/lib/dates";
import { orpc } from "@/utils/orpc";

const routeApi = getRouteApi("/_auth/admin/organizations/$organizationId");

const RouteComponent = () => {
  const { organizationId } = routeApi.useParams();
  const detail = useQuery(
    orpc.admin.organizations.detail.queryOptions({ input: { organizationId } })
  );

  if (detail.isPending) {
    return <Skeleton className="h-64 w-full" />;
  }

  if (!detail.data?.organization) {
    return (
      <Empty>
        <EmptyTitle>Organization not found</EmptyTitle>
        <EmptyDescription>
          It may have been deleted since this list was loaded.
        </EmptyDescription>
      </Empty>
    );
  }

  const { organization, members, invitations } = detail.data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          {organization.name}
          {organization.isPersonal ? (
            <Badge variant="outline">personal</Badge>
          ) : null}
        </h1>
        <p className="text-muted-foreground text-sm">/{organization.slug}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
          <CardDescription>{members.length} total</CardDescription>
        </CardHeader>
        <CardPanel>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((member) => (
                <TableRow key={member.id}>
                  <TableCell>{member.userName}</TableCell>
                  <TableCell>
                    <span className="text-muted-foreground text-xs">
                      {member.userEmail}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{member.role}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardPanel>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Invitations</CardTitle>
          <CardDescription>{invitations.length} total</CardDescription>
        </CardHeader>
        <CardPanel>
          {invitations.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Expires</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invitations.map((invitation) => (
                  <TableRow key={invitation.id}>
                    <TableCell>{invitation.email}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {invitation.role ?? "member"}
                      </Badge>
                    </TableCell>
                    <TableCell>{invitation.status}</TableCell>
                    <TableCell>
                      <span className="text-xs">
                        {formatDate(invitation.expiresAt)}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-muted-foreground text-sm">No invitations.</p>
          )}
        </CardPanel>
      </Card>
    </div>
  );
};

// `loader` before `head`, or `loaderData` infers as `never`.
/* oxlint-disable sort-keys */
export const Route = createFileRoute(
  "/_auth/admin/organizations/$organizationId"
)({
  component: RouteComponent,
  // Seeds the same cache entry `RouteComponent` reads, so naming the crumb costs
  // no second request. See `users.$userId.tsx` for the fuller reasoning.
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(
      orpc.admin.organizations.detail.queryOptions({
        input: { organizationId: params.organizationId },
      })
    ),
  // Named after the organization itself rather than the word "Organization",
  // which is the whole reason the crumb reads `head` instead of static data.
  head: ({ loaderData }) => ({
    meta: [{ title: loaderData?.organization?.name ?? "Organization" }],
  }),
});
