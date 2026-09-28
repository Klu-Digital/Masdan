import {
  Archive02Icon,
  ArchiveRestoreIcon,
  ArrowDataTransferHorizontalIcon,
  FileImportIcon,
  Invoice02Icon,
  MoreHorizontalIcon,
  PencilEdit02Icon,
  PlusSignIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { resolveCardNetwork } from "@masdan/card-catalog/catalog";
import { Amount } from "@masdan/ui/components/amount";
import { Badge } from "@masdan/ui/components/badge";
import { Button } from "@masdan/ui/components/button";
import {
  Empty,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@masdan/ui/components/empty";
import {
  List,
  ListItem,
  ListItemContent,
  ListItemDescription,
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
import { Meter, MeterIndicator, MeterTrack } from "@masdan/ui/components/meter";
import { NetworkMark } from "@masdan/ui/components/network-mark";
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
  StatGroup,
  StatLabel,
  StatValue,
} from "@masdan/ui/components/stat";
import { toastManager } from "@masdan/ui/components/toast";
import { formatMoney, toNumber } from "@masdan/ui/lib/money";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useState } from "react";

import { useAppActions } from "@/components/app-actions";
import type { ActiveHousehold } from "@/components/household-gate";
import {
  formatLongDate,
  formatRelativeDays,
  formatShortDate,
  nextDayOfMonth,
  startOfMonth,
} from "@/lib/dates";
import { householdToday } from "@/lib/household-date";
import { Ledger } from "@/modules/transactions/components/ledger";
import {
  transactionSummaryQueryOptions,
  transactionsQueryOptions,
} from "@/modules/transactions/queries";
import { DEFAULT_TRANSACTION_SEARCH } from "@/modules/transactions/search";
import { useLedgerActions } from "@/modules/transactions/use-ledger-actions";
import { client } from "@/utils/orpc";

import { networkMarkOf } from "../card-art";
import { cardCountriesOf, useCardCatalog } from "../card-catalog";
import { cardProductLabel, nextPaymentDue, utilizationTone } from "../credit";
import type { CardStatement } from "../credit";
import { accountKind } from "../kinds";
import {
  accountQueryOptions,
  accountSnapshotsQueryOptions,
  accountStatementsQueryOptions,
  invalidateAccounts,
} from "../queries";
import { AccountCard } from "./account-card";
import type { AccountDetail as Account } from "./account-composer";
import { AccountTile, accountSubtitle } from "./account-row";
import { StatementComposer } from "./statement-composer";

const ACTIVITY_PAGE_SIZE = 15;

const LIQUIDITY_LABELS: Record<string, string> = {
  illiquid: "Illiquid",
  liquid: "Liquid",
  semi_liquid: "Semi-liquid",
};

const NetworkValue = ({ network }: { network: string | null }) => {
  const mark = networkMarkOf(resolveCardNetwork(network));
  if (!mark) {
    return network ?? "Not set";
  }
  return (
    <span className="inline-flex items-center gap-2">
      <NetworkMark
        className={mark === "mastercard" ? "h-4" : "h-3"}
        network={mark}
      />
      {network}
    </span>
  );
};

const DetailRow = ({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) => (
  <ListItem className="min-h-11">
    <ListItemContent className="flex-none">
      <span className="text-muted-foreground text-sm">{label}</span>
    </ListItemContent>
    <ListItemTrailing className="min-w-0 flex-1 shrink justify-end text-right">
      {children}
    </ListItemTrailing>
  </ListItem>
);

/** Money in and out of this account this month — context for the balance. */
const MonthFlow = ({
  account,
  organizationId,
  today,
}: {
  account: Account;
  organizationId: string;
  today: string;
}) => {
  const summary = useQuery(
    transactionSummaryQueryOptions(organizationId, {
      accountIds: [account.id],
      dateFrom: startOfMonth(today),
      dateTo: today,
    })
  );
  const month = summary.data?.cashFlow.find(
    (entry) => entry.currencyCode === account.currencyCode
  );
  const income = toNumber(month?.income ?? 0);
  const expense = toNumber(month?.expense ?? 0);
  return (
    <StatGroup className="sm:max-w-md">
      <Stat>
        <StatLabel>In this month</StatLabel>
        <StatValue>
          {summary.isPending ? (
            <Skeleton className="h-5 w-20" />
          ) : (
            <Amount
              currency={account.currencyCode}
              sign={income > 0 ? "in" : "none"}
              tone="auto"
              value={income}
            />
          )}
        </StatValue>
      </Stat>
      <Stat>
        <StatLabel>Out this month</StatLabel>
        <StatValue>
          {summary.isPending ? (
            <Skeleton className="h-5 w-20" />
          ) : (
            <Amount
              currency={account.currencyCode}
              sign={expense > 0 ? "out" : "none"}
              value={expense}
            />
          )}
        </StatValue>
      </Stat>
    </StatGroup>
  );
};

const paymentSuggestions = (
  account: Account,
  statement: CardStatement | null
) => {
  const suggestions: { amount: string; label: string }[] = [];
  if (statement && toNumber(statement.statementBalance) > 0) {
    suggestions.push({
      amount: statement.statementBalance,
      label: "Statement",
    });
  }
  if (statement?.minimumAmountDue && toNumber(statement.minimumAmountDue) > 0) {
    suggestions.push({ amount: statement.minimumAmountDue, label: "Minimum" });
  }
  if (toNumber(account.balance) > 0) {
    suggestions.push({ amount: account.balance, label: "Full balance" });
  }
  return suggestions;
};

// Card figures, payment status and statements read as one panel; the branches
// are display states, not logic worth splitting further.
// oxlint-disable-next-line complexity
const CreditCardPanel = ({
  account,
  canPay,
  canRecord,
  today,
}: {
  account: Account;
  canPay: boolean;
  canRecord: boolean;
  today: string;
}) => {
  const { compose } = useAppActions();
  const statements = useQuery(accountStatementsQueryOptions(account.id));
  const [recording, setRecording] = useState(false);
  const history = statements.data ?? [];
  const due = nextPaymentDue(account, history, today);
  const utilization =
    account.utilization === null ? null : toNumber(account.utilization);
  const archived = account.archivedAt !== null;

  let dueTone: "default" | "warning" | "danger" = "default";
  if (due && due.daysLeft < 0) {
    dueTone = "danger";
  } else if (due && due.daysLeft <= 5) {
    dueTone = "warning";
  }

  return (
    <>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-muted-foreground text-xs font-medium">
              Balance owed
            </span>
            <Amount
              animate
              currency={account.currencyCode}
              size="display"
              value={account.balance}
            />
          </div>
          <StatGroup>
            <Stat>
              <StatLabel>Available</StatLabel>
              <StatValue>
                {account.availableCredit === null ? (
                  <span className="text-muted-foreground">—</span>
                ) : (
                  <Amount
                    currency={account.currencyCode}
                    value={account.availableCredit}
                  />
                )}
              </StatValue>
            </Stat>
            <Stat>
              <StatLabel>Credit limit</StatLabel>
              <StatValue>
                {account.creditLimit === null ? (
                  <span className="text-muted-foreground">Not set</span>
                ) : (
                  <Amount
                    currency={account.currencyCode}
                    value={account.creditLimit}
                  />
                )}
              </StatValue>
            </Stat>
            <Stat className="col-span-2 sm:col-span-1">
              <StatLabel>Utilization</StatLabel>
              {utilization === null ? (
                <StatValue>
                  <span className="text-muted-foreground">—</span>
                </StatValue>
              ) : (
                <>
                  <StatValue>{utilization.toFixed(0)}%</StatValue>
                  <Meter
                    aria-label="Credit utilization"
                    max={100}
                    value={Math.min(utilization, 100)}
                  >
                    <MeterTrack>
                      <MeterIndicator tone={utilizationTone(utilization)} />
                    </MeterTrack>
                  </Meter>
                </>
              )}
            </Stat>
          </StatGroup>
        </div>
        <AccountCard
          account={account}
          className="max-lg:order-first max-lg:max-w-sm"
          interactive
        />
      </div>

      {archived ? null : (
        <Section aria-label="Next payment">
          <div className="bg-card dark:ring-hairline flex flex-col gap-4 rounded-2xl p-5 sm:flex-row sm:items-center sm:justify-between dark:ring-1">
            <div className="flex flex-col gap-1">
              <span className="text-muted-foreground text-xs font-medium">
                {due?.source === "statement"
                  ? "Statement payment"
                  : "Next payment"}
              </span>
              {due ? (
                <>
                  <span className="flex flex-wrap items-baseline gap-x-2 text-xl font-semibold">
                    {due.statement ? (
                      <Amount
                        currency={account.currencyCode}
                        value={due.statement.statementBalance}
                      />
                    ) : null}
                    <span
                      className={
                        dueTone === "danger"
                          ? "text-destructive-foreground text-base font-semibold"
                          : "text-base font-semibold"
                      }
                    >
                      {due.daysLeft < 0 ? "was due " : "due "}
                      {formatShortDate(due.dueDate, today)} ·{" "}
                      {formatRelativeDays(due.dueDate, today)}
                    </span>
                  </span>
                  {due.statement?.minimumAmountDue ? (
                    <span className="text-muted-foreground text-xs">
                      Minimum{" "}
                      {formatMoney(
                        due.statement.minimumAmountDue,
                        account.currencyCode
                      )}
                    </span>
                  ) : null}
                  {due.source === "schedule" ? (
                    <span className="text-muted-foreground text-xs">
                      Based on the card’s due day. Record the statement for
                      exact amounts.
                    </span>
                  ) : null}
                </>
              ) : (
                <span className="text-sm">
                  {toNumber(account.balance) > 0
                    ? "Set the card’s due day or record a statement to see when payment is due."
                    : "Nothing owed right now."}
                </span>
              )}
            </div>
            {canPay ? (
              <Button
                className="shrink-0"
                onClick={() =>
                  compose({
                    destinationAccountId: account.id,
                    payCard: {
                      name: account.name,
                      suggestions: paymentSuggestions(
                        account,
                        due?.statement ?? null
                      ),
                    },
                    type: "transfer",
                  })
                }
                variant={dueTone === "default" ? "secondary" : "default"}
              >
                Pay card
              </Button>
            ) : null}
          </div>
        </Section>
      )}

      <Section aria-label="Statements">
        <SectionHeader>
          <SectionTitle>Statements</SectionTitle>
          {canRecord && !archived ? (
            <Button
              onClick={() => setRecording(true)}
              size="sm"
              variant="tinted"
            >
              Record statement
            </Button>
          ) : null}
        </SectionHeader>
        {account.statementClosingDay && !archived ? (
          <p className="text-muted-foreground text-xs">
            Next statement closes{" "}
            {formatLongDate(nextDayOfMonth(account.statementClosingDay, today))}
            .
          </p>
        ) : null}
        {statements.isPending ? (
          <Skeleton className="h-24 w-full" radius="2xl" />
        ) : null}
        {history.length === 0 && !statements.isPending ? (
          <p className="bg-card text-muted-foreground dark:ring-hairline rounded-2xl px-4 py-5 text-center text-sm dark:ring-1">
            No statements recorded yet.
          </p>
        ) : null}
        {history.length > 0 ? (
          <List>
            {history.map((statement) => (
              <ListItem key={statement.id}>
                <ListItemContent>
                  <ListItemTitle>
                    {formatLongDate(statement.statementDate)}
                  </ListItemTitle>
                  <ListItemDescription>
                    {formatShortDate(statement.periodStart, today)} –{" "}
                    {formatShortDate(statement.periodEnd, today)}
                    {statement.dueDate
                      ? ` · due ${formatShortDate(statement.dueDate, today)}`
                      : ""}
                  </ListItemDescription>
                </ListItemContent>
                <ListItemTrailing stacked>
                  <Amount
                    weight="medium"
                    currency={account.currencyCode}
                    value={statement.statementBalance}
                  />
                  {statement.minimumAmountDue ? (
                    <span className="text-muted-foreground text-xs">
                      Min{" "}
                      {formatMoney(
                        statement.minimumAmountDue,
                        account.currencyCode
                      )}
                    </span>
                  ) : null}
                </ListItemTrailing>
              </ListItem>
            ))}
          </List>
        ) : null}
      </Section>

      {recording ? (
        <StatementComposer
          card={account}
          onOpenChange={setRecording}
          open={recording}
          today={today}
        />
      ) : null}
    </>
  );
};

// oxlint-disable-next-line complexity
export const AccountDetailPage = ({
  accountId,
  household,
}: {
  accountId: string;
  household: ActiveHousehold;
}) => {
  const { activeOrganizationId, can, members, timezone } = household;
  const queryClient = useQueryClient();
  const { compose, composeAccount, inspect } = useAppActions();
  const ledgerActions = useLedgerActions(activeOrganizationId);
  const account = useQuery(accountQueryOptions(accountId));
  const snapshots = useQuery(accountSnapshotsQueryOptions(accountId));
  const catalog = useCardCatalog(cardCountriesOf(account.data ?? {}));
  const activitySearch = {
    ...DEFAULT_TRANSACTION_SEARCH,
    accountIds: [accountId],
    pageSize: ACTIVITY_PAGE_SIZE,
  };
  const activity = useQuery(
    transactionsQueryOptions(activeOrganizationId, activitySearch)
  );
  const today = householdToday(timezone);

  const archive = useMutation({
    mutationFn: (restore: boolean) =>
      restore
        ? client.accounts.restore({ accountId })
        : client.accounts.archive({ accountId }),
    onError: (error: Error) => {
      toastManager.add({ title: error.message, type: "error" });
    },
    onSuccess: async (_, restore) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: accountQueryOptions(accountId).queryKey,
        }),
        invalidateAccounts(queryClient, activeOrganizationId),
      ]);
      toastManager.add({
        actionProps: restore
          ? undefined
          : { children: "Undo", onClick: () => archive.mutate(true) },
        title: restore ? "Account restored" : "Account archived",
        type: "success",
      });
    },
  });

  if (account.isPending) {
    return (
      <Page aria-busy="true">
        <div className="flex items-center gap-3">
          <Skeleton className="size-12" radius="2xl" />
          <Skeleton className="h-7 w-48" />
        </div>
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-64 w-full" radius="2xl" />
      </Page>
    );
  }
  if (account.isError || !account.data) {
    return (
      <Page width="narrow">
        <Empty>
          <EmptyTitle>Account not found</EmptyTitle>
          <EmptyDescription>
            It may have been removed, or it belongs to another household.
          </EmptyDescription>
          <Button render={<Link to="/accounts" />} variant="secondary">
            Back to accounts
          </Button>
        </Empty>
      </Page>
    );
  }

  const { data } = account;
  const kind = accountKind(data.accountType);
  const archived = data.archivedAt !== null;
  const isCard = data.accountType === "credit_card";
  const canUpdate = can({ financialAccount: ["update"] });
  const canArchive = can({ financialAccount: ["archive"] });
  const canRestore = can({ financialAccount: ["restore"] });
  const canTransact = can({ transaction: ["create"] }) && !archived;
  const owners = members.filter((member) =>
    data.ownerMemberIds.includes(member.id)
  );

  return (
    <Page>
      <PageHeader>
        <PageHeading>
          <div className="flex items-center gap-3.5">
            <AccountTile account={data} size="lg" />
            <div className="flex min-w-0 flex-col">
              <PageTitle>{data.name}</PageTitle>
              <PageDescription>
                <span className="flex items-center gap-2">
                  {accountSubtitle(data)}
                  {archived ? <Badge variant="outline">Archived</Badge> : null}
                </span>
              </PageDescription>
            </div>
          </div>
        </PageHeading>
        <PageActions>
          {canTransact ? (
            <Button
              onClick={() =>
                compose({
                  accountId: data.id,
                  kind: "expense",
                  type: "transaction",
                })
              }
              variant={isCard ? "secondary" : "default"}
            >
              <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} />
              Add transaction
            </Button>
          ) : null}
          {canTransact && !isCard ? (
            <Button
              onClick={() =>
                compose({ sourceAccountId: data.id, type: "transfer" })
              }
              variant="secondary"
            >
              <HugeiconsIcon
                icon={ArrowDataTransferHorizontalIcon}
                strokeWidth={1.8}
              />
              Transfer
            </Button>
          ) : null}
          {canTransact && !archived ? (
            <Button
              render={<Link search={{ accountId: data.id }} to="/imports" />}
              variant="secondary"
            >
              <HugeiconsIcon icon={FileImportIcon} strokeWidth={1.8} />
              Import CSV
            </Button>
          ) : null}
          {canUpdate || canArchive || canRestore ? (
            <Menu>
              <MenuTrigger
                aria-label="More actions"
                render={<Button size="icon" variant="secondary" />}
              >
                <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={2} />
              </MenuTrigger>
              <MenuPopup align="end" className="min-w-48">
                {canUpdate && !archived ? (
                  <MenuItem onClick={() => composeAccount({ account: data })}>
                    <HugeiconsIcon icon={PencilEdit02Icon} strokeWidth={1.8} />
                    Edit account
                  </MenuItem>
                ) : null}
                {canUpdate && canArchive && !archived ? (
                  <MenuSeparator />
                ) : null}
                {archived && canRestore ? (
                  <MenuItem onClick={() => archive.mutate(true)}>
                    <HugeiconsIcon
                      icon={ArchiveRestoreIcon}
                      strokeWidth={1.8}
                    />
                    Restore account
                  </MenuItem>
                ) : null}
                {!archived && canArchive ? (
                  <MenuItem onClick={() => archive.mutate(false)}>
                    <HugeiconsIcon icon={Archive02Icon} strokeWidth={1.8} />
                    Archive account
                  </MenuItem>
                ) : null}
              </MenuPopup>
            </Menu>
          ) : null}
        </PageActions>
      </PageHeader>

      {isCard ? (
        <CreditCardPanel
          account={data}
          canPay={canTransact}
          canRecord={canUpdate}
          today={today}
        />
      ) : (
        <section aria-label="Balance" className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-muted-foreground text-xs font-medium">
              {kind.accountClass === "liability" ? "Amount owed" : "Balance"}
            </span>
            <Amount
              animate
              currency={data.currencyCode}
              size="display"
              value={data.balance}
            />
          </div>
          <MonthFlow
            account={data}
            organizationId={activeOrganizationId}
            today={today}
          />
        </section>
      )}

      <Section aria-label="Activity">
        <SectionHeader>
          <SectionTitle>Activity</SectionTitle>
          {(activity.data?.total ?? 0) > ACTIVITY_PAGE_SIZE ? (
            <Button
              render={
                <Link
                  search={{
                    ...DEFAULT_TRANSACTION_SEARCH,
                    accountIds: [data.id],
                  }}
                  to="/transactions"
                />
              }
              size="sm"
              variant="ghost"
            >
              See all {activity.data?.total.toLocaleString()}
            </Button>
          ) : null}
        </SectionHeader>
        {activity.isPending ? (
          <Skeleton className="h-48 w-full" radius="2xl" />
        ) : null}
        {activity.data && activity.data.items.length === 0 ? (
          <Empty size="compact">
            <EmptyMedia>
              <HugeiconsIcon icon={Invoice02Icon} strokeWidth={1.8} />
            </EmptyMedia>
            <EmptyTitle>No activity yet</EmptyTitle>
            <EmptyDescription>
              Transactions and transfers for this account will appear here.
            </EmptyDescription>
          </Empty>
        ) : null}
        {activity.data && activity.data.items.length > 0 ? (
          <Ledger
            actions={{
              handleEdit: (transaction) =>
                compose(
                  transaction.transfer
                    ? { transfer: transaction.transfer, type: "transfer" }
                    : { transaction, type: "transaction" }
                ),
              ledger: ledgerActions,
              permissions: {
                canArchive: can({ transaction: ["archive"] }),
                canRestore: can({ transaction: ["restore"] }),
                canUpdate: can({ transaction: ["update"] }),
              },
            }}
            grouped
            hideAccount
            onOpen={(transaction) => inspect(transaction.id)}
            scoped
            today={today}
            transactions={activity.data.items}
          />
        ) : null}
      </Section>

      <div className="grid items-start gap-8 lg:grid-cols-2">
        <Section aria-label="Details">
          <SectionHeader>
            <SectionTitle>Details</SectionTitle>
          </SectionHeader>
          <List>
            <DetailRow label="Type">{kind.label}</DetailRow>
            <DetailRow label="Currency">{data.currencyCode}</DetailRow>
            <DetailRow label="Opening balance">
              <span className="flex flex-col items-end">
                <Amount
                  currency={data.currencyCode}
                  value={data.openingBalance}
                />
                <span className="text-muted-foreground text-xs">
                  as of {formatLongDate(data.openingBalanceDate)}
                </span>
              </span>
            </DetailRow>
            {data.liquidity ? (
              <DetailRow label="Liquidity">
                {LIQUIDITY_LABELS[data.liquidity] ?? data.liquidity}
              </DetailRow>
            ) : null}
            <DetailRow label="Net worth">
              {data.includeInNetWorth ? "Included" : "Not included"}
            </DetailRow>
            <DetailRow label="Owners">
              {owners.length > 0
                ? owners.map((owner) => owner.user.name).join(", ")
                : "Joint"}
            </DetailRow>
            {isCard ? (
              <>
                {data.cardProductKey ? (
                  <DetailRow label="Card">
                    {cardProductLabel(catalog, data.cardProductKey)}
                  </DetailRow>
                ) : null}
                <DetailRow label="Network">
                  <NetworkValue network={data.cardNetwork} />
                </DetailRow>
                <DetailRow label="Statement closes">
                  {data.statementClosingDay
                    ? `Day ${data.statementClosingDay}`
                    : "Not set"}
                </DetailRow>
                <DetailRow label="Payment due">
                  {data.paymentDueDay ? `Day ${data.paymentDueDay}` : "Not set"}
                </DetailRow>
              </>
            ) : null}
          </List>
          {data.notes ? (
            <p className="bg-card dark:ring-hairline rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap dark:ring-1">
              {data.notes}
            </p>
          ) : null}
        </Section>

        {snapshots.data && snapshots.data.length > 0 ? (
          <Section aria-label="Balance history">
            <SectionHeader>
              <SectionTitle>Balance checkpoints</SectionTitle>
            </SectionHeader>
            <List>
              {snapshots.data.map((snapshot) => (
                <ListItem className="min-h-12" key={snapshot.id}>
                  <ListItemContent>
                    <ListItemTitle>
                      {formatLongDate(snapshot.effectiveDate)}
                    </ListItemTitle>
                    <ListItemDescription>
                      {snapshot.source === "import"
                        ? "Imported"
                        : "Entered manually"}
                    </ListItemDescription>
                  </ListItemContent>
                  <ListItemTrailing>
                    <Amount
                      currency={data.currencyCode}
                      value={snapshot.balance}
                    />
                  </ListItemTrailing>
                </ListItem>
              ))}
            </List>
          </Section>
        ) : null}
      </div>
    </Page>
  );
};
