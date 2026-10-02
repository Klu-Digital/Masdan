import type { Database } from "@masdan/db";
import type {
  TransactionRuleApplication,
  TransactionSuggestionApplication,
} from "@masdan/db/schema/index";
import {
  category,
  financialAccount,
  financialTransaction,
  financialTransactionSplit,
  financialTransactionTag,
  tag,
} from "@masdan/db/schema/index";
import { ORPCError } from "@orpc/server";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import { notFound } from "../shared/errors";
import type { TransactionPaidStatus } from "./constants";

// No procedure ladder, so apps/workers can import it.

export interface LedgerAccount {
  currencyCode: string;
  id: string;
  openingBalanceDate: string;
}

// `FOR SHARE` so a concurrent class or currency change waits for this posting.
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
    .for("share")
    .limit(1);

  if (!account) {
    throw notFound("Financial account");
  }

  return account;
};

export const lockLedgerAccounts = async (
  db: Database,
  organizationId: string,
  accountIds: string[]
): Promise<void> => {
  await db
    .select({ id: financialAccount.id })
    .from(financialAccount)
    .where(
      and(
        eq(financialAccount.organizationId, organizationId),
        inArray(financialAccount.id, [...new Set(accountIds)])
      )
    )
    .orderBy(financialAccount.id)
    .for("share");
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

export const ownedTags = async (
  db: Database,
  organizationId: string,
  tagIds: string[]
) => {
  if (tagIds.length === 0) {
    return [];
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
  return selected;
};

/** Archived tags are only allowed where the transaction already carries them. */
export const validTags = async (
  db: Database,
  organizationId: string,
  tagIds: string[],
  existingTagIds = new Set<string>()
): Promise<void> => {
  const selected = await ownedTags(db, organizationId, tagIds);
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
  organizationId: string,
  transactionId: string,
  tagIds: string[]
): Promise<void> => {
  await db
    .delete(financialTransactionTag)
    .where(eq(financialTransactionTag.transactionId, transactionId));

  if (tagIds.length > 0) {
    await db
      .insert(financialTransactionTag)
      .values(
        tagIds.map((tagId) => ({ organizationId, tagId, transactionId }))
      );
  }
};

export const replaceSplits = async (
  db: Database,
  organizationId: string,
  transactionId: string,
  splits: { amount: string; categoryId: string }[]
): Promise<void> => {
  await db
    .delete(financialTransactionSplit)
    .where(eq(financialTransactionSplit.transactionId, transactionId));

  if (splits.length > 1) {
    await db.insert(financialTransactionSplit).values(
      splits.map((split, sortOrder) => ({
        amount: split.amount,
        categoryId: split.categoryId,
        organizationId,
        sortOrder,
        transactionId,
      }))
    );
  }
};

export const validateSplitCategories = async (
  db: Database,
  organizationId: string,
  parentType: string,
  splits: { categoryId: string }[],
  existingCategoryIds = new Set<string>()
): Promise<void> => {
  const selected = await Promise.all(
    splits.map((split) =>
      validCategory(
        db,
        organizationId,
        split.categoryId,
        existingCategoryIds.has(split.categoryId)
      )
    )
  );

  if (selected.some(({ type }) => type !== parentType)) {
    throw new ORPCError("BAD_REQUEST", {
      message: "Every split category must match the transaction type",
    });
  }
};

export const assertReferences = async (
  db: Database,
  organizationId: string,
  values: {
    accountId: string | null;
    categoryId: string | null;
    tagIds: string[];
  },
  existing?: {
    accountId: string | null;
    categoryId: string | null;
    tagIds: string[];
  }
) => {
  if (values.accountId && values.accountId !== existing?.accountId) {
    await activeAccount(db, organizationId, values.accountId);
  }
  const selected = values.categoryId
    ? await validCategory(
        db,
        organizationId,
        values.categoryId,
        values.categoryId === existing?.categoryId
      )
    : null;
  await validTags(db, organizationId, values.tagIds, new Set(existing?.tagIds));
  return selected;
};

/** The schedule occurrence a generated transaction stands for. */
export interface RecurringOccurrence {
  occurrenceDate: string;
  scheduleId: string;
}

export interface TransactionWrite {
  amount: string;
  categoryId: string;
  /** Null for system postings: recurring generation, interest. */
  createdByUserId?: string | null;
  importFingerprint?: string | null;
  notes: string | null;
  paidStatus: TransactionPaidStatus;
  recurrence?: RecurringOccurrence | null;
  ruleApplication?: TransactionRuleApplication | null;
  suggestionApplication?: TransactionSuggestionApplication | null;
  transactionDate: string;
}

/** Callers resolve currency from the account or household, never user input. */
export const transactionInsertValues = (
  organizationId: string,
  account: { id: string | null; currencyCode: string },
  values: TransactionWrite
): typeof financialTransaction.$inferInsert => ({
  accountId: account.id,
  amount: values.amount,
  categoryId: values.categoryId,
  createdByUserId: values.createdByUserId ?? null,
  currencyCode: account.currencyCode,
  importFingerprint: values.importFingerprint ?? null,
  notes: values.notes,
  organizationId,
  paidStatus: values.paidStatus,
  recurringOccurrenceDate: values.recurrence?.occurrenceDate ?? null,
  recurringScheduleId: values.recurrence?.scheduleId ?? null,
  ruleApplication: values.ruleApplication ?? null,
  suggestionApplication: values.suggestionApplication ?? null,
  transactionDate: values.transactionDate,
});

export interface TransactionCreate {
  accountId: string;
  amount: string;
  categoryId: string;
  createdByUserId?: string | null;
  notes: string | null;
  paidStatus: TransactionPaidStatus;
  splits: { amount: string; categoryId: string }[];
  tagIds: string[];
  transactionDate: string;
}

// The unique index, not a prior read, dedupes recurring occurrences.
export const createTransaction = async (
  db: Database,
  organizationId: string,
  input: TransactionCreate,
  recurrence?: RecurringOccurrence
): Promise<{ id: string } | null> => {
  const account = await activeAccount(db, organizationId, input.accountId);
  const parentCategory = await validCategory(
    db,
    organizationId,
    input.categoryId,
    false
  );
  const { splits } = input;
  await validateSplitCategories(
    db,
    organizationId,
    parentCategory.type,
    splits
  );
  await validTags(db, organizationId, input.tagIds);

  const insert = db.insert(financialTransaction).values(
    transactionInsertValues(organizationId, account, {
      amount: input.amount,
      categoryId:
        splits.length === 1
          ? (splits[0]?.categoryId ?? input.categoryId)
          : input.categoryId,
      createdByUserId: input.createdByUserId ?? null,
      notes: input.notes,
      paidStatus: input.paidStatus,
      recurrence: recurrence ?? null,
      transactionDate: input.transactionDate,
    })
  );
  const [created] = await (
    recurrence
      ? insert.onConflictDoNothing({
          target: [
            financialTransaction.recurringScheduleId,
            financialTransaction.recurringOccurrenceDate,
          ],
          where: sql`${financialTransaction.recurringScheduleId} IS NOT NULL`,
        })
      : insert
  ).returning({ id: financialTransaction.id });

  if (!created) {
    if (recurrence) {
      return null;
    }
    throw new ORPCError("INTERNAL_SERVER_ERROR", {
      message: "Could not create transaction",
    });
  }

  await replaceTags(db, organizationId, created.id, input.tagIds);
  await replaceSplits(db, organizationId, created.id, splits);
  return created;
};
