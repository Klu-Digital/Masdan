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
import { Sensitive } from "@masdan/ui/components/sensitive";
import { toNumber } from "@masdan/ui/lib/money";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { formatRelativeDays, formatShortDate } from "@/lib/dates";
import { householdOrpc } from "@/utils/orpc";

import { nextPaymentDue, utilizationTone } from "../credit";
import { accountKind, accountTint } from "../kinds";
import type { LabelledAllocation } from "../net-worth";
import { AccountCard, AccountCardThumb } from "./account-card";
import { AllocationMeter } from "./allocation-meter";

export interface RowAccount {
  accountType: string;
  archivedAt: Date | null;
  availableCredit: string | null;
  balance: string;
  cardLastFour: string | null;
  cardNetwork: string | null;
  cardProductKey: string | null;
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
export const CardContext = ({
  account,
  organizationId,
  today,
}: {
  account: RowAccount;
  organizationId: string;
  today: string;
}) => {
  const statements = useQuery(
    householdOrpc(organizationId).accounts.listStatements.queryOptions({
      input: { accountId: account.id },
    })
  );
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

const AllocationLabel = ({
  allocation,
}: {
  allocation?: LabelledAllocation | null;
}) =>
  allocation ? (
    <>
      <span className="sr-only"> · </span>
      <AllocationMeter allocation={allocation} />
    </>
  ) : null;

const ConvertedAmount = ({
  converted,
  originalCurrency,
}: {
  converted?: { balance: string; currencyCode: string };
  originalCurrency: string;
}) =>
  converted && converted.currencyCode !== originalCurrency ? (
    <span className="text-muted-foreground text-xs">
      <Sensitive>
        <Amount currency={converted.currencyCode} value={converted.balance} />
      </Sensitive>{" "}
      converted
    </span>
  ) : null;

export const AccountRow = ({
  account,
  allocation,
  converted,
  organizationId,
  today,
}: {
  account: RowAccount;
  allocation?: LabelledAllocation | null;
  converted?: { balance: string; currencyCode: string };
  organizationId: string;
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
        {isCard ? (
          <AccountCardThumb account={account} />
        ) : (
          <AccountTile account={account} />
        )}
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
            <CardContext
              account={account}
              organizationId={organizationId}
              today={today}
            />
          ) : (
            accountSubtitle(account)
          )}
        </ListItemDescription>
      </ListItemContent>
      <ListItemTrailing chevron>
        <span className="flex flex-col items-end gap-1">
          <Amount
            weight="medium"
            currency={account.currencyCode}
            tone={account.archivedAt ? "muted" : "default"}
            value={account.balance}
          />
          <ConvertedAmount
            converted={converted}
            originalCurrency={account.currencyCode}
          />
          <AllocationLabel allocation={allocation} />
        </span>
      </ListItemTrailing>
    </ListItem>
  );
};

/**
 * A credit card listed as the card itself, with what is owed and when it is
 * due beneath it.
 */
export const CardTile = ({
  account,
  allocation,
  converted,
  organizationId,
  today,
}: {
  account: RowAccount;
  allocation?: LabelledAllocation | null;
  converted?: { balance: string; currencyCode: string };
  organizationId: string;
  today: string;
}) => (
  <Link
    className="group/tile focus-visible:ring-ring/50 flex min-w-0 flex-col gap-2.5 rounded-xl outline-none focus-visible:ring-3"
    params={{ accountId: account.id }}
    to="/accounts/$accountId"
  >
    <span className="block transition-transform duration-300 ease-out group-hover/tile:-translate-y-0.5 group-active/tile:scale-[0.98] motion-reduce:transition-none motion-reduce:group-hover/tile:translate-y-0">
      <AccountCard account={account} size="compact" />
    </span>
    <span className="flex min-w-0 flex-col gap-1 px-0.5">
      <span className="flex items-baseline justify-between gap-2">
        <span className="truncate text-sm font-medium">{account.name}</span>
        <span className="flex flex-col items-end gap-1">
          <Amount
            currency={account.currencyCode}
            value={account.balance}
            weight="medium"
          />
          <ConvertedAmount
            converted={converted}
            originalCurrency={account.currencyCode}
          />
          <AllocationLabel allocation={allocation} />
        </span>
      </span>
      <span className="text-muted-foreground text-xs">
        <CardContext
          account={account}
          organizationId={organizationId}
          today={today}
        />
      </span>
    </span>
  </Link>
);
