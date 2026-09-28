import { toNumber } from "@masdan/ui/lib/money";

import { accountKind } from "./kinds";
import type { AccountGroup } from "./kinds";

interface GroupAccount {
  balance: string;
  currencyCode: string;
}

/** Group totals in one currency, when every account in the group shares it. */
export const groupTotal = (
  accounts: GroupAccount[]
): { currencyCode: string; total: number } | null => {
  const [first] = accounts;
  if (
    !first ||
    accounts.some((account) => account.currencyCode !== first.currencyCode)
  ) {
    return null;
  }
  return {
    currencyCode: first.currencyCode,
    total: accounts.reduce(
      (sum, account) => sum + toNumber(account.balance),
      0
    ),
  };
};

export const groupOf = (account: { accountType: string }): AccountGroup =>
  accountKind(account.accountType).group;

export interface AllocationAccount {
  accountClass: string;
  accountType: string;
  archivedAt: Date | null;
  balance: string;
  currencyCode: string;
  id: string;
  includeInNetWorth: boolean;
}

export interface Allocation {
  accountClass: "asset" | "liability";
  currencyCode: string;
  share: number;
}

export interface LabelledAllocation extends Allocation {
  /** Readable text for the share, so the bar is never the only signal. */
  label: string;
}

const classOf = (account: AllocationAccount): Allocation["accountClass"] =>
  account.accountClass === "asset" ? "asset" : "liability";

const allocationKey = (account: AllocationAccount) =>
  `${classOf(account)}:${account.currencyCode}`;

const sumBalances = (accounts: AllocationAccount[]) => {
  const sums = new Map<
    string,
    { account: AllocationAccount; amount: number }
  >();
  for (const account of accounts) {
    const key = allocationKey(account);
    sums.set(key, {
      account,
      amount: (sums.get(key)?.amount ?? 0) + toNumber(account.balance),
    });
  }
  return sums;
};

const SMALL_SHARE = 0.1;

const formatAllocation = (
  allocation: Allocation,
  multiCurrency: boolean
): string => {
  const percentage = new Intl.NumberFormat(undefined, {
    maximumFractionDigits: allocation.share < SMALL_SHARE ? 1 : 0,
    style: "percent",
  }).format(allocation.share);
  const currency = multiCurrency ? `${allocation.currencyCode} ` : "";
  const classification =
    allocation.accountClass === "asset" ? "assets" : "liabilities";
  return `${percentage} of ${currency}${classification}`;
};

export const allocations = (accounts: AllocationAccount[]) => {
  const eligible = accounts.filter(
    (account) => account.archivedAt === null && account.includeInNetWorth
  );
  const eligibleById = new Map(
    eligible.map((account) => [account.id, account])
  );
  const totals = sumBalances(eligible);
  const multiCurrency =
    new Set(eligible.map((account) => account.currencyCode)).size > 1;
  const shareOf = (
    account: AllocationAccount,
    amount: number
  ): Allocation | null => {
    const total = totals.get(allocationKey(account))?.amount;
    if (total === undefined || total <= 0 || amount < 0) {
      return null;
    }
    const share = amount / total;
    // Huge balances that nearly cancel leave a tiny total and overflow here.
    if (!Number.isFinite(share)) {
      return null;
    }
    return {
      accountClass: classOf(account),
      currencyCode: account.currencyCode,
      share,
    };
  };
  const accountShare = (accountId: string): Allocation | null => {
    const account = eligibleById.get(accountId);
    return account ? shareOf(account, toNumber(account.balance)) : null;
  };
  const groupShares = (group: AccountGroup): Allocation[] =>
    [
      ...sumBalances(
        eligible.filter((account) => groupOf(account) === group)
      ).values(),
    ]
      .map(({ account, amount }) => shareOf(account, amount))
      .filter((share): share is Allocation => share !== null);

  const labelled = (allocation: Allocation): LabelledAllocation => ({
    ...allocation,
    label: formatAllocation(allocation, multiCurrency),
  });

  return {
    accountAllocation: (accountId: string): LabelledAllocation | null => {
      const share = accountShare(accountId);
      return share ? labelled(share) : null;
    },
    accountShare,
    groupAllocations: (group: AccountGroup): LabelledAllocation[] =>
      groupShares(group).map(labelled),
    groupShares,
    multiCurrency,
  };
};
