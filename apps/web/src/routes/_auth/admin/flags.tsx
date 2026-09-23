import { Badge } from "@masdan/ui/components/badge";
import { Button } from "@masdan/ui/components/button";
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

import { client, orpc } from "@/utils/orpc";

type FlagsResult = Awaited<ReturnType<typeof client.admin.featureFlags.list>>;
type Flag = FlagsResult[number];

interface SetVariables {
  enabled: boolean;
  name: Flag["name"];
}
interface ResetVariables {
  name: Flag["name"];
}

const changedBy = (flag: Flag): string => {
  if (!flag.updatedAt) {
    return "—";
  }
  const who = flag.updatedByName ?? flag.updatedByEmail ?? "unknown";
  return `${new Date(flag.updatedAt).toLocaleString()} · ${who}`;
};

const FlagsTable = ({
  flags,
  resetFlag,
  setFlag,
}: {
  flags: UseQueryResult<FlagsResult>;
  resetFlag: UseMutationResult<unknown, Error, ResetVariables>;
  setFlag: UseMutationResult<unknown, Error, SetVariables>;
}) => {
  if (flags.isPending) {
    return <Skeleton className="h-48 w-full" />;
  }

  if (!flags.data || flags.data.length === 0) {
    return (
      <Empty>
        <EmptyTitle>No feature flags</EmptyTitle>
        <EmptyDescription>
          Declare one in <code>packages/env/src/flags.ts</code> and it appears
          here.
        </EmptyDescription>
      </Empty>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Flag</TableHead>
          <TableHead>State</TableHead>
          <TableHead>Source</TableHead>
          <TableHead>Last changed</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {flags.data.map((flag) => {
          const busy =
            (setFlag.isPending && setFlag.variables?.name === flag.name) ||
            (resetFlag.isPending && resetFlag.variables?.name === flag.name);

          return (
            <TableRow key={flag.name}>
              <TableCell>
                <div className="font-mono text-xs">{flag.name}</div>
                <div className="text-muted-foreground text-xs">
                  {flag.description}
                </div>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={flag.enabled}
                    disabled={busy}
                    id={`flag-${flag.name}`}
                    onCheckedChange={(enabled) => {
                      setFlag.mutate({ enabled, name: flag.name });
                    }}
                  />
                  <label
                    className="text-muted-foreground text-xs"
                    htmlFor={`flag-${flag.name}`}
                  >
                    {flag.enabled ? "on" : "off"}
                  </label>
                </div>
              </TableCell>
              <TableCell>
                <Badge variant={flag.overridden ? "default" : "outline"}>
                  {flag.overridden ? "overridden" : "default"}
                </Badge>
              </TableCell>
              <TableCell>
                <span className="text-muted-foreground text-xs">
                  {changedBy(flag)}
                </span>
              </TableCell>
              <TableCell className="text-right">
                {flag.overridden ? (
                  <Button
                    loading={
                      resetFlag.isPending &&
                      resetFlag.variables?.name === flag.name
                    }
                    onClick={() => resetFlag.mutate({ name: flag.name })}
                    size="sm"
                    variant="ghost"
                  >
                    Reset to default
                  </Button>
                ) : (
                  <span className="text-muted-foreground text-xs">
                    {flag.defaultEnabled ? "on" : "off"} by default
                  </span>
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
};

const RouteComponent = () => {
  const queryClient = useQueryClient();
  const flags = useQuery(orpc.admin.featureFlags.list.queryOptions());

  // Both lists: invalidating only the admin one leaves this tab's own
  // `useFeatureFlag` consumers showing the pre-toggle value until their TTL runs out.
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: orpc.admin.featureFlags.list.key(),
      }),
      queryClient.invalidateQueries({ queryKey: orpc.featureFlags.all.key() }),
    ]);
  };

  const setFlag = useMutation({
    mutationFn: (variables: SetVariables) =>
      client.admin.featureFlags.set(variables),
    onError: (error: Error) => {
      toastManager.add({ title: error.message, type: "error" });
    },
    onSuccess: async (_data, variables) => {
      await refresh();
      toastManager.add({
        title: `${variables.name} turned ${variables.enabled ? "on" : "off"}`,
        type: "success",
      });
    },
  });

  const resetFlag = useMutation({
    mutationFn: (variables: ResetVariables) =>
      client.admin.featureFlags.reset(variables),
    onError: (error: Error) => {
      toastManager.add({ title: error.message, type: "error" });
    },
    onSuccess: async (_data, variables) => {
      await refresh();
      toastManager.add({
        title: `${variables.name} reset to its default`,
        type: "success",
      });
    },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Feature flags</h1>

      <Card>
        <CardHeader>
          <CardTitle>Current values</CardTitle>
          <CardDescription>
            Flags are declared in code and toggled here — no deploy needed. A
            change is immediate on this server and reaches every other instance
            within 30 seconds.
          </CardDescription>
        </CardHeader>
        <CardPanel>
          <FlagsTable flags={flags} resetFlag={resetFlag} setFlag={setFlag} />
        </CardPanel>
      </Card>
    </div>
  );
};

export const Route = createFileRoute("/_auth/admin/flags")({
  component: RouteComponent,
  head: () => ({ meta: [{ title: "Feature flags" }] }),
});
