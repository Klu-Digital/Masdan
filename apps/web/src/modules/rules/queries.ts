import type { QueryClient } from "@tanstack/react-query";
import { queryOptions } from "@tanstack/react-query";

import { client } from "@/utils/orpc";

export type Rule = Awaited<ReturnType<typeof client.rules.list>>[number];
export type RuleInput = Parameters<typeof client.rules.create>[0];

export const rulesQueryKey = (activeOrganizationId: string | null) =>
  ["rules", activeOrganizationId] as const;

export const rulesQueryOptions = (activeOrganizationId: string | null) =>
  queryOptions({
    enabled: activeOrganizationId !== null,
    queryFn: () => client.rules.list(),
    queryKey: rulesQueryKey(activeOrganizationId),
  });

export const invalidateRules = (
  queryClient: QueryClient,
  activeOrganizationId: string | null
) =>
  queryClient.invalidateQueries({
    queryKey: rulesQueryKey(activeOrganizationId),
  });

export const ruleMatchQueryOptions = (transactionId: string) =>
  queryOptions({
    queryFn: () => client.rules.matchTransaction({ transactionId }),
    queryKey: ["rule-match", transactionId] as const,
  });
