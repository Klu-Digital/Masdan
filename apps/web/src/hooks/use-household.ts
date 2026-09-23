import { hasPermission } from "@masdan/auth/permissions";
import type { PermissionRequest } from "@masdan/auth/permissions";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { useCallback } from "react";

import { activeOrganizationQueryOptions } from "@/lib/organization";
import { householdProfileQueryOptions } from "@/modules/household/queries";

const authRoute = getRouteApi("/_auth");

const FALLBACK_TIMEZONE = "Asia/Manila";

/**
 * The active household as every screen needs it: who the viewer is there,
 * what they may do, and its money defaults. Permission checks here are
 * cosmetic — the procedures enforce.
 */
export const useHousehold = () => {
  const { activeOrganizationId, session } = authRoute.useRouteContext();
  const organization = useQuery(
    activeOrganizationQueryOptions(activeOrganizationId)
  );
  const profile = useQuery(householdProfileQueryOptions(activeOrganizationId));
  const role =
    organization.data?.members?.find(
      (member) => member.userId === session.user.id
    )?.role ?? "";
  const can = useCallback(
    (permissions: PermissionRequest) => hasPermission({ permissions, role }),
    [role]
  );

  return {
    activeOrganizationId,
    can,
    currency: profile.data?.defaultCurrency.code ?? null,
    isError: organization.isError || profile.isError,
    isPending:
      activeOrganizationId !== null &&
      (organization.isPending || profile.isPending),
    members: organization.data?.members ?? [],
    organization: organization.data ?? null,
    profile: profile.data ?? null,
    role,
    session,
    timezone: profile.data?.timezone ?? FALLBACK_TIMEZONE,
  };
};

export type Household = ReturnType<typeof useHousehold>;
