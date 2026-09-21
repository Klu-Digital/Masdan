import type { Database } from "@masdan/db";
import {
  category,
  financialAccount,
  financialTransaction,
  financialTransactionSplit,
  financialTransactionTag,
  tag,
} from "@masdan/db/schema/index";
import { ORPCError } from "@orpc/server";
import {
  and,
  asc,
  count,
  desc,
  eq,
  exists,
  gte,
  ilike,
  inArray,
  isNull,
  lte,
  or,
} from "drizzle-orm";
import { z } from "zod";

import { CATEGORY_TYPES } from "../categories/constants";
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
const SCALE_FACTOR = 1_000_000n;

const positiveAmount = z
  .string()
  .trim()
  .regex(positiveDecimalPattern, "Use a positive amount")
  .refine((value) => /[1-9]/u.test(value), "Amount must be greater than zero");

const scaledAmount = (value: string): bigint => {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * SCALE_FACTOR + BigInt(fraction.padEnd(6, "0"));
};

const splitTotal = (splits: { amount: string }[]): bigint => {
  let total = 0n;
  for (const split of splits) {
    total += scaledAmount(split.amount);
  }
  return total;
};

const transactionIdInput = z.object({ transactionId: z.uuid() });

const transactionListValues = z
  .object({
    accountIds: z.array(z.uuid()).max(50).default([]),
    categoryIds: z.array(z.uuid()).max(50).default([]),
    dateFrom: isoDate.optional(),
    dateTo: isoDate.optional(),
    includeArchived: z.boolean().default(false),
    page: z.number().int().min(1).default(1),
    pageSize: z.number().int().min(1).max(100).default(25),
    paidStatuses: z.array(z.enum(TRANSACTION_PAID_STATUSES)).max(2).default([]),
    search: z.string().trim().max(120).default(""),
    sortBy: z.enum(["date", "amount"]).default("date"),
    sortDirection: z.enum(["asc", "desc"]).default("desc"),
    tagIds: z.array(z.uuid()).max(50).default([]),
    types: z.array(z.enum(CATEGORY_TYPES)).max(2).default([]),
  })
  .superRefine((value, context) => {
    if (value.dateFrom && value.dateTo && value.dateFrom > value.dateTo) {
      context.addIssue({
        code: "custom",
        message: "The start date must be before the end date",
        path: ["dateFrom"],
      });
    }
  });

type TransactionListInput = z.output<typeof transactionListValues>;

const splitValues = z.object({
  amount: positiveAmount,
  categoryId: z.uuid(),
});

const transactionValues = z
  .object({
    accountId: z.uuid(),
    amount: positiveAmount,
    categoryId: z.uuid(),
    notes: z.string().trim().max(2000).nullable().optional(),
    paidStatus: z.enum(TRANSACTION_PAID_STATUSES),
    splits: z.array(splitValues).max(50).optional(),
    tagIds: z
      .array(z.uuid())
      .max(50)
      .default([])
      .refine((ids) => new Set(ids).size === ids.length, "Duplicate tag"),
    transactionDate: isoDate,
  })
  .strict()
  .superRefine((value, context) => {
    if (!value.splits || value.splits.length === 0) {
      return;
    }

    const total = splitTotal(value.splits);
    if (total !== scaledAmount(value.amount)) {
      context.addIssue({
        code: "custom",
        message: "Split amounts must equal the transaction amount",
        path: ["splits"],
      });
    }
  });

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

const transactionSplits = (db: Database, transactionId: string) =>
  db
    .select({
      amount: financialTransactionSplit.amount,
      categoryColor: category.color,
      categoryIcon: category.icon,
      categoryId: financialTransactionSplit.categoryId,
      categoryName: category.name,
      categoryType: category.type,
      id: financialTransactionSplit.id,
      sortOrder: financialTransactionSplit.sortOrder,
    })
    .from(financialTransactionSplit)
    .innerJoin(category, eq(category.id, financialTransactionSplit.categoryId))
    .where(eq(financialTransactionSplit.transactionId, transactionId))
    .orderBy(
      asc(financialTransactionSplit.sortOrder),
      asc(financialTransactionSplit.id)
    );

const withDetails = async <T extends TransactionRow>(
  db: Database,
  row: T
): Promise<
  T & {
    splits: Awaited<ReturnType<typeof transactionSplits>>;
    tags: {
      archivedAt: Date | null;
      color: string;
      id: string;
      name: string;
    }[];
  }
