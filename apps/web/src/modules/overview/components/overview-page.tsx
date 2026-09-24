import {
  ArrowRight01Icon,
  CheckmarkCircle02Icon,
  FileImportIcon,
  Invoice02Icon,
  Mail01Icon,
  PlusSignIcon,
  UserAdd01Icon,
  Wallet01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Amount } from "@masdan/ui/components/amount";
import { Badge } from "@masdan/ui/components/badge";
import { Button } from "@masdan/ui/components/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyTitle,
} from "@masdan/ui/components/empty";
import { IconTile } from "@masdan/ui/components/icon-tile";
import {
  List,
  ListItem,
  ListItemButton,
  ListItemContent,
  ListItemDescription,
  ListItemLeading,
  ListItemTitle,
  ListItemTrailing,
} from "@masdan/ui/components/list";
import { Meter, MeterIndicator, MeterTrack } from "@masdan/ui/components/meter";
import {
  Page,
  PageEyebrow,
  PageHeader,
  PageHeading,
  PageTitle,
  Section,
  SectionHeader,
  SectionTitle,
} from "@masdan/ui/components/page";
import { Skeleton } from "@masdan/ui/components/skeleton";
import { formatMoney, toNumber } from "@masdan/ui/lib/money";
import { cn } from "@masdan/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { Link, createLink } from "@tanstack/react-router";
import type { ComponentProps, ReactNode } from "react";

import { useAppActions } from "@/components/app-actions";
import type { ActiveHousehold } from "@/components/household-gate";
import {
  formatDay,
  formatLongDate,
  formatMonthYear,
  formatRelativeDays,
  formatShortDate,
  parseIsoDate,
} from "@/lib/dates";
import { householdToday } from "@/lib/household-date";
import { userInvitationsQueryOptions } from "@/lib/organization";
import { AccountTile } from "@/modules/accounts/components/account-row";
import { nextPaymentDue } from "@/modules/accounts/credit";
import { ACCOUNT_GROUPS } from "@/modules/accounts/kinds";
import { groupOf, groupTotal } from "@/modules/accounts/net-worth";
import {
  accountStatementsQueryOptions,
  accountsQueryOptions,
} from "@/modules/accounts/queries";
import { NetWorthHistoryChart } from "@/modules/reports/components/report-sections";
import {
  cashFlowQueryOptions,
  netWorthHistoryQueryOptions,
  netWorthQueryOptions,
  spendingQueryOptions,
} from "@/modules/reports/queries";
import type {
  CashFlowReport,
  LedgerReportInput,
  NetWorthHistoryInput,
  NetWorthReport,
  SpendingReport,
} from "@/modules/reports/queries";
import { TransactionTile } from "@/modules/transactions/components/transaction-tile";
import { describeTransaction } from "@/modules/transactions/presentation";
import { transactionsQueryOptions } from "@/modules/transactions/queries";
import { DEFAULT_TRANSACTION_SEARCH } from "@/modules/transactions/search";
import type { client } from "@/utils/orpc";

type Account = Awaited<ReturnType<typeof client.accounts.list>>;

/** The slice of the active household this page reads. */
export interface OverviewHousehold extends Pick<
  ActiveHousehold,
  "activeOrganizationId" | "can" | "currency" | "timezone"
> {
  organization: { name: string } | null;
  session: { user: { name: string } };
}

const THIS_MONTH = {
  preset: "this_month",
} as const satisfies LedgerReportInput;
const NET_WORTH_TREND = {
  granularity: "month",
  preset: "last_6_months",
} as const satisfies NetWorthHistoryInput;

const TOP_CATEGORIES = 5;
const RECENT_COUNT = 8;
const UPCOMING_BILLS = 5;

const greeting = (now: Date): string => {
  const hour = now.getHours();
  if (hour < 12) {
    return "Good morning";
  }
  if (hour < 18) {
    return "Good afternoon";
  }
  return "Good evening";
};

const weekdayFormat = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "long",
  weekday: "long",
});

