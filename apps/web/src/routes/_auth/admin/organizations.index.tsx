import { Badge } from "@masdan/ui/components/badge";
import { Button } from "@masdan/ui/components/button";
import { Card, CardHeader, CardPanel } from "@masdan/ui/components/card";
import {
  Empty,
  EmptyDescription,
  EmptyTitle,
} from "@masdan/ui/components/empty";
import { Input } from "@masdan/ui/components/input";
import { Skeleton } from "@masdan/ui/components/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@masdan/ui/components/table";
import type { UseQueryResult } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import type { RouterOutputs } from "@/utils/orpc";
import { orpc } from "@/utils/orpc";

const PAGE_SIZE = 50;

type OrganizationsResult = RouterOutputs["admin"]["organizations"]["list"];

const OrganizationsList = ({
  offset,
  organizations,
  setOffset,
}: {
  offset: number;
  organizations: UseQueryResult<OrganizationsResult>;
  setOffset: (offset: number) => void;
}) => {
  if (organizations.isPending) {
    return <Skeleton className="h-64 w-full" />;
  }

  if (!organizations.data || organizations.data.length === 0) {
    return (
      <Empty>
        <EmptyTitle>No organizations</EmptyTitle>
        <EmptyDescription>Nothing matches this search.</EmptyDescription>
      </Empty>
    );
  }

  const rows = organizations.data;

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Members</TableHead>
            <TableHead>Pending invites</TableHead>
            <TableHead>Files</TableHead>
            <TableHead>Created</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((org) => (
            <TableRow key={org.id}>
              <TableCell>
                <Link
                  className="font-medium hover:underline"
                  params={{ organizationId: org.id }}
                  to="/admin/organizations/$organizationId"
                >
                  {org.name}
                </Link>
                {org.isPersonal ? (
                  <Badge className="ml-2" variant="outline">
                    personal
                  </Badge>
                ) : null}
              </TableCell>
              <TableCell>{org.memberCount}</TableCell>
              <TableCell>{org.pendingInvitationCount}</TableCell>
              <TableCell>{org.fileCount}</TableCell>
              <TableCell>
                <span className="text-xs">
                  {new Date(org.createdAt).toLocaleDateString()}
                </span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className="mt-4 flex justify-end gap-2">
        <Button
          disabled={offset === 0}
          onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
          size="sm"
          variant="outline"
        >
          Previous
        </Button>
        <Button
          disabled={rows.length < PAGE_SIZE}
          onClick={() => setOffset(offset + PAGE_SIZE)}
          size="sm"
          variant="outline"
        >
          Next
        </Button>
      </div>
    </>
  );
};

const RouteComponent = () => {
  const [offset, setOffset] = useState(0);
  const [search, setSearch] = useState("");

  const organizations = useQuery(
    orpc.admin.organizations.list.queryOptions({
      input: {
        limit: PAGE_SIZE,
        offset,
        ...(search ? { search } : {}),
      },
    })
  );

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Organizations</h1>

      <Card>
        <CardHeader>
          <Input
            className="max-w-64"
            onChange={(e) => {
              setSearch(e.target.value);
              setOffset(0);
            }}
            placeholder="Search by name"
            value={search}
          />
        </CardHeader>
        <CardPanel>
          <OrganizationsList
            offset={offset}
            organizations={organizations}
            setOffset={setOffset}
          />
        </CardPanel>
      </Card>
    </div>
  );
};

export const Route = createFileRoute("/_auth/admin/organizations/")({
  component: RouteComponent,
});
