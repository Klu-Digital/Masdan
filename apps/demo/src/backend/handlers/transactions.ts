import { ruleApplicationHolds } from "@masdan/api/rules/engine";
import {
  transactionFilterValues,
  transactionListValues,
} from "@masdan/api/transactions/schema";
import type {
  TransactionFilterInput,
  TransactionListInput,
} from "@masdan/api/transactions/schema";

import type { RouterInputs } from "@/utils/orpc";

import { categoryTotals, monthlyCashFlow, today } from "../flows";
import {
  accountOf,
  categoryOf,
  transactionDetails,
  transactionRow,
} from "../ledger";
import type { Section } from "../router";
import { runnableRules } from "../rule-views";
import { db } from "../store";
import type { Transaction } from "../store";
import { badRequest, find, newId, notFound, scaled, text } from "../util";

type CreateInput = RouterInputs["transactions"]["create"];

const sourcePostingAccount = (transferId: string | null): string | null =>
  db().transactions.find(
    (row) => row.transferId === transferId && row.transferSide === "source"
  )?.accountId ?? null;

const searchable = (posting: Transaction): string[] => [
  posting.notes ?? "",
  accountOf(posting.accountId)?.name ?? "",
  categoryOf(posting.categoryId)?.name ?? "",
  ...posting.splits.map((split) => categoryOf(split.categoryId)?.name ?? ""),
  ...db()
    .tags.filter((tag) => posting.tagIds.includes(tag.id))
    .map((tag) => tag.name),
];

/** `transactionListConditions` in packages/api/src/transactions/transactions.queries.ts. */
// oxlint-disable-next-line complexity
const matches = (posting: Transaction, filter: TransactionFilterInput) => {
  const { accountIds } = filter;
  const isSource =
    posting.transferId === null || posting.transferSide === "source";
  if (accountIds.length === 0 && !isSource) {
    return false;
  }
  if (!filter.includeArchived && posting.archivedAt !== null) {
    return false;
  }
  if (accountIds.length > 0) {
    if (!accountIds.includes(posting.accountId ?? "")) {
      return false;
    }
    // Both ends of a transfer between listed accounts show once.
    if (
      accountIds.length > 1 &&
      !isSource &&
      accountIds.includes(sourcePostingAccount(posting.transferId) ?? "")
    ) {
      return false;
    }
  }
  if (
    filter.categoryIds.length > 0 &&
    !filter.categoryIds.includes(posting.categoryId ?? "") &&
    !posting.splits.some((split) =>
      filter.categoryIds.includes(split.categoryId)
    )
  ) {
    return false;
  }
  if (filter.dateFrom && posting.transactionDate < filter.dateFrom) {
    return false;
  }
  if (filter.dateTo && posting.transactionDate > filter.dateTo) {
    return false;
  }
  if (
    filter.paidStatuses.length > 0 &&
    !filter.paidStatuses.includes(posting.paidStatus)
  ) {
    return false;
  }
  const type = categoryOf(posting.categoryId)?.type;
  if (filter.types.length > 0 && !(type && filter.types.includes(type))) {
    return false;
  }
  if (
    filter.tagIds.length > 0 &&
    !posting.tagIds.some((tagId) => filter.tagIds.includes(tagId))
  ) {
    return false;
  }
  if (filter.search) {
    const needle = filter.search.toLowerCase();
    return searchable(posting).some((value) =>
      value.toLowerCase().includes(needle)
    );
  }
  return true;
};

const compare = (input: TransactionListInput) => {
  const direction = input.sortDirection === "asc" ? 1 : -1;
  return (a: Transaction, b: Transaction): number => {
    const primary =
      input.sortBy === "amount"
        ? Number(scaled(a.amount) - scaled(b.amount))
        : a.transactionDate.localeCompare(b.transactionDate);
    const secondary =
      input.sortBy === "amount"
        ? a.transactionDate.localeCompare(b.transactionDate)
        : a.createdAt.getTime() - b.createdAt.getTime();
    return (
      direction * (Math.sign(primary) || Math.sign(secondary)) ||
      direction * a.id.localeCompare(b.id)
    );
  };
};

