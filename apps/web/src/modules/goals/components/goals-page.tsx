import {
  Archive02Icon,
  ArchiveRestoreIcon,
  CheckmarkCircle02Icon,
  MoreHorizontalIcon,
  PencilEdit02Icon,
  PlusSignIcon,
  RepeatIcon,
  Target02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Badge } from "@masdan/ui/components/badge";
import { Button } from "@masdan/ui/components/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@masdan/ui/components/empty";
import { IconTile } from "@masdan/ui/components/icon-tile";
import {
  List,
  ListItem,
  ListItemContent,
  ListItemDescription,
  ListItemLeading,
  ListItemTitle,
  ListItemTrailing,
} from "@masdan/ui/components/list";
import {
  Menu,
  MenuItem,
  MenuPopup,
  MenuSeparator,
  MenuTrigger,
} from "@masdan/ui/components/menu";
import {
  Page,
  PageActions,
  PageDescription,
  PageHeader,
  PageHeading,
  PageTitle,
  Section,
  SectionHeader,
  SectionTitle,
} from "@masdan/ui/components/page";
import {
  Progress,
  ProgressIndicator,
  ProgressTrack,
} from "@masdan/ui/components/progress";
import { Skeleton } from "@masdan/ui/components/skeleton";
import { toastManager } from "@masdan/ui/components/toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import type { ReactNode } from "react";

import { Amount } from "@/components/finance/amount";
import { formatLongDate } from "@/lib/dates";
import { invalidate } from "@/utils/invalidate";
import { householdOrpc } from "@/utils/orpc";

import type { Goal } from "../types";
import { GoalComposer } from "./goal-composer";

export interface GoalPermissions {
  canArchive: boolean;
  canCreate: boolean;
  canRestore: boolean;
  canUpdate: boolean;
}

type LifecycleAction = "archive" | "complete" | "reopen" | "restore";

const LIFECYCLE_TOASTS: Record<LifecycleAction, string> = {
  archive: "archived",
  complete: "completed",
  reopen: "reopened",
  restore: "restored",
};

const runLifecycle = (
  goals: ReturnType<typeof householdOrpc>["goals"],
  action: LifecycleAction,
  goalId: string
) => {
  switch (action) {
    case "archive": {
      return goals.archive.call({ goalId });
    }
    case "complete": {
      return goals.complete.call({ goalId });
    }
    case "reopen": {
      return goals.reopen.call({ goalId });
    }
    default: {
      return goals.restore.call({ goalId });
    }
  }
};

/** When a closed goal's progress was frozen; null while it is active. */
const measuredNote = (goal: Goal): string | null => {
  if (goal.measuredOn === null) {
    return null;
  }
  const day = formatLongDate(goal.measuredOn);
  if (goal.status === "completed") {
    return `Completed ${day}`;
  }
  return goal.completedAt ? `Completed ${day} · archived` : `Archived ${day}`;
};

const GoalRow = ({ actions, goal }: { actions: ReactNode; goal: Goal }) => {
  const active = goal.status === "active";
  const note = measuredNote(goal);
  return (
    <ListItem className="items-start">
      <ListItemLeading>
        <IconTile size="sm" tint={active ? "emerald" : "slate"}>
          <HugeiconsIcon icon={Target02Icon} strokeWidth={2} />
        </IconTile>
      </ListItemLeading>
      <ListItemContent>
        <ListItemTitle>
          {goal.name}
          {goal.status === "completed" ? (
            <Badge variant="success">Completed</Badge>
          ) : null}
          {goal.status === "archived" ? (
            <Badge variant="outline">Archived</Badge>
          ) : null}
          {active && goal.reached ? (
            <Badge variant="success">Target reached</Badge>
          ) : null}
        </ListItemTitle>
        {/* Amounts are too wide to truncate meaningfully, so they wrap. */}
        <ListItemDescription className="block whitespace-normal">
          <Amount currency={goal.currencyCode} value={goal.saved} /> of{" "}
          <Amount currency={goal.currencyCode} value={goal.targetAmount} />
          {goal.targetDate ? ` · by ${formatLongDate(goal.targetDate)}` : null}
          {goal.reached ? null : (
            <span className="sm:hidden">
              {" · "}
              <Amount currency={goal.currencyCode} value={goal.remaining} /> to
              go
            </span>
          )}
        </ListItemDescription>
        <Progress
          aria-label={`${goal.name} progress`}
          className="mt-1.5"
          max={100}
          value={goal.percent}
        >
          <ProgressTrack>
            <ProgressIndicator />
          </ProgressTrack>
        </Progress>
        <ListItemDescription>
          {`Saved in ${goal.accountName}`}
          {goal.accountArchivedAt ? " (archived account)" : null}
          {note ? ` · ${note}` : null}
        </ListItemDescription>
      </ListItemContent>
      <ListItemTrailing>
        <div className="flex flex-col items-end gap-0.5">
          <span className="text-sm font-semibold tabular-nums">
            {`${goal.percent}%`}
          </span>
          {goal.reached ? (
            <span className="text-positive-foreground text-xs">Reached</span>
          ) : (
            <span className="text-muted-foreground text-xs max-sm:hidden">
              <Amount currency={goal.currencyCode} value={goal.remaining} /> to
              go
            </span>
          )}
        </div>
        {actions}
      </ListItemTrailing>
    </ListItem>
  );
};

