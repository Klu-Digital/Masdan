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
