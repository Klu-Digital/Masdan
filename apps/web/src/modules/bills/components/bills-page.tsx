import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Calendar03Icon,
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
  ListItemButton,
  ListItemContent,
  ListItemDescription,
  ListItemLeading,
  ListItemTitle,
  ListItemTrailing,
} from "@masdan/ui/components/list";
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
import { Skeleton } from "@masdan/ui/components/skeleton";
import { cn } from "@masdan/ui/lib/utils";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useRef, useState } from "react";

import { Amount } from "@/components/finance/amount";
import {
  addMonths,
  formatLongDate,
  formatMonthYear,
  formatShortDate,
  parseIsoDate,
} from "@/lib/dates";
import { AccountCardThumb } from "@/modules/accounts/components/account-card";
import { householdOrpc } from "@/utils/orpc";

import {
  STATUS_LABELS,
  calendarWeeks,
  daySummary,
  moveWithinMonth,
  statusBadgeVariant,
  calendarEventType,
} from "../presentation";
import type { BillStatus } from "../presentation";
import type { Bill, BillsMonth } from "../types";
import { BillSheet } from "./bill-sheet";
import { FeedSection } from "./feed-section";

const shiftMonth = (month: string, offset: number): string =>
  addMonths(`${month}-01`, offset).slice(0, 7);

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

const dotClassName = (bill: Bill): string => {
  if (bill.kind === "card") {
    return "bg-info size-1.5 shrink-0 rounded-full";
  }
  if (bill.transactionType === "income") {
    return "bg-positive size-1.5 shrink-0 rounded-full";
  }
  return "bg-destructive size-1.5 shrink-0 rounded-full";
};

