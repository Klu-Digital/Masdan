import { householdToday, presetRange } from "@masdan/api/reports/periods";
import type { ReportPreset } from "@masdan/api/reports/periods";

import { categoryOf } from "./ledger";
import { db } from "./store";
import type { Category, Transaction } from "./store";
import { badRequest, scaled, text } from "./util";

export interface LedgerRange {
  accountIds?: string[];
  dateFrom: string;
  dateTo: string;
}

export interface PeriodInput {
  dateFrom?: string;
  dateTo?: string;
  preset?: ReportPreset;
}

export const today = (): string =>
  householdToday(db().household.timezone, new Date());

const earliestLedgerDate = (): string | null => {
  const dates = [
    ...db().accounts.map((row) => row.openingBalanceDate),
    ...db()
      .transactions.filter((row) => row.archivedAt === null)
      .map((row) => row.transactionDate),
  ];
  return dates.toSorted()[0] ?? null;
};

/** `resolveReportPeriod` in packages/api/src/reports/reports.queries.ts. */
export const resolvePeriod = (input: PeriodInput | undefined) => {
  const preset = input?.preset ?? "this_month";
  const day = today();
  if (preset === "custom") {
    if (!(input?.dateFrom && input.dateTo)) {
      throw badRequest("A custom period needs a start and an end date");
    }
    return {
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
      preset,
      today: day,
    };
  }
  const earliest = preset === "all_time" ? earliestLedgerDate() : null;
  return { ...presetRange(preset, day, earliest), preset, today: day };
};

// Transfers and reconciliation adjustments are never income or spending.
const flowPostings = (range: LedgerRange): Transaction[] =>
  db().transactions.filter(
    (row) =>
      row.archivedAt === null &&
      row.transferId === null &&
      row.reconciliationSnapshotId === null &&
      row.transactionDate >= range.dateFrom &&
      row.transactionDate <= range.dateTo &&
      (!range.accountIds?.length ||
        range.accountIds.includes(row.accountId ?? ""))
  );

interface Line {
  amount: bigint;
  category: Category;
  posting: Transaction;
}

/** A split posting counts once per split, toward each split's category. */
const linesOf = (posting: Transaction): Line[] => {
  const parts =
    posting.splits.length > 0
      ? posting.splits
      : [{ amount: posting.amount, categoryId: posting.categoryId ?? "" }];
  return parts.flatMap((part) => {
    const category = categoryOf(part.categoryId);
    return category ? [{ amount: scaled(part.amount), category, posting }] : [];
  });
};

export const flowLines = (
  range: LedgerRange,
  type?: Category["type"]
): Line[] =>
  flowPostings(range)
    .flatMap(linesOf)
    .filter((line) => type === undefined || line.category.type === type);

interface Flow {
  expense: bigint;
  income: bigint;
}

const flowText = (flow: Flow) => ({
  expense: text(flow.expense),
  income: text(flow.income),
  net: text(flow.income - flow.expense),
});

/** Income and expense by the posting's own category, not its splits. */
const addFlow = (
  flows: Map<string, Flow>,
  key: string,
  posting: Transaction
) => {
  const type = categoryOf(posting.categoryId)?.type;
  if (!type) {
    return;
  }
  const flow = flows.get(key) ?? { expense: 0n, income: 0n };
  flow[type] += scaled(posting.amount);
  flows.set(key, flow);
};

export const monthlyCashFlow = (range: LedgerRange) => {
  const flows = new Map<string, Flow>();
  for (const posting of flowPostings(range)) {
    addFlow(
      flows,
      `${posting.transactionDate.slice(0, 7)}|${posting.currencyCode}`,
      posting
    );
  }
  return [...flows]
    .toSorted(([a], [b]) => a.localeCompare(b))
    .map(([key, flow]) => {
      const [month = "", currencyCode = ""] = key.split("|");
      return { currencyCode, month, ...flowText(flow) };
    });
};

export const cashFlowTotals = (range: LedgerRange) => {
  const flows = new Map<string, Flow>();
  for (const posting of flowPostings(range)) {
    addFlow(flows, posting.currencyCode, posting);
  }
  return [...flows]
    .toSorted(([a], [b]) => a.localeCompare(b))
    .map(([currencyCode, flow]) => ({ currencyCode, ...flowText(flow) }));
};

/** `getCategoryTotals`: split-aware, largest first. */
export const categoryTotals = (range: LedgerRange, type?: Category["type"]) => {
  const totals = new Map<
    string,
    {
      category: Category;
      currencyCode: string;
      ids: Set<string>;
      total: bigint;
    }
  >();
  for (const line of flowLines(range, type)) {
    const key = `${line.category.id}|${line.posting.currencyCode}`;
    const entry = totals.get(key) ?? {
      category: line.category,
      currencyCode: line.posting.currencyCode,
      ids: new Set<string>(),
      total: 0n,
    };
    entry.ids.add(line.posting.id);
    entry.total += line.amount;
    totals.set(key, entry);
  }
  return [...totals.values()]
    .toSorted(
      (a, b) =>
        Number(b.total - a.total) ||
        a.category.name.localeCompare(b.category.name) ||
        a.currencyCode.localeCompare(b.currencyCode)
    )
    .map((entry) => ({
      categoryId: entry.category.id,
      color: entry.category.color,
      count: entry.ids.size,
      currencyCode: entry.currencyCode,
      icon: entry.category.icon,
      name: entry.category.name,
      total: text(entry.total),
      type: entry.category.type,
    }));
};

export const spendingTotals = (range: LedgerRange) => {
  const totals = new Map<string, bigint>();
  for (const line of flowLines(range, "expense")) {
    const code = line.posting.currencyCode;
    totals.set(code, (totals.get(code) ?? 0n) + line.amount);
  }
  return [...totals]
    .toSorted(([a], [b]) => a.localeCompare(b))
    .map(([currencyCode, total]) => ({ currencyCode, total: text(total) }));
};
