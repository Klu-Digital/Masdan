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
    // Filter changes keep the current rows on screen until the next page lands.
    placeholderData: (previous) => previous,
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

export type TransactionDetail = Awaited<
  ReturnType<typeof client.transactions.get>
>;
export type TransactionTotalsInput = Parameters<
  typeof client.transactions.totals
>[0];
export type TransactionSummary = Awaited<
  ReturnType<typeof client.transactions.summary>
>;
export type TransactionSummaryInput = Parameters<
  typeof client.transactions.summary
>[0];

export const transactionTotalsQueryOptions = (
  activeOrganizationId: string | null,
  input: TransactionTotalsInput
) =>
  queryOptions({
    enabled: activeOrganizationId !== null,
    placeholderData: (previous) => previous,
    queryFn: () => client.transactions.totals(input),
    // Under the "transactions" key so every ledger write refreshes it too.
    queryKey: ["transactions", activeOrganizationId, "totals", input] as const,
  });

export const transactionSummaryQueryOptions = (
  activeOrganizationId: string | null,
  input: TransactionSummaryInput
) =>
  queryOptions({
    enabled: activeOrganizationId !== null,
    placeholderData: (previous) => previous,
    queryFn: () => client.transactions.summary(input),
    queryKey: ["transactions", activeOrganizationId, "summary", input] as const,
  });
