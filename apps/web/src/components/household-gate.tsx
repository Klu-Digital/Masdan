import { Building02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@masdan/ui/components/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@masdan/ui/components/empty";
import { Page } from "@masdan/ui/components/page";
import { Skeleton } from "@masdan/ui/components/skeleton";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { useHousehold } from "@/hooks/use-household";
import type { Household } from "@/hooks/use-household";

export type ActiveHousehold = Household & { activeOrganizationId: string };

export const PageSkeleton = () => (
  <Page aria-busy="true">
    <Skeleton className="h-8 w-48" />
    <Skeleton className="h-24 w-full" radius="2xl" />
    <Skeleton className="h-64 w-full" radius="2xl" />
  </Page>
);

/**
 * Household-scoped screens render only inside an active household. Without
 * one, the person is pointed at creating or joining one instead.
 */
export const HouseholdGate = ({
  children,
  permission,
}: {
  children: (household: ActiveHousehold) => ReactNode;
  /** Shown instead of the screen when the viewer lacks this permission. */
  permission?: Parameters<Household["can"]>[0];
}) => {
  const household = useHousehold();
  const { activeOrganizationId } = household;

  if (!activeOrganizationId) {
    return (
      <Page width="narrow">
        <Empty>
          <EmptyMedia>
            <HugeiconsIcon icon={Building02Icon} strokeWidth={1.8} />
          </EmptyMedia>
          <EmptyTitle>No household yet</EmptyTitle>
          <EmptyDescription>
            Create a household, or open an invite link from someone else’s.
          </EmptyDescription>
          <EmptyContent>
            <Button
              render={<Link hash="new-household" to="/settings/household" />}
            >
              Create a household
            </Button>
          </EmptyContent>
        </Empty>
      </Page>
    );
  }
  if (household.isPending) {
    return <PageSkeleton />;
  }
  if (household.isError) {
    return (
      <Page width="narrow">
        <Empty>
          <EmptyTitle>Couldn’t load this household</EmptyTitle>
          <EmptyDescription>
            Check your connection and reload the page.
          </EmptyDescription>
        </Empty>
      </Page>
    );
  }
  if (permission && !household.can(permission)) {
    return (
      <Page width="narrow">
        <Empty>
          <EmptyTitle>You don’t have access to this</EmptyTitle>
          <EmptyDescription>
            Ask a household owner or admin to change your role.
          </EmptyDescription>
        </Empty>
      </Page>
    );
  }
  return children({ ...household, activeOrganizationId });
};
