import type { QueryClient } from "@tanstack/react-query";
import { queryOptions } from "@tanstack/react-query";

import { authClient } from "@/lib/auth-client";
import { invalidateSession } from "@/lib/session";
import { client } from "@/utils/orpc";

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

/** After any write that changes membership or the active org. */
export const invalidateOrganizations = async (
  queryClient: QueryClient
): Promise<void> => {
  await queryClient.invalidateQueries({ queryKey: organizationQueryKey });
};

export const acceptHouseholdInvitation = async (input: {
  invitationId: string;
  queryClient: QueryClient;
}): Promise<void> => {
  const { organizationId } = await client.invitations.accept({
    invitationId: input.invitationId,
  });

  const activation = await authClient.organization.setActive({
    organizationId,
  });
  await invalidateSession(input.queryClient);
  await invalidateOrganizations(input.queryClient);
  if (activation.error) {
    throw new Error(
      `Invitation accepted, but could not switch households: ${activation.error.message ?? "please switch manually"}`
    );
  }
};

export const rejectHouseholdInvitation = async (input: {
  invitationId: string;
  queryClient: QueryClient;
}): Promise<void> => {
  await client.invitations.decline({ invitationId: input.invitationId });

  await invalidateOrganizations(input.queryClient);
};
