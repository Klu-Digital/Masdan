import {
  MoreHorizontalIcon,
  PauseIcon,
  PencilEdit02Icon,
  PlayIcon,
  PlusSignIcon,
  RepeatIcon,
  StopIcon,
  TaskDone01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { describeRecurrence } from "@masdan/api/recurring/recurrence";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "@masdan/ui/components/alert-dialog";
import { Badge } from "@masdan/ui/components/badge";
import { Button } from "@masdan/ui/components/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@masdan/ui/components/empty";
import { ColorDot, IconTile } from "@masdan/ui/components/icon-tile";
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
  MenuTrigger,
} from "@masdan/ui/components/menu";
import {
  Page,
  PageActions,
  PageDescription,
  PageHeader,
  PageHeading,
  PageTitle,
} from "@masdan/ui/components/page";
import { ResponsiveSheet } from "@masdan/ui/components/responsive-sheet";
import { Skeleton } from "@masdan/ui/components/skeleton";
import { toastManager } from "@masdan/ui/components/toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useState } from "react";

import { Amount } from "@/components/finance/amount";
import { formatLongDate } from "@/lib/dates";
import { invalidate } from "@/utils/invalidate";
import { householdOrpc } from "@/utils/orpc";

import { STATUS_LABELS, scheduleTiming } from "../presentation";
import type { Schedule } from "../types";
import { ScheduleComposer } from "./schedule-composer";

export interface SchedulePermissions {
  canCreate: boolean;
  canStop: boolean;
  canUpdate: boolean;
}

const StatusBadge = ({ schedule }: { schedule: Schedule }) => {
  if (schedule.status === "active") {
    return null;
  }
  return (
    <Badge variant={schedule.status === "paused" ? "warning" : "outline"}>
      {STATUS_LABELS[schedule.status]}
    </Badge>
  );
};

const Row = ({ children, label }: { children: ReactNode; label: string }) => (
  <ListItem className="min-h-11">
    <ListItemContent>
      <span className="text-muted-foreground text-sm">{label}</span>
    </ListItemContent>
    <ListItemTrailing className="min-w-0 justify-end">
      {children}
    </ListItemTrailing>
  </ListItem>
);

/** The transactions a schedule already posted — separate rows from the template. */
const PostedTransactions = ({
  activeOrganizationId,
  schedule,
}: {
  activeOrganizationId: string;
  schedule: Schedule;
}) => {
  const postings = useQuery(
    householdOrpc(
      activeOrganizationId
    ).recurringSchedules.postings.queryOptions({
      input: { scheduleId: schedule.id },
    })
  );
  const sign = schedule.type === "income" ? "in" : "out";
  let body: ReactNode;
  if (postings.isPending) {
    body = <Skeleton className="h-24 w-full" radius="2xl" />;
  } else if (postings.isError) {
    body = (
      <p className="text-muted-foreground px-4 text-sm">
        Couldn’t load the posted transactions.
      </p>
    );
  } else if (postings.data.length === 0) {
    body = (
      <p className="text-muted-foreground px-4 text-sm">Nothing posted yet.</p>
    );
  } else {
    body = (
      <List aria-label="Posted transactions">
        {postings.data.map((posting) => (
          <ListItem
            className="min-h-11"
            key={posting.id}
            render={
              <Link
                params={{ transactionId: posting.id }}
                to="/transactions/$transactionId"
              />
            }
          >
            <ListItemContent>
              <ListItemTitle>
                {formatLongDate(posting.transactionDate)}
                {posting.archivedAt ? (
                  <Badge variant="outline">Archived</Badge>
                ) : null}
              </ListItemTitle>
            </ListItemContent>
            <ListItemTrailing chevron>
              <Amount
                currency={posting.currencyCode}
                sign={sign}
                tone={posting.archivedAt ? "muted" : "auto"}
                value={posting.amount}
              />
            </ListItemTrailing>
          </ListItem>
        ))}
      </List>
    );
  }
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-muted-foreground px-4 text-xs font-medium">
        Posted transactions
      </h3>
      {body}
      <p className="text-muted-foreground px-4 text-xs">
        These are ordinary transactions: edit or archive them from the ledger.
        Changing the schedule never rewrites them.
      </p>
    </section>
  );
};

