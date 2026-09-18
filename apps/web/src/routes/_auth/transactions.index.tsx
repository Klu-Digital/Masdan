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
import { TransactionManager } from "@/modules/transactions/components/transaction-manager";

const routeApi = getRouteApi("/_auth/transactions");

const TransactionsPage = () => {
  const { activeOrganizationId, session } = routeApi.useRouteContext();
  const organization = useQuery(
    activeOrganizationQueryOptions(activeOrganizationId)
  );

  if (!activeOrganizationId) {
    return (
      <div className="p-6">
        <Empty>
          <EmptyTitle>No active household</EmptyTitle>
          <EmptyDescription>
            Create or join a household before managing transactions.
          </EmptyDescription>
        </Empty>
      </div>
    );
  }

  if (organization.isPending) {
    return <Skeleton className="m-6 h-96" />;
  }
  if (!organization.data) {
    return (
      <p className="text-muted-foreground p-6">Could not load household.</p>
    );
  }

  const role =
    organization.data.members?.find(
      (member) => member.userId === session.user.id
    )?.role ?? "";

  if (!hasPermission({ permissions: { transaction: ["read"] }, role })) {
    return (
      <p className="text-muted-foreground p-6">You cannot view transactions.</p>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <TransactionManager
        activeOrganizationId={activeOrganizationId}
        role={role}
      />
    </div>
  );
};

export const Route = createFileRoute("/_auth/transactions/")({
  component: TransactionsPage,
  head: () => ({ meta: [{ title: "Transactions" }] }),
});
