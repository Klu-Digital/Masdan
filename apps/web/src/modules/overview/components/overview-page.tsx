import {
  FileImportIcon,
  Invoice02Icon,
  PlusSignIcon,
  UserAdd01Icon,
  Wallet01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
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
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { useAppActions } from "@/components/app-actions";
import { Amount } from "@/components/finance/amount";
import { EmptyNote } from "@/components/finance/empty-note";
import { toNumber } from "@/components/finance/money";
import { useFormattedMoney } from "@/components/finance/use-formatted-money";
import type { ActiveHousehold } from "@/components/household-gate";
import {
  formatDay,
  formatLongDate,
  formatMonthYear,
  formatWeekdayLong,
} from "@/lib/dates";
import { householdToday } from "@/lib/household-date";
import { overviewQueries } from "@/modules/overview/queries";
import { NetWorthHistoryChart } from "@/modules/reports/components/report-sections";
import type {
  CashFlowReport,
  NetWorthReport,
  SpendingReport,
} from "@/modules/reports/types";
import { TransactionTile } from "@/modules/transactions/components/transaction-tile";
import { describeTransaction } from "@/modules/transactions/presentation";
import { DEFAULT_TRANSACTION_SEARCH } from "@/modules/transactions/search";

import { AccountsGlance, Upcoming } from "./overview-sidebar";
import { LoadFailed, SeeAll } from "./overview-ui";

/** The slice of the active household this page reads. */
export interface OverviewHousehold extends Pick<
  ActiveHousehold,
  "activeOrganizationId" | "can" | "currency" | "timezone"
> {
  organization: { name: string } | null;
  session: { user: { name: string } };
}

const TOP_CATEGORIES = 5;

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
  const money = useFormattedMoney();
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
                .map((item) => money(item.netWorth, item.currencyCode))
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
  const recent = useQuery(overviewQueries(organizationId).recent);
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

const Overview = ({ household }: { household: OverviewHousehold }) => {
  const { activeOrganizationId, can, session, timezone } = household;
  const today = householdToday(timezone);
  const queries = overviewQueries(activeOrganizationId);
  const accounts = useQuery(queries.accounts);
  const netWorth = useQuery(queries.netWorth);
  const month = useQuery(queries.month);
  const spending = useQuery(queries.spending);
  const trend = useQuery(queries.trend);
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
          <PageEyebrow>{formatWeekdayLong(today)}</PageEyebrow>
          <PageTitle>
            {greeting(new Date())}, {firstName}
          </PageTitle>
        </PageHeading>
      </PageHeader>

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
