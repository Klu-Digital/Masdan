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
  recurringSchedule,
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
  notExists,
  or,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";

import { CATEGORY_TYPES } from "../categories/constants";
import {
  orgMutationProcedure,
  orgProcedure,
  rateLimit,
  requirePermission,
} from "../procedures";
import {
  expenseTotal,
  getCategoryTotals,
  getMonthlyCashFlow,
  incomeTotal,
} from "../reports/reports.queries";
import { ruleApplicationHolds } from "../rules/engine";
import { getTransfer } from "../transfers/transfers.router";
import { TRANSACTION_PAID_STATUSES } from "./constants";
import { parseQuickEntryText, quickEntryText } from "./quick-entry.parse";
import { isoDate, transactionValues } from "./schema";
import { bulkUpdateTransactions, bulkUpdateValues } from "./transactions.bulk";
import {
  activeAccount,
  createTransaction,
  replaceSplits,
  replaceTags,
  validCategory,
  validTags,
  validateSplitCategories,
} from "./transactions.write";

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
  recurringOccurrenceDate: financialTransaction.recurringOccurrenceDate,
  recurringScheduleId: financialTransaction.recurringScheduleId,
  ruleApplication: financialTransaction.ruleApplication,
  suggestionApplication: financialTransaction.suggestionApplication,
  transactionDate: financialTransaction.transactionDate,
  transferId: financialTransaction.transferId,
  transferSide: financialTransaction.transferSide,
  updatedAt: financialTransaction.updatedAt,
};

const transactionIdInput = z.object({ transactionId: z.uuid() });

const dateRangeOrder = (
  value: { dateFrom?: string; dateTo?: string },
  context: z.RefinementCtx
): void => {
  if (value.dateFrom && value.dateTo && value.dateFrom > value.dateTo) {
    context.addIssue({
      code: "custom",
      message: "The start date must be before the end date",
      path: ["dateFrom"],
    });
  }
};

const transactionFilterFields = {
  accountIds: z.array(z.uuid()).max(50).default([]),
  categoryIds: z.array(z.uuid()).max(50).default([]),
  dateFrom: isoDate.optional(),
  dateTo: isoDate.optional(),
  includeArchived: z.boolean().default(false),
  paidStatuses: z.array(z.enum(TRANSACTION_PAID_STATUSES)).max(2).default([]),
  search: z.string().trim().max(120).default(""),
  tagIds: z.array(z.uuid()).max(50).default([]),
  types: z.array(z.enum(CATEGORY_TYPES)).max(2).default([]),
};

const transactionFilterValues = z
  .object(transactionFilterFields)
  .superRefine(dateRangeOrder);

const transactionListValues = z
  .object({
    ...transactionFilterFields,
    page: z.number().int().min(1).default(1),
    pageSize: z.number().int().min(1).max(100).default(25),
    sortBy: z.enum(["date", "amount"]).default("date"),
    sortDirection: z.enum(["asc", "desc"]).default("desc"),
  })
  .superRefine(dateRangeOrder);

export type TransactionFilterInput = z.output<typeof transactionFilterValues>;
type TransactionListInput = z.output<typeof transactionListValues>;

const transactionSummaryValues = z
  .object({
    accountIds: z.array(z.uuid()).max(50).default([]),
    dateFrom: isoDate,
    dateTo: isoDate,
  })
  .superRefine(dateRangeOrder);

interface TransactionRow {
  id: string;
  organizationId: string;
  transferId: string | null;
  [key: string]: unknown;
}

const transactionNotFound = () =>
  new ORPCError("NOT_FOUND", { message: "Transaction not found" });

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
    transfer: Awaited<ReturnType<typeof getTransfer>> | null;
  }
> => {
  const [tags, splits, transfer] = await Promise.all([
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
    row.transferId
      ? getTransfer(db, row.organizationId, row.transferId)
      : Promise.resolve(null),
  ]);

  return { ...row, splits, tags, transfer };
};

