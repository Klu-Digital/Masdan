import { PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { AccountType } from "@masdan/api/accounts/constants";
import { Amount } from "@masdan/ui/components/amount";
import { Button } from "@masdan/ui/components/button";
import {
  Empty,
  EmptyDescription,
  EmptyTitle,
} from "@masdan/ui/components/empty";
import { IconTile } from "@masdan/ui/components/icon-tile";
import {
  List,
  ListSection,
  ListSectionHeader,
} from "@masdan/ui/components/list";
import {
  Page,
  PageActions,
  PageHeader,
  PageHeading,
  PageTitle,
} from "@masdan/ui/components/page";
import { Skeleton } from "@masdan/ui/components/skeleton";
import {
  Stat,
  StatGroup,
  StatLabel,
  StatValue,
} from "@masdan/ui/components/stat";
import { formatMoney } from "@masdan/ui/lib/money";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { useAppActions } from "@/components/app-actions";
import type { ActiveHousehold } from "@/components/household-gate";
import { householdToday } from "@/lib/household-date";
import { netWorthQueryOptions } from "@/modules/reports/queries";
import type { NetWorthReport } from "@/modules/reports/queries";

import { ACCOUNT_GROUPS, ACCOUNT_KINDS } from "../kinds";
import { allocations, groupOf, groupTotal } from "../net-worth";
import { accountsQueryOptions } from "../queries";
import { AccountRow, CardTile } from "./account-row";
import { AllocationMeter } from "./allocation-meter";

const QUICK_START: AccountType[] = ["bank", "cash", "e_wallet", "credit_card"];

const FirstRun = ({ canCreate }: { canCreate: boolean }) => {
  const { composeAccount } = useAppActions();
  return (
    <Empty size="compact">
      <EmptyTitle>Add the places your money lives</EmptyTitle>
      <EmptyDescription>
        Balances, spending and net worth all start from your accounts.
      </EmptyDescription>
      {canCreate ? (
        <div className="grid w-full max-w-lg grid-cols-2 gap-2 pt-2 sm:grid-cols-4">
          {QUICK_START.map((type) => {
            const kind = ACCOUNT_KINDS[type];
            return (
              <button
                className="bg-card hover:bg-surface-hover focus-visible:ring-ring/50 dark:ring-hairline flex flex-col items-center gap-2 rounded-2xl px-3 py-4 transition duration-150 outline-none focus-visible:ring-3 active:scale-[0.98] motion-reduce:active:scale-100 dark:ring-1"
                key={type}
                onClick={() => composeAccount({ accountType: type })}
                type="button"
              >
                <IconTile size="lg" tint={kind.color}>
                  <HugeiconsIcon icon={kind.icon} strokeWidth={1.8} />
                </IconTile>
                <span className="text-sm font-medium">{kind.label}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </Empty>
  );
};

const NetWorthHeadline = ({
  currency,
  report,
}: {
  currency: string | null;
  report: NetWorthReport | undefined;
}) => {
  if (!report) {
    return <Skeleton className="h-36 w-full sm:max-w-xl" radius="2xl" />;
  }
  const primary =
    report.positions.find(
      (position) =>
        position.currencyCode === (currency ?? report.defaultCurrency)
    ) ?? report.positions[0];
  if (!primary) {
    return null;
  }
  const others = report.positions.filter((position) => position !== primary);
  return (
    <section aria-label="Net worth" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <span className="text-muted-foreground text-xs font-medium">
          Net worth
        </span>
        <Amount
          animate
          currency={primary.currencyCode}
          size="display"
          value={primary.netWorth}
        />
      </div>
      <StatGroup className="sm:max-w-xl">
        <Stat>
          <StatLabel>Assets</StatLabel>
          <StatValue>
            <Amount currency={primary.currencyCode} value={primary.assets} />
          </StatValue>
        </Stat>
        <Stat>
          <StatLabel>Liabilities</StatLabel>
          <StatValue>
            <Amount
              currency={primary.currencyCode}
              value={primary.liabilities}
            />
          </StatValue>
        </Stat>
        {others.length > 0 ? (
          <Stat className="col-span-2">
            <StatLabel>Other currencies</StatLabel>
            <StatValue>
              {others
                .map((position) =>
                  formatMoney(position.netWorth, position.currencyCode)
                )
                .join(" · ")}
            </StatValue>
          </Stat>
        ) : null}
      </StatGroup>
    </section>
  );
};

export const AccountsOverview = ({
  household,
}: {
  household: ActiveHousehold;
}) => {
  const { activeOrganizationId, can, currency, timezone } = household;
  const { composeAccount } = useAppActions();
  const accounts = useQuery(accountsQueryOptions(activeOrganizationId));
  const netWorth = useQuery(netWorthQueryOptions(activeOrganizationId));
  const [showArchived, setShowArchived] = useState(false);
  const today = householdToday(timezone);
  const canCreate = can({ financialAccount: ["create"] });

  if (accounts.isPending) {
    return (
      <Page aria-busy="true">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-20 w-full" radius="2xl" />
        <Skeleton className="h-56 w-full" radius="2xl" />
      </Page>
    );
  }
  if (accounts.isError) {
    return (
      <Page>
        <Empty>
          <EmptyTitle>Couldn’t load accounts</EmptyTitle>
          <EmptyDescription>
            Check your connection and try again.
          </EmptyDescription>
          <Button onClick={() => accounts.refetch()} variant="secondary">
            Try again
          </Button>
        </Empty>
      </Page>
    );
  }

  const active = accounts.data.filter((account) => account.archivedAt === null);
  const archived = accounts.data.filter(
    (account) => account.archivedAt !== null
  );
  const balanceSheet = allocations(accounts.data);

  return (
    <Page>
      <PageHeader>
        <PageHeading>
          <PageTitle>Accounts</PageTitle>
        </PageHeading>
        {canCreate ? (
          <PageActions>
            <Button onClick={() => composeAccount()}>
              <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} />
              Add account
            </Button>
          </PageActions>
        ) : null}
      </PageHeader>

      {active.length === 0 ? (
        <FirstRun canCreate={canCreate} />
      ) : (
        <>
          <NetWorthHeadline currency={currency} report={netWorth.data} />

          <div className="grid items-start gap-8 lg:grid-cols-2">
            {ACCOUNT_GROUPS.map((group) => {
              const members = active.filter(
                (account) => groupOf(account) === group.key
              );
              if (members.length === 0) {
                return null;
              }
              const total = groupTotal(members);
              const shares = balanceSheet.groupAllocations(group.key);
              return (
                <ListSection aria-label={group.label} key={group.key}>
                  <ListSectionHeader>
                    <span>{group.label}</span>
                    <span className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
                      {total ? (
                        <span className="tabular-nums">
                          {formatMoney(total.total, total.currencyCode)}
                          {group.liability ? " owed" : ""}
                        </span>
                      ) : null}
                      {shares.map((share) => (
                        <AllocationMeter
                          allocation={share}
                          key={share.currencyCode}
                        />
                      ))}
                    </span>
                  </ListSectionHeader>
                  {group.key === "credit" ? (
                    <div className="grid grid-cols-2 gap-x-4 gap-y-5 pt-1">
                      {members.map((account) => (
                        <CardTile
                          account={account}
                          allocation={balanceSheet.accountAllocation(
                            account.id
                          )}
                          key={account.id}
                          today={today}
                        />
                      ))}
                    </div>
                  ) : (
                    <List>
                      {members.map((account) => (
                        <AccountRow
                          account={account}
                          allocation={balanceSheet.accountAllocation(
                            account.id
                          )}
                          key={account.id}
                          today={today}
                        />
                      ))}
                    </List>
                  )}
                </ListSection>
              );
            })}
          </div>
        </>
      )}

      {archived.length > 0 ? (
        <section className="flex flex-col gap-3">
          <Button
            aria-expanded={showArchived}
            className="self-start"
            onClick={() => setShowArchived((value) => !value)}
            size="sm"
            variant="ghost"
          >
            {showArchived ? "Hide" : "Show"} {archived.length} archived{" "}
            {archived.length === 1 ? "account" : "accounts"}
          </Button>
          {showArchived ? (
            <div className="grid gap-8 lg:grid-cols-2">
              <List>
                {archived.map((account) => (
                  <AccountRow
                    account={account}
                    key={account.id}
                    today={today}
                  />
                ))}
              </List>
            </div>
          ) : null}
        </section>
      ) : null}
    </Page>
  );
};
