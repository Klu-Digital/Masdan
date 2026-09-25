import { Cancel01Icon, Notification02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Badge } from "@masdan/ui/components/badge";
import { Button } from "@masdan/ui/components/button";
import {
  Popover,
  PopoverPopup,
  PopoverTitle,
  PopoverTrigger,
} from "@masdan/ui/components/popover";
import { Skeleton } from "@masdan/ui/components/skeleton";
import { toastManager } from "@masdan/ui/components/toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";

import { AccountCardThumb } from "@/modules/accounts/components/account-card";
import { client } from "@/utils/orpc";

import { reminderCopy, strongestTone } from "../presentation";
import type { ReminderTone } from "../presentation";
import { invalidateReminders, remindersQueryOptions } from "../queries";
import type { Reminder } from "../queries";

const detailClassName = (tone: ReminderTone): string => {
  if (tone === "danger") {
    return "text-destructive-foreground text-xs";
  }
  if (tone === "warning") {
    return "text-warning-foreground text-xs";
  }
  return "text-muted-foreground text-xs";
};

const countClassName = (tone: ReminderTone | null): string => {
  if (tone === "danger") {
    return "bg-destructive text-2xs absolute -end-0.5 -top-0.5 min-w-4 rounded-full px-1 leading-4 font-semibold text-white tabular-nums";
  }
  return "bg-brand text-brand-foreground text-2xs absolute -end-0.5 -top-0.5 min-w-4 rounded-full px-1 leading-4 font-semibold tabular-nums";
};

const ReminderRow = ({
  canDismiss,
  dismissing,
  onDismiss,
  onNavigate,
  reminder,
  today,
}: {
  canDismiss: boolean;
  dismissing: boolean;
  onDismiss: () => void;
  onNavigate: () => void;
  reminder: Reminder;
  today: string;
}) => {
  const copy = reminderCopy(reminder, today);
  const { account } = reminder;
  return (
    <li className="flex items-start gap-1">
      <Link
        className="hover:bg-accent focus-visible:ring-ring/50 flex min-w-0 flex-1 items-start gap-3 rounded-lg p-2 outline-none focus-visible:ring-3"
        onClick={onNavigate}
        params={{ accountId: account.id }}
        to="/accounts/$accountId"
      >
        <span className="mt-1">
          <AccountCardThumb account={account} size="sm" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex items-center gap-2 text-sm font-medium">
            <span className="truncate">{copy.title}</span>
            {copy.badge ? (
              <Badge
                size="sm"
                variant={copy.tone === "danger" ? "error" : "warning"}
              >
                {copy.badge}
              </Badge>
            ) : null}
          </span>
          <span className="truncate text-xs">
            {account.name}
            {account.cardLastFour ? ` •••• ${account.cardLastFour}` : ""}
          </span>
          {copy.detail ? (
            <span className={detailClassName(copy.tone)}>{copy.detail}</span>
          ) : null}
        </span>
      </Link>
      {canDismiss ? (
        <Button
          aria-label={`Dismiss “${copy.title}” for ${account.name}`}
          className="mt-1.5"
          disabled={dismissing}
          onClick={onDismiss}
          size="icon-sm"
          variant="ghost"
        >
          <HugeiconsIcon icon={Cancel01Icon} strokeWidth={1.8} />
        </Button>
      ) : null}
    </li>
  );
};

/**
 * The household's card statement and payment reminders, a week ahead.
 * Dismissing is household-wide and undoable from the toast.
 */
export const RemindersMenu = ({
  activeOrganizationId,
  canDismiss,
}: {
  activeOrganizationId: string | null;
  canDismiss: boolean;
}) => {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const reminders = useQuery(remindersQueryOptions(activeOrganizationId));
  const items = reminders.data?.items ?? [];
  const today = reminders.data?.today ?? "";

  const dismiss = useMutation({
    mutationFn: ({ reminder, undo }: { reminder: Reminder; undo: boolean }) =>
      undo
        ? client.reminders.restore({ reminderId: reminder.id })
        : client.reminders.dismiss({ reminderId: reminder.id }),
    onError: (error: Error) => {
      toastManager.add({ title: error.message, type: "error" });
    },
    onSuccess: async (_, { reminder, undo }) => {
      await invalidateReminders(queryClient, activeOrganizationId);
      if (undo) {
        return;
      }
      toastManager.add({
        actionProps: {
          children: "Undo",
          onClick: () => dismiss.mutate({ reminder, undo: true }),
        },
        title: `Reminder for ${reminder.account.name} dismissed`,
        type: "success",
      });
    },
  });

  if (activeOrganizationId === null) {
    return null;
  }

  const tone = strongestTone(items, today);
  const label =
    items.length > 0 ? `Reminders, ${items.length} active` : "Reminders";

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger
        render={
          <Button
            aria-label={label}
            className="relative"
            size="icon"
            variant="ghost"
          />
        }
      >
        <HugeiconsIcon icon={Notification02Icon} strokeWidth={1.8} />
        {items.length > 0 ? (
          <span aria-hidden="true" className={countClassName(tone)}>
            {items.length}
          </span>
        ) : null}
      </PopoverTrigger>
      <PopoverPopup align="end" className="w-80" inset="none">
        <div className="flex flex-col gap-1 p-2">
          <PopoverTitle className="mx-2 mt-2 mb-1">Reminders</PopoverTitle>
          {reminders.isPending ? <Skeleton className="m-2 h-12" /> : null}
          {reminders.isError ? (
            <p className="text-muted-foreground px-2 pb-2 text-sm">
              Reminders could not be loaded.
            </p>
          ) : null}
          {reminders.isSuccess && items.length === 0 ? (
            <p className="text-muted-foreground px-2 pb-2 text-sm">
              You’re all caught up. Card statements and payments show up here a
              week before they’re due.
            </p>
          ) : null}
          {items.length > 0 ? (
            <ul aria-label="Card reminders" className="flex flex-col">
              {items.map((reminder) => (
                <ReminderRow
                  canDismiss={canDismiss}
                  dismissing={
                    dismiss.isPending &&
                    dismiss.variables?.reminder.id === reminder.id
                  }
                  key={reminder.id}
                  onDismiss={() => dismiss.mutate({ reminder, undo: false })}
                  onNavigate={() => setOpen(false)}
                  reminder={reminder}
                  today={today}
                />
              ))}
            </ul>
          ) : null}
        </div>
      </PopoverPopup>
    </Popover>
  );
};
