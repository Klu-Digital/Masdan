import type { QueryClient } from "@tanstack/react-query";
import { queryOptions } from "@tanstack/react-query";

import { client } from "@/utils/orpc";

export const accountsQueryKey = (activeOrganizationId: string | null) =>
  ["accounts", activeOrganizationId] as const;

export const accountsQueryOptions = (activeOrganizationId: string | null) =>
  queryOptions({
    enabled: activeOrganizationId !== null,
    queryFn: () => client.accounts.list({ includeArchived: true }),
    queryKey: accountsQueryKey(activeOrganizationId),
  });

export const accountQueryOptions = (accountId: string) =>
  queryOptions({
    queryFn: () => client.accounts.get({ accountId }),
    queryKey: ["account", accountId] as const,
  });

export const accountSnapshotsQueryOptions = (accountId: string) =>
  queryOptions({
    queryFn: () => client.accounts.listSnapshots({ accountId }),
    queryKey: ["account-snapshots", accountId] as const,
  });

export const invalidateAccounts = (
  queryClient: QueryClient,
  activeOrganizationId: string | null
) =>
  queryClient.invalidateQueries({
    queryKey: accountsQueryKey(activeOrganizationId),
  });