const SeeAllAnchor = ({
  children,
  className,
  ...props
}: ComponentProps<"a">) => (
  <a
    className={cn(
      "text-brand-text hover:bg-brand-soft focus-visible:ring-ring/50 -me-2 inline-flex h-7 shrink-0 items-center gap-0.5 rounded-md px-2 text-xs font-medium outline-none focus-visible:ring-3",
      className
    )}
    {...props}
  >
    {children}
    <HugeiconsIcon
      aria-hidden="true"
      className="size-3.5"
      icon={ArrowRight01Icon}
      strokeWidth={2}
    />
  </a>
);

const SeeAll = createLink(SeeAllAnchor);

const EmptyNote = ({ children }: { children: ReactNode }) => (
  <p className="bg-card text-muted-foreground dark:ring-hairline rounded-3xl px-5 py-8 text-center text-sm dark:ring-1">
    {children}
  </p>
);

const LoadFailed = ({ onRetry }: { onRetry: () => void }) => (
  <div className="bg-card dark:ring-hairline flex items-center justify-between gap-3 rounded-2xl px-4 py-3 dark:ring-1">
    <p className="text-muted-foreground text-sm">Couldn’t load this.</p>
    <Button onClick={onRetry} size="sm" variant="secondary">
      Try again
    </Button>
  </div>
);

/* ------------------------------------------------------------------ */
/* Net worth + this month                                              */
/* ------------------------------------------------------------------ */

const NetWorthCard = ({
  currency,
  failed,
  onRetry,
  report,
}: {
  currency: string;
  failed: boolean;
  onRetry: () => void;
  report: NetWorthReport | undefined;
}) => {
  const position = report?.positions.find(
    (item) => item.currencyCode === currency
  );
  const others =
    report?.positions.filter((item) => item.currencyCode !== currency) ?? [];

  return (
    <section
      aria-busy={report === undefined && !failed}
      aria-label="Net worth"
      className="bg-card dark:ring-hairline flex flex-col justify-between gap-6 rounded-3xl p-5 sm:p-6 dark:ring-1"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-muted-foreground text-xs font-medium">
            Net worth
          </span>
          {report ? (
            <Amount
              animate
              currency={currency}
              size="display"
              value={position?.netWorth ?? 0}
            />
          ) : null}
          {others.length > 0 ? (
            <span className="text-muted-foreground text-xs">
              Plus{" "}
              {others
                .map((item) => formatMoney(item.netWorth, item.currencyCode))
                .join(" · ")}
            </span>
          ) : null}
        </div>
        <SeeAll to="/accounts">Accounts</SeeAll>
      </div>
      {failed ? <LoadFailed onRetry={onRetry} /> : null}
      {!report && !failed ? (
        <Skeleton className="h-24 w-full" radius="xl" />
      ) : null}
      {report ? (
        <dl className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-0.5">
            <dt className="text-muted-foreground text-xs">Assets</dt>
            <dd className="text-sm font-semibold">
              <Amount currency={currency} value={position?.assets ?? 0} />
            </dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-muted-foreground text-xs">Liabilities</dt>
            <dd className="text-sm font-semibold">
              <Amount currency={currency} value={position?.liabilities ?? 0} />
            </dd>
          </div>
        </dl>
      ) : null}
    </section>
  );
};

const MonthFigures = ({
  currency,
  report,
}: {
  currency: string;
  report: CashFlowReport;
}) => {
  const total = report.totals.find((item) => item.currencyCode === currency);
  const income = total?.income ?? 0;
  const expense = total?.expense ?? 0;
  const net = total?.net ?? 0;
  const overspent = toNumber(net) < 0;

  return (
    <>
      <dl className="flex flex-col gap-2.5">
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-sm">Money in</dt>
          <dd className="text-base font-semibold">
            <Amount
              currency={currency}
              sign={toNumber(income) > 0 ? "in" : "none"}
              tone="auto"
              value={income}
            />
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-sm">Money out</dt>
          <dd className="text-base font-semibold">
            <Amount
              currency={currency}
              sign={toNumber(expense) > 0 ? "out" : "none"}
              value={expense}
            />
          </dd>
        </div>
        <div className="border-hairline flex items-baseline justify-between gap-4 border-t pt-2.5">
          <dt className="text-sm font-medium">
            {overspent ? "Overspent" : "Left over"}
          </dt>
          <dd className="text-base font-semibold">
            <Amount
              currency={currency}
              sign="none"
              tone={overspent ? "negative" : "default"}
              value={net}
            />
          </dd>
        </div>
      </dl>
      <SeeAll
        className="self-start"
        search={{
          ...DEFAULT_TRANSACTION_SEARCH,
          dateFrom: report.period.dateFrom,
          dateTo: report.period.dateTo,
        }}
        to="/transactions"
      >
        This month’s transactions
      </SeeAll>
    </>
  );
};

