import type { Database } from "@masdan/db";
import {
  category,
  financialAccount,
  financialTransaction,
} from "@masdan/db/schema/index";
import { and, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";

/**
 * The one balance formula. Aggregate it over `financial_account` joined with
 * `balancePostings()` and `balanceCategory`, grouped by the account.
 */
export const balanceExpression = sql<string>`
  ${financialAccount.openingBalance} + COALESCE(
    SUM(
      CASE
        WHEN ${financialTransaction.transferSide} = 'source' AND ${financialAccount.accountClass} = 'asset'
          THEN -${financialTransaction.amount}
        WHEN ${financialTransaction.transferSide} = 'source'
          THEN ${financialTransaction.amount}
        WHEN ${financialTransaction.transferSide} = 'destination' AND ${financialAccount.accountClass} = 'asset'
          THEN ${financialTransaction.amount}
        WHEN ${financialTransaction.transferSide} = 'destination'
          THEN -${financialTransaction.amount}
        WHEN ${financialAccount.accountClass} = 'asset' AND ${category.type} = 'income'
          THEN ${financialTransaction.amount}
        WHEN ${financialAccount.accountClass} = 'asset'
          THEN -${financialTransaction.amount}
        WHEN ${category.type} = 'expense'
          THEN ${financialTransaction.amount}
        ELSE -${financialTransaction.amount}
      END
    ),
    0
  )
`;

/**
 * Join condition for the postings that move a balance. Rows dated before the
 * opening balance date are already inside the opening balance; `asOf` stops
 * at that calendar day, and without it every posting counts, future-dated too.
 */
export const balancePostings = (asOf?: SQL | string): SQL | undefined =>
  and(
    eq(financialTransaction.accountId, financialAccount.id),
    isNull(financialTransaction.archivedAt),
    gte(
      financialTransaction.transactionDate,
      financialAccount.openingBalanceDate
    ),
    asOf === undefined
      ? undefined
      : lte(financialTransaction.transactionDate, asOf)
  );

export const balanceCategory = eq(category.id, financialTransaction.categoryId);

export const getAccountBalances = async (
  db: Database,
  accountIds: string[]
): Promise<Map<string, string>> => {
  if (accountIds.length === 0) {
    return new Map();
  }

  const rows = await db
    .select({
      accountId: financialAccount.id,
      balance: balanceExpression,
    })
    .from(financialAccount)
    .leftJoin(financialTransaction, balancePostings())
    .leftJoin(category, balanceCategory)
    .where(inArray(financialAccount.id, accountIds))
    .groupBy(
      financialAccount.id,
      financialAccount.accountClass,
      financialAccount.openingBalance
    );

  return new Map(rows.map(({ accountId, balance }) => [accountId, balance]));
};

export const getAccountBalance = async (
  db: Database,
  accountId: string
): Promise<string> => {
  const balances = await getAccountBalances(db, [accountId]);
  return balances.get(accountId) ?? "0";
};