> => {
  const [tags, splits] = await Promise.all([
    db
      .select({
        archivedAt: tag.archivedAt,
        color: tag.color,
        id: tag.id,
        name: tag.name,
      })
      .from(financialTransactionTag)
      .innerJoin(tag, eq(tag.id, financialTransactionTag.tagId))
      .where(eq(financialTransactionTag.transactionId, row.id))
      .orderBy(asc(tag.name)),
    transactionSplits(db, row.id),
  ]);

  return { ...row, splits, tags };
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

const transactionListConditions = (
  db: Database,
  organizationId: string,
  input: TransactionListInput
) => {
  const conditions = [eq(financialTransaction.organizationId, organizationId)];

  if (!input.includeArchived) {
    conditions.push(isNull(financialTransaction.archivedAt));
  }
  if (input.accountIds.length > 0) {
    conditions.push(inArray(financialTransaction.accountId, input.accountIds));
  }
  if (input.categoryIds.length > 0) {
    conditions.push(
      inArray(financialTransaction.categoryId, input.categoryIds)
    );
  }
  if (input.dateFrom) {
    conditions.push(gte(financialTransaction.transactionDate, input.dateFrom));
  }
  if (input.dateTo) {
    conditions.push(lte(financialTransaction.transactionDate, input.dateTo));
  }
  if (input.paidStatuses.length > 0) {
    conditions.push(
      inArray(financialTransaction.paidStatus, input.paidStatuses)
    );
  }
  if (input.types.length > 0) {
    conditions.push(inArray(category.type, input.types));
  }
  if (input.tagIds.length > 0) {
    conditions.push(
      exists(
        db
          .select({ transactionId: financialTransactionTag.transactionId })
          .from(financialTransactionTag)
          .innerJoin(tag, eq(tag.id, financialTransactionTag.tagId))
          .where(
            and(
              eq(
                financialTransactionTag.transactionId,
                financialTransaction.id
              ),
              eq(tag.organizationId, organizationId),
              inArray(financialTransactionTag.tagId, input.tagIds)
            )
          )
      )
    );
  }
  if (input.search) {
    const pattern = `%${input.search}%`;
    const searchCondition = or(
      ilike(financialTransaction.notes, pattern),
      ilike(financialAccount.name, pattern),
      ilike(category.name, pattern),
      exists(
        db
          .select({ transactionId: financialTransactionTag.transactionId })
          .from(financialTransactionTag)
          .innerJoin(tag, eq(tag.id, financialTransactionTag.tagId))
          .where(
            and(
              eq(
                financialTransactionTag.transactionId,
                financialTransaction.id
              ),
              eq(tag.organizationId, organizationId),
              ilike(tag.name, pattern)
            )
          )
      )
    );
    if (searchCondition) {
      conditions.push(searchCondition);
    }
  }

  return conditions;
};

const transactionOrderBy = (input: TransactionListInput) => {
  if (input.sortBy === "amount") {
    if (input.sortDirection === "asc") {
      return [
        asc(financialTransaction.amount),
        asc(financialTransaction.transactionDate),
        asc(financialTransaction.id),
      ];
    }

    return [
      desc(financialTransaction.amount),
      desc(financialTransaction.transactionDate),
      desc(financialTransaction.id),
    ];
  }

  if (input.sortDirection === "asc") {
    return [
      asc(financialTransaction.transactionDate),
      asc(financialTransaction.createdAt),
      asc(financialTransaction.id),
    ];
  }

  return [
    desc(financialTransaction.transactionDate),
    desc(financialTransaction.createdAt),
    desc(financialTransaction.id),
  ];
};

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

const replaceSplits = async (
  db: Database,
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
        sortOrder,
        transactionId,
      }))
    );
  }
};

const validateSplitCategories = async (
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

      return withDetails(context.db, archived);
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
      const parentCategory = await validCategory(
        context.db,
        context.organizationId,
        input.categoryId,
        false
      );
      const splits = input.splits ?? [];
      await validateSplitCategories(
        context.db,
        context.organizationId,
        parentCategory.type,
        splits
      );
      await validTags(context.db, context.organizationId, input.tagIds);

      const [created] = await context.db
        .insert(financialTransaction)
        .values({
          accountId: account.id,
          amount: input.amount,
          categoryId:
            splits.length === 1
              ? (splits[0]?.categoryId ?? input.categoryId)
              : input.categoryId,
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
      await replaceSplits(context.db, created.id, splits);
      const [result] = await transactionQuery(context.db)
        .where(
          and(
            eq(financialTransaction.id, created.id),
            eq(financialTransaction.organizationId, context.organizationId)
          )
        )
        .limit(1);

      return result
        ? withDetails(context.db, result)
        : withDetails(context.db, created);
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

      return withDetails(context.db, result);
    }),

  list: orgProcedure
    .use(requirePermission({ transaction: ["read"] }))
    .input(transactionListValues)
    .handler(async ({ context, input }) => {
      const conditions = transactionListConditions(
        context.db,
        context.organizationId,
        input
      );
      const orderBy = transactionOrderBy(input);

      const [rows, countRows] = await Promise.all([
        transactionQuery(context.db)
          .where(and(...conditions))
          .orderBy(...orderBy)
          .limit(input.pageSize)
          .offset((input.page - 1) * input.pageSize),
        context.db
          .select({ total: count() })
          .from(financialTransaction)
          .innerJoin(
            financialAccount,
            eq(financialAccount.id, financialTransaction.accountId)
          )
          .innerJoin(category, eq(category.id, financialTransaction.categoryId))
          .where(and(...conditions)),
      ]);

      const total = countRows[0]?.total ?? 0;

      return {
        items: await Promise.all(
          rows.map((row) => withDetails(context.db, row))
        ),
        page: input.page,
        pageSize: input.pageSize,
        total,
        totalPages: Math.ceil(total / input.pageSize),
      };
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

      return withDetails(context.db, restored);
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

      const [currentTags, currentSplits] = await Promise.all([
        context.db
          .select({ tagId: financialTransactionTag.tagId })
          .from(financialTransactionTag)
          .where(eq(financialTransactionTag.transactionId, existing.id)),
        transactionSplits(context.db, existing.id),
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

      const account = await activeAccount(
        context.db,
        context.organizationId,
        input.accountId
      );
      const parentCategory = await validCategory(
        context.db,
        context.organizationId,
        categoryId,
        categoryId === existing.categoryId ||
          existingSplitCategoryIds.has(categoryId)
      );
      await validateSplitCategories(
        context.db,
        context.organizationId,
        parentCategory.type,
        splits,
        existingSplitCategoryIds
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
          categoryId,
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
      await replaceSplits(context.db, updated.id, splits);
      const [result] = await transactionQuery(context.db)
        .where(
          and(
            eq(financialTransaction.id, updated.id),
            eq(financialTransaction.organizationId, context.organizationId)
          )
        )
        .limit(1);

      return result
        ? withDetails(context.db, result)
        : withDetails(context.db, updated);
    }),
};