const MonthCard = ({
  currency,
  failed,
  onRetry,
  report,
}: {
  currency: string;
  failed: boolean;
  onRetry: () => void;
  report: CashFlowReport | undefined;
}) => (
  <section
    aria-busy={report === undefined && !failed}
    aria-label="This month"
    className="bg-card dark:ring-hairline flex flex-col gap-4 rounded-3xl p-5 sm:p-6 dark:ring-1"
  >
    <div className="flex items-start justify-between gap-4">
      <span className="text-muted-foreground text-xs font-medium">
        {report
          ? `${formatMonthYear(report.period.dateFrom)} so far`
          : "This month"}
      </span>
      <SeeAll to="/reports">Reports</SeeAll>
    </div>
    {failed ? <LoadFailed onRetry={onRetry} /> : null}
    {!report && !failed ? (
      <Skeleton className="h-28 w-full" radius="xl" />
    ) : null}
    {report ? <MonthFigures currency={currency} report={report} /> : null}
  </section>
);

/* ------------------------------------------------------------------ */
/* Spending this month                                                 */
/* ------------------------------------------------------------------ */

const SpendingRows = ({
  currency,
  report,
}: {
  currency: string;
  report: SpendingReport;
}) => {
  const rows = report.categories.filter((row) => row.currencyCode === currency);
  const total = toNumber(
    report.totals.find((item) => item.currencyCode === currency)?.total ?? 0
  );
  const top = rows.slice(0, TOP_CATEGORIES);
  const more = rows.length - top.length;
  const largest = toNumber(top[0]?.total ?? 0);

  if (rows.length === 0) {
    return <EmptyNote>No spending recorded this month yet.</EmptyNote>;
  }
  return (
    <List>
      {top.map((row) => {
        const value = toNumber(row.total);
        return (
          <ListItem
            key={row.categoryId}
            render={
              <Link
                search={{
                  ...DEFAULT_TRANSACTION_SEARCH,
                  categoryIds: [row.categoryId],
                  dateFrom: report.period.dateFrom,
                  dateTo: report.period.dateTo,
                }}
                to="/transactions"
              />
            }
          >
            <ListItemLeading>
              <IconTile tint={row.color}>{row.icon}</IconTile>
            </ListItemLeading>
            <ListItemContent>
              <span className="flex items-baseline justify-between gap-3">
                <ListItemTitle>{row.name}</ListItemTitle>
                <span className="shrink-0 text-sm font-medium">
                  <Amount currency={currency} value={row.total} />
                </span>
              </span>
              <span className="flex items-center gap-3">
                <Meter
                  aria-label={`${row.name} share of spending`}
                  className="flex-1"
                  max={largest}
                  value={value}
                >
                  <MeterTrack>
                    <MeterIndicator tone="brand" />
                  </MeterTrack>
                </Meter>
                <span className="text-muted-foreground w-9 shrink-0 text-right text-xs tabular-nums">
                  {total > 0 ? Math.round((value / total) * 100) : 0}%
                </span>
              </span>
            </ListItemContent>
          </ListItem>
        );
      })}
      {more > 0 ? (
        <ListItem render={<Link to="/reports" />}>
          <ListItemLeading>
            <IconTile>…</IconTile>
          </ListItemLeading>
          <ListItemContent>
            <ListItemTitle>
              {more === 1 ? "1 more category" : `${more} more categories`}
            </ListItemTitle>
          </ListItemContent>
          <ListItemTrailing chevron />
        </ListItem>
      ) : null}
    </List>
  );
};

