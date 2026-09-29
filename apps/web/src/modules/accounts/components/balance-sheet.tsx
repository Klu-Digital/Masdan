import { ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
} from "@masdan/ui/components/collapsible";
import { List, ListSection } from "@masdan/ui/components/list";
import type { ComponentProps } from "react";

import { Amount } from "@/components/finance/amount";
import { toNumber } from "@/components/finance/money";
import { useFormattedMoney } from "@/components/finance/use-formatted-money";
import type {
  ConsolidatedNetWorthReport,
  NetWorthReport,
} from "@/modules/reports/types";

import { ACCOUNT_GROUPS } from "../kinds";
import { convertedBalances, groupOf, groupTotal } from "../net-worth";
import type { AllocationAccount, allocations } from "../net-worth";
import { AccountRow, CardTile } from "./account-row";
import type { RowAccount } from "./account-row";
import { AllocationMeter } from "./allocation-meter";

type Account = AllocationAccount & RowAccount;

const convertedAccount = (
  convertedById: Map<string, string | null>,
  currencyCode: string | undefined,
  accountId: string
) => {
  const balance = convertedById.get(accountId);
  return balance === null || balance === undefined || !currencyCode
    ? undefined
    : { balance, currencyCode };
};

/** The group header; its text comes from the trigger's children. */
const GroupTrigger = ({ children, ...props }: ComponentProps<"button">) => (
  <button
    {...props}
    className="group/sheet hover:bg-surface-hover focus-visible:ring-ring/50 flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-xl px-4 py-2 text-left text-sm font-medium outline-none focus-visible:ring-3"
    type="button"
  >
    {children}
  </button>
);

export const BalanceSheet = ({
  accounts,
  balanceSheet,
  consolidated,
  organizationId,
  report,
  today,
}: {
  accounts: Account[];
  organizationId: string;
  balanceSheet: ReturnType<typeof allocations>;
  consolidated?: ConsolidatedNetWorthReport;
  report?: NetWorthReport;
  today: string;
}) => {
  const money = useFormattedMoney();
  const convertedById = convertedBalances(consolidated);
  return (
    <div className="grid items-start gap-8 lg:grid-cols-2">
      {([false, true] as const).map((liability) => {
        const groups = ACCOUNT_GROUPS.map((group) => ({
          ...group,
          members: accounts.filter((account) => groupOf(account) === group.key),
        })).filter(
          (group) => group.liability === liability && group.members.length > 0
        );
        if (groups.length === 0) {
          return null;
        }
        const title = liability ? "Liabilities" : "Assets";
        const headingId = liability
          ? "balance-sheet-liabilities"
          : "balance-sheet-assets";
        return (
          <section
            aria-labelledby={headingId}
            className="flex min-w-0 flex-col gap-5"
            key={title}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold" id={headingId}>
                {title}
              </h2>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm font-medium">
                {consolidated ? (
                  <span className="inline-flex items-baseline gap-1">
                    <span className="text-muted-foreground text-xs">
                      Converted
                    </span>{" "}
                    <Amount
                      currency={consolidated.defaultCurrency}
                      value={
                        liability
                          ? consolidated.liabilities
                          : consolidated.assets
                      }
                    />
                    {consolidated.status === "partial" ? (
                      <span className="text-muted-foreground text-xs">
                        · partial
                      </span>
                    ) : null}
                  </span>
                ) : null}
                {report?.positions.map((position) => {
                  const value = liability
                    ? position.liabilities
                    : position.assets;
                  return toNumber(value) === 0 ? null : (
                    <Amount
                      currency={position.currencyCode}
                      key={position.currencyCode}
                      value={value}
                    />
                  );
                })}
              </div>
            </div>
            {consolidated?.unconverted.some((row) =>
              accounts.some(
                (account) =>
                  account.currencyCode === row.currencyCode &&
                  (account.accountClass !== "asset") === liability
              )
            ) ? (
              <p className="text-muted-foreground text-xs">
                Accounts without exchange rates remain in their original
                currency and are excluded from allocation percentages.
              </p>
            ) : null}
            {groups.map((group) => {
              const convertedMembers = consolidated
                ? group.members.flatMap((account) => {
                    const balance = convertedById.get(account.id);
                    return balance === null || balance === undefined
                      ? []
                      : [
                          {
                            ...account,
                            balance,
                            currencyCode: consolidated.defaultCurrency,
                          },
                        ];
                  })
                : group.members;
              const missingCodes = consolidated
                ? [
                    ...new Set(
                      group.members
                        .filter((account) => {
                          const balance = convertedById.get(account.id);
                          return balance === null || balance === undefined;
                        })
                        .map((account) => account.currencyCode)
                    ),
                  ]
                : [];
              const total =
                groupTotal(convertedMembers) ??
                (missingCodes.length ? groupTotal(group.members) : null);
              return (
                <ListSection aria-label={group.label} key={group.key}>
                  <Collapsible defaultOpen>
                    <CollapsibleTrigger render={<GroupTrigger />}>
                      <HugeiconsIcon
                        aria-hidden="true"
                        className="size-4 transition-transform duration-200 group-data-[panel-open]/sheet:rotate-180 motion-reduce:transition-none"
                        icon={ArrowDown01Icon}
                        strokeWidth={2}
                      />
                      <span className="flex-1">{group.label}</span>
                      {total ? (
                        <span className="tabular-nums">
                          {money(total.total, total.currencyCode)}
                          {group.liability ? " owed" : ""}
                        </span>
                      ) : null}
                      {missingCodes.length > 0 ? (
                        <span className="text-muted-foreground text-xs">
                          {convertedMembers.length
                            ? `excl. ${missingCodes.join(", ")}`
                            : "unconverted"}
                        </span>
                      ) : null}
                      {balanceSheet.groupAllocations(group.key).map((share) => (
                        <AllocationMeter
                          allocation={share}
                          className="w-24"
                          key={share.currencyCode}
                        />
                      ))}
                    </CollapsibleTrigger>
                    <CollapsiblePanel>
                      {group.key === "credit" ? (
                        <div className="grid grid-cols-2 gap-x-4 gap-y-5 pt-1">
                          {group.members.map((account) => (
                            <CardTile
                              account={account}
                              allocation={balanceSheet.accountAllocation(
                                account.id
                              )}
                              converted={convertedAccount(
                                convertedById,
                                consolidated?.defaultCurrency,
                                account.id
                              )}
                              key={account.id}
                              organizationId={organizationId}
                              today={today}
                            />
                          ))}
                        </div>
                      ) : (
                        <List>
                          {group.members.map((account) => (
                            <AccountRow
                              account={account}
                              allocation={balanceSheet.accountAllocation(
                                account.id
                              )}
                              converted={convertedAccount(
                                convertedById,
                                consolidated?.defaultCurrency,
                                account.id
                              )}
                              key={account.id}
                              organizationId={organizationId}
                              today={today}
                            />
                          ))}
                        </List>
                      )}
                    </CollapsiblePanel>
                  </Collapsible>
                </ListSection>
              );
            })}
          </section>
        );
      })}
    </div>
  );
};