/** One schedule: what it posts and when, then what it has posted so far. */
const ScheduleDetails = ({
  actions,
  activeOrganizationId,
  onOpenChange,
  open,
  schedule,
}: {
  actions: ReactNode;
  activeOrganizationId: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  schedule: Schedule;
}) => {
  let next = "Stopped";
  if (schedule.status === "paused") {
    next = "Paused";
  } else if (schedule.nextOccurrenceDate) {
    next = formatLongDate(schedule.nextOccurrenceDate);
  }
  return (
    <ResponsiveSheet
      onOpenChange={onOpenChange}
      open={open}
      title={schedule.name}
    >
      <div className="flex flex-col gap-6">
        {schedule.lastError ? (
          <p
            className="bg-warning-soft text-warning-foreground rounded-2xl px-4 py-3 text-sm"
            role="alert"
          >
            {`Paused automatically: ${schedule.lastError}. Fix the schedule, then resume it.`}
          </p>
        ) : null}
        <section className="flex flex-col gap-2">
          <h3 className="text-muted-foreground px-4 text-xs font-medium">
            Schedule
          </h3>
          <List aria-label="Schedule">
            <Row label="Amount">
              <Amount
                currency={schedule.currencyCode}
                sign={schedule.type === "income" ? "in" : "out"}
                tone="auto"
                value={schedule.amount}
              />
            </Row>
            <Row label="Category">
              <span className="flex min-w-0 items-center gap-2">
                <IconTile size="xs" tint={schedule.categoryColor}>
                  {schedule.categoryIcon}
                </IconTile>
                <span className="truncate">{schedule.categoryName}</span>
              </span>
            </Row>
            <Row label="Account">{schedule.accountName}</Row>
            <Row label="Repeats">{describeRecurrence(schedule)}</Row>
            <Row label="Next">{next}</Row>
            <Row label="Posts as">
              {schedule.paidStatus === "paid" ? "Paid" : "Unpaid"}
            </Row>
            {schedule.tags.length > 0 ? (
              <Row label="Tags">
                <span className="flex flex-wrap justify-end gap-x-3 gap-y-1">
                  {schedule.tags.map((tag) => (
                    <span
                      className="inline-flex items-center gap-1.5"
                      key={tag.id}
                    >
                      <ColorDot tint={tag.color} />
                      {tag.name}
                    </span>
                  ))}
                </span>
              </Row>
            ) : null}
            {schedule.notes ? (
              <Row label="Note">
                <span className="truncate">{schedule.notes}</span>
              </Row>
            ) : null}
          </List>
        </section>
        <PostedTransactions
          activeOrganizationId={activeOrganizationId}
          schedule={schedule}
        />
        <div className="flex flex-wrap gap-2">{actions}</div>
      </div>
    </ResponsiveSheet>
  );
};

/**
 * A household's recurring schedules. Each is a template that posts normal
 * transactions on its dates; pausing, editing or stopping it changes what it
 * posts next, never what it already posted.
 */
