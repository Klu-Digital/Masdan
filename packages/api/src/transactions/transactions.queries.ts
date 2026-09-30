import type { Database } from "@masdan/db";
import {
  category,
  financialAccount,
  financialTransaction,
  financialTransactionSplit,
  financialTransactionTag,
  recurringSchedule,
  tag,
} from "@masdan/db/schema/index";
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

import {
  expenseTotal,
  getCategoryTotals,
  getMonthlyCashFlow,
  incomeTotal,
} from "../reports/reports.queries";
import { notFound } from "../shared/errors";
import { listTransfers } from "../transfers/transfers.queries";
import type { TransactionFilterInput, TransactionListInput } from "./schema";

export const transactionFields = {
  accountId: financialTransaction.accountId,
  adjustmentDirection: financialTransaction.adjustmentDirection,
  amount: financialTransaction.amount,
  archivedAt: financialTransaction.archivedAt,
  categoryId: financialTransaction.categoryId,
  createdAt: financialTransaction.createdAt,
  currencyCode: financialTransaction.currencyCode,
  id: financialTransaction.id,
  notes: financialTransaction.notes,
  organizationId: financialTransaction.organizationId,
  paidStatus: financialTransaction.paidStatus,
  reconciliationSnapshotId: financialTransaction.reconciliationSnapshotId,
  recurringOccurrenceDate: financialTransaction.recurringOccurrenceDate,
  recurringScheduleId: financialTransaction.recurringScheduleId,
  ruleApplication: financialTransaction.ruleApplication,
  suggestionApplication: financialTransaction.suggestionApplication,
  transactionDate: financialTransaction.transactionDate,
  transferId: financialTransaction.transferId,
  transferSide: financialTransaction.transferSide,
  updatedAt: financialTransaction.updatedAt,
};

interface TransactionRow {
  id: string;
  organizationId: string;
  transferId: string | null;
  [key: string]: unknown;
}

/** Splits of every transaction in `transactionIds`, in display order. */
export const transactionSplits = (
  db: Database,
  organizationId: string,
  transactionIds: string[]
) =>
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
      transactionId: financialTransactionSplit.transactionId,
    })
    .from(financialTransactionSplit)
    .innerJoin(category, eq(category.id, financialTransactionSplit.categoryId))
    .where(
      and(
        eq(financialTransactionSplit.organizationId, organizationId),
        inArray(financialTransactionSplit.transactionId, transactionIds)
      )
    )
    .orderBy(
      asc(financialTransactionSplit.sortOrder),
      asc(financialTransactionSplit.id)
    );

const transactionTags = (
  db: Database,
  organizationId: string,
  transactionIds: string[]
) =>
  db
    .select({
      archivedAt: tag.archivedAt,
      color: tag.color,
      id: tag.id,
      name: tag.name,
      transactionId: financialTransactionTag.transactionId,
    })
    .from(financialTransactionTag)
    .innerJoin(tag, eq(tag.id, financialTransactionTag.tagId))
    .where(
      and(
        eq(financialTransactionTag.organizationId, organizationId),
        inArray(financialTransactionTag.transactionId, transactionIds)
      )
    )
    .orderBy(asc(tag.name));

const groupBy = <T, K>(items: T[], key: (item: T) => K): Map<K, T[]> => {
  const groups = new Map<K, T[]>();
  for (const item of items) {
    const group = groups.get(key(item));
    if (group) {
      group.push(item);
    } else {
      groups.set(key(item), [item]);
    }
  }
  return groups;
};

/**
 * Tags, splits and transfers for a page of rows: one query each, so a list
 * costs the same few round trips at 10 rows as at 100.
 */
const withDetailsList = async <T extends TransactionRow>(
  db: Database,
  organizationId: string,
  rows: T[]
) => {
  const ids = rows.map((row) => row.id);
  const transferIds = [
    ...new Set(rows.flatMap((row) => (row.transferId ? [row.transferId] : []))),
  ];
  const [tags, splits, transfers] =
    ids.length === 0
      ? [[], [], []]
      : await Promise.all([
          transactionTags(db, organizationId, ids),
          transactionSplits(db, organizationId, ids),
          listTransfers(db, organizationId, transferIds),
        ]);
  const tagsByTransaction = groupBy(tags, (row) => row.transactionId);
  const splitsByTransaction = groupBy(splits, (row) => row.transactionId);
  const transferById = new Map(
    transfers.map((transfer) => [transfer.id, transfer])
  );

  return rows.map((row) => ({
    ...row,
    splits: (splitsByTransaction.get(row.id) ?? []).map(
      ({ transactionId: _transactionId, ...split }) => split
    ),
    tags: (tagsByTransaction.get(row.id) ?? []).map(
      ({ transactionId: _transactionId, ...rowTag }) => rowTag
    ),
    transfer: row.transferId
      ? (transferById.get(row.transferId) ?? null)
      : null,
  }));
};