const SpendingHighlights = ({
  currency,
  failed,
  onRetry,
  report,
}: {
  currency: string;
  failed: boolean;
  onRetry: () => void;
  report: SpendingReport | undefined;
}) => (
  <Section
    aria-busy={report === undefined && !failed}
    aria-label="Spending this month"
  >
    <SectionHeader>
      <SectionTitle>Where it went</SectionTitle>
      {report ? (
        <SeeAll
          search={{
            ...DEFAULT_TRANSACTION_SEARCH,
            dateFrom: report.period.dateFrom,
            dateTo: report.period.dateTo,
            types: ["expense"],
          }}
          to="/transactions"
        >
          This month’s spending
        </SeeAll>
      ) : null}
    </SectionHeader>
    {failed ? <LoadFailed onRetry={onRetry} /> : null}
    {!report && !failed ? (
      <Skeleton className="h-64 w-full" radius="3xl" />
    ) : null}
    {report ? <SpendingRows currency={currency} report={report} /> : null}
  </Section>
);

/* ------------------------------------------------------------------ */
/* Upcoming: card payments and unpaid bills                           */
/* ------------------------------------------------------------------ */

const CardDueRow = ({
  account,
  today,
}: {
  account: Account[number];
  today: string;
}) => {
  const statements = useQuery(accountStatementsQueryOptions(account.id));
  const due = nextPaymentDue(account, statements.data ?? [], today);
  if (!due) {
    return null;
  }
  const overdue = due.daysLeft < 0;
  const amount = due.statement?.statementBalance ?? account.balance;
  return (
    <ListItem
      render={
        <Link params={{ accountId: account.id }} to="/accounts/$accountId" />
      }
    >
      <ListItemLeading>
        <AccountTile account={account} />
      </ListItemLeading>
      <ListItemContent>
        <ListItemTitle>{account.name}</ListItemTitle>
        <ListItemDescription>
          {overdue ? (
            <Badge variant="error">
              Overdue since {formatShortDate(due.dueDate, today)}
            </Badge>
          ) : (
            `Due ${formatShortDate(due.dueDate, today)} · ${formatRelativeDays(due.dueDate, today)}`
          )}
        </ListItemDescription>
      </ListItemContent>
      <ListItemTrailing chevron>
        <Amount
          weight="medium"
          currency={account.currencyCode}
          value={amount}
        />
      </ListItemTrailing>
    </ListItem>
  );
};

const Upcoming = ({
  accounts,
  organizationId,
  today,
}: {
  accounts: Account;
  organizationId: string;
  today: string;
}) => {
  const cards = accounts.filter(
    (account) => account.accountType === "credit_card"
  );
  const unpaid = useQuery(
    transactionsQueryOptions(organizationId, {
      ...DEFAULT_TRANSACTION_SEARCH,
      pageSize: UPCOMING_BILLS,
      paidStatuses: ["unpaid"],
      sortDirection: "asc",
    })
  );
  const bills = unpaid.data?.items ?? [];
  const hasCards = cards.some(
    (card) => card.paymentDueDay !== null || toNumber(card.balance) > 0
  );

  return (
    <Section aria-busy={unpaid.isPending} aria-label="Coming up">
      <SectionHeader>
        <SectionTitle>Coming up</SectionTitle>
        {(unpaid.data?.total ?? 0) > bills.length ? (
          <SeeAll
            search={{ ...DEFAULT_TRANSACTION_SEARCH, paidStatuses: ["unpaid"] }}
            to="/transactions"
          >
            All unpaid
          </SeeAll>
        ) : null}
      </SectionHeader>
      {!hasCards && bills.length === 0 && !unpaid.isPending ? (
        <div className="bg-card dark:ring-hairline flex items-center gap-3 rounded-2xl px-4 py-4 dark:ring-1">
          <HugeiconsIcon
            className="text-positive-foreground size-5 shrink-0"
            icon={CheckmarkCircle02Icon}
            strokeWidth={1.8}
          />
          <p className="text-sm">
            Nothing due. Card payments and unpaid bills will show up here.
          </p>
        </div>
      ) : (
        <List>
          {cards.map((card) => (
            <CardDueRow account={card} key={card.id} today={today} />
          ))}
          {bills.map((bill) => {
            const view = describeTransaction(bill);
            return (
              <ListItem
                key={bill.id}
                render={
                  <Link
                    params={{ transactionId: bill.id }}
                    to="/transactions/$transactionId"
                  />
                }
              >
                <ListItemLeading>
                  <TransactionTile transaction={bill} />
                </ListItemLeading>
                <ListItemContent>
                  <ListItemTitle>{view.title}</ListItemTitle>
                  <ListItemDescription>
                    Unpaid · {formatShortDate(bill.transactionDate, today)}
                  </ListItemDescription>
                </ListItemContent>
                <ListItemTrailing>
                  <Amount
                    weight="medium"
                    currency={bill.currencyCode}
                    sign={view.sign}
                    tone="auto"
                    value={bill.amount}
                  />
                </ListItemTrailing>
              </ListItem>
            );
          })}
        </List>
      )}
    </Section>
  );
};