// One screen for the list, its details sheet and every lifecycle action.
// oxlint-disable-next-line complexity
export const ScheduleManager = ({
  activeOrganizationId,
  householdCurrency,
  permissions,
  timezone,
}: {
  activeOrganizationId: string;
  householdCurrency: string;
  permissions: SchedulePermissions;
  timezone: string;
}) => {
  const queryClient = useQueryClient();
  const orpc = householdOrpc(activeOrganizationId);
  const schedules = useQuery(orpc.recurringSchedules.list.queryOptions());
  const accounts = useQuery(
    orpc.accounts.list.queryOptions({ input: { includeArchived: true } })
  );
  const categories = useQuery(
    orpc.categories.list.queryOptions({ input: { includeArchived: true } })
  );
  const tags = useQuery(
    orpc.tags.list.queryOptions({ input: { includeArchived: true } })
  );
  const [composer, setComposer] = useState<{
    key: number;
    open: boolean;
    schedule?: Schedule;
  } | null>(null);
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [stopping, setStopping] = useState<Schedule | null>(null);

  const refresh = () =>
    invalidate(queryClient, activeOrganizationId, "recurringSchedules");

  const pause = useMutation(
    orpc.recurringSchedules.pause.mutationOptions({
      onSuccess: async (schedule) => {
        await refresh();
        toastManager.add({ title: `${schedule.name} paused`, type: "success" });
      },
    })
  );
  const resume = useMutation(
    orpc.recurringSchedules.resume.mutationOptions({
      onSuccess: async (schedule) => {
        await refresh();
        toastManager.add({
          title: schedule.nextOccurrenceDate
            ? `${schedule.name} resumed — next ${formatLongDate(schedule.nextOccurrenceDate)}`
            : `${schedule.name} resumed`,
          type: "success",
        });
      },
    })
  );
  const stop = useMutation(
    orpc.recurringSchedules.stop.mutationOptions({
      onSuccess: async (schedule) => {
        setStopping(null);
        await refresh();
        toastManager.add({
          title: `${schedule.name} stopped`,
          type: "success",
        });
      },
    })
  );

  const openComposer = (schedule?: Schedule) => {
    setDetailsId(null);
    setComposer({ key: Date.now(), open: true, schedule });
  };

  const header = (
    <PageHeader>
      <PageHeading>
        <PageTitle>Recurring</PageTitle>
        <PageDescription>
          Salary, rent, bills and subscriptions, posted to the ledger on their
          dates in your household’s timezone.
        </PageDescription>
      </PageHeading>
      {permissions.canCreate ? (
        <PageActions>
          <Button onClick={() => openComposer()}>
            <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} />
            New schedule
          </Button>
        </PageActions>
      ) : null}
    </PageHeader>
  );

  if (schedules.isPending) {
    return (
      <Page width="narrow">
        {header}
        <Skeleton className="h-64 w-full" radius="2xl" />
      </Page>
    );
  }
  if (schedules.isError) {
    return (
      <Page width="narrow">
        {header}
        <Empty>
          <EmptyTitle>Couldn’t load recurring schedules</EmptyTitle>
          <EmptyDescription>
            Check your connection and try again.
          </EmptyDescription>
        </Empty>
      </Page>
    );
  }

  const lifecycleActions = (schedule: Schedule, layout: "menu" | "buttons") => {
    const items: {
      destructive?: boolean;
      icon: typeof PauseIcon;
      label: string;
      loading: boolean;
      handleSelect: () => void;
    }[] = [];
    if (schedule.status !== "stopped" && permissions.canUpdate) {
      items.push(
        {
          handleSelect: () => openComposer(schedule),
          icon: PencilEdit02Icon,
          label: "Edit",
          loading: false,
        },
        schedule.status === "active"
          ? {
              handleSelect: () => pause.mutate({ scheduleId: schedule.id }),
              icon: PauseIcon,
              label: "Pause",
              loading: pause.isPending,
            }
          : {
              handleSelect: () => resume.mutate({ scheduleId: schedule.id }),
              icon: PlayIcon,
              label: "Resume",
              loading: resume.isPending,
            }
      );
    }
    if (schedule.status !== "stopped" && permissions.canStop) {
      items.push({
        destructive: true,
        handleSelect: () => setStopping(schedule),
        icon: StopIcon,
        label: "Stop",
        loading: false,
      });
    }
    if (layout === "buttons") {
      return items.map((item) => (
        <Button
          className="flex-1"
          key={item.label}
          loading={item.loading}
          onClick={item.handleSelect}
          variant={item.destructive ? "destructive-outline" : "secondary"}
        >
          <HugeiconsIcon icon={item.icon} strokeWidth={1.8} />
          {item.label}
        </Button>
      ));
    }
    return (
      <Menu>
        <MenuTrigger
          aria-label={`${schedule.name} actions`}
          render={<Button size="icon-sm" variant="ghost" />}
        >
          <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={2} />
        </MenuTrigger>
        <MenuPopup align="end" className="min-w-44">
          <MenuItem onClick={() => setDetailsId(schedule.id)}>
            <HugeiconsIcon icon={TaskDone01Icon} strokeWidth={1.8} />
            Details and history
          </MenuItem>
          {items.map((item) => (
            <MenuItem
              key={item.label}
              onClick={item.handleSelect}
              variant={item.destructive ? "destructive" : "default"}
            >
              <HugeiconsIcon icon={item.icon} strokeWidth={1.8} />
              {item.label}
            </MenuItem>
          ))}
        </MenuPopup>
      </Menu>
    );
  };

  const row = (schedule: Schedule) => (
    <ListItem className="items-start" key={schedule.id}>
      <ListItemLeading>
        <IconTile size="sm" tint={schedule.categoryColor}>
          {schedule.categoryIcon}
        </IconTile>
      </ListItemLeading>
      <ListItemContent>
        <ListItemTitle>
          <button
            className="truncate text-left hover:underline focus-visible:underline focus-visible:outline-none"
            onClick={() => setDetailsId(schedule.id)}
            type="button"
          >
            {schedule.name}
          </button>
          <StatusBadge schedule={schedule} />
          {schedule.lastError ? (
            <Badge variant="warning">Needs attention</Badge>
          ) : null}
        </ListItemTitle>
        <ListItemDescription>{scheduleTiming(schedule)}</ListItemDescription>
        <ListItemDescription>
          {`${schedule.categoryName} · ${schedule.accountName} · ${schedule.postedCount} posted`}
        </ListItemDescription>
      </ListItemContent>
      <ListItemTrailing>
        <Amount
          currency={schedule.currencyCode}
          sign={schedule.type === "income" ? "in" : "out"}
          tone={schedule.status === "stopped" ? "muted" : "auto"}
          value={schedule.amount}
        />
        {lifecycleActions(schedule, "menu")}
      </ListItemTrailing>
    </ListItem>
  );

  const details = schedules.data.find(({ id }) => id === detailsId);

  return (
    <Page width="narrow">
      {header}
      {schedules.data.length === 0 ? (
        <Empty size="compact">
          <EmptyMedia>
            <HugeiconsIcon icon={RepeatIcon} strokeWidth={1.8} />
          </EmptyMedia>
          <EmptyTitle>No recurring transactions</EmptyTitle>
          <EmptyDescription>
            Set up your salary or rent once, and it lands in the ledger on time.
          </EmptyDescription>
          {permissions.canCreate ? (
            <EmptyContent>
              <Button onClick={() => openComposer()} variant="secondary">
                Add a schedule
              </Button>
            </EmptyContent>
          ) : null}
        </Empty>
      ) : (
        <>
          <List aria-label="Recurring schedules">
            {schedules.data.map(row)}
          </List>
          <p className="text-muted-foreground px-1 text-xs">
            Paused schedules skip the dates they miss; resuming picks up from
            today. Edits change future transactions only.
          </p>
        </>
      )}
      {details ? (
        <ScheduleDetails
          actions={lifecycleActions(details, "buttons")}
          activeOrganizationId={activeOrganizationId}
          onOpenChange={(open) => {
            if (!open) {
              setDetailsId(null);
            }
          }}
          open
          schedule={details}
        />
      ) : null}
      {composer && accounts.data && categories.data && tags.data ? (
        <ScheduleComposer
          accounts={accounts.data}
          activeOrganizationId={activeOrganizationId}
          categories={categories.data}
          householdCurrency={householdCurrency}
          key={composer.key}
          onOpenChange={(open) =>
            setComposer((current) => (current ? { ...current, open } : current))
          }
          open={composer.open}
          schedule={composer.schedule}
          tags={tags.data}
          timezone={timezone}
        />
      ) : null}
      <AlertDialog
        onOpenChange={(open) => {
          if (!open) {
            setStopping(null);
          }
        }}
        open={stopping !== null}
      >
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>{`Stop “${stopping?.name ?? ""}”?`}</AlertDialogTitle>
            <AlertDialogDescription>
              It won’t post again and can’t be resumed. The transactions it
              already posted stay in the ledger. To take a break instead, pause
              it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="secondary" />}>
              Cancel
            </AlertDialogClose>
            <Button
              loading={stop.isPending}
              onClick={() =>
                stopping && stop.mutate({ scheduleId: stopping.id })
              }
              variant="destructive"
            >
              Stop schedule
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </Page>
  );
};
