import { hasPermission } from "@masdan/auth/permissions";
import {
  Empty,
  EmptyDescription,
  EmptyTitle,
} from "@masdan/ui/components/empty";
import { Skeleton } from "@masdan/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, getRouteApi } from "@tanstack/react-router";

import { activeOrganizationQueryOptions } from "@/lib/organization";
import { AccountManager } from "@/modules/accounts/components/account-manager";
import { householdProfileQueryOptions } from "@/modules/household/queries";

const routeApi = getRouteApi("/_auth/accounts");

const AccountsPage = () => {
  const { activeOrganizationId, session } = routeApi.useRouteContext();
  const organization = useQuery(
    activeOrganizationQueryOptions(activeOrganizationId)
  );
  const profile = useQuery(householdProfileQueryOptions(activeOrganizationId));

  if (!activeOrganizationId) {
    return (
      <div className="p-6">
        <Empty>
          <EmptyTitle>No active household</EmptyTitle>
          <EmptyDescription>
            Create or join a household before managing accounts.
          </EmptyDescription>
        </Empty>
      </div>
    );
  }

  if (organization.isPending || profile.isPending) {
    return <Skeleton className="m-6 h-96" />;
  }

  if (!organization.data || !profile.data) {
    return (
      <p className="text-muted-foreground p-6">Could not load household.</p>
    );
  }

  const role =
    organization.data.members?.find(
      (member) => member.userId === session.user.id
    )?.role ?? "";

  return (
    <div className="space-y-6 p-6">
      <AccountManager
        activeOrganizationId={activeOrganizationId}
        canArchive={hasPermission({
          permissions: { financialAccount: ["archive"] },
          role,
        })}
        canCreate={hasPermission({
          permissions: { financialAccount: ["create"] },
          role,
        })}
        canRestore={hasPermission({
          permissions: { financialAccount: ["restore"] },
          role,
        })}
        canUpdate={hasPermission({
          permissions: { financialAccount: ["update"] },
          role,
        })}
        defaultCurrency={profile.data.defaultCurrency.code}
        members={organization.data.members ?? []}
      />
    </div>
  );
};

export const Route = createFileRoute("/_auth/accounts")({
  component: AccountsPage,
  head: () => ({ meta: [{ title: "Accounts" }] }),
});
