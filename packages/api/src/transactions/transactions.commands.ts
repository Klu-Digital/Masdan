import type { Database } from "@masdan/db";
import type {
  TransactionRuleApplication,
  TransactionSuggestionApplication,
} from "@masdan/db/schema/index";
import {
  financialTransaction,
  financialTransactionTag,
} from "@masdan/db/schema/index";
import { ORPCError } from "@orpc/server";
import { and, eq, isNull } from "drizzle-orm";

import { ruleApplicationHolds } from "../rules/engine";
import { notFound } from "../shared/errors";
import { lockOwned } from "../shared/ownership";
import type { TransactionCreateInput, TransactionUpdateInput } from "./schema";
import {
  transactionFields,
  transactionQuery,
  transactionSplits,
  withDetails,
} from "./transactions.queries";
import {
  activeAccount,
  createTransaction,
  replaceSplits,
  replaceTags,
  validCategory,
  validTags,
  validateSplitCategories,
} from "./transactions.write";

/** A split's categories come from its splits, never a rule or suggestion. */
const keptApplication = <
  A extends Pick<TransactionRuleApplication, "categoryId" | "tagIds">,
>(
  application: A | null,
  values: { categoryId: string; splits: unknown[]; tagIds: string[] }
): A | null =>
  application &&
  !(values.splits.length > 1 && application.categoryId !== null) &&
  ruleApplicationHolds(application, values)
    ? application
    : null;

/**
 * The one edit path for an income or expense: the update procedure, rule
 * application and accepted suggestions all go through it. `provenance`
 * records a rule that just ran or a suggestion just accepted; without one,
 * earlier provenance survives only while the category and tags it set are
 * still there.
 */
export const updateTransaction = async (
  db: Database,
  organizationId: string,
  input: TransactionUpdateInput,
  provenance: {
    ruleApplication?: TransactionRuleApplication;
    suggestionApplication?: TransactionSuggestionApplication;
  } = {}
) => {
  // Held to commit: the tag and split replacement below is delete-then-insert.
  const existing = await lockOwned(
    db,
    financialTransaction,
    { id: input.transactionId, organizationId },
    "Transaction"
  );
  if (existing.transferId !== null || existing.categoryId === null) {
    throw new ORPCError("BAD_REQUEST", {
      message: "Use transfer actions to edit a transfer",
    });
  }
  if (existing.archivedAt !== null) {
    throw new ORPCError("BAD_REQUEST", {
      message: "Restore the transaction before editing it",
    });
  }

  const [currentTags, currentSplits] = await Promise.all([
    db
      .select({ tagId: financialTransactionTag.tagId })
      .from(financialTransactionTag)
      .where(eq(financialTransactionTag.transactionId, existing.id)),
    transactionSplits(db, existing.id),
  ]);
  const existingTagIds = new Set(currentTags.map(({ tagId }) => tagId));
  const existingSplitCategoryIds = new Set(
    currentSplits.map(({ categoryId }) => categoryId)
  );
  const splits = input.splits ?? [];
  const categoryId =
    splits.length === 1
      ? (splits[0]?.categoryId ?? input.categoryId)
      : input.categoryId;

  const account = await activeAccount(db, organizationId, input.accountId);
  const parentCategory = await validCategory(
    db,
    organizationId,
    categoryId,
    categoryId === existing.categoryId ||
      existingSplitCategoryIds.has(categoryId)
  );
  await validateSplitCategories(
    db,
    organizationId,
    parentCategory.type,
    splits,
    existingSplitCategoryIds
  );
  await validTags(db, organizationId, input.tagIds, existingTagIds);

  const [updated] = await db
    .update(financialTransaction)
    .set({
      accountId: account.id,
      amount: input.amount,
      categoryId,
      currencyCode: account.currencyCode,
      notes: input.notes ?? null,
      paidStatus: input.paidStatus,
      ruleApplication: keptApplication(
        provenance.ruleApplication ?? existing.ruleApplication,
        { categoryId, splits, tagIds: input.tagIds }
      ),
      suggestionApplication: keptApplication(
        provenance.suggestionApplication ?? existing.suggestionApplication,
        { categoryId, splits, tagIds: input.tagIds }
      ),
      transactionDate: input.transactionDate,
    })
    .where(
      and(
        eq(financialTransaction.id, existing.id),
        eq(financialTransaction.organizationId, organizationId)
      )
    )
    .returning(transactionFields);

  if (!updated) {
    throw notFound("Transaction");
  }

  await replaceTags(db, organizationId, updated.id, input.tagIds);
  await replaceSplits(db, organizationId, updated.id, splits);
  const [result] = await transactionQuery(db)
    .where(
      and(
        eq(financialTransaction.id, updated.id),
        eq(financialTransaction.organizationId, organizationId)
      )
    )
    .limit(1);

  return result ? withDetails(db, result) : withDetails(db, updated);
};

/** Manual entry: creates through the shared create path, then reads it back whole. */
export const addTransaction = async (
  db: Database,
  organizationId: string,
  input: TransactionCreateInput
) => {
  const created = await createTransaction(db, organizationId, {
    ...input,
    notes: input.notes ?? null,
    splits: input.splits ?? [],
  });
  const [result] = created
    ? await transactionQuery(db)
        .where(
          and(
            eq(financialTransaction.id, created.id),
            eq(financialTransaction.organizationId, organizationId)
          )
        )
        .limit(1)
    : [];

  if (!result) {
    throw new ORPCError("INTERNAL_SERVER_ERROR", {
      message: "Could not create transaction",
    });
  }

  return withDetails(db, result);
};

/** Archive (a date) or restore (`null`). Transfers archive through their own actions. */
export const setTransactionArchived = async (
  db: Database,
  organizationId: string,
  transactionId: string,
  archivedAt: Date | null
) => {
  const [row] = await db
    .update(financialTransaction)
    .set({ archivedAt })
    .where(
      and(
        eq(financialTransaction.id, transactionId),
        eq(financialTransaction.organizationId, organizationId),
        isNull(financialTransaction.transferId)
      )
    )
    .returning(transactionFields);

  if (!row) {
    throw notFound("Transaction");
  }

  return withDetails(db, row);
};
