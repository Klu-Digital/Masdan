import type { QueryClient } from "@tanstack/react-query";
import { queryOptions } from "@tanstack/react-query";

import { client } from "@/utils/orpc";

export type TransactionList = Awaited<
  ReturnType<typeof client.transactions.list>
>;
export type Transaction = TransactionList["items"][number];
export type TransactionListInput = Parameters<
  typeof client.transactions.list
>[0];

export const transactionsQueryKey = (
  activeOrganizationId: string | null,
  input?: TransactionListInput
) => ["transactions", activeOrganizationId, input] as const;

export const transactionsQueryOptions = (
  activeOrganizationId: string | null,
  input: TransactionListInput
) =>
  queryOptions({
    enabled: activeOrganizationId !== null,
    queryFn: () => client.transactions.list(input),
    queryKey: transactionsQueryKey(activeOrganizationId, input),
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
