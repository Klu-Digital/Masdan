import type { Database } from "@masdan/db";
import type {
  financialTransaction,
  TransactionRuleApplication,
} from "@masdan/db/schema/index";
import {
  category,
  financialAccount,
  financialTransactionTag,
  tag,
} from "@masdan/db/schema/index";
import { ORPCError } from "@orpc/server";
import { and, eq, inArray, isNull } from "drizzle-orm";

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

/** Archived tags are only allowed where the transaction already carries them. */
export const validTags = async (
  db: Database,
  organizationId: string,
  tagIds: string[],
  existingTagIds = new Set<string>()
): Promise<void> => {
  if (tagIds.length === 0) {
    return;
  }

  const selected = await db
    .select({ archivedAt: tag.archivedAt, id: tag.id })
    .from(tag)
    .where(
      and(eq(tag.organizationId, organizationId), inArray(tag.id, tagIds))
    );

  if (selected.length !== tagIds.length) {
    throw new ORPCError("BAD_REQUEST", {
      message: "Every tag must belong to the active household",
    });
  }

  if (
    selected.some(
      (selectedTag) =>
        selectedTag.archivedAt !== null && !existingTagIds.has(selectedTag.id)
    )
  ) {
    throw new ORPCError("BAD_REQUEST", {
      message: "New transactions can only use active tags",
    });
  }
};

export const replaceTags = async (
  db: Database,
  transactionId: string,
  tagIds: string[]
): Promise<void> => {
  await db
    .delete(financialTransactionTag)
    .where(eq(financialTransactionTag.transactionId, transactionId));

  if (tagIds.length > 0) {
    await db
      .insert(financialTransactionTag)
      .values(tagIds.map((tagId) => ({ tagId, transactionId })));
  }
};

export interface TransactionWrite {
  amount: string;
  categoryId: string;
  importFingerprint?: string | null;
  notes: string | null;
  paidStatus: TransactionPaidStatus;
  ruleApplication?: TransactionRuleApplication | null;
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
  ruleApplication: values.ruleApplication ?? null,
  transactionDate: values.transactionDate,
});
