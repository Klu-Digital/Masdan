import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@masdan/ui/components/alert";
import { Badge } from "@masdan/ui/components/badge";
import {
  Card,
  CardHeader,
  CardPanel,
  CardTitle,
} from "@masdan/ui/components/card";
import { Skeleton } from "@masdan/ui/components/skeleton";
import type { UseQueryResult } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type React from "react";

import type { client } from "@/utils/orpc";
import { orpc } from "@/utils/orpc";

type HealthResult = Awaited<ReturnType<typeof client.admin.system.health>>;
type ConfigResult = Awaited<ReturnType<typeof client.admin.system.config>>;

const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="flex items-center justify-between py-1.5 text-sm">
    <span className="text-muted-foreground">{label}</span>
    <span className="font-mono">{value}</span>
  </div>
);

const redisStatusLabel = (redis: HealthResult["redis"]) => {
  if (!redis.configured) {
    return "not configured";
  }
  return redis.reachable ? "reachable" : "unreachable";
};

const HealthCard = ({ health }: { health: UseQueryResult<HealthResult> }) => (
  <Card>
    <CardHeader>
      <CardTitle>Health</CardTitle>
    </CardHeader>
    <CardPanel>
      {health.isPending ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <div className="divide-y">
          <Row
            label="Database"
            value={
              health.data?.database.reachable
                ? `${health.data.database.latencyMs?.toFixed(1)} ms`
                : "unreachable"
            }
          />
          <Row
            label="Redis"
            value={
              <Badge
                variant={health.data?.redis.reachable ? "default" : "outline"}
              >
                {health.data ? redisStatusLabel(health.data.redis) : "—"}
              </Badge>
            }
          />
          <Row
            label="Storage"
            value={
              <Badge
                variant={
                  health.data?.storage.configured ? "default" : "outline"
                }
              >
                {health.data?.storage.bucket ?? "not configured"}
              </Badge>
            }
          />
          <Row
            label="Queue"
            value={
              <Badge
                variant={health.data?.queue.started ? "default" : "outline"}
              >
                {health.data?.queue.started ? "started" : "not started"}
              </Badge>
            }
          />
          <Row label="Node" value={health.data?.nodeVersion} />
          <Row label="Uptime" value={`${health.data?.uptimeSeconds}s`} />
        </div>
      )}
    </CardPanel>
  </Card>
);

const ConfigCard = ({ config }: { config: UseQueryResult<ConfigResult> }) => (
  <Card>
    <CardHeader>
      <CardTitle>Configuration</CardTitle>
    </CardHeader>
    <CardPanel>
      {config.isPending ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <div className="divide-y">
          <Row label="NODE_ENV" value={config.data?.nodeEnv} />
          <Row label="Service name" value={config.data?.serviceName} />
          <Row label="Port" value={config.data?.port} />
          <Row label="CORS origin" value={config.data?.corsOrigin} />
          <Row label="better-auth URL" value={config.data?.betterAuthUrl} />
          <Row
            label="Trust proxy headers"
            value={config.data?.trustProxyHeaders ? "on" : "off"}
          />
          <Row
            label="Auth rate limit"
            value={`${config.data?.authRateLimit.max}/${config.data?.authRateLimit.windowSeconds}s`}
          />
          <Row
            label="Metrics"
            value={config.data?.metricsEnabled ? "enabled" : "disabled"}
          />
          <Row label="pg-boss schema" value={config.data?.pgBossSchema} />
          <Row label="Queue pool" value={config.data?.queue.poolMax} />
          <Row
            label="Max upload size"
            value={`${((config.data?.storageMaxUploadBytes ?? 0) / (1024 * 1024)).toFixed(0)} MB`}
          />
        </div>
      )}
    </CardPanel>
  </Card>
);

const RouteComponent = () => {
  const health = useQuery(orpc.admin.system.health.queryOptions());
  const config = useQuery(orpc.admin.system.config.queryOptions());

  return (
    <div className="space-y-6">
      <h1 className="font-heading text-2xl font-semibold">System</h1>

      {config.data && !config.data.trustProxyHeaders ? (
        <Alert variant="warning">
          <AlertTitle>Trust proxy headers is off</AlertTitle>
          <AlertDescription>
            Rate limits will key to the proxy&apos;s IP, not the caller&apos;s.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <HealthCard health={health} />
        <ConfigCard config={config} />
      </div>
    </div>
  );
};

export const Route = createFileRoute("/_auth/admin/system")({
  component: RouteComponent,
  head: () => ({ meta: [{ title: "System" }] }),
});
