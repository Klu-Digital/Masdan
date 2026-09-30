import type { Database } from "@masdan/db";
import {
  financialTransaction,
  financialTransactionSplit,
  financialTransactionTag,
} from "@masdan/db/schema/index";
import { ORPCError } from "@orpc/server";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { updateTransaction } from "./transactions.commands";
import { ownedTags, validCategory, validTags } from "./transactions.write";

const uniqueIds = (ids: string[]) => new Set(ids).size === ids.length;
export const bulkUpdateValues = z
  .object({
    addTagIds: z.array(z.uuid()).max(50).refine(uniqueIds).default([]),
    categoryId: z.uuid().optional(),
    removeTagIds: z.array(z.uuid()).max(50).refine(uniqueIds).default([]),
    transactionIds: z.array(z.uuid()).min(1).max(100).refine(uniqueIds),
  })
  .strict()
  .refine(
    (value) =>
      value.categoryId !== undefined ||
      value.addTagIds.length > 0 ||
      value.removeTagIds.length > 0,
    "Choose a category or tags to change"
  )
  .refine(
    (value) => !value.addTagIds.some((id) => value.removeTagIds.includes(id)),
    "A tag cannot be added and removed at the same time"
  );

type BulkUpdateInput = z.output<typeof bulkUpdateValues>;
type BulkSkipReason =
  | "not_found"
  | "transfer"
  | "archived"
  | "split"
  | "invalid";
interface BulkSkip {
  transactionId: string;
  reason: BulkSkipReason;
  message?: string;
}

export const bulkUpdateTransactions = async (
  db: Database,
  organizationId: string,
  input: BulkUpdateInput
): Promise<{
  categoryKept: string[];
  updated: string[];
  skipped: BulkSkip[];
}> => {
  if (input.categoryId) {
    await validCategory(db, organizationId, input.categoryId, false);
  }
  await validTags(db, organizationId, input.addTagIds);
  await ownedTags(db, organizationId, input.removeTagIds);

  const rows = await db
    .select()
    .from(financialTransaction)
    .where(
      and(
        eq(financialTransaction.organizationId, organizationId),
        inArray(financialTransaction.id, input.transactionIds)
      )
    )
    // Locked up front, in id order so overlapping bulk edits cannot deadlock:
    // each edit below rebuilds the tag set from what it read.
    .orderBy(financialTransaction.id)
    .for("update");
  const byId = new Map(rows.map((row) => [row.id, row]));
  const updated: string[] = [];
  const categoryKept: string[] = [];
  const skipped: BulkSkip[] = [];

  for (const transactionId of input.transactionIds) {
    const row = byId.get(transactionId);
    if (!row || row.transferId !== null || row.archivedAt !== null) {
      let reason: BulkSkipReason = "not_found";
      if (row?.transferId) {
        reason = "transfer";
      } else if (row?.archivedAt) {
        reason = "archived";
      }
      skipped.push({ reason, transactionId });
      continue;
    }
    const currentCategoryId = row.categoryId;
    if (currentCategoryId === null) {
      skipped.push({
        message: row.reconciliationSnapshotId
          ? "Reconciliation adjustments cannot be edited"
          : "Transaction has no category",
        reason: "invalid",
        transactionId,
      });
      continue;
    }
    try {
      const applied = await db.transaction(async (tx) => {
        const [tags, splits] = await Promise.all([
          tx
            .select({ tagId: financialTransactionTag.tagId })
            .from(financialTransactionTag)
            .where(eq(financialTransactionTag.transactionId, transactionId)),
          tx
            .select({
              amount: financialTransactionSplit.amount,
              categoryId: financialTransactionSplit.categoryId,
            })
            .from(financialTransactionSplit)
            .where(eq(financialTransactionSplit.transactionId, transactionId))
            .orderBy(financialTransactionSplit.sortOrder),
        ]);
        if (
          splits.length > 0 &&
          input.categoryId &&
          input.addTagIds.length === 0 &&
          input.removeTagIds.length === 0
        ) {
          return null;
        }
        const tagIds = new Set([
          ...tags.map(({ tagId }) => tagId),
          ...input.addTagIds,
        ]);
        for (const id of input.removeTagIds) {
          tagIds.delete(id);
        }
        await updateTransaction(tx, organizationId, {
          accountId: row.accountId,
          amount: row.amount,
          categoryId:
            splits.length > 0
              ? currentCategoryId
              : (input.categoryId ?? currentCategoryId),
          notes: row.notes,
          paidStatus: row.paidStatus,
          splits,
          tagIds: [...tagIds],
          transactionDate: row.transactionDate,
          transactionId,
        });
        return splits.length > 0 && input.categoryId !== undefined;
      });
      if (applied === null) {
        skipped.push({ reason: "split", transactionId });
      } else {
        updated.push(transactionId);
        if (applied) {
          categoryKept.push(transactionId);
        }
      }
    } catch (error) {
      if (!(error instanceof ORPCError)) {
        throw error;
      }
      skipped.push({
        message: error.message,
        reason: "invalid",
        transactionId,
      });
    }
  }
  return { categoryKept, skipped, updated };
};
