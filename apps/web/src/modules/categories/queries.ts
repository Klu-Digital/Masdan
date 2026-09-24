import type { QueryClient } from "@tanstack/react-query";
import { queryOptions } from "@tanstack/react-query";

import { invalidateBudgets } from "@/modules/budgets/queries";
import { client } from "@/utils/orpc";

export const categoriesQueryKey = (activeOrganizationId: string | null) =>
  ["categories", activeOrganizationId] as const;

export const categoriesQueryOptions = (activeOrganizationId: string | null) =>
  queryOptions({
    enabled: activeOrganizationId !== null,
    queryFn: () => client.categories.list({ includeArchived: true }),
    queryKey: categoriesQueryKey(activeOrganizationId),
  });

/** Budget lines carry category names and archive state, so they refresh too. */
export const invalidateCategories = (
  queryClient: QueryClient,
  activeOrganizationId: string | null
) =>
  Promise.all([
    queryClient.invalidateQueries({
      queryKey: categoriesQueryKey(activeOrganizationId),
    }),
    invalidateBudgets(queryClient, activeOrganizationId),
  ]);
