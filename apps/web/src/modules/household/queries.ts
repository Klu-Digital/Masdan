import type { QueryClient } from "@tanstack/react-query";
import { queryOptions } from "@tanstack/react-query";

import { client } from "@/utils/orpc";

const householdProfileQueryKey = (activeOrganizationId: string | null) =>
  ["household", "profile", activeOrganizationId] as const;

export const householdProfileQueryOptions = (
  activeOrganizationId: string | null
) =>
  queryOptions({
    enabled: activeOrganizationId !== null,
    queryFn: () => client.households.profile(),
    queryKey: householdProfileQueryKey(activeOrganizationId),
  });

export const invalidateHouseholdProfile = (
  queryClient: QueryClient,
  activeOrganizationId: string | null
) =>
  queryClient.invalidateQueries({
    queryKey: householdProfileQueryKey(activeOrganizationId),
  });