/* ------------------------------------------------------------------ */
/* Accounts at a glance                                                */
/* ------------------------------------------------------------------ */

const AccountsGlance = ({ accounts }: { accounts: Account }) => (
  <Section aria-label="Accounts">
    <SectionHeader>
      <SectionTitle>Accounts</SectionTitle>
      <SeeAll to="/accounts">All accounts</SeeAll>
    </SectionHeader>
    <List>
      {ACCOUNT_GROUPS.map((group) => {
        const members = accounts.filter(
          (account) => groupOf(account) === group.key
        );
        const [first] = members;
        if (!first) {
          return null;
        }
        const total = groupTotal(members);
        const only = members.length === 1;
        return (
          <ListItem
            key={group.key}
            render={
              only ? (
                <Link
                  params={{ accountId: first.id }}
                  to="/accounts/$accountId"
                />
              ) : (
                <Link to="/accounts" />
              )
            }
          >
            <ListItemLeading>
              <AccountTile account={first} />
            </ListItemLeading>
            <ListItemContent>
              <ListItemTitle>{group.label}</ListItemTitle>
              <ListItemDescription>
                {only ? first.name : `${members.length} accounts`}
              </ListItemDescription>
            </ListItemContent>
            <ListItemTrailing chevron>
              {total ? (
                <Amount
                  weight="medium"
                  currency={total.currencyCode}
                  value={total.total}
                />
              ) : (
                <span className="text-muted-foreground text-xs">
                  Mixed currencies
                </span>
              )}
            </ListItemTrailing>
          </ListItem>
        );
      })}
    </List>
  </Section>
);

/* ------------------------------------------------------------------ */
/* Recent activity                                                     */
/* ------------------------------------------------------------------ */

const NoTransactions = ({ canCreate }: { canCreate: boolean }) => {
  const { compose } = useAppActions();
  return (
    <div className="bg-card dark:ring-hairline rounded-3xl dark:ring-1">
      <Empty size="compact">
        <EmptyTitle>No transactions yet</EmptyTitle>
        <EmptyDescription>
          Record what comes in and goes out, or bring in a bank export.
        </EmptyDescription>
        {canCreate ? (
          <EmptyContent>
            <Button
              onClick={() => compose({ kind: "expense", type: "transaction" })}
            >
              <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} />
              Add a transaction
            </Button>
            <Button render={<Link to="/imports" />} variant="secondary">
              <HugeiconsIcon icon={FileImportIcon} strokeWidth={1.8} />
              Import from CSV
            </Button>
          </EmptyContent>
        ) : null}
      </Empty>
    </div>
  );
};

const RecentActivity = ({
  canCreate,
  organizationId,
  today,
}: {
  canCreate: boolean;
  organizationId: string;
  today: string;
}) => {
  const recent = useQuery(
    transactionsQueryOptions(organizationId, {
      ...DEFAULT_TRANSACTION_SEARCH,
      pageSize: RECENT_COUNT,
    })
  );
  const items = recent.data?.items ?? [];
  return (
    <Section aria-busy={recent.isPending} aria-label="Recent activity">
      <SectionHeader>
        <SectionTitle>Recent activity</SectionTitle>
        <SeeAll to="/transactions">All transactions</SeeAll>
      </SectionHeader>
      {recent.isPending ? (
        <Skeleton className="h-72 w-full" radius="3xl" />
      ) : null}
      {recent.isError ? <LoadFailed onRetry={() => recent.refetch()} /> : null}
      {recent.data && items.length === 0 ? (
        <NoTransactions canCreate={canCreate} />
      ) : null}
      {items.length > 0 ? (
        <List>
          {items.map((transaction) => {
            const view = describeTransaction(transaction);
            return (
              <ListItem
                key={transaction.id}
                render={
                  <Link
                    params={{ transactionId: transaction.id }}
                    to="/transactions/$transactionId"
                  />
                }
              >
                <ListItemLeading>
                  <TransactionTile transaction={transaction} />
                </ListItemLeading>
                <ListItemContent>
                  <ListItemTitle>{view.title}</ListItemTitle>
                  <ListItemDescription>
                    {formatDay(transaction.transactionDate, today)} ·{" "}
                    {view.subtitle}
                  </ListItemDescription>
                </ListItemContent>
                <ListItemTrailing>
                  <Amount
                    weight="medium"
                    currency={transaction.currencyCode}
                    sign={view.sign}
                    tone="auto"
                    value={transaction.amount}
                  />
                </ListItemTrailing>
              </ListItem>
            );
          })}
        </List>
      ) : null}
    </Section>
  );
};

