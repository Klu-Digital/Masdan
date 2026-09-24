import type { QueryClient } from "@tanstack/react-query";
import { queryOptions } from "@tanstack/react-query";

import { client } from "@/utils/orpc";

export type Goal = Awaited<ReturnType<typeof client.goals.list>>[number];
export type GoalInput = Parameters<typeof client.goals.create>[0];

// Under "accounts": ledger and account writes move the balances goals track.
const goalsQueryKey = (activeOrganizationId: string | null) =>
  ["accounts", activeOrganizationId, "goals"] as const;

export const goalsQueryOptions = (activeOrganizationId: string | null) =>
  queryOptions({
    enabled: activeOrganizationId !== null,
    meta: { suppressErrorToast: true },
    queryFn: () => client.goals.list(),
    queryKey: goalsQueryKey(activeOrganizationId),
  });

export const invalidateGoals = (
  queryClient: QueryClient,
  activeOrganizationId: string | null
) =>
  queryClient.invalidateQueries({
    queryKey: goalsQueryKey(activeOrganizationId),
  });
