import type { Database } from "@masdan/db";
import {
  category,
  financialAccount,
  financialTransaction,
  financialTransactionTag,
  tag,
} from "@masdan/db/schema/index";
import { ORPCError } from "@orpc/server";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";

import {
  orgMutationProcedure,
  orgProcedure,
  requirePermission,
} from "../procedures";
import { TRANSACTION_PAID_STATUSES } from "./constants";

const transactionFields = {
  accountId: financialTransaction.accountId,
  amount: financialTransaction.amount,
  archivedAt: financialTransaction.archivedAt,
  categoryId: financialTransaction.categoryId,
  createdAt: financialTransaction.createdAt,
  currencyCode: financialTransaction.currencyCode,
  id: financialTransaction.id,
  notes: financialTransaction.notes,
  organizationId: financialTransaction.organizationId,
  paidStatus: financialTransaction.paidStatus,
  transactionDate: financialTransaction.transactionDate,
  updatedAt: financialTransaction.updatedAt,
};

const isoDate = z.iso.date();
const positiveDecimalPattern = /^\d+(?<fraction>\.\d{1,6})?$/u;

const transactionIdInput = z.object({ transactionId: z.uuid() });

const transactionValues = z
  .object({
    accountId: z.uuid(),
    amount: z
      .string()
      .trim()
      .regex(positiveDecimalPattern, "Use a positive amount")
      .refine(
        (value) => /[1-9]/u.test(value),
        "Amount must be greater than zero"
      ),
    categoryId: z.uuid(),
    notes: z.string().trim().max(2000).nullable().optional(),
    paidStatus: z.enum(TRANSACTION_PAID_STATUSES),
    tagIds: z
      .array(z.uuid())
      .max(50)
      .default([])
      .refine((ids) => new Set(ids).size === ids.length, "Duplicate tag"),
    transactionDate: isoDate,
  })
  .strict();

interface TransactionRow {
  id: string;
  [key: string]: unknown;
}

const transactionNotFound = () =>
  new ORPCError("NOT_FOUND", { message: "Transaction not found" });

