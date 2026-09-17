import type { QueryClient } from "@tanstack/react-query";
import { queryOptions } from "@tanstack/react-query";

import { authClient } from "@/lib/auth-client";

export type Organization = typeof authClient.$Infer.Organization;
export type ActiveOrganization = typeof authClient.$Infer.ActiveOrganization;

export const organizationQueryKey = ["organization"] as const;

/**
 * The active organization lives on the session row, never in the URL. It is in
 * the query key so switching in one tab cannot serve the previous
 * organization's cache to this one.
 */
export const activeOrganizationQueryOptions = (
  activeOrganizationId: string | null
) =>
  queryOptions({
    enabled: activeOrganizationId !== null,
    queryFn: async () => {
      const { data, error } =
        await authClient.organization.getFullOrganization();
      if (error) {
        throw new Error(error.message ?? "Could not load the household");
      }
      return data ?? null;
    },
    queryKey: [...organizationQueryKey, "active", activeOrganizationId],
  });

export const organizationsQueryOptions = () =>
  queryOptions({
    queryFn: async () => {
      const { data, error } = await authClient.organization.list();
      if (error) {
        throw new Error(error.message ?? "Could not load your households");
      }
      return data ?? [];
    },
    queryKey: [...organizationQueryKey, "list"],
  });

/** After any write that changes membership, invitations or the active org. */
export const invalidateOrganizations = (queryClient: QueryClient) =>
  queryClient.invalidateQueries({ queryKey: organizationQueryKey });
