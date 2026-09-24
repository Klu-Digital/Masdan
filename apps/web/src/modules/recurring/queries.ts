import type { QueryClient } from "@tanstack/react-query";
import { queryOptions } from "@tanstack/react-query";

import { client } from "@/utils/orpc";

export type Schedule = Awaited<
  ReturnType<typeof client.recurring.list>
>[number];
export type ScheduleInput = Parameters<typeof client.recurring.create>[0];

export const schedulesQueryKey = (activeOrganizationId: string | null) =>
  ["recurring", activeOrganizationId] as const;

export const schedulesQueryOptions = (activeOrganizationId: string | null) =>
  queryOptions({
    enabled: activeOrganizationId !== null,
    queryFn: () => client.recurring.list(),
    queryKey: schedulesQueryKey(activeOrganizationId),
  });

export const schedulePostingsQueryOptions = (scheduleId: string) =>
  queryOptions({
    queryFn: () => client.recurring.postings({ scheduleId }),
    queryKey: ["recurring-postings", scheduleId] as const,
  });

/** Schedules and everything they post from: the ledger may have changed too. */
export const invalidateSchedules = (
  queryClient: QueryClient,
  activeOrganizationId: string | null
) =>
  Promise.all([
    queryClient.invalidateQueries({
      queryKey: schedulesQueryKey(activeOrganizationId),
    }),
    queryClient.invalidateQueries({ queryKey: ["recurring-postings"] }),
  ]);
