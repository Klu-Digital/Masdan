import { resolveCardNetwork } from "@masdan/card-catalog/catalog";
import {
  ListItem,
  ListItemContent,
  ListItemTrailing,
} from "@masdan/ui/components/list";
import { Skeleton } from "@masdan/ui/components/skeleton";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { Amount } from "@/components/finance/amount";
import { toNumber } from "@/components/finance/money";
import { NetworkMark } from "@/components/finance/network-mark";
import {
  Stat,
  StatGroup,
  StatLabel,
  StatValue,
} from "@/components/finance/stat";
import { startOfMonth } from "@/lib/dates";
import { householdOrpc } from "@/utils/orpc";

import { networkMarkOf } from "../card-art";
import type { AccountDetail as Account } from "./account-composer";

export const NetworkValue = ({ network }: { network: string | null }) => {
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

export const DetailRow = ({
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
export const MonthFlow = ({
  account,
  organizationId,
  today,
}: {
  account: Account;
  organizationId: string;
  today: string;
}) => {
  const summary = useQuery(
    householdOrpc(organizationId).transactions.summary.queryOptions({
      input: {
        accountIds: [account.id],
        dateFrom: startOfMonth(today),
        dateTo: today,
      },
      placeholderData: keepPreviousData,
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
