import type { QueryClient } from "@tanstack/react-query";
import { queryOptions } from "@tanstack/react-query";

import { client } from "@/utils/orpc";

export const categoriesQueryKey = (activeOrganizationId: string | null) =>
  ["categories", activeOrganizationId] as const;

export const categoriesQueryOptions = (activeOrganizationId: string | null) =>
  queryOptions({
    enabled: activeOrganizationId !== null,
    queryFn: () => client.categories.list({ includeArchived: true }),
    queryKey: categoriesQueryKey(activeOrganizationId),
  });

export const invalidateCategories = (
  queryClient: QueryClient,
  activeOrganizationId: string | null
) =>
  queryClient.invalidateQueries({
    queryKey: categoriesQueryKey(activeOrganizationId),
  });
