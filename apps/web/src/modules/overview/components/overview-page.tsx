import {
  ArrowRight01Icon,
  CheckmarkCircle02Icon,
  Invoice02Icon,
  Mail01Icon,
  PlusSignIcon,
  UserAdd01Icon,
  Wallet01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { ColumnChart } from "@masdan/ui/charts/column-chart";
import { Amount } from "@masdan/ui/components/amount";
import { Badge } from "@masdan/ui/components/badge";
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
  SectionDescription,
  SectionHeader,
  SectionTitle,
} from "@masdan/ui/components/page";
import { Skeleton } from "@masdan/ui/components/skeleton";
import { formatMoney, toNumber } from "@masdan/ui/lib/money";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { useAppActions } from "@/components/app-actions";
import type { ActiveHousehold } from "@/components/household-gate";
import {
  addMonths,
  formatLongDate,
  formatMonth,
  formatMonthName,
  formatMonthYear,
  formatRelativeDays,
  formatShortDate,
  parseIsoDate,
  startOfMonth,
} from "@/lib/dates";
import { householdToday } from "@/lib/household-date";
import { userInvitationsQueryOptions } from "@/lib/organization";
import { AccountTile } from "@/modules/accounts/components/account-row";
import { nextPaymentDue } from "@/modules/accounts/credit";
import { ACCOUNT_GROUPS } from "@/modules/accounts/kinds";
import {
  groupOf,
  groupTotal,
  netWorthByCurrency,
  primaryPosition,
} from "@/modules/accounts/net-worth";
import {
  accountStatementsQueryOptions,
  accountsQueryOptions,
} from "@/modules/accounts/queries";
import { Ledger } from "@/modules/transactions/components/ledger";
import { TransactionTile } from "@/modules/transactions/components/transaction-tile";
import { describeTransaction } from "@/modules/transactions/presentation";
import {
  transactionSummaryQueryOptions,
  transactionsQueryOptions,
} from "@/modules/transactions/queries";
import type { TransactionSummary } from "@/modules/transactions/queries";
import { DEFAULT_TRANSACTION_SEARCH } from "@/modules/transactions/search";
import type { client } from "@/utils/orpc";

type Account = Awaited<ReturnType<typeof client.accounts.list>>;

const MONTHS_OF_HISTORY = 6;
const TOP_CATEGORIES = 6;
const RECENT_COUNT = 8;

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

const SeeAll = ({
  children,
  to,
  search,
}: {
  children: ReactNode;
  search?: Record<string, unknown>;
  to: "/transactions" | "/accounts";
}) => (
  <Link
    className="text-brand-text hover:bg-brand-soft focus-visible:ring-ring/50 -me-2 inline-flex h-7 items-center gap-0.5 rounded-md px-2 text-xs font-medium outline-none focus-visible:ring-3"
    search={search as never}
    to={to}
  >
    {children}
    <HugeiconsIcon
      className="size-3.5"
      icon={ArrowRight01Icon}
      strokeWidth={2}
    />
  </Link>
);

/* ------------------------------------------------------------------ */
/* Net worth + this month                                              */
/* ------------------------------------------------------------------ */

const monthFlow = (
  summary: TransactionSummary | undefined,
  month: string,
  currency: string
) => {
  const entry = summary?.cashFlow.find(
    (item) => item.month === month && item.currencyCode === currency
  );
  return {
    expense: toNumber(entry?.expense ?? 0),
    income: toNumber(entry?.income ?? 0),
  };
};