const editable = (transactionId: string): Transaction => {
  const posting = find(db().transactions, transactionId, "Transaction");
  if (posting.transferId !== null) {
    throw notFound("Transaction");
  }
  return posting;
};

const activeAccount = (accountId: string) => {
  const account = accountOf(accountId);
  if (!account || account.archivedAt !== null) {
    throw notFound("Financial account");
  }
  return account;
};

const validCategory = (categoryId: string, allowArchived: boolean) => {
  const category = categoryOf(categoryId);
  if (!category || (!allowArchived && category.archivedAt !== null)) {
    throw badRequest("Choose an active category");
  }
  return category;
};

const splitsOf = (input: Pick<CreateInput, "splits">) =>
  (input.splits ?? []).length > 1
    ? (input.splits ?? []).map((split) => ({
        amount: text(scaled(split.amount)),
        categoryId: split.categoryId,
        id: newId(),
      }))
    : [];

export const insertTransaction = (
  input: CreateInput,
  extra: Partial<Transaction> = {}
): Transaction => {
  const account = activeAccount(input.accountId);
  validCategory(input.categoryId, false);
  const now = new Date();
  const posting: Transaction = {
    accountId: account.id,
    adjustmentDirection: null,
    amount: text(scaled(input.amount)),
    archivedAt: null,
    categoryId:
      input.splits?.length === 1
        ? (input.splits[0]?.categoryId ?? input.categoryId)
        : input.categoryId,
    createdAt: now,
    createdByUserId: db().user.id,
    currencyCode: account.currencyCode,
    id: newId(),
    notes: input.notes ?? null,
    organizationId: db().household.id,
    paidStatus: input.paidStatus,
    reconciliationSnapshotId: null,
    recurringOccurrenceDate: null,
    recurringScheduleId: null,
    ruleApplication: null,
    splits: splitsOf(input),
    suggestionApplication: null,
    tagIds: input.tagIds ?? [],
    transactionDate: input.transactionDate,
    transferId: null,
    transferSide: null,
    updatedAt: now,
    ...extra,
  };
  db().transactions.push(posting);
  return posting;
};

export const updatePosting = (
  input: RouterInputs["transactions"]["update"],
  provenance: Pick<Transaction, "ruleApplication"> | null = null
): Transaction => {
  const posting = editable(input.transactionId);
  if (posting.reconciliationSnapshotId !== null) {
    throw badRequest(
      "Reconciliation adjustments cannot be edited. Archive the adjustment and reconcile again."
    );
  }
  const splits = input.splits ?? [];
  const categoryId =
    splits.length === 1
      ? (splits[0]?.categoryId ?? input.categoryId)
      : input.categoryId;
  validCategory(categoryId, categoryId === posting.categoryId);
  const account = input.accountId ? activeAccount(input.accountId) : null;
  const tagIds = input.tagIds ?? [];
  const keep = <A extends { categoryId: string | null; tagIds: string[] }>(
    application: A | null
  ): A | null =>
    application &&
    !(splits.length > 1 && application.categoryId !== null) &&
    ruleApplicationHolds(application, { categoryId, tagIds })
      ? application
      : null;
  Object.assign(posting, {
    accountId: account?.id ?? posting.accountId,
    amount: text(scaled(input.amount)),
    categoryId,
    currencyCode: account?.currencyCode ?? posting.currencyCode,
    notes: input.notes ?? null,
    paidStatus: input.paidStatus,
    ruleApplication: provenance
      ? provenance.ruleApplication
      : keep(posting.ruleApplication),
    splits: splitsOf(input),
    suggestionApplication: keep(posting.suggestionApplication),
    tagIds,
    transactionDate: input.transactionDate,
    updatedAt: new Date(),
  });
  return posting;
};

const setArchived = (transactionId: string, archived: boolean) => {
  const posting = editable(transactionId);
  posting.archivedAt = archived ? new Date() : null;
  posting.updatedAt = new Date();
  return transactionDetails(posting);
};

