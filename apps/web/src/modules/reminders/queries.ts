import type { QueryClient } from "@tanstack/react-query";
import { queryOptions } from "@tanstack/react-query";

import { client } from "@/utils/orpc";

export type RemindersResult = Awaited<ReturnType<typeof client.reminders.list>>;
export type Reminder = RemindersResult["items"][number];

/** New reminders come from the worker, not from anything this tab did. */
const REFETCH_INTERVAL_MS = 5 * 60 * 1000;

// Under "accounts": payments, statements and card edits all settle reminders.
const remindersQueryKey = (activeOrganizationId: string | null) =>
  ["accounts", activeOrganizationId, "reminders"] as const;

export const remindersQueryOptions = (activeOrganizationId: string | null) =>
  queryOptions({
    enabled: activeOrganizationId !== null,
    meta: { suppressErrorToast: true },
    queryFn: () => client.reminders.list(),
    queryKey: remindersQueryKey(activeOrganizationId),
    refetchInterval: REFETCH_INTERVAL_MS,
  });

export const invalidateReminders = (
  queryClient: QueryClient,
  activeOrganizationId: string | null
) =>
  queryClient.invalidateQueries({
    queryKey: remindersQueryKey(activeOrganizationId),
  });

/** For writers that don't know the household, like the statement composer. */
export const invalidateAllReminders = (queryClient: QueryClient) =>
  queryClient.invalidateQueries({
    predicate: ({ queryKey }) =>
      queryKey[0] === "accounts" && queryKey[2] === "reminders",
  });