const MonthGrid = ({
  bills,
  month,
  onSelect,
  selected,
  today,
}: {
  bills: readonly Bill[];
  month: string;
  onSelect: (day: string | null) => void;
  selected: string | null;
  today: string;
}) => {
  const byDay = new Map<string, Bill[]>();
  for (const bill of bills) {
    byDay.set(bill.dueDate, [...(byDay.get(bill.dueDate) ?? []), bill]);
  }
  const weeks = calendarWeeks(month);
  const firstBill = bills[0]?.dueDate;
  const initial =
    selected ??
    (today.startsWith(month) ? today : null) ??
    firstBill ??
    `${month}-01`;
  const [focused, setFocused] = useState(initial);
  const active = focused.startsWith(month) ? focused : initial;
  const cells = useRef(new Map<string, HTMLButtonElement>());

  const move = (day: string) => {
    setFocused(day);
    cells.current.get(day)?.focus();
  };

  return (
    <table
      aria-label={`${formatMonthYear(month)} calendar`}
      className="w-full table-fixed border-separate border-spacing-1"
    >
      <thead>
        <tr>
          {WEEKDAYS.map((weekday) => (
            <th
              className="text-muted-foreground text-center text-xs font-medium"
              key={weekday}
              scope="col"
            >
              {weekday}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {weeks.map((week) => (
          <tr key={week.find(Boolean)}>
            {week.map((day, index) => {
              if (!day) {
                return <td aria-hidden="true" key={`pad-${index}`} />;
              }
              const dayBills = byDay.get(day) ?? [];
              const isSelected = selected === day;
              return (
                <td className="p-0" key={day}>
                  <button
                    aria-label={`${formatLongDate(day)}, ${daySummary(dayBills)}`}
                    aria-pressed={isSelected}
                    className={cn(
                      "hover:bg-accent focus-visible:ring-ring/50 sm:border-border flex min-h-12 w-full flex-col items-center gap-1 rounded-lg p-1 text-sm tabular-nums outline-none focus-visible:ring-3 sm:min-h-36 sm:items-start sm:border sm:p-2",
                      isSelected && "bg-accent font-semibold",
                      day === today && "text-brand-text font-semibold",
                      dayBills.length === 0 && "text-muted-foreground"
                    )}
                    onClick={() => {
                      setFocused(day);
                      onSelect(isSelected ? null : day);
                    }}
                    onKeyDown={(event) => {
                      const target = moveWithinMonth(day, event.key);
                      if (target) {
                        event.preventDefault();
                        move(target);
                      }
                    }}
                    ref={(node) => {
                      if (node) {
                        cells.current.set(day, node);
                      } else {
                        cells.current.delete(day);
                      }
                    }}
                    tabIndex={day === active ? 0 : -1}
                    type="button"
                  >
                    {parseIsoDate(day).getDate()}
                    {/* Phones get dots; the agenda below carries the names. */}
                    {dayBills.length > 0 ? (
                      <span
                        aria-hidden="true"
                        className="flex items-center gap-0.5 sm:hidden"
                      >
                        {dayBills.slice(0, 3).map((bill) => (
                          <span className={dotClassName(bill)} key={bill.key} />
                        ))}
                      </span>
                    ) : null}
                    {dayBills.length > 0 ? (
                      <span
                        aria-hidden="true"
                        className="flex w-full flex-col gap-1 max-sm:hidden"
                      >
                        {dayBills.slice(0, 3).map((bill) => (
                          <span
                            className="bg-secondary flex min-w-0 items-center gap-1 rounded px-1 py-0.5 text-xs"
                            key={bill.key}
                          >
                            <span className={dotClassName(bill)} />
                            <span className="truncate">
                              {calendarEventType(bill)} · {bill.name}
                            </span>
                          </span>
                        ))}
                        {dayBills.length > 3 ? (
                          <span className="text-muted-foreground text-xs">
                            +{dayBills.length - 3} more
                          </span>
                        ) : null}
                      </span>
                    ) : null}
                  </button>
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
};

const BillRow = ({
  bill,
  onOpen,
  today,
}: {
  bill: Bill;
  onOpen: () => void;
  today: string;
}) => (
  <ListItemButton onClick={onOpen}>
    <ListItemLeading>
      {bill.card ? (
        <AccountCardThumb
          account={{
            ...bill.card,
            color: bill.account.color,
            currencyCode: bill.currencyCode,
            name: bill.account.name,
          }}
          size="sm"
        />
      ) : (
        <IconTile size="sm" tint={bill.category?.color}>
          {bill.category?.icon}
        </IconTile>
      )}
    </ListItemLeading>
    <ListItemContent>
      <ListItemTitle>
        {bill.name}
        <Badge variant={statusBadgeVariant(bill.status)}>
          {bill.kind === "recurring" && bill.status === "paid"
            ? "Posted"
            : STATUS_LABELS[bill.status]}
        </Badge>
      </ListItemTitle>
      <ListItemDescription>
        {`${formatShortDate(bill.dueDate, today)} · ${calendarEventType(bill)} · ${bill.account.name}`}
      </ListItemDescription>
    </ListItemContent>
    <ListItemTrailing>
      {bill.amount === null ? (
        <span className="text-muted-foreground text-xs">Amount TBD</span>
      ) : (
        <Amount
          currency={bill.currencyCode}
          tone={bill.transactionType === "income" ? "positive" : "negative"}
          value={bill.amount}
          weight="semibold"
        />
      )}
    </ListItemTrailing>
  </ListItemButton>
);

const GROUPS: { status: BillStatus; title: string }[] = [
  { status: "overdue", title: "Overdue" },
  { status: "expected", title: "Upcoming" },
  { status: "paid", title: "Completed" },
];

const Agenda = ({
  bills,
  onOpen,
  onClearDay,
  selected,
  today,
}: {
  bills: readonly Bill[];
  onClearDay: () => void;
  onOpen: (bill: Bill) => void;
  selected: string | null;
  today: string;
}) => {
  const shown = selected
    ? bills.filter((bill) => bill.dueDate === selected)
    : bills;
  return (
    <>
      {selected ? (
        <div className="flex items-center justify-between gap-2 px-1">
          <p aria-live="polite" className="text-sm font-medium">
            {formatLongDate(selected)}
          </p>
          <Button onClick={onClearDay} size="sm" variant="ghost">
            Show the whole month
          </Button>
        </div>
      ) : null}
      {shown.length === 0 ? (
        <Empty size="compact">
          <EmptyTitle>Nothing due that day</EmptyTitle>
        </Empty>
      ) : null}
      {GROUPS.map(({ status, title }) => {
        const group = shown.filter((bill) => bill.status === status);
        if (group.length === 0) {
          return null;
        }
        return (
          <Section key={status}>
            <SectionHeader>
              <SectionTitle>{`${title} · ${group.length}`}</SectionTitle>
            </SectionHeader>
            <List aria-label={`${title} events`}>
              {group.map((bill) => (
                <BillRow
                  bill={bill}
                  key={bill.key}
                  onOpen={() => onOpen(bill)}
                  today={today}
                />
              ))}
            </List>
          </Section>
        );
      })}
    </>
  );
};

const MonthBody = ({
  activeOrganizationId,
  canConfirm,
  data,
}: {
  activeOrganizationId: string;
  canConfirm: boolean;
  data: BillsMonth;
}) => {
  const [selected, setSelected] = useState<string | null>(null);
  const [open, setOpen] = useState<{ key: string; open: boolean } | null>(null);
  const openBill = data.bills.find((bill) => bill.key === open?.key);
  const day = selected?.startsWith(data.month) ? selected : null;

  return (
    <>
      <MonthGrid
        bills={data.bills}
        key={data.month}
        month={data.month}
        onSelect={setSelected}
        selected={day}
        today={data.today}
      />
      {data.bills.length === 0 ? (
        <Empty>
          <EmptyMedia>
            <HugeiconsIcon icon={Calendar03Icon} strokeWidth={1.8} />
          </EmptyMedia>
          <EmptyTitle>{`No events in ${formatMonthYear(data.month)}`}</EmptyTitle>
          <EmptyDescription>
            Add recurring income, expenses, or credit-card due dates to see them
            here.
          </EmptyDescription>
          <EmptyContent>
            <Button render={<Link to="/recurring" />} variant="secondary">
              Manage recurring
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <Agenda
          bills={data.bills}
          onClearDay={() => setSelected(null)}
          onOpen={(bill) => setOpen({ key: bill.key, open: true })}
          selected={day}
          today={data.today}
        />
      )}
      {open && openBill ? (
        <BillSheet
          activeOrganizationId={activeOrganizationId}
          bill={openBill}
          canConfirm={canConfirm}
          key={open.key}
          onOpenChange={(next) =>
            setOpen((current) => (current ? { ...current, open: next } : null))
          }
          open={open.open}
          today={data.today}
        />
      ) : null}
    </>
  );
};

/** Statuses come from the ledger, not the client's clock. */
export const BillsPage = ({
  activeOrganizationId,
  canConfirm,
  month,
  onMonthChange,
}: {
  activeOrganizationId: string;
  canConfirm: boolean;
  /** `YYYY-MM`; undefined is the household's current month. */
  month: string | undefined;
  /** No month returns to the household's current one. */
  onMonthChange: (month?: string) => void;
}) => {
  const bills = useQuery(
    householdOrpc(activeOrganizationId).bills.month.queryOptions({
      input: { month },
      meta: { suppressErrorToast: true },
      placeholderData: keepPreviousData,
    })
  );
  const shown = month ?? bills.data?.currentMonth;
  const currentMonth = bills.data?.currentMonth;
  const goTo = (target: string) =>
    target === currentMonth ? onMonthChange() : onMonthChange(target);

  const header = (
    <PageHeader>
      <PageHeading>
        <PageTitle>Calendar</PageTitle>
        <PageDescription>
          Recurring income and expenses post automatically. Card bills track
          payments.
        </PageDescription>
      </PageHeading>
      {shown ? (
        <PageActions>
          <Button
            aria-label="Previous month"
            onClick={() => goTo(shiftMonth(shown, -1))}
            size="icon"
            variant="ghost"
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} />
          </Button>
          <span
            aria-live="polite"
            className="min-w-32 text-center text-sm font-medium"
          >
            {formatMonthYear(shown)}
          </span>
          <Button
            aria-label="Next month"
            onClick={() => goTo(shiftMonth(shown, 1))}
            size="icon"
            variant="ghost"
          >
            <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} />
          </Button>
          {month !== undefined && month !== currentMonth ? (
            <Button
              onClick={() => onMonthChange()}
              size="sm"
              variant="secondary"
            >
              This month
            </Button>
          ) : null}
        </PageActions>
      ) : null}
    </PageHeader>
  );

  let body: React.ReactNode;
  if (bills.isPending) {
    body = (
      <>
        <Skeleton className="h-20 w-full" radius="2xl" />
        <Skeleton className="h-64 w-full" radius="2xl" />
      </>
    );
  } else if (bills.isError) {
    body = (
      <Empty>
        <EmptyTitle>Couldn’t load calendar</EmptyTitle>
        <EmptyDescription>
          Check your connection and try again.
        </EmptyDescription>
        <EmptyContent>
          <Button onClick={() => bills.refetch()} variant="secondary">
            Try again
          </Button>
        </EmptyContent>
      </Empty>
    );
  } else {
    body = (
      <MonthBody
        activeOrganizationId={activeOrganizationId}
        canConfirm={canConfirm}
        data={bills.data}
      />
    );
  }

  return (
    <Page
      aria-busy={bills.isPending || bills.isPlaceholderData || undefined}
      width="wide"
    >
      {header}
      {body}
      <FeedSection activeOrganizationId={activeOrganizationId} />
    </Page>
  );
};
