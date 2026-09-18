import type { Database } from "@masdan/db";
import {
  category,
  financialAccount,
  financialTransaction,
} from "@masdan/db/schema/index";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";

const balanceExpression = sql<string>`
  ${financialAccount.openingBalance} + COALESCE(
    SUM(
      CASE
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
    .leftJoin(
      financialTransaction,
      and(
        eq(financialTransaction.accountId, financialAccount.id),
        isNull(financialTransaction.archivedAt)
      )
    )
    .leftJoin(category, eq(category.id, financialTransaction.categoryId))
    .where(inArray(financialAccount.id, accountIds))
    .groupBy(
      financialAccount.id,
      financialAccount.accountClass,
      financialAccount.openingBalance,
      category.type
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