export const withDetails = async <T extends TransactionRow>(
  db: Database,
  row: T
) => {
  const [detailed] = await withDetailsList(db, row.organizationId, [row]);
  if (!detailed) {
    throw notFound("Transaction");
  }
  return detailed;
};

export const transactionQuery = (db: Database) =>
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
    .leftJoin(
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

/** One income, expense or transfer posting with its tags, splits and transfer. */
export const getTransaction = async (
  db: Database,
  organizationId: string,
  transactionId: string
) => {
  const [result] = await transactionQuery(db)
    .where(
      and(
        eq(financialTransaction.id, transactionId),
        eq(financialTransaction.organizationId, organizationId)
      )
    )
    .limit(1);

  if (!result) {
    throw notFound("Transaction");
  }

  return withDetails(db, result);
};

export const listTransactions = async (
  db: Database,
  organizationId: string,
  input: TransactionListInput
) => {
  const conditions = transactionListConditions(db, organizationId, input);
  const orderBy = transactionOrderBy(input);

  const [rows, countRows] = await Promise.all([
    transactionQuery(db)
      .where(and(...conditions))
      .orderBy(...orderBy)
      .limit(input.pageSize)
      .offset((input.page - 1) * input.pageSize),
    db
      .select({ total: count() })
      .from(financialTransaction)
      .leftJoin(
        financialAccount,
        eq(financialAccount.id, financialTransaction.accountId)
      )
      .leftJoin(category, eq(category.id, financialTransaction.categoryId))
      .where(and(...conditions)),
  ]);

  const total = countRows[0]?.total ?? 0;
  const items = await withDetailsList(db, organizationId, rows);
  const groups: { month: string; items: typeof items }[] = [];
  if (input.sortBy === "date") {
    for (const item of items) {
      const month = item.transactionDate.slice(0, 7);
      const last = groups.at(-1);
      if (last?.month === month) {
        last.items.push(item);
      } else {
        groups.push({ items: [item], month });
      }
    }
  }

  return {
    groups,
    items,
    page: input.page,
    pageSize: input.pageSize,
    total,
    totalPages: Math.ceil(total / input.pageSize),
  };
};

export const transactionTotals = async (
  db: Database,
  organizationId: string,
  input: TransactionFilterInput
) => {
  const conditions = transactionListConditions(db, organizationId, input);

  const [countRows, currencies] = await Promise.all([
    db
      .select({ total: count() })
      .from(financialTransaction)
      .leftJoin(
        financialAccount,
        eq(financialAccount.id, financialTransaction.accountId)
      )
      .leftJoin(category, eq(category.id, financialTransaction.categoryId))
      .where(and(...conditions)),
    db
      .select({
        currencyCode: financialTransaction.currencyCode,
        expense: expenseTotal,
        income: incomeTotal,
      })
      .from(financialTransaction)
      .leftJoin(
        financialAccount,
        eq(financialAccount.id, financialTransaction.accountId)
      )
      .leftJoin(category, eq(category.id, financialTransaction.categoryId))
      .where(
        and(
          ...conditions,
          isNull(financialTransaction.transferId),
          isNull(financialTransaction.reconciliationSnapshotId)
        )
      )
      .groupBy(financialTransaction.currencyCode)
      .orderBy(asc(financialTransaction.currencyCode)),
  ]);

  return { count: countRows[0]?.total ?? 0, currencies };
};

export const transactionSummary = async (
  db: Database,
  organizationId: string,
  input: { accountIds: string[]; dateFrom: string; dateTo: string }
) => {
  const [cashFlow, categories] = await Promise.all([
    getMonthlyCashFlow(db, organizationId, input),
    getCategoryTotals(db, organizationId, input),
  ]);

  return { cashFlow, categories };
};
