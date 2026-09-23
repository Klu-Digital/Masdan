import { Badge } from "@masdan/ui/components/badge";
import { Button } from "@masdan/ui/components/button";
import { Card, CardPanel } from "@masdan/ui/components/card";
import {
  Empty,
  EmptyDescription,
  EmptyTitle,
} from "@masdan/ui/components/empty";
import { Skeleton } from "@masdan/ui/components/skeleton";
import { Switch } from "@masdan/ui/components/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@masdan/ui/components/table";
import { toastManager } from "@masdan/ui/components/toast";
import type { UseMutationResult, UseQueryResult } from "@tanstack/react-query";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { authClient } from "@/lib/auth-client";
import type { client } from "@/utils/orpc";
import { orpc } from "@/utils/orpc";

const PAGE_SIZE = 50;

type SessionsResult = Awaited<ReturnType<typeof client.admin.sessions.list>>;

const SessionsList = ({
  offset,
  revokeAll,
  sessions,
  setOffset,
}: {
  offset: number;
  revokeAll: UseMutationResult<void, Error, string>;
  sessions: UseQueryResult<SessionsResult>;
  setOffset: (offset: number) => void;
}) => {
  if (sessions.isPending) {
    return <Skeleton className="h-64 w-full" />;
  }

  if (!sessions.data || sessions.data.length === 0) {
    return (
      <Empty>
        <EmptyTitle>No sessions</EmptyTitle>
        <EmptyDescription>Nothing matches this filter.</EmptyDescription>
      </Empty>
    );
  }

  const rows = sessions.data;

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>User</TableHead>
            <TableHead>IP</TableHead>
            <TableHead>Created</TableHead>
            <TableHead>Expires</TableHead>
            <TableHead>Impersonated</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((session) => (
            <TableRow key={session.id}>
              <TableCell>
                <div className="font-medium">{session.userName}</div>
                <div className="text-muted-foreground text-xs">
                  {session.userEmail}
                </div>
              </TableCell>
              <TableCell>
                <span className="text-muted-foreground text-xs">
                  {session.ipAddress ?? "—"}
                </span>
              </TableCell>
              <TableCell>
                <span className="text-xs">
                  {new Date(session.createdAt).toLocaleString()}
                </span>
              </TableCell>
              <TableCell>
                <span className="text-xs">
                  {new Date(session.expiresAt).toLocaleString()}
                </span>
              </TableCell>
              <TableCell>
                {session.impersonatedBy ? (
                  <Badge variant="warning">yes</Badge>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="text-right">
                <Button
                  loading={
                    revokeAll.isPending &&
                    revokeAll.variables === session.userId
                  }
                  onClick={() => revokeAll.mutate(session.userId)}
                  size="sm"
                  variant="ghost"
                >
                  Revoke all for user
                </Button>
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
  const [activeOnly, setActiveOnly] = useState(false);
  const queryClient = useQueryClient();

  const sessions = useQuery(
    orpc.admin.sessions.list.queryOptions({
      input: { activeOnly, limit: PAGE_SIZE, offset },
    })
  );

  const revokeAll = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await authClient.admin.revokeUserSessions({ userId });
      if (error) {
        throw new Error(error.message ?? "Could not revoke sessions");
      }
    },
    onError: (error: Error) => {
      toastManager.add({ title: error.message, type: "error" });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: orpc.admin.sessions.list.key(),
      });
      toastManager.add({ title: "Sessions revoked", type: "success" });
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Sessions</h1>
        <div className="flex items-center gap-2 text-sm">
          <label htmlFor="active-only">Active only</label>
          <Switch
            checked={activeOnly}
            id="active-only"
            onCheckedChange={(checked) => {
              setActiveOnly(checked);
              setOffset(0);
            }}
          />
        </div>
      </div>

      <Card>
        <CardPanel>
          <SessionsList
            offset={offset}
            revokeAll={revokeAll}
            sessions={sessions}
            setOffset={setOffset}
          />
        </CardPanel>
      </Card>
    </div>
  );
};

export const Route = createFileRoute("/_auth/admin/sessions")({
  component: RouteComponent,
  head: () => ({ meta: [{ title: "Sessions" }] }),
});
