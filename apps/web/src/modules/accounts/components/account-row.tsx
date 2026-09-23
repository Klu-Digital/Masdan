import { HugeiconsIcon } from "@hugeicons/react";
import { Amount } from "@masdan/ui/components/amount";
import { Badge } from "@masdan/ui/components/badge";
import { IconTile } from "@masdan/ui/components/icon-tile";
import {
  ListItem,
  ListItemContent,
  ListItemDescription,
  ListItemLeading,
  ListItemTitle,
  ListItemTrailing,
} from "@masdan/ui/components/list";
import { Meter, MeterIndicator, MeterTrack } from "@masdan/ui/components/meter";
import { toNumber } from "@masdan/ui/lib/money";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { formatRelativeDays, formatShortDate } from "@/lib/dates";

import { nextPaymentDue, utilizationTone } from "../credit";
import { accountKind, accountTint } from "../kinds";
import { accountStatementsQueryOptions } from "../queries";

export interface RowAccount {
  accountType: string;
  archivedAt: Date | null;
  availableCredit: string | null;
  balance: string;
  cardLastFour: string | null;
  color: string | null;
  currencyCode: string;
  id: string;
  institution: string | null;
  name: string;
  paymentDueDay: number | null;
  utilization: string | null;
}

export const AccountTile = ({
  account,
  size = "default",
}: {
  account: Pick<RowAccount, "accountType" | "color">;
  size?: "default" | "lg" | "sm";
}) => (
  <IconTile aria-hidden="true" size={size} tint={accountTint(account)}>
    <HugeiconsIcon
      icon={accountKind(account.accountType).icon}
      strokeWidth={1.8}
    />
  </IconTile>
);

export const accountSubtitle = (
  account: Pick<RowAccount, "accountType" | "cardLastFour" | "institution">
): string =>
  [
    account.institution ?? accountKind(account.accountType).label,
    account.cardLastFour ? `•••• ${account.cardLastFour}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

/** Utilization and the next due date — the two things a card row must say. */
const CardContext = ({
  account,
  today,
}: {
  account: RowAccount;
  today: string;
}) => {
  const statements = useQuery(accountStatementsQueryOptions(account.id));
  const due = nextPaymentDue(account, statements.data ?? [], today);
  const utilization =
    account.utilization === null ? null : toNumber(account.utilization);

  let dueLabel: ReactNode = null;
  if (due) {
    const overdue = due.daysLeft < 0;
    let variant: "error" | "warning" | "secondary" = "secondary";
    if (overdue) {
      variant = "error";
    } else if (due.daysLeft <= 5) {
      variant = "warning";
    }
    dueLabel = (
      <Badge variant={variant}>
        {overdue
          ? `Overdue since ${formatShortDate(due.dueDate, today)}`
          : `Due ${formatRelativeDays(due.dueDate, today)}`}
      </Badge>
    );
  }

  return (
    <span className="flex min-w-0 items-center gap-2">
      {utilization === null ? null : (
        <Meter
          aria-label={`${account.name} utilization`}
          className="w-16"
          max={100}
          value={Math.min(utilization, 100)}
        >
          <MeterTrack className="h-1">
            <MeterIndicator tone={utilizationTone(utilization)} />
          </MeterTrack>
        </Meter>
      )}
      {utilization === null ? null : (
        <span className="text-muted-foreground tabular-nums">
          {Math.round(utilization)}% used
        </span>
      )}
      {dueLabel}
    </span>
  );
};

export const AccountRow = ({
  account,
  today,
}: {
  account: RowAccount;
  today: string;
}) => {
  const isCard = account.accountType === "credit_card";
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
        <ListItemTitle>
          {account.name}
          {account.archivedAt ? (
            <Badge variant="outline">Archived</Badge>
          ) : null}
        </ListItemTitle>
        <ListItemDescription>
          {isCard && !account.archivedAt ? (
            <CardContext account={account} today={today} />
          ) : (
            accountSubtitle(account)
          )}
        </ListItemDescription>
      </ListItemContent>
      <ListItemTrailing chevron>
        <Amount
          weight="medium"
          currency={account.currencyCode}
          tone={account.archivedAt ? "muted" : "default"}
          value={account.balance}
        />
      </ListItemTrailing>
    </ListItem>
  );
};
