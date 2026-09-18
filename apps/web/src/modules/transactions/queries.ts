import type { QueryClient } from "@tanstack/react-query";
import { queryOptions } from "@tanstack/react-query";

import { client } from "@/utils/orpc";

export const transactionsQueryKey = (activeOrganizationId: string | null) =>
  ["transactions", activeOrganizationId] as const;

export const transactionsQueryOptions = (activeOrganizationId: string | null) =>
  queryOptions({
    enabled: activeOrganizationId !== null,
    queryFn: () => client.transactions.list({ includeArchived: true }),
    queryKey: transactionsQueryKey(activeOrganizationId),
  });

export const transactionQueryOptions = (transactionId: string) =>
  queryOptions({
    queryFn: () => client.transactions.get({ transactionId }),
    queryKey: ["transaction", transactionId] as const,
  });

export const invalidateTransactions = (
  queryClient: QueryClient,
  activeOrganizationId: string | null
) =>
  queryClient.invalidateQueries({
    queryKey: transactionsQueryKey(activeOrganizationId),
  });
