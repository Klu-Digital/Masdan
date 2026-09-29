import { CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Badge } from "@masdan/ui/components/badge";
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
  Section,
  SectionHeader,
  SectionTitle,
} from "@masdan/ui/components/page";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { Amount } from "@/components/finance/amount";
import { toNumber } from "@/components/finance/money";
import { formatRelativeDays, formatShortDate } from "@/lib/dates";
import { AccountCardThumb } from "@/modules/accounts/components/account-card";
import { AccountTile } from "@/modules/accounts/components/account-row";
import { nextPaymentDue } from "@/modules/accounts/credit";
import type { CardStatement } from "@/modules/accounts/credit";
import { ACCOUNT_GROUPS } from "@/modules/accounts/kinds";
import { groupOf, groupTotal } from "@/modules/accounts/net-worth";
import { overviewQueries } from "@/modules/overview/queries";
import { TransactionTile } from "@/modules/transactions/components/transaction-tile";
import { describeTransaction } from "@/modules/transactions/presentation";
import { DEFAULT_TRANSACTION_SEARCH } from "@/modules/transactions/search";
import type { RouterOutputs } from "@/utils/orpc";

import { SeeAll } from "./overview-ui";

type Account = RouterOutputs["accounts"]["list"];

const CardDueRow = ({
  account,
  statement,
  today,
}: {
  account: Account[number];
  statement: CardStatement | undefined;
  today: string;
}) => {
  const due = nextPaymentDue(account, statement, today);
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
        <AccountCardThumb account={account} />
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

export const Upcoming = ({
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
  const queries = overviewQueries(organizationId);
  const unpaid = useQuery(queries.unpaid);
  const statements = useQuery(queries.statements);
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
            <CardDueRow
              account={card}
              key={card.id}
              statement={statements.data?.find(
                (statement) => statement.accountId === card.id
              )}
              today={today}
            />
          ))}
          {bills.map((bill) => {
            const view = describeTransaction(bill);
            return (
              <ListItem
                key={bill.id}
                render={
                  <Link
                    params={{ transactionId: bill.id }}
                    search={DEFAULT_TRANSACTION_SEARCH}
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

export const AccountsGlance = ({ accounts }: { accounts: Account }) => (
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