/* ------------------------------------------------------------------ */
/* First run                                                           */
/* ------------------------------------------------------------------ */

const Welcome = ({ household }: { household: OverviewHousehold }) => {
  const { compose, composeAccount } = useAppActions();
  const canCreateTransaction = household.can({ transaction: ["create"] });
  const steps = [
    {
      allowed: household.can({ financialAccount: ["create"] }),
      description: "A bank account, cash, an e-wallet or a credit card.",
      handleClick: () => composeAccount(),
      icon: Wallet01Icon,
      title: "Add an account",
    },
    {
      allowed: canCreateTransaction,
      description: "Every entry updates balances and this overview.",
      handleClick: () => compose({ kind: "expense", type: "transaction" }),
      icon: Invoice02Icon,
      title: "Record a transaction",
    },
  ];
  return (
    <section
      aria-label="Get started"
      className="bg-card dark:ring-hairline flex flex-col gap-5 rounded-3xl p-6 sm:p-8 dark:ring-1"
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold">
          Let’s set up {household.organization?.name ?? "your household"}
        </h2>
        <p className="text-muted-foreground text-sm">
          Add an account, then record or import transactions, and this page
          fills in with your net worth, spending and what’s due.
        </p>
      </div>
      <List variant="inset">
        {steps
          .filter((step) => step.allowed)
          .map((step, index) => (
            <ListItemButton key={step.title} onClick={step.handleClick}>
              <ListItemLeading>
                <IconTile tint={index === 0 ? "blue" : "green"}>
                  <HugeiconsIcon icon={step.icon} strokeWidth={1.8} />
                </IconTile>
              </ListItemLeading>
              <ListItemContent>
                <ListItemTitle>{step.title}</ListItemTitle>
                <ListItemDescription>{step.description}</ListItemDescription>
              </ListItemContent>
              <ListItemTrailing chevron>
                <HugeiconsIcon
                  className="text-brand-text size-4"
                  icon={PlusSignIcon}
                  strokeWidth={2}
                />
              </ListItemTrailing>
            </ListItemButton>
          ))}
        {canCreateTransaction ? (
          <ListItem render={<Link to="/imports" />}>
            <ListItemLeading>
              <IconTile tint="orange">
                <HugeiconsIcon icon={FileImportIcon} strokeWidth={1.8} />
              </IconTile>
            </ListItemLeading>
            <ListItemContent>
              <ListItemTitle>Import from CSV</ListItemTitle>
              <ListItemDescription>
                Bring in a bank or card export instead of typing it.
              </ListItemDescription>
            </ListItemContent>
            <ListItemTrailing chevron />
          </ListItem>
        ) : null}
        <ListItem render={<Link to="/settings/household" />}>
          <ListItemLeading>
            <IconTile tint="violet">
              <HugeiconsIcon icon={UserAdd01Icon} strokeWidth={1.8} />
            </IconTile>
          </ListItemLeading>
          <ListItemContent>
            <ListItemTitle>Invite your household</ListItemTitle>
            <ListItemDescription>
              Share accounts and spending with a partner or family.
            </ListItemDescription>
          </ListItemContent>
          <ListItemTrailing chevron />
        </ListItem>
      </List>
    </section>
  );
};