export const transactions: Section<"transactions"> = {
  archive: ({ transactionId }) => setArchived(transactionId, true),

  bulkUpdate: (input) => {
    const result = {
      categoryKept: [] as string[],
      skipped: [] as {
        message?: string;
        reason: "archived" | "invalid" | "not_found" | "split" | "transfer";
        transactionId: string;
      }[],
      updated: [] as string[],
    };
    const category = input.categoryId
      ? validCategory(input.categoryId, false)
      : null;
    for (const transactionId of input.transactionIds) {
      const posting = db().transactions.find((row) => row.id === transactionId);
      if (!posting) {
        result.skipped.push({ reason: "not_found", transactionId });
        continue;
      }
      if (posting.transferId !== null) {
        result.skipped.push({ reason: "transfer", transactionId });
        continue;
      }
      if (posting.archivedAt !== null) {
        result.skipped.push({ reason: "archived", transactionId });
        continue;
      }
      if (category) {
        const current = categoryOf(posting.categoryId);
        if (posting.splits.length > 0 || current?.type !== category.type) {
          result.categoryKept.push(transactionId);
        } else {
          posting.categoryId = category.id;
        }
      }
      const removed = new Set(input.removeTagIds);
      posting.tagIds = [
        ...new Set([
          ...posting.tagIds.filter((tagId) => !removed.has(tagId)),
          ...(input.addTagIds ?? []),
        ]),
      ];
      posting.updatedAt = new Date();
      result.updated.push(transactionId);
    }
    return result;
  },

  create: (input) => transactionRow(insertTransaction(input)),

  get: ({ transactionId }) => {
    const posting = find(db().transactions, transactionId, "Transaction");
    const { user } = db();
    return {
      ...transactionRow(posting),
      createdBy:
        posting.createdByUserId === user.id
          ? { id: user.id, image: user.image, name: user.name }
          : null,
    };
  },

  list: (raw) => {
    const input = transactionListValues.parse(raw ?? {});
    const rows = db()
      .transactions.filter((row) => matches(row, input))
      .toSorted(compare(input));
    const start = (input.page - 1) * input.pageSize;
    const items = rows.slice(start, start + input.pageSize).map(transactionRow);
    const groups: { items: typeof items; month: string }[] = [];
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
      total: rows.length,
      totalPages: Math.ceil(rows.length / input.pageSize),
    };
  },

  parseQuickEntry: async ({ text: note }) => {
    const [{ resolveQuickEntry }, { resolveQuickTransfer }] = await Promise.all(
      [
        import("@masdan/api/transactions/quick-entry"),
        import("@masdan/api/transactions/quick-transfer"),
      ]
    );
    const trimmed = note.trim();
    if (!trimmed) {
      throw badRequest("Describe the transaction first");
    }
    const household = {
      accounts: db()
        .accounts.filter((row) => row.archivedAt === null)
        .toSorted((a, b) => a.name.localeCompare(b.name)),
      categories: db()
        .categories.filter((row) => row.archivedAt === null)
        .toSorted(
          (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)
        ),
      today: today(),
    };
    return {
      ai: "unavailable" as const,
      ...(resolveQuickTransfer(trimmed, household, null) ??
        resolveQuickEntry(trimmed, household, null, runnableRules())),
    };
  },

  restore: ({ transactionId }) => setArchived(transactionId, false),

  summary: (input) => ({
    cashFlow: monthlyCashFlow(input),
    categories: categoryTotals(input),
  }),

  totals: (raw) => {
    const input = transactionFilterValues.parse(raw ?? {});
    const rows = db().transactions.filter((row) => matches(row, input));
    const flows = new Map<string, { expense: bigint; income: bigint }>();
    for (const row of rows) {
      const type = categoryOf(row.categoryId)?.type;
      if (row.transferId !== null || row.reconciliationSnapshotId !== null) {
        continue;
      }
      const flow = flows.get(row.currencyCode) ?? { expense: 0n, income: 0n };
      if (type) {
        flow[type] += scaled(row.amount);
      }
      flows.set(row.currencyCode, flow);
    }
    return {
      count: rows.length,
      currencies: [...flows]
        .toSorted(([a], [b]) => a.localeCompare(b))
        .map(([currencyCode, flow]) => ({
          currencyCode,
          expense: text(flow.expense),
          income: text(flow.income),
        })),
    };
  },

  update: (input) => transactionDetails(updatePosting(input)),
};
