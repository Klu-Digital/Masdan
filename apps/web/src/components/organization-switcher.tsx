import {
  Building02Icon,
  CheckIcon,
  PlusIcon,
  UnfoldMoreIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Menu,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuPopup,
  MenuSeparator,
  MenuTrigger,
} from "@masdan/ui/components/menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  useSidebar,
} from "@masdan/ui/components/sidebar";
import { toastManager } from "@masdan/ui/components/toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useRouter } from "@tanstack/react-router";

import { authClient } from "@/lib/auth-client";
import {
  invalidateOrganizations,
  organizationsQueryOptions,
} from "@/lib/organization";
import { invalidateSession } from "@/lib/session";

const OrganizationSwitcher = ({
  activeOrganizationId,
}: {
  activeOrganizationId: string | null;
}) => {
  const queryClient = useQueryClient();
  const router = useRouter();
  const { isMobile } = useSidebar();
  const organizations = useQuery(organizationsQueryOptions());

  const switchTo = useMutation({
    mutationFn: async (organizationId: string) => {
      const { error } = await authClient.organization.setActive({
        organizationId,
      });
      if (error) {
        throw new Error(error.message ?? "Could not switch household");
      }

      // `setActive` rewrites `activeOrganizationId`, so the cached session and
      // every org-scoped query are stale.
      await invalidateSession(queryClient);
      await invalidateOrganizations(queryClient);
      await router.invalidate();
    },
    onError: (error: Error) => {
      toastManager.add({ title: error.message, type: "error" });
    },
  });

  if (organizations.isPending) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuSkeleton showIcon />
        </SidebarMenuItem>
      </SidebarMenu>
    );
  }

  const active = organizations.data?.find(
    (organization) => organization.id === activeOrganizationId
  );

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <Menu>
          <MenuTrigger render={<SidebarMenuButton size="lg" />}>
            <div className="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
              <HugeiconsIcon
                icon={Building02Icon}
                strokeWidth={2}
                className="size-4"
              />
            </div>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">
                {active?.name ?? "Select household"}
              </span>
              <span className="text-muted-foreground truncate text-xs">
                {organizations.data?.length === 1
                  ? "Personal household"
                  : `${organizations.data?.length ?? 0} households`}
              </span>
            </div>
            <HugeiconsIcon
              icon={UnfoldMoreIcon}
              strokeWidth={2}
              className="ms-auto size-4"
            />
          </MenuTrigger>
          <MenuPopup
            align={isMobile ? "center" : "start"}
            className="min-w-56"
            side={isMobile ? "bottom" : "right"}
          >
            {/* Base UI requires the label to live inside a group; rendering it
                bare throws rather than degrading. */}
            <MenuGroup>
              <MenuGroupLabel>Households</MenuGroupLabel>
              {organizations.data?.map((organization) => (
                <MenuItem
                  key={organization.id}
                  onClick={() => {
                    if (organization.id !== activeOrganizationId) {
                      switchTo.mutate(organization.id);
                    }
                  }}
                >
                  <span className="flex-1 truncate">{organization.name}</span>
                  {organization.id === activeOrganizationId ? (
                    <HugeiconsIcon
                      icon={CheckIcon}
                      strokeWidth={2}
                      className="size-4"
                    />
                  ) : null}
                </MenuItem>
              ))}
              <MenuSeparator />
              <MenuItem render={<Link to="/settings/household" />}>
                <HugeiconsIcon icon={PlusIcon} strokeWidth={2} />
                Manage households
              </MenuItem>
            </MenuGroup>
          </MenuPopup>
        </Menu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
};

export default OrganizationSwitcher;
