import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Calendar03Icon,
  CreditCardIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Amount } from "@masdan/ui/components/amount";
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
import {
  Stat,
  StatDetail,
  StatGroup,
  StatLabel,
  StatValue,
} from "@masdan/ui/components/stat";
import { cn } from "@masdan/ui/lib/utils";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useRef, useState } from "react";

import {
  addMonths,
  formatLongDate,
  formatMonthYear,
  formatShortDate,
  parseIsoDate,
} from "@/lib/dates";
import { householdOrpc } from "@/utils/orpc";

import {
  STATUS_LABELS,
  calendarWeeks,
  daySummary,
  moveWithinMonth,
  statusBadgeVariant,
} from "../presentation";
import type { BillStatus } from "../presentation";
import type { Bill, BillTotals, BillsMonth } from "../types";
import { BillSheet } from "./bill-sheet";
import { FeedSection } from "./feed-section";

const shiftMonth = (month: string, offset: number): string =>
  addMonths(`${month}-01`, offset).slice(0, 7);

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

const dotClassName = (status: BillStatus): string => {
  if (status === "overdue") {
    return "bg-destructive size-1.5 rounded-full";
  }
  if (status === "paid") {
    return "bg-positive size-1.5 rounded-full";
  }
  return "bg-brand size-1.5 rounded-full";
};

const Totals = ({ totals }: { totals: BillTotals }) => {
  const overdue = Number(totals.overdue) > 0;
  return (
    <StatGroup aria-label={`${totals.currencyCode} totals`}>
      <Stat>
        <StatLabel>Due this month</StatLabel>
        <StatValue>
          <Amount currency={totals.currencyCode} value={totals.due} />
        </StatValue>
        <StatDetail>
          {totals.unknownAmountCount > 0
            ? `+ ${totals.unknownAmountCount} without an amount yet`
            : "Every bill with an amount"}
        </StatDetail>
      </Stat>
      <Stat>
        <StatLabel>Paid</StatLabel>
        <StatValue>
          <Amount currency={totals.currencyCode} value={totals.paid} />
        </StatValue>
        <StatDetail>Recorded or confirmed</StatDetail>
      </Stat>
      <Stat>
        <StatLabel>Overdue</StatLabel>
        <StatValue>
          <Amount
            currency={totals.currencyCode}
            tone={overdue ? "negative" : "default"}
            value={totals.overdue}
          />
        </StatValue>
        <StatDetail>Past due, not paid</StatDetail>
      </Stat>
      <Stat>
        <StatLabel>Upcoming</StatLabel>
        <StatValue>
          <Amount currency={totals.currencyCode} value={totals.expected} />
        </StatValue>
        <StatDetail>Still expected</StatDetail>
      </Stat>
    </StatGroup>
  );
};

/**
 * The month as a keyboard grid: one tab stop, arrows move between days, Enter
 * or Space picks a day to filter the list below. Each day's name carries its
 * bill count, so the dots are never the only signal.
 */
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
      aria-label={`${formatMonthYear(month)} bills`}
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
                      "hover:bg-accent focus-visible:ring-ring/50 flex h-12 w-full flex-col items-center justify-start gap-1 rounded-lg pt-1.5 text-sm tabular-nums outline-none focus-visible:ring-3 sm:h-16",
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
                    {dayBills.length > 0 ? (
                      <span aria-hidden="true" className="flex gap-0.5">
                        {dayBills.slice(0, 3).map((bill) => (
                          <span
                            className={dotClassName(bill.status)}
                            key={bill.key}
                          />
                        ))}
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
      {bill.kind === "card" ? (
        <IconTile size="sm" tint={bill.account.color}>
          <HugeiconsIcon icon={CreditCardIcon} strokeWidth={1.8} />
        </IconTile>
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
          {STATUS_LABELS[bill.status]}
        </Badge>
      </ListItemTitle>
      <ListItemDescription>
        {`${formatShortDate(bill.dueDate, today)} · ${bill.account.name}`}
      </ListItemDescription>
    </ListItemContent>
    <ListItemTrailing>
      {bill.amount === null ? (
        <span className="text-muted-foreground text-xs">Amount TBD</span>
      ) : (
        <Amount
          currency={bill.currencyCode}
          tone={bill.status === "overdue" ? "negative" : "default"}
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
  { status: "paid", title: "Paid" },
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
            {`Due ${formatLongDate(selected)}`}
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
            <List aria-label={`${title} bills`}>
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

  if (data.bills.length === 0) {
    return (
      <Empty>
        <EmptyMedia>
          <HugeiconsIcon icon={Calendar03Icon} strokeWidth={1.8} />
        </EmptyMedia>
        <EmptyTitle>{`No bills in ${formatMonthYear(data.month)}`}</EmptyTitle>
        <EmptyDescription>
          Bills come from recurring expenses and credit-card due dates.
        </EmptyDescription>
        <EmptyContent>
          <Button render={<Link to="/recurring" />} variant="secondary">
            Manage recurring
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  return (
    <>
      {data.totals.map((totals) => (
        <Totals key={totals.currencyCode} totals={totals} />
      ))}
      <MonthGrid
        bills={data.bills}
        key={data.month}
        month={data.month}
        onSelect={setSelected}
        selected={day}
        today={data.today}
      />
      <Agenda
        bills={data.bills}
        onClearDay={() => setSelected(null)}
        onOpen={(bill) => setOpen({ key: bill.key, open: true })}
        selected={day}
        today={data.today}
      />
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

/**
 * The bill calendar: recurring expenses and card due dates for one month.
 * The server decides every status and total; this screen lays them out.
 */
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
        <PageTitle>Bills</PageTitle>
        <PageDescription>
          Recurring expenses and card due dates, and whether each is paid.
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
        <EmptyTitle>Couldn’t load bills</EmptyTitle>
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
      width="narrow"
    >
      {header}
      {body}
      <FeedSection activeOrganizationId={activeOrganizationId} />
    </Page>
  );
};
