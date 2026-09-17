import { queryOptions } from "@tanstack/react-query";

import { client } from "@/utils/orpc";

export type Currency = Awaited<
  ReturnType<typeof client.currencies.list>
>[number];

/**
 * Reference data, not tenant data: no `activeOrganizationId` in the key, and
 * stale-time is effectively "until reload" — the list only changes when a
 * migration or post-migration script changes it.
 */
export const currenciesQueryOptions = () =>
  queryOptions({
    queryFn: () => client.currencies.list(),
    queryKey: ["currencies"] as const,
    staleTime: Number.POSITIVE_INFINITY,
  });