const activeAccount = async (
  db: Database,
  organizationId: string,
  accountId: string
) => {
  const [account] = await db
    .select({
      currencyCode: financialAccount.currencyCode,
      id: financialAccount.id,
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

const validCategory = async (
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

const validTags = async (
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

const withTags = async <T extends TransactionRow>(
  db: Database,
  row: T
): Promise<
  T & {
    tags: {
      archivedAt: Date | null;
      color: string;
      id: string;
      name: string;
    }[];
  }
> => {
  const tags = await db
    .select({
      archivedAt: tag.archivedAt,
      color: tag.color,
      id: tag.id,
      name: tag.name,
    })
    .from(financialTransactionTag)
    .innerJoin(tag, eq(tag.id, financialTransactionTag.tagId))
    .where(eq(financialTransactionTag.transactionId, row.id))
    .orderBy(asc(tag.name));

  return { ...row, tags };
};

const transactionQuery = (db: Database) =>
  db
    .select({
      ...transactionFields,
      accountName: financialAccount.name,
      categoryColor: category.color,
      categoryIcon: category.icon,
      categoryName: category.name,
      type: category.type,
    })
    .from(financialTransaction)
    .innerJoin(
      financialAccount,
      eq(financialAccount.id, financialTransaction.accountId)
    )
    .innerJoin(category, eq(category.id, financialTransaction.categoryId));

const replaceTags = async (
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

export const transactionsRouter = {
  archive: orgMutationProcedure
    .use(requirePermission({ transaction: ["archive"] }))
    .input(transactionIdInput)
    .handler(async ({ context, input }) => {
      const [archived] = await context.db
        .update(financialTransaction)
        .set({ archivedAt: new Date() })
        .where(
          and(
            eq(financialTransaction.id, input.transactionId),
            eq(financialTransaction.organizationId, context.organizationId)
          )
        )
        .returning(transactionFields);

      if (!archived) {
        throw transactionNotFound();
      }

      return withTags(context.db, archived);
    }),

  create: orgMutationProcedure
    .use(requirePermission({ transaction: ["create"] }))
    .input(transactionValues)
    .handler(async ({ context, input }) => {
      const account = await activeAccount(
        context.db,
        context.organizationId,
        input.accountId
      );
      await validCategory(
        context.db,
        context.organizationId,
        input.categoryId,
        false
      );
      await validTags(context.db, context.organizationId, input.tagIds);

      const [created] = await context.db
        .insert(financialTransaction)
        .values({
          accountId: account.id,
          amount: input.amount,
          categoryId: input.categoryId,
          currencyCode: account.currencyCode,
          notes: input.notes ?? null,
          organizationId: context.organizationId,
          paidStatus: input.paidStatus,
          transactionDate: input.transactionDate,
        })
        .returning(transactionFields);

      if (!created) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: "Could not create transaction",
        });
      }

      await replaceTags(context.db, created.id, input.tagIds);
      const [result] = await transactionQuery(context.db)
        .where(
          and(
            eq(financialTransaction.id, created.id),
            eq(financialTransaction.organizationId, context.organizationId)
          )
        )
        .limit(1);

      return result
        ? withTags(context.db, result)
        : withTags(context.db, created);
    }),

  get: orgProcedure
    .use(requirePermission({ transaction: ["read"] }))
    .input(transactionIdInput)
    .handler(async ({ context, input }) => {
      const [result] = await transactionQuery(context.db)
        .where(
          and(
            eq(financialTransaction.id, input.transactionId),
            eq(financialTransaction.organizationId, context.organizationId)
          )
        )
        .limit(1);

      if (!result) {
        throw transactionNotFound();
      }

      return withTags(context.db, result);
    }),

  list: orgProcedure
    .use(requirePermission({ transaction: ["read"] }))
    .input(z.object({ includeArchived: z.boolean().default(false) }).optional())
    .handler(async ({ context, input }) => {
      const conditions = [
        eq(financialTransaction.organizationId, context.organizationId),
      ];
      if (!input?.includeArchived) {
        conditions.push(isNull(financialTransaction.archivedAt));
      }

      const rows = await transactionQuery(context.db)
        .where(and(...conditions))
        .orderBy(
          desc(financialTransaction.transactionDate),
          desc(financialTransaction.createdAt)
        )
        .limit(50);

      return Promise.all(rows.map((row) => withTags(context.db, row)));
    }),

  restore: orgMutationProcedure
    .use(requirePermission({ transaction: ["restore"] }))
    .input(transactionIdInput)
    .handler(async ({ context, input }) => {
      const [restored] = await context.db
        .update(financialTransaction)
        .set({ archivedAt: null })
        .where(
          and(
            eq(financialTransaction.id, input.transactionId),
            eq(financialTransaction.organizationId, context.organizationId)
          )
        )
        .returning(transactionFields);

      if (!restored) {
        throw transactionNotFound();
      }

      return withTags(context.db, restored);
    }),

  update: orgMutationProcedure
    .use(requirePermission({ transaction: ["update"] }))
    .input(transactionValues.extend({ transactionId: z.uuid() }))
    .handler(async ({ context, input }) => {
      const [existing] = await context.db
        .select({
          archivedAt: financialTransaction.archivedAt,
          categoryId: financialTransaction.categoryId,
          id: financialTransaction.id,
        })
        .from(financialTransaction)
        .where(
          and(
            eq(financialTransaction.id, input.transactionId),
            eq(financialTransaction.organizationId, context.organizationId)
          )
        )
        .limit(1);

      if (!existing) {
        throw transactionNotFound();
      }
      if (existing.archivedAt !== null) {
        throw new ORPCError("BAD_REQUEST", {
          message: "Restore the transaction before editing it",
        });
      }

      const currentTags = await context.db
        .select({ tagId: financialTransactionTag.tagId })
        .from(financialTransactionTag)
        .where(eq(financialTransactionTag.transactionId, existing.id));
      const existingTagIds = new Set(currentTags.map(({ tagId }) => tagId));

      const account = await activeAccount(
        context.db,
        context.organizationId,
        input.accountId
      );
      await validCategory(
        context.db,
        context.organizationId,
        input.categoryId,
        input.categoryId === existing.categoryId
      );
      await validTags(
        context.db,
        context.organizationId,
        input.tagIds,
        existingTagIds
      );

      const [updated] = await context.db
        .update(financialTransaction)
        .set({
          accountId: account.id,
          amount: input.amount,
          categoryId: input.categoryId,
          currencyCode: account.currencyCode,
          notes: input.notes ?? null,
          paidStatus: input.paidStatus,
          transactionDate: input.transactionDate,
        })
        .where(
          and(
            eq(financialTransaction.id, existing.id),
            eq(financialTransaction.organizationId, context.organizationId)
          )
        )
        .returning(transactionFields);

      if (!updated) {
        throw transactionNotFound();
      }

      await replaceTags(context.db, updated.id, input.tagIds);
      const [result] = await transactionQuery(context.db)
        .where(
          and(
            eq(financialTransaction.id, updated.id),
            eq(financialTransaction.organizationId, context.organizationId)
          )
        )
        .limit(1);

      return result
        ? withTags(context.db, result)
        : withTags(context.db, updated);
    }),
};