const transactionQuery = (db: Database) =>
  db
    .select({
      ...transactionFields,
      accountClass: financialAccount.accountClass,
      accountName: financialAccount.name,
      categoryColor: category.color,
      categoryIcon: category.icon,
      categoryName: category.name,
      recurringScheduleName: recurringSchedule.name,
      type: category.type,
    })
    .from(financialTransaction)
    .innerJoin(
      financialAccount,
      eq(financialAccount.id, financialTransaction.accountId)
    )
    .leftJoin(category, eq(category.id, financialTransaction.categoryId))
    .leftJoin(
      recurringSchedule,
      eq(recurringSchedule.id, financialTransaction.recurringScheduleId)
    );

const splitCategory = alias(category, "split_category");
const sourcePosting = alias(financialTransaction, "source_posting");

/** The ledger filters; Ask Masdan reuses them so its totals match this screen. */
export const transactionListConditions = (
  db: Database,
  organizationId: string,
  input: TransactionFilterInput
) => {
  const conditions = [eq(financialTransaction.organizationId, organizationId)];

  // An unfiltered household ledger shows one row per transfer, not both postings.
  if (input.accountIds.length === 0) {
    const logicalTransfer = or(
      isNull(financialTransaction.transferId),
      eq(financialTransaction.transferSide, "source")
    );
    if (logicalTransfer) {
      conditions.push(logicalTransfer);
    }
  }
  if (!input.includeArchived) {
    conditions.push(isNull(financialTransaction.archivedAt));
  }
  if (input.accountIds.length > 0) {
    conditions.push(inArray(financialTransaction.accountId, input.accountIds));
    if (input.accountIds.length > 1) {
      const logicalTransfer = or(
        isNull(financialTransaction.transferId),
        eq(financialTransaction.transferSide, "source"),
        notExists(
          db
            .select({ id: sourcePosting.id })
            .from(sourcePosting)
            .where(
              and(
                eq(sourcePosting.transferId, financialTransaction.transferId),
                eq(sourcePosting.transferSide, "source"),
                inArray(sourcePosting.accountId, input.accountIds)
              )
            )
        )
      );
      if (logicalTransfer) {
        conditions.push(logicalTransfer);
      }
    }
  }
  if (input.categoryIds.length > 0) {
    const categoryCondition = or(
      inArray(financialTransaction.categoryId, input.categoryIds),
      exists(
        db
          .select({ id: financialTransactionSplit.id })
          .from(financialTransactionSplit)
          .innerJoin(
            splitCategory,
            eq(splitCategory.id, financialTransactionSplit.categoryId)
          )
          .where(
            and(
              eq(
                financialTransactionSplit.transactionId,
                financialTransaction.id
              ),
              eq(splitCategory.organizationId, organizationId),
              inArray(financialTransactionSplit.categoryId, input.categoryIds)
            )
          )
      )
    );
    if (categoryCondition) {
      conditions.push(categoryCondition);
    }
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
          .select({ id: financialTransactionSplit.id })
          .from(financialTransactionSplit)
          .innerJoin(
            splitCategory,
            eq(splitCategory.id, financialTransactionSplit.categoryId)
          )
          .where(
            and(
              eq(
                financialTransactionSplit.transactionId,
                financialTransaction.id
              ),
              eq(splitCategory.organizationId, organizationId),
              ilike(splitCategory.name, pattern)
            )
          )
      ),
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

const transactionUpdateValues = transactionValues.extend({
  transactionId: z.uuid(),
});

export type TransactionUpdateInput = z.output<typeof transactionUpdateValues>;

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
  const [existing] = await db
    .select({
      archivedAt: financialTransaction.archivedAt,
      categoryId: financialTransaction.categoryId,
      id: financialTransaction.id,
      ruleApplication: financialTransaction.ruleApplication,
      suggestionApplication: financialTransaction.suggestionApplication,
      transferId: financialTransaction.transferId,
    })
    .from(financialTransaction)
    .where(
      and(
        eq(financialTransaction.id, input.transactionId),
        eq(financialTransaction.organizationId, organizationId)
      )
    )
    .limit(1);

  if (!existing) {
    throw transactionNotFound();
  }
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
    throw transactionNotFound();
  }

  await replaceTags(db, updated.id, input.tagIds);
  await replaceSplits(db, updated.id, splits);
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
            eq(financialTransaction.organizationId, context.organizationId),
            isNull(financialTransaction.transferId)
          )
        )
        .returning(transactionFields);

      if (!archived) {
        throw transactionNotFound();
      }

      return withDetails(context.db, archived);
    }),

  bulkUpdate: orgMutationProcedure
    .use(requirePermission({ transaction: ["update"] }))
    .input(bulkUpdateValues)
    .handler(({ context, input }) =>
      bulkUpdateTransactions(
        context.db,
        context.organizationId,
        input,
        updateTransaction
      )
    ),

  create: orgMutationProcedure
    .use(requirePermission({ transaction: ["create"] }))
    .input(transactionValues)
    .handler(async ({ context, input }) => {
      const created = await createTransaction(
        context.db,
        context.organizationId,
        {
          ...input,
          notes: input.notes ?? null,
          splits: input.splits ?? [],
        }
      );
      const [result] = created
        ? await transactionQuery(context.db)
            .where(
              and(
                eq(financialTransaction.id, created.id),
                eq(financialTransaction.organizationId, context.organizationId)
              )
            )
            .limit(1)
        : [];

      if (!result) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: "Could not create transaction",
        });
      }

      return withDetails(context.db, result);
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
          .leftJoin(category, eq(category.id, financialTransaction.categoryId))
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

  /**
   * Reads one line of text into create input. Side-effect free: the client
   * creates with `create`, which validates everything again. Any AI failure
   * leaves `input` null, so the caller falls back to the prefilled form.
   */
  parseQuickEntry: orgProcedure
    .use(requirePermission({ transaction: ["create"] }))
    .use(rateLimit({ limit: 30, window: 60 }))
    .input(z.object({ text: quickEntryText }))
    .handler(({ context, input }) =>
      parseQuickEntryText(context.db, context.organizationId, input.text)
    ),

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
            eq(financialTransaction.organizationId, context.organizationId),
            isNull(financialTransaction.transferId)
          )
        )
        .returning(transactionFields);

      if (!restored) {
        throw transactionNotFound();
      }

      return withDetails(context.db, restored);
    }),

  summary: orgProcedure
    .use(requirePermission({ transaction: ["read"] }))
    .input(transactionSummaryValues)
    .handler(async ({ context, input }) => {
      const [cashFlow, categories] = await Promise.all([
        getMonthlyCashFlow(context.db, context.organizationId, input),
        getCategoryTotals(context.db, context.organizationId, input),
      ]);

      return { cashFlow, categories };
    }),

  totals: orgProcedure
    .use(requirePermission({ transaction: ["read"] }))
    .input(transactionFilterValues)
    .handler(async ({ context, input }) => {
      const conditions = transactionListConditions(
        context.db,
        context.organizationId,
        input
      );

      const [countRows, currencies] = await Promise.all([
        context.db
          .select({ total: count() })
          .from(financialTransaction)
          .innerJoin(
            financialAccount,
            eq(financialAccount.id, financialTransaction.accountId)
          )
          .leftJoin(category, eq(category.id, financialTransaction.categoryId))
          .where(and(...conditions)),
        context.db
          .select({
            currencyCode: financialTransaction.currencyCode,
            expense: expenseTotal,
            income: incomeTotal,
          })
          .from(financialTransaction)
          .innerJoin(
            financialAccount,
            eq(financialAccount.id, financialTransaction.accountId)
          )
          .leftJoin(category, eq(category.id, financialTransaction.categoryId))
          .where(and(...conditions, isNull(financialTransaction.transferId)))
          .groupBy(financialTransaction.currencyCode)
          .orderBy(asc(financialTransaction.currencyCode)),
      ]);

      return { count: countRows[0]?.total ?? 0, currencies };
    }),

  update: orgMutationProcedure
    .use(requirePermission({ transaction: ["update"] }))
    .input(transactionUpdateValues)
    .handler(({ context, input }) =>
      updateTransaction(context.db, context.organizationId, input)
    ),
};
