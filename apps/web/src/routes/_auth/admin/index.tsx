import { Badge } from "@masdan/ui/components/badge";
import {
  Card,
  CardDescription,
  CardHeader,
  CardPanel,
  CardTitle,
} from "@masdan/ui/components/card";
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
import { createFileRoute } from "@tanstack/react-router";
import type React from "react";

import type { RouterOutputs } from "@/utils/orpc";
import { orpc } from "@/utils/orpc";

type StatsResult = RouterOutputs["admin"]["overview"]["stats"];
type SignupsResult = RouterOutputs["admin"]["overview"]["signupsLast30Days"];
type HealthResult = RouterOutputs["admin"]["system"]["health"];

const StatCard = ({
  isPending,
  label,
  value,
}: {
  isPending: boolean;
  label: string;
  value: number | string;
}) => (
  <Card>
    <CardHeader>
      <CardDescription>{label}</CardDescription>
      {isPending ? (
        <Skeleton className="h-8 w-16" />
      ) : (
        <CardTitle>
          <span className="text-2xl font-semibold tabular-nums">{value}</span>
        </CardTitle>
      )}
    </CardHeader>
  </Card>
);

const InfraBadge = ({ label, ok }: { label: string; ok: boolean }) => (
  <div className="flex items-center justify-between py-2">
    <span className="text-sm">{label}</span>
    <Badge variant={ok ? "default" : "outline"}>
      {ok ? "OK" : "Unavailable"}
    </Badge>
  </div>
);

const StatsRow = ({ stats }: { stats: UseQueryResult<StatsResult> }) => (
  <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
    <StatCard
      isPending={stats.isPending}
      label="Users"
      value={stats.data?.users ?? 0}
    />
    <StatCard
      isPending={stats.isPending}
      label="Organizations"
      value={stats.data?.organizations ?? 0}
    />
    <StatCard
      isPending={stats.isPending}
      label="Members"
      value={stats.data?.members ?? 0}
    />
    <StatCard
      isPending={stats.isPending}
      label="Pending invites"
      value={stats.data?.pendingInvitations ?? 0}
    />
    <StatCard
      isPending={stats.isPending}
      label="Files"
      value={stats.data?.files.total ?? 0}
    />
    <StatCard
      isPending={stats.isPending}
      label="Active sessions"
      value={stats.data?.activeSessions ?? 0}
    />
  </div>
);

const SignupsCard = ({
  signups,
}: {
  signups: UseQueryResult<SignupsResult>;
}) => {
  let body: React.ReactNode;
  if (signups.isPending) {
    body = <Skeleton className="h-48 w-full" />;
  } else if (signups.data && signups.data.length > 0) {
    body = (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Day</TableHead>
            <TableHead className="text-right">Signups</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {signups.data.map((row) => (
            <TableRow key={row.day}>
              <TableCell>{row.day}</TableCell>
              <TableCell className="text-right">{row.count}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  } else {
    body = (
      <p className="text-muted-foreground text-sm">
        No signups in the last 30 days.
      </p>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Signups, last 30 days</CardTitle>
      </CardHeader>
      <CardPanel>{body}</CardPanel>
    </Card>
  );
};

const InfrastructureCard = ({
  health,
}: {
  health: UseQueryResult<HealthResult>;
}) => (
  <Card>
    <CardHeader>
      <CardTitle>Infrastructure</CardTitle>
    </CardHeader>
    <CardPanel>
      {health.isPending ? (
        <Skeleton className="h-32 w-full" />
      ) : (
        <div className="divide-y">
          <InfraBadge
            label="Database"
            ok={health.data?.database.reachable ?? false}
          />
          <InfraBadge
            label={
              health.data?.redis.configured ? "Redis" : "Redis (not configured)"
            }
            ok={health.data?.redis.reachable ?? false}
          />
          <InfraBadge
            label={
              health.data?.storage.configured
                ? "Storage"
                : "Storage (not configured)"
            }
            ok={health.data?.storage.configured ?? false}
          />
          <InfraBadge label="Queue" ok={health.data?.queue.started ?? false} />
        </div>
      )}
    </CardPanel>
  </Card>
);

const RouteComponent = () => {
  const stats = useQuery(orpc.admin.overview.stats.queryOptions());
  const signups = useQuery(
    orpc.admin.overview.signupsLast30Days.queryOptions()
  );
  const health = useQuery(orpc.admin.system.health.queryOptions());

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Overview</h1>

      <StatsRow stats={stats} />

      <div className="grid gap-4 lg:grid-cols-2">
        <SignupsCard signups={signups} />
        <InfrastructureCard health={health} />
      </div>
    </div>
  );
};

export const Route = createFileRoute("/_auth/admin/")({
  component: RouteComponent,
  head: () => ({ meta: [{ title: "Overview" }] }),
});