// oxlint-disable-next-line complexity
export const GoalsPage = ({
  activeOrganizationId,
  householdCurrency,
  permissions,
}: {
  activeOrganizationId: string;
  householdCurrency: string;
  permissions: GoalPermissions;
}) => {
  const queryClient = useQueryClient();
  const orpc = householdOrpc(activeOrganizationId);
  const goals = useQuery(
    orpc.goals.list.queryOptions({ meta: { suppressErrorToast: true } })
  );
  const accounts = useQuery(
    orpc.accounts.list.queryOptions({ input: { includeArchived: true } })
  );
  const [composer, setComposer] = useState<{
    goal?: Goal;
    key: number;
    open: boolean;
  } | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const lifecycle = useMutation({
    mutationFn: ({ action, goal }: { action: LifecycleAction; goal: Goal }) =>
      runLifecycle(orpc.goals, action, goal.id),
    onSuccess: async (_, { action, goal }) => {
      await invalidate(queryClient, activeOrganizationId, "goals");
      const undo = action === "archive" && permissions.canRestore;
      toastManager.add({
        actionProps: undo
          ? {
              children: "Undo",
              onClick: () => lifecycle.mutate({ action: "restore", goal }),
            }
          : undefined,
        title: `${goal.name} ${LIFECYCLE_TOASTS[action]}`,
        type: "success",
      });
    },
  });

  const openComposer = (goal?: Goal) =>
    setComposer((current) => ({
      goal,
      key: (current?.key ?? 0) + 1,
      open: true,
    }));

  const assetAccounts = (accounts.data ?? []).filter(
    (account) => account.accountClass === "asset" && account.archivedAt === null
  );
  const canAdd =
    permissions.canCreate && accounts.isSuccess && assetAccounts.length > 0;

  const header = (
    <PageHeader>
      <PageHeading>
        <PageTitle>Goals</PageTitle>
        <PageDescription>
          What the household is saving toward, measured by the balance of the
          account it’s saved in.
        </PageDescription>
      </PageHeading>
      {canAdd ? (
        <PageActions>
          <Button onClick={() => openComposer()}>
            <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} />
            New goal
          </Button>
        </PageActions>
      ) : null}
    </PageHeader>
  );

  if (goals.isPending) {
    return (
      <Page aria-busy="true" width="narrow">
        {header}
        <Skeleton className="h-64 w-full" radius="2xl" />
      </Page>
    );
  }
  if (goals.isError) {
    return (
      <Page width="narrow">
        {header}
        <Empty>
          <EmptyTitle>Couldn’t load goals</EmptyTitle>
          <EmptyDescription>
            Check your connection and try again.
          </EmptyDescription>
          <EmptyContent>
            <Button onClick={() => goals.refetch()} variant="secondary">
              Try again
            </Button>
          </EmptyContent>
        </Empty>
      </Page>
    );
  }

  const actionsFor = (goal: Goal) => {
    const items: {
      handleSelect: () => void;
      icon: typeof PlusSignIcon;
      label: string;
    }[] = [];
    if (goal.status === "active" && permissions.canUpdate) {
      items.push(
        {
          handleSelect: () => openComposer(goal),
          icon: PencilEdit02Icon,
          label: "Edit",
        },
        {
          handleSelect: () => lifecycle.mutate({ action: "complete", goal }),
          icon: CheckmarkCircle02Icon,
          label: "Mark complete",
        }
      );
    }
    if (goal.status === "completed" && permissions.canUpdate) {
      items.push({
        handleSelect: () => lifecycle.mutate({ action: "reopen", goal }),
        icon: RepeatIcon,
        label: "Reopen",
      });
    }
    const archiveItem =
      goal.status !== "archived" && permissions.canArchive
        ? {
            handleSelect: () => lifecycle.mutate({ action: "archive", goal }),
            icon: Archive02Icon,
            label: "Archive",
          }
        : null;
    if (goal.status === "archived" && permissions.canRestore) {
      items.push({
        handleSelect: () => lifecycle.mutate({ action: "restore", goal }),
        icon: ArchiveRestoreIcon,
        label: "Restore",
      });
    }
    if (items.length === 0 && !archiveItem) {
      return null;
    }
    return (
      <Menu>
        <MenuTrigger
          aria-label={`${goal.name} actions`}
          disabled={lifecycle.isPending}
          render={<Button size="icon-sm" variant="ghost" />}
        >
          <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={2} />
        </MenuTrigger>
        <MenuPopup align="end" className="min-w-44">
          {items.map((item) => (
            <MenuItem key={item.label} onClick={item.handleSelect}>
              <HugeiconsIcon icon={item.icon} strokeWidth={1.8} />
              {item.label}
            </MenuItem>
          ))}
          {archiveItem && items.length > 0 ? <MenuSeparator /> : null}
          {archiveItem ? (
            <MenuItem onClick={archiveItem.handleSelect}>
              <HugeiconsIcon icon={archiveItem.icon} strokeWidth={1.8} />
              {archiveItem.label}
            </MenuItem>
          ) : null}
        </MenuPopup>
      </Menu>
    );
  };

  const active = goals.data.filter((goal) => goal.status === "active");
  const completed = goals.data.filter((goal) => goal.status === "completed");
  const archived = goals.data.filter((goal) => goal.status === "archived");
  const rows = (list: Goal[]) =>
    list.map((goal) => (
      <GoalRow actions={actionsFor(goal)} goal={goal} key={goal.id} />
    ));

  let emptyAction: ReactNode = null;
  if (canAdd) {
    emptyAction = (
      <Button onClick={() => openComposer()} variant="secondary">
        Add a goal
      </Button>
    );
  } else if (permissions.canCreate && accounts.isSuccess) {
    emptyAction = (
      <Button render={<Link to="/accounts" />} variant="secondary">
        Add an account first
      </Button>
    );
  }

  return (
    <Page width="narrow">
      {header}
      {goals.data.length === 0 ? (
        <Empty size="compact">
          <EmptyMedia>
            <HugeiconsIcon icon={Target02Icon} strokeWidth={1.8} />
          </EmptyMedia>
          <EmptyTitle>No savings goals</EmptyTitle>
          <EmptyDescription>
            Set a target for an emergency fund, a trip or a big purchase, and
            watch the account you save in close the gap.
          </EmptyDescription>
          {emptyAction ? <EmptyContent>{emptyAction}</EmptyContent> : null}
        </Empty>
      ) : null}

      {active.length > 0 ? (
        <List aria-label="Active goals">{rows(active)}</List>
      ) : null}
      {goals.data.length > 0 && active.length === 0 ? (
        <p className="text-muted-foreground px-1 text-sm">
          No active goals right now.
        </p>
      ) : null}

      {completed.length > 0 ? (
        <Section>
          <SectionHeader>
            <SectionTitle>Completed</SectionTitle>
          </SectionHeader>
          <List aria-label="Completed goals">{rows(completed)}</List>
        </Section>
      ) : null}

      {archived.length > 0 ? (
        <div className="flex flex-col gap-3">
          <Button
            aria-expanded={showArchived}
            className="self-start"
            onClick={() => setShowArchived((value) => !value)}
            size="sm"
            variant="ghost"
          >
            {showArchived
              ? "Hide archived"
              : `Show ${archived.length} archived`}
          </Button>
          {showArchived ? (
            <List aria-label="Archived goals">{rows(archived)}</List>
          ) : null}
        </div>
      ) : null}

      {goals.data.length > 0 ? (
        <p className="text-muted-foreground px-1 text-xs">
          Completed and archived goals show the balance on the day they closed.
          Goals sharing an account each count its whole balance.
        </p>
      ) : null}

      {composer && accounts.data ? (
        <GoalComposer
          accounts={accounts.data}
          activeOrganizationId={activeOrganizationId}
          goal={composer.goal}
          householdCurrency={householdCurrency}
          key={composer.key}
          onOpenChange={(open) =>
            setComposer((current) => (current ? { ...current, open } : current))
          }
          open={composer.open}
        />
      ) : null}
    </Page>
  );
};
