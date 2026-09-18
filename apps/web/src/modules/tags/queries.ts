import type { QueryClient } from "@tanstack/react-query";
import { queryOptions } from "@tanstack/react-query";

import { client } from "@/utils/orpc";

export const tagsQueryKey = (activeOrganizationId: string | null) =>
  ["tags", activeOrganizationId] as const;

export const tagsQueryOptions = (activeOrganizationId: string | null) =>
  queryOptions({
    enabled: activeOrganizationId !== null,
    queryFn: () => client.tags.list({ includeArchived: true }),
    queryKey: tagsQueryKey(activeOrganizationId),
  });

export const invalidateTags = (
  queryClient: QueryClient,
  activeOrganizationId: string | null
) =>
  queryClient.invalidateQueries({
    queryKey: tagsQueryKey(activeOrganizationId),
  });
