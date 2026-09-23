import { toNumber } from "@masdan/ui/lib/money";

import { accountKind } from "./kinds";
import type { AccountGroup } from "./kinds";

export interface BalanceAccount {
  accountClass: string;
  accountType: string;
  archivedAt: Date | string | null;
  balance: string;
  currencyCode: string;
  includeInNetWorth: boolean;
}

export interface CurrencyPosition {
  assets: number;
  currencyCode: string;
  liabilities: number;
  net: number;
}

/**
 * Net worth per currency. There is no FX data, so currencies are never mixed;
 * the household's default currency is the headline and others are listed.
 * Display arithmetic only — ledger precision lives on the server.
 */
export const netWorthByCurrency = (
  accounts: BalanceAccount[]
): CurrencyPosition[] => {
  const positions = new Map<string, CurrencyPosition>();
  for (const account of accounts) {
    if (account.archivedAt !== null || !account.includeInNetWorth) {
      continue;
    }
    const position = positions.get(account.currencyCode) ?? {
      assets: 0,
      currencyCode: account.currencyCode,
      liabilities: 0,
      net: 0,
    };
    const balance = toNumber(account.balance);
    if (account.accountClass === "liability") {
      position.liabilities += balance;
      position.net -= balance;
    } else {
      position.assets += balance;
      position.net += balance;
    }
    positions.set(account.currencyCode, position);
  }
  return [...positions.values()];
};

export const primaryPosition = (
  positions: CurrencyPosition[],
  currency: string | null
): { others: CurrencyPosition[]; primary: CurrencyPosition | null } => {
  const primary =
    positions.find((position) => position.currencyCode === currency) ??
    positions[0] ??
    null;
  return {
    others: positions.filter((position) => position !== primary),
    primary,
  };
};

/** Group totals in one currency, when every account in the group shares it. */
export const groupTotal = (
  accounts: BalanceAccount[]
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