const InvitationNotice = () => {
  const invitations = useQuery(userInvitationsQueryOptions());
  const pending =
    invitations.data?.filter((invitation) => !invitation.expired) ?? [];
  if (pending.length === 0) {
    return null;
  }
  const [first] = pending;
  return (
    <Link
      className="bg-brand-soft hover:bg-brand/16 focus-visible:ring-ring/50 flex items-center gap-3 rounded-2xl px-4 py-3 transition-colors outline-none focus-visible:ring-3"
      to="/invitations"
    >
      <HugeiconsIcon
        className="text-brand-text size-5 shrink-0"
        icon={Mail01Icon}
        strokeWidth={1.8}
      />
      <span className="min-w-0 flex-1 text-sm">
        {pending.length === 1 && first
          ? `You’re invited to join ${first.organizationName}.`
          : `You have ${pending.length} household invitations.`}
      </span>
      <span className="text-brand-text shrink-0 text-sm font-medium">
        Review
      </span>
    </Link>
  );
};

const Overview = ({ household }: { household: OverviewHousehold }) => {
  const { activeOrganizationId, can, session, timezone } = household;
  const today = householdToday(timezone);
  const accounts = useQuery(accountsQueryOptions(activeOrganizationId));
  const netWorth = useQuery(netWorthQueryOptions(activeOrganizationId));
  const month = useQuery(
    cashFlowQueryOptions(activeOrganizationId, THIS_MONTH)
  );
  const spending = useQuery(
    spendingQueryOptions(activeOrganizationId, THIS_MONTH)
  );
  const trend = useQuery(
    netWorthHistoryQueryOptions(activeOrganizationId, NET_WORTH_TREND)
  );
  const currency =
    household.currency ?? netWorth.data?.defaultCurrency ?? "PHP";
  const firstName = session.user.name.split(" ")[0] ?? session.user.name;
  const activeAccounts = (accounts.data ?? []).filter(
    (account) => account.archivedAt === null
  );

  return (
    <Page>
      <PageHeader>
        <PageHeading>
          <PageEyebrow>{weekdayFormat.format(parseIsoDate(today))}</PageEyebrow>
          <PageTitle>
            {greeting(new Date())}, {firstName}
          </PageTitle>
        </PageHeading>
      </PageHeader>

      <InvitationNotice />

      {accounts.isPending ? (
        <section
          aria-busy="true"
          aria-label="Loading overview"
          className="grid gap-4 md:grid-cols-2"
        >
          <Skeleton className="h-44" radius="3xl" />
          <Skeleton className="h-44" radius="3xl" />
        </section>
      ) : null}

      {accounts.isError ? (
        <LoadFailed onRetry={() => accounts.refetch()} />
      ) : null}

      {accounts.data && activeAccounts.length === 0 ? (
        <Welcome household={household} />
      ) : null}

      {activeAccounts.length > 0 ? (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <NetWorthCard
              currency={currency}
              failed={netWorth.isError}
              onRetry={() => netWorth.refetch()}
              report={netWorth.data}
            />
            <MonthCard
              currency={currency}
              failed={month.isError}
              onRetry={() => month.refetch()}
              report={month.data}
            />
          </div>
          <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <div className="flex min-w-0 flex-col gap-8">
              {trend.isError ? (
                <LoadFailed onRetry={() => trend.refetch()} />
              ) : (
                <NetWorthHistoryChart
                  action={<SeeAll to="/reports">Reports</SeeAll>}
                  currency={currency}
                  history={trend.data}
                />
              )}
              <SpendingHighlights
                currency={currency}
                failed={spending.isError}
                onRetry={() => spending.refetch()}
                report={spending.data}
              />
              <RecentActivity
                canCreate={can({ transaction: ["create"] })}
                organizationId={activeOrganizationId}
                today={today}
              />
            </div>
            <div className="flex min-w-0 flex-col gap-8">
              <Upcoming
                accounts={activeAccounts}
                organizationId={activeOrganizationId}
                today={today}
              />
              <AccountsGlance accounts={activeAccounts} />
              <p className="text-muted-foreground px-1 text-xs">
                Figures are in {currency}, the household’s default currency.
                Updated {formatLongDate(today)}.
              </p>
            </div>
          </div>
        </>
      ) : null}
    </Page>
  );
};

export const OverviewPage = ({
  household,
}: {
  household: OverviewHousehold;
}) => (
  // Remount per household: report queries keep placeholder data across key
  // changes, which would show the previous household's figures under this one.
  <Overview household={household} key={household.activeOrganizationId} />
);
