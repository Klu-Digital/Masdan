import type { QueryClient } from "@tanstack/react-query";
import { queryOptions } from "@tanstack/react-query";

import { authClient } from "@/lib/auth-client";
import { invalidateSession } from "@/lib/session";
import { client } from "@/utils/orpc";

export type Organization = typeof authClient.$Infer.Organization;
export type ActiveOrganization = typeof authClient.$Infer.ActiveOrganization;

export const organizationQueryKey = ["organization"] as const;
export const invitationsQueryKey = ["invitations", "current-user"] as const;

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

export const userInvitationsQueryOptions = () =>
  queryOptions({
    meta: { suppressErrorToast: true },
    queryFn: async () => {
      const rows = await client.invitations.listForCurrentUser();
      const now = Date.now();
      return rows.map((row) => ({
        ...row,
        expired: new Date(row.expiresAt).getTime() <= now,
      }));
    },
    queryKey: invitationsQueryKey,
    retry: false,
  });

/** After any write that changes membership, invitations or the active org. */
export const invalidateOrganizations = async (
  queryClient: QueryClient
): Promise<void> => {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: organizationQueryKey }),
    queryClient.invalidateQueries({ queryKey: invitationsQueryKey }),
  ]);
};

export const acceptHouseholdInvitation = async (input: {
  invitationId: string;
  organizationId: string;
  queryClient: QueryClient;
}): Promise<void> => {
  const { error } = await authClient.organization.acceptInvitation({
    invitationId: input.invitationId,
  });
  if (error) {
    throw new Error(error.message ?? "Could not accept the invitation");
  }

  await authClient.organization.setActive({
    organizationId: input.organizationId,
  });
  await invalidateSession(input.queryClient);
  await invalidateOrganizations(input.queryClient);
};

export const rejectHouseholdInvitation = async (input: {
  invitationId: string;
  queryClient: QueryClient;
}): Promise<void> => {
  const { error } = await authClient.organization.rejectInvitation({
    invitationId: input.invitationId,
  });
  if (error) {
    throw new Error(error.message ?? "Could not decline the invitation");
  }

  await invalidateOrganizations(input.queryClient);
};