const HeadlineFigures = ({
  accounts,
  currency,
  summary,
  today,
}: {
  accounts: Account;
  currency: string;
  summary: TransactionSummary | undefined;
  today: string;
}) => {
  const { others, primary } = primaryPosition(
    netWorthByCurrency(accounts),
    currency
  );
  const thisMonth = monthFlow(summary, today.slice(0, 7), currency);
  const lastMonth = monthFlow(
    summary,
    addMonths(today, -1).slice(0, 7),
    currency
  );
  const left = thisMonth.income - thisMonth.expense;
  const spendChange =
    lastMonth.expense > 0
      ? (thisMonth.expense - lastMonth.expense) / lastMonth.expense
      : null;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <section
        aria-label="Net worth"
        className="bg-card dark:ring-hairline flex flex-col justify-between gap-6 rounded-3xl p-5 sm:p-6 dark:ring-1"
      >
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground text-xs font-medium">
            Net worth
          </span>
          {primary ? (
            <Amount
              animate
              currency={primary.currencyCode}
              size="display"
              value={primary.net}
            />
          ) : (
            <Amount currency={currency} size="display" value={0} />
          )}
          {others.length > 0 ? (
            <span className="text-muted-foreground text-xs">
              Plus{" "}
              {others
                .map((position) =>
                  formatMoney(position.net, position.currencyCode)
                )
                .join(" · ")}
            </span>
          ) : null}
        </div>
        {primary ? (
          <dl className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-0.5">
              <dt className="text-muted-foreground text-xs">Assets</dt>
              <dd className="text-sm font-semibold">
                <Amount
                  currency={primary.currencyCode}
                  value={primary.assets}
                />
              </dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-muted-foreground text-xs">Liabilities</dt>
              <dd className="text-sm font-semibold">
                <Amount
                  currency={primary.currencyCode}
                  value={primary.liabilities}
                />
              </dd>
            </div>
          </dl>
        ) : null}
      </section>

      <section
        aria-label={`${formatMonthYear(today)} so far`}
        className="bg-card dark:ring-hairline flex flex-col gap-4 rounded-3xl p-5 sm:p-6 dark:ring-1"
      >
        <span className="text-muted-foreground text-xs font-medium">
          {formatMonthYear(today)} so far
        </span>
        <dl className="flex flex-col gap-2.5">
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-sm">Money in</dt>
            <dd className="text-base font-semibold">
              <Amount
                currency={currency}
                sign={thisMonth.income > 0 ? "in" : "none"}
                tone="auto"
                value={thisMonth.income}
              />
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-sm">Money out</dt>
            <dd className="text-base font-semibold">
              <Amount
                currency={currency}
                sign={thisMonth.expense > 0 ? "out" : "none"}
                value={thisMonth.expense}
              />
            </dd>
          </div>
          <div className="border-hairline flex items-baseline justify-between gap-4 border-t pt-2.5">
            <dt className="text-sm font-medium">
              {left >= 0 ? "Left over" : "Overspent"}
            </dt>
            <dd className="text-base font-semibold">
              <Amount
                currency={currency}
                sign="none"
                tone={left < 0 ? "negative" : "default"}
                value={Math.abs(left)}
              />
            </dd>
          </div>
        </dl>
        {spendChange === null ? null : (
          <p className="text-muted-foreground text-xs">
            Spending is {Math.abs(Math.round(spendChange * 100))}%{" "}
            {spendChange <= 0 ? "below" : "above"} all of{" "}
            {formatMonthName(addMonths(today, -1))} (
            {formatMoney(lastMonth.expense, currency)}).
          </p>
        )}
      </section>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Cash flow chart                                                     */
/* ------------------------------------------------------------------ */

const CashFlow = ({
  currency,
  summary,
  today,
}: {
  currency: string;
  summary: TransactionSummary | undefined;
  today: string;
}) => {
  const months = Array.from({ length: MONTHS_OF_HISTORY }, (_, index) =>
    addMonths(startOfMonth(today), index - (MONTHS_OF_HISTORY - 1)).slice(0, 7)
  );
  const data = months.map((month) => {
    const flow = monthFlow(summary, month, currency);
    return {
      key: month,
      label: formatMonth(month),
      longLabel:
        month === today.slice(0, 7)
          ? `${formatMonthYear(month)} so far`
          : formatMonthYear(month),
      values: { expense: flow.expense, income: flow.income },
    };
  });

  return (
    <Section aria-label="Cash flow">
      <SectionHeader>
        <SectionTitle>Cash flow</SectionTitle>
        <SectionDescription>
          Last {MONTHS_OF_HISTORY} months · {currency}
        </SectionDescription>
      </SectionHeader>
      <div className="bg-card dark:ring-hairline rounded-3xl p-5 sm:p-6 dark:ring-1">
        {summary ? (
          <ColumnChart
            data={data}
            formatAxis={(value) =>
              formatMoney(value, currency, { compact: true, sign: "none" })
            }
            formatValue={(value) => (
              <Amount currency={currency} value={value} />
            )}
            series={[
              {
                fillClassName: "fill-chart-2",
                key: "income",
                label: "Money in",
                swatchClassName: "bg-chart-2",
              },
              {
                fillClassName: "fill-chart-1",
                key: "expense",
                label: "Money out",
                swatchClassName: "bg-chart-1",
              },
            ]}
            title="Money in and out by month"
          />
        ) : (
          <Skeleton className="h-60 w-full" radius="xl" />
        )}
      </div>
    </Section>
  );
};

/* ------------------------------------------------------------------ */
/* Spending by category                                                */
/* ------------------------------------------------------------------ */

const SpendingByCategory = ({
  currency,
  summary,
  today,
}: {
  currency: string;
  summary: TransactionSummary | undefined;
  today: string;
}) => {
  const rows = (summary?.categories ?? []).filter(
    (row) => row.type === "expense" && row.currencyCode === currency
  );
  const total = rows.reduce((sum, row) => sum + toNumber(row.total), 0);
  const top = rows.slice(0, TOP_CATEGORIES);
  const rest = rows.slice(TOP_CATEGORIES);
  const restTotal = rest.reduce((sum, row) => sum + toNumber(row.total), 0);
  const largest = toNumber(top[0]?.total ?? 0);

  return (
    <Section aria-label="Spending by category">
      <SectionHeader>
        <SectionTitle>Where it went</SectionTitle>
        <SeeAll
          search={{
            ...DEFAULT_TRANSACTION_SEARCH,
            dateFrom: startOfMonth(today),
            dateTo: today,
            types: ["expense"],
          }}
          to="/transactions"
        >
          This month’s spending
        </SeeAll>
      </SectionHeader>
      {summary === undefined ? (
        <Skeleton className="h-64 w-full" radius="3xl" />
      ) : null}
      {summary && rows.length === 0 ? (
        <p className="bg-card text-muted-foreground dark:ring-hairline rounded-3xl px-5 py-8 text-center text-sm dark:ring-1">
          No spending recorded this month yet.
        </p>
      ) : null}
      {rows.length > 0 ? (
        <List>
          {top.map((row) => {
            const value = toNumber(row.total);
            const share = total > 0 ? value / total : 0;
            return (
              <ListItem
                key={row.categoryId}
                render={
                  <Link
                    search={{
                      ...DEFAULT_TRANSACTION_SEARCH,
                      categoryIds: [row.categoryId],
                      dateFrom: startOfMonth(today),
                      dateTo: today,
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
                      <Amount currency={currency} value={value} />
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
                      {Math.round(share * 100)}%
                    </span>
                  </span>
                </ListItemContent>
              </ListItem>
            );
          })}
          {rest.length > 0 ? (
            <ListItem>
              <ListItemLeading>
                <IconTile>…</IconTile>
              </ListItemLeading>
              <ListItemContent>
                <ListItemTitle>{rest.length} more categories</ListItemTitle>
              </ListItemContent>
              <ListItemTrailing>
                <Amount currency={currency} value={restTotal} />
              </ListItemTrailing>
            </ListItem>
          ) : null}
        </List>
      ) : null}
    </Section>
  );
};

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
  const { inspect } = useAppActions();
  const cards = accounts.filter(
    (account) =>
      account.accountType === "credit_card" && account.archivedAt === null
  );
  const unpaid = useQuery(
    transactionsQueryOptions(organizationId, {
      ...DEFAULT_TRANSACTION_SEARCH,
      pageSize: 5,
      paidStatuses: ["unpaid"],
      sortDirection: "asc",
    })
  );
  const bills = unpaid.data?.items ?? [];
  const hasCards = cards.some(
    (card) => card.paymentDueDay !== null || toNumber(card.balance) > 0
  );

  return (
    <Section aria-label="Coming up">
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
              <ListItemButton key={bill.id} onClick={() => inspect(bill.id)}>
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
              </ListItemButton>
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
        if (members.length === 0) {
          return null;
        }
        const total = groupTotal(members);
        const [first] = members;
        return (
          <ListItem key={group.key} render={<Link to="/accounts" />}>
            <ListItemLeading>
              {first ? <AccountTile account={first} /> : null}
            </ListItemLeading>
            <ListItemContent>
              <ListItemTitle>{group.label}</ListItemTitle>
              <ListItemDescription>
                {members.length === 1
                  ? members[0]?.name
                  : `${members.length} accounts`}
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

const RecentActivity = ({
  organizationId,
  today,
}: {
  organizationId: string;
  today: string;
}) => {
  const { inspect } = useAppActions();
  const recent = useQuery(
    transactionsQueryOptions(organizationId, {
      ...DEFAULT_TRANSACTION_SEARCH,
      pageSize: RECENT_COUNT,
    })
  );
  return (
    <Section aria-label="Recent activity">
      <SectionHeader>
        <SectionTitle>Recent activity</SectionTitle>
        <SeeAll to="/transactions">All transactions</SeeAll>
      </SectionHeader>
      {recent.isPending ? (
        <Skeleton className="h-72 w-full" radius="3xl" />
      ) : null}
      {recent.data && recent.data.items.length === 0 ? (
        <p className="bg-card text-muted-foreground dark:ring-hairline rounded-3xl px-5 py-8 text-center text-sm dark:ring-1">
          Transactions you record will appear here.
        </p>
      ) : null}
      {recent.data && recent.data.items.length > 0 ? (
        <Ledger
          grouped
          onOpen={(transaction) => inspect(transaction.id)}
          today={today}
          transactions={recent.data.items}
        />
      ) : null}
    </Section>
  );
};

/* ------------------------------------------------------------------ */
/* First run                                                           */
/* ------------------------------------------------------------------ */

const Welcome = ({ household }: { household: ActiveHousehold }) => {
  const { compose, composeAccount } = useAppActions();
  const steps = [
    {
      allowed: household.can({ financialAccount: ["create"] }),
      description: "A bank account, cash, an e-wallet or a credit card.",
      handleClick: () => composeAccount(),
      icon: Wallet01Icon,
      title: "Add an account",
    },
    {
      allowed: household.can({ transaction: ["create"] }),
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
          Two steps and this page fills in with your net worth, cash flow and
          what’s due.
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

export const OverviewPage = ({ household }: { household: ActiveHousehold }) => {
  const { activeOrganizationId, currency, session, timezone } = household;
  const today = householdToday(timezone);
  const accounts = useQuery(accountsQueryOptions(activeOrganizationId));
  const history = useQuery(
    transactionSummaryQueryOptions(activeOrganizationId, {
      dateFrom: startOfMonth(addMonths(today, -(MONTHS_OF_HISTORY - 1))),
      dateTo: today,
    })
  );
  const month = useQuery(
    transactionSummaryQueryOptions(activeOrganizationId, {
      dateFrom: startOfMonth(today),
      dateTo: today,
    })
  );
  const householdCurrency = currency ?? "PHP";
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
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-44" radius="3xl" />
          <Skeleton className="h-44" radius="3xl" />
        </div>
      ) : null}

      {accounts.data && activeAccounts.length === 0 ? (
        <Welcome household={household} />
      ) : null}

      {activeAccounts.length > 0 ? (
        <>
          <HeadlineFigures
            accounts={activeAccounts}
            currency={householdCurrency}
            summary={history.data}
            today={today}
          />
          <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <div className="flex min-w-0 flex-col gap-8">
              <CashFlow
                currency={householdCurrency}
                summary={history.data}
                today={today}
              />
              <SpendingByCategory
                currency={householdCurrency}
                summary={month.data}
                today={today}
              />
              <RecentActivity
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
                Figures are in {householdCurrency}, the household’s default
                currency. Updated {formatLongDate(today)}.
              </p>
            </div>
          </div>
        </>
      ) : null}
    </Page>
  );
};
