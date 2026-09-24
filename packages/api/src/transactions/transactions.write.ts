import type { Database } from "@masdan/db";
import type { financialTransaction } from "@masdan/db/schema/index";
import { category, financialAccount } from "@masdan/db/schema/index";
import { ORPCError } from "@orpc/server";
import { and, eq, isNull } from "drizzle-orm";

import type { TransactionPaidStatus } from "./constants";

/**
 * Transaction writes shared by manual entry and CSV import. Kept free of the
 * procedure ladder so apps/workers can import it without auth or server env.
 */

export interface LedgerAccount {
  currencyCode: string;
  id: string;
  openingBalanceDate: string;
}

export const activeAccount = async (
  db: Database,
  organizationId: string,
  accountId: string
): Promise<LedgerAccount> => {
  const [account] = await db
    .select({
      currencyCode: financialAccount.currencyCode,
      id: financialAccount.id,
      openingBalanceDate: financialAccount.openingBalanceDate,
    })
    .from(financialAccount)
    .where(
      and(
        eq(financialAccount.id, accountId),
        eq(financialAccount.organizationId, organizationId),
        isNull(financialAccount.archivedAt)
      )
    )
    .limit(1);

  if (!account) {
    throw new ORPCError("NOT_FOUND", {
      message: "Financial account not found",
    });
  }

  return account;
};

export const validCategory = async (
  db: Database,
  organizationId: string,
  categoryId: string,
  allowArchived: boolean
) => {
  const [selected] = await db
    .select({
      archivedAt: category.archivedAt,
      id: category.id,
      type: category.type,
    })
    .from(category)
    .where(
      and(
        eq(category.id, categoryId),
        eq(category.organizationId, organizationId)
      )
    )
    .limit(1);

  if (!selected || (!allowArchived && selected.archivedAt !== null)) {
    throw new ORPCError("BAD_REQUEST", {
      message: "Choose an active category",
    });
  }

  return selected;
};

export interface TransactionWrite {
  amount: string;
  categoryId: string;
  importFingerprint?: string | null;
  notes: string | null;
  paidStatus: TransactionPaidStatus;
  transactionDate: string;
}

/** Currency always follows the account, never the caller. */
export const transactionInsertValues = (
  organizationId: string,
  account: LedgerAccount,
  values: TransactionWrite
): typeof financialTransaction.$inferInsert => ({
  accountId: account.id,
  amount: values.amount,
  categoryId: values.categoryId,
  currencyCode: account.currencyCode,
  importFingerprint: values.importFingerprint ?? null,
  notes: values.notes,
  organizationId,
  paidStatus: values.paidStatus,
  transactionDate: values.transactionDate,
});
