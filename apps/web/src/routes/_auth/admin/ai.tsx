import { Badge } from "@masdan/ui/components/badge";
import { Button } from "@masdan/ui/components/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardPanel,
  CardTitle,
} from "@masdan/ui/components/card";
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
import { toastManager } from "@masdan/ui/components/toast";
import type { UseMutationResult } from "@tanstack/react-query";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { client, orpc } from "@/utils/orpc";

type CapsResult = Awaited<ReturnType<typeof client.admin.ai.tokenCaps>>;
type Cap = CapsResult["caps"][number];

interface SetVariables {
  feature: Cap["feature"];
  maxTokens: number;
}
interface ResetVariables {
  feature: Cap["feature"];
}

const changedBy = (cap: Cap): string => {
  if (!cap.updatedAt) {
    return "—";
  }
  const who = cap.updatedByName ?? cap.updatedByEmail ?? "unknown";
  return `${new Date(cap.updatedAt).toLocaleString()} · ${who}`;
};

const CapRow = ({
  bounds,
  cap,
  resetCap,
  setCap,
}: {
  bounds: { max: number; min: number };
  cap: Cap;
  resetCap: UseMutationResult<unknown, Error, ResetVariables>;
  setCap: UseMutationResult<unknown, Error, SetVariables>;
}) => {
  const [draft, setDraft] = useState(String(cap.maxTokens));
  const value = Number(draft);
  const valid =
    Number.isInteger(value) && value >= bounds.min && value <= bounds.max;
  const saving = setCap.isPending && setCap.variables?.feature === cap.feature;
  const resetting =
    resetCap.isPending && resetCap.variables?.feature === cap.feature;
  const inputId = `cap-${cap.feature}`;

  return (
    <TableRow>
      <TableCell>
        <label className="font-medium" htmlFor={inputId}>
          {cap.label}
        </label>
        <div className="text-muted-foreground font-mono text-xs">
          {cap.feature}
        </div>
      </TableCell>
      <TableCell>
        <form
          className="flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (valid) {
              setCap.mutate({ feature: cap.feature, maxTokens: value });
            }
          }}
        >
          <Input
            aria-invalid={!valid}
            className="w-28"
            id={inputId}
            inputMode="numeric"
            max={bounds.max}
            min={bounds.min}
            numeric
            onChange={(event) => setDraft(event.target.value)}
            size="sm"
            step={1}
            type="number"
            value={draft}
          />
          <Button
            disabled={!valid || value === cap.maxTokens || resetting}
            loading={saving}
            size="sm"
            type="submit"
            variant="outline"
          >
            Save
          </Button>
        </form>
      </TableCell>
      <TableCell>
        <Badge variant={cap.overridden ? "default" : "outline"}>
          {cap.overridden ? "overridden" : "default"}
        </Badge>
      </TableCell>
      <TableCell>
        <span className="text-muted-foreground text-xs">{changedBy(cap)}</span>
      </TableCell>
      <TableCell className="text-right">
        {cap.overridden ? (
          <Button
            disabled={saving}
            loading={resetting}
            onClick={() => resetCap.mutate({ feature: cap.feature })}
            size="sm"
            variant="ghost"
          >
            Reset to {cap.defaultMaxTokens.toLocaleString()}
          </Button>
        ) : (
          <span className="text-muted-foreground text-xs">
            {cap.defaultMaxTokens.toLocaleString()} by default
          </span>
        )}
      </TableCell>
    </TableRow>
  );
};

const RouteComponent = () => {
  const queryClient = useQueryClient();
  const caps = useQuery(orpc.admin.ai.tokenCaps.queryOptions());

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: orpc.admin.ai.tokenCaps.key() });

  const setCap = useMutation({
    mutationFn: (variables: SetVariables) =>
      client.admin.ai.setTokenCap(variables),
    onError: (error: Error) => {
      toastManager.add({ title: error.message, type: "error" });
    },
    onSuccess: async (data) => {
      await refresh();
      toastManager.add({
        title: `${data.feature} capped at ${data.maxTokens.toLocaleString()} tokens`,
        type: "success",
      });
    },
  });

  const resetCap = useMutation({
    mutationFn: (variables: ResetVariables) =>
      client.admin.ai.resetTokenCap(variables),
    onError: (error: Error) => {
      toastManager.add({ title: error.message, type: "error" });
    },
    onSuccess: async (data) => {
      await refresh();
      toastManager.add({
        title: `${data.feature} reset to ${data.maxTokens.toLocaleString()} tokens`,
        type: "success",
      });
    },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">AI</h1>

      <Card>
        <CardHeader>
          <CardTitle>Token caps</CardTitle>
          <CardDescription>
            The most tokens one answer may use, per feature. An answer cut off
            at its cap counts as a failed read, so set it above the longest
            answer a feature gives. A change is immediate on this server and
            reaches every other instance, workers included, within 30 seconds.
          </CardDescription>
        </CardHeader>
        <CardPanel>
          {caps.data ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Feature</TableHead>
                  <TableHead>Max tokens</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Last changed</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {caps.data.caps.map((cap) => (
                  <CapRow
                    bounds={{ max: caps.data.max, min: caps.data.min }}
                    cap={cap}
                    // Remounts on a saved or reset value, so the draft follows it.
                    key={`${cap.feature}:${cap.maxTokens}`}
                    resetCap={resetCap}
                    setCap={setCap}
                  />
                ))}
              </TableBody>
            </Table>
          ) : (
            <Skeleton className="h-48 w-full" />
          )}
        </CardPanel>
      </Card>
    </div>
  );
};

export const Route = createFileRoute("/_auth/admin/ai")({
  component: RouteComponent,
  head: () => ({ meta: [{ title: "AI" }] }),
});
