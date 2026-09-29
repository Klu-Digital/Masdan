import {
  CheckmarkCircle02Icon,
  PlusSignIcon,
  Settings02Icon,
  UnfoldMoreIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useAppFrame } from "@masdan/ui/components/app-frame";
import {
  Menu,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuPopup,
  MenuSeparator,
  MenuTrigger,
} from "@masdan/ui/components/menu";
import { Skeleton } from "@masdan/ui/components/skeleton";
import { cn } from "@masdan/ui/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useRouter } from "@tanstack/react-router";

import { authClient } from "@/lib/auth-client";
import {
  invalidateOrganizations,
  organizationsQueryOptions,
} from "@/lib/organization";
import { invalidateSession } from "@/lib/session";

import { initialsOf } from "./initials";

export const HouseholdMark = ({
  name,
  size = "default",
}: {
  name: string;
  size?: "default" | "lg" | "sm";
}) => (
  <span
    aria-hidden="true"
    className={cn(
      "bg-primary text-primary-foreground flex shrink-0 items-center justify-center font-semibold",
      size === "sm" &&
        "text-2xs size-6 rounded-md font-semibold tracking-normal",
      size === "default" && "size-8 rounded-lg text-xs",
      size === "lg" && "size-14 rounded-2xl text-base font-semibold"
    )}
  >
    {initialsOf(name)}
  </span>
);

/**
 * Which household you are looking at, and the door to the others. Switching
 * rewrites the session's active organization, so every cache is refreshed.
 */
export const HouseholdSwitcher = ({
  activeOrganizationId,
  placement = "sidebar",
}: {
  activeOrganizationId: string | null;
  placement?: "sidebar" | "sheet";
}) => {
  const queryClient = useQueryClient();
  const router = useRouter();
  const { collapsed } = useAppFrame();
  const organizations = useQuery(organizationsQueryOptions());
  const compact = placement === "sidebar" && collapsed;

  const switchTo = useMutation({
    mutationFn: async (organizationId: string) => {
      const { error } = await authClient.organization.setActive({
        organizationId,
      });
      if (error) {
        throw new Error(error.message ?? "Could not switch household");
      }
      await invalidateSession(queryClient);
      await invalidateOrganizations(queryClient);
      await queryClient.invalidateQueries();
      await router.invalidate();
    },
  });

  if (organizations.isPending) {
    return (
      <Skeleton
        className={cn("h-11", compact ? "w-11" : "w-full")}
        radius="xl"
      />
    );
  }

  const active = organizations.data?.find(
    (organization) => organization.id === activeOrganizationId
  );
  const name = active?.name ?? "No household";
  const count = organizations.data?.length ?? 0;

  return (
    <Menu>
      <MenuTrigger
        render={
          <button
            aria-label={`Household: ${name}. Switch household`}
            className={cn(
              "hover:bg-sidebar-accent focus-visible:ring-ring/50 data-popup-open:bg-sidebar-accent flex h-12 w-full min-w-0 items-center gap-2.5 rounded-xl px-2 text-left transition-colors outline-none focus-visible:ring-3",
              compact && "justify-center px-0"
            )}
            type="button"
          />
        }
      >
        <HouseholdMark name={name} />
        {compact ? null : (
          <>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm font-semibold">{name}</span>
              <span className="text-muted-foreground truncate text-xs">
                {count === 1 ? "Household" : `${count} households`}
              </span>
            </span>
            <HugeiconsIcon
              className="text-muted-foreground size-4 shrink-0"
              icon={UnfoldMoreIcon}
              strokeWidth={2}
            />
          </>
        )}
      </MenuTrigger>
      <MenuPopup align="start" className="min-w-64">
        <MenuGroup>
          <MenuGroupLabel>Households</MenuGroupLabel>
          {organizations.data?.map((organization) => {
            const current = organization.id === activeOrganizationId;
            return (
              <MenuItem
                disabled={switchTo.isPending}
                key={organization.id}
                onClick={() => {
                  if (!current) {
                    switchTo.mutate(organization.id);
                  }
                }}
              >
                <HouseholdMark name={organization.name} size="sm" />
                <span className="flex-1 truncate">{organization.name}</span>
                {current ? (
                  <HugeiconsIcon
                    className="text-brand-text"
                    icon={CheckmarkCircle02Icon}
                    strokeWidth={2}
                  />
                ) : null}
              </MenuItem>
            );
          })}
        </MenuGroup>
        <MenuSeparator />
        <MenuItem render={<Link to="/settings/household" />}>
          <HugeiconsIcon icon={Settings02Icon} strokeWidth={1.8} />
          Household settings
        </MenuItem>
        <MenuItem
          render={<Link hash="new-household" to="/settings/household" />}
        >
          <HugeiconsIcon icon={PlusSignIcon} strokeWidth={1.8} />
          New household…
        </MenuItem>
      </MenuPopup>
    </Menu>
  );
};
