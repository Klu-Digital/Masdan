import type { Database } from "@masdan/db";
import {
  category,
  financialAccount,
  financialTransaction,
} from "@masdan/db/schema/index";
import { and, asc, count, desc, eq, isNull } from "drizzle-orm";

import { getAccountBalances } from "../accounts/balances";
import type { ReportPreset } from "../reports/periods";
import { householdToday } from "../reports/periods";
import {
  expenseTotal,
  getCashFlow,
  getCategoryTotals,
  getNetWorth,
  getNetWorthHistory,
  incomeTotal,
  resolveReportPeriod,
} from "../reports/reports.queries";
import { householdSettings } from "../shared/household";
import {
  fixedAmountText,
  formatDisplayMoney,
  signedScaledAmount,
} from "../shared/money";
import { transactionListConditions } from "../transactions/transactions.queries";
import type { AskHousehold, AskKind, AskQuery } from "./ask.plan";

/**
 * Runs a resolved plan through the same queries the Reports and Transactions
 * screens use, and words the answer from their results. The model is not
 * involved here: every number and every sentence comes from the ledger.
 */

interface AskAmount {
  amount: string;
  currencyCode: string;
}

interface AskFigure {
  /** One per currency, household default first; never converted or mixed. */
  amounts: AskAmount[];
  label: string;
}

interface AskRow {
  amount: string;
  count: number | null;
  currencyCode: string;
  detail: string | null;
  id: string;
  label: string;
}

/** Enough to redo the answer by hand in the normal views. */
interface AskContext {
  account: string | null;
  /** Net worth answers are as of this household-local day. */
  asOf: string | null;
  category: string | null;
  kind: AskKind | null;
  period: { dateFrom: string; dateTo: string; preset: ReportPreset } | null;
  search: string | null;
}

type AskLink =
  | {
      search: {
        accountIds: string[];
        categoryIds: string[];
        dateFrom: string;
        dateTo: string;
        search: string;
        types: AskKind[];
      };
      to: "/transactions";
    }
  | { accountId: string; to: "/accounts/$accountId" }
  | { to: "/accounts" }
  | { to: "/reports" };

export interface AskAnswer {
  context: AskContext;
  figures: AskFigure[];
  headline: string;
  intent: AskQuery["intent"];
  link: AskLink;
  rows: AskRow[];
  rowsLabel: string | null;
}

/** Only this household's active accounts and categories can ever be matched. */
export const askHousehold = async (
  db: Database,
  organizationId: string,
  now: Date = new Date()
): Promise<AskHousehold> => {
  const [accounts, categories, settings] = await Promise.all([
    db
      .select({
        accountType: financialAccount.accountType,
        cardLastFour: financialAccount.cardLastFour,
        cardNetwork: financialAccount.cardNetwork,
        cardProductKey: financialAccount.cardProductKey,
        currencyCode: financialAccount.currencyCode,
        id: financialAccount.id,
        institution: financialAccount.institution,
        name: financialAccount.name,
      })
      .from(financialAccount)
      .where(
        and(
          eq(financialAccount.organizationId, organizationId),
          isNull(financialAccount.archivedAt)
        )
      )
      .orderBy(asc(financialAccount.name)),
    db
      .select({ id: category.id, name: category.name, type: category.type })
      .from(category)
      .where(
        and(
          eq(category.organizationId, organizationId),
          isNull(category.archivedAt)
        )
      )
      .orderBy(asc(category.sortOrder), asc(category.name)),
    householdSettings(db, organizationId),
  ]);
  return {
    accounts,
    categories: categories.flatMap((row) =>
      row.type === "expense" || row.type === "income"
        ? [{ ...row, type: row.type }]
        : []
    ),
    today: householdToday(settings.timezone, now),
  };
};

// --- Wording ----------------------------------------------------------------

const formatAmount = ({ amount, currencyCode }: AskAmount): string =>
  formatDisplayMoney(amount, currencyCode, "en-US");

const formatAmounts = (amounts: readonly AskAmount[]): string =>
  amounts.map(formatAmount).join(" and ");

const formatDate = (iso: string): string =>
  new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(`${iso}T00:00:00Z`));

const formatMonth = (month: string): string =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    timeZone: "UTC",
    year: "numeric",
  }).format(new Date(`${month}-01T00:00:00Z`));

const periodText = (period: { dateFrom: string; dateTo: string }): string =>
  period.dateFrom === period.dateTo
    ? `on ${formatDate(period.dateFrom)}`
    : `from ${formatDate(period.dateFrom)} to ${formatDate(period.dateTo)}`;

const filterText = (context: AskContext): string =>
  [
    context.category ? ` on ${context.category}` : "",
    context.search ? ` matching “${context.search}”` : "",
    context.account ? ` in ${context.account}` : "",
  ].join("");

const isZero = (amounts: readonly AskAmount[]): boolean =>
  amounts.every((item) => signedScaledAmount(item.amount) === 0n);

/** Household default first, then alphabetical, as the reports order them. */
const byCurrency =
  (defaultCurrency: string) => (left: AskAmount, right: AskAmount) =>
    Number(right.currencyCode === defaultCurrency) -
      Number(left.currencyCode === defaultCurrency) ||
    left.currencyCode.localeCompare(right.currencyCode);

const sumByCurrency = (
  rows: readonly AskAmount[],
  defaultCurrency: string
): AskAmount[] => {
  const totals = new Map<string, bigint>();
  for (const row of rows) {
    totals.set(
      row.currencyCode,
      (totals.get(row.currencyCode) ?? 0n) + signedScaledAmount(row.amount)
    );
  }
  return [...totals]
    .map(([currencyCode, total]) => ({
      amount: fixedAmountText(total),
      currencyCode,
    }))
    .toSorted(byCurrency(defaultCurrency));
};

// --- Queries ----------------------------------------------------------------

const TOP_CATEGORIES = 5;

interface Resolved {
  context: AskContext;
  defaultCurrency: string;
  range: { dateFrom: string; dateTo: string };
  today: string;
  timezone: string;
}

const nameOf = <Row extends { id: string; name: string }>(
  rows: readonly Row[],
  id: string | null
) => rows.find((row) => row.id === id)?.name ?? null;

const resolveContext = async (
  db: Database,
  organizationId: string,
  household: AskHousehold,
  query: AskQuery
): Promise<Resolved> => {
  const period = await resolveReportPeriod(
    db,
    organizationId,
    query.period ?? { preset: "this_month" }
  );
  return {
    context: {
      account: nameOf(household.accounts, query.accountId),
      asOf: null,
      category: nameOf(household.categories, query.categoryId),
      kind: null,
      period: query.period
        ? {
            dateFrom: period.dateFrom,
            dateTo: period.dateTo,
            preset: period.preset,
          }
        : null,
      search: query.search,
    },
    defaultCurrency: period.defaultCurrency,
    range: { dateFrom: period.dateFrom, dateTo: period.dateTo },
    timezone: period.timezone,
    today: period.today,
  };
};

const ledgerFilters = (query: AskQuery, range: Resolved["range"]) => ({
  accountIds: query.accountId ? [query.accountId] : [],
  categoryIds: query.categoryId ? [query.categoryId] : [],
  dateFrom: range.dateFrom,
  dateTo: range.dateTo,
  includeArchived: false,
  includeInterest: true,
  paidStatuses: [],
  search: query.search ?? "",
  tagIds: [],
  types: [query.kind],
});

const transactionsLink = (
  query: AskQuery,
  range: Resolved["range"],
  types: AskKind[]
): AskLink => ({
  search: {
    accountIds: query.accountId ? [query.accountId] : [],
    categoryIds: query.categoryId ? [query.categoryId] : [],
    dateFrom: range.dateFrom,
    dateTo: range.dateTo,
    search: query.search ?? "",
    types,
  },
  to: "/transactions",
});

/**
 * Spending or income. Without a text filter the totals are the Reports
 * screen's split-aware category totals; with one they are the Transactions
 * screen's filtered totals, which is where that filter lives.
 */
const flowAnswer = async (
  db: Database,
  organizationId: string,
  query: AskQuery,
  resolved: Resolved
): Promise<AskAnswer> => {
  const { context, defaultCurrency, range } = resolved;
  let amounts: AskAmount[];
  let rows: AskRow[] = [];
  let transactionCount: number | null = null;

  if (query.search) {
    const conditions = transactionListConditions(
      db,
      organizationId,
      ledgerFilters(query, range)
    );
    const totals = await db
      .select({
        amount: query.kind === "income" ? incomeTotal : expenseTotal,
        count: count(),
        currencyCode: financialTransaction.currencyCode,
      })
      .from(financialTransaction)
      .leftJoin(
        financialAccount,
        eq(financialAccount.id, financialTransaction.accountId)
      )
      .leftJoin(category, eq(category.id, financialTransaction.categoryId))
      .where(and(...conditions))
      .groupBy(financialTransaction.currencyCode);
    amounts = totals
      .map(({ amount, currencyCode }) => ({ amount, currencyCode }))
      .toSorted(byCurrency(defaultCurrency));
    transactionCount = totals.reduce((sum, row) => sum + row.count, 0);
  } else {
    const categories = await getCategoryTotals(
      db,
      organizationId,
      {
        accountIds: query.accountId ? [query.accountId] : [],
        dateFrom: range.dateFrom,
        dateTo: range.dateTo,
      },
      query.kind
    );
    const selected = query.categoryId
      ? categories.filter((row) => row.categoryId === query.categoryId)
      : categories;
    amounts = sumByCurrency(
      selected.map((row) => ({
        amount: row.total,
        currencyCode: row.currencyCode,
      })),
      defaultCurrency
    );
    if (query.categoryId) {
      transactionCount = selected.reduce((sum, row) => sum + row.count, 0);
    } else {
      rows = selected.slice(0, TOP_CATEGORIES).map((row) => ({
        amount: row.total,
        count: row.count,
        currencyCode: row.currencyCode,
        detail: null,
        id: `${row.categoryId}:${row.currencyCode}`,
        label: row.name,
      }));
    }
  }

  const verb = query.kind === "income" ? "received" : "spent";
  const noun = query.kind === "income" ? "income" : "spending";
  const counted =
    transactionCount === null
      ? ""
      : ` across ${transactionCount} transaction${transactionCount === 1 ? "" : "s"}`;
  const headline =
    amounts.length === 0 || isZero(amounts)
      ? `You have no ${noun}${filterText(context)} ${periodText(range)}.`
      : `You ${verb} ${formatAmounts(amounts)}${filterText(context)} ${periodText(range)}${counted}.`;

  return {
    context: { ...context, kind: query.kind },
    figures: [
      {
        amounts,
        label: query.kind === "income" ? "Income" : "Spending",
      },
    ],
    headline,
    intent: query.intent,
    link: transactionsLink(query, range, [query.kind]),
    rows,
    rowsLabel: rows.length > 0 ? "Top categories" : null,
  };
};

const cashFlowAnswer = async (
  db: Database,
  organizationId: string,
  query: AskQuery,
  resolved: Resolved
): Promise<AskAnswer> => {
  const { context, defaultCurrency, range } = resolved;
  const report = await getCashFlow(db, organizationId, {
    accountIds: query.accountId ? [query.accountId] : [],
    dateFrom: range.dateFrom,
    dateTo: range.dateTo,
  });
  const totals = report.totals.toSorted((left, right) =>
    byCurrency(defaultCurrency)(
      { amount: left.net, currencyCode: left.currencyCode },
      { amount: right.net, currencyCode: right.currencyCode }
    )
  );
  const pick = (field: "expense" | "income" | "net") =>
    totals.map((total) => ({
      amount: total[field],
      currencyCode: total.currencyCode,
    }));
  const headline =
    totals.length === 0
      ? `You have no income or spending${filterText(context)} ${periodText(range)}.`
      : [
          `${periodText(range).replace(/^./u, (letter) => letter.toUpperCase())}${filterText(context)}`,
          `you received ${formatAmounts(pick("income"))}`,
          `spent ${formatAmounts(pick("expense"))}`,
          `net ${formatAmounts(pick("net"))}.`,
        ].join(", ");
  const rows =
    report.months.length > 1
      ? report.monthly.map((month) => ({
          amount: month.net,
          count: null,
          currencyCode: month.currencyCode,
          detail: `In ${formatAmount({ amount: month.income, currencyCode: month.currencyCode })} · Out ${formatAmount({ amount: month.expense, currencyCode: month.currencyCode })}`,
          id: `${month.month}:${month.currencyCode}`,
          label: formatMonth(month.month),
        }))
      : [];
  return {
    context: { ...context, category: null, search: null },
    figures: [
      { amounts: pick("income"), label: "Income" },
      { amounts: pick("expense"), label: "Spending" },
      { amounts: pick("net"), label: "Net" },
    ],
    headline,
    intent: query.intent,
    link: transactionsLink(
      { ...query, categoryId: null, search: null },
      range,
      []
    ),
    rows,
    rowsLabel: rows.length > 0 ? "Net by month" : null,
  };
};

const largestAnswer = async (
  db: Database,
  organizationId: string,
  query: AskQuery,
  resolved: Resolved
): Promise<AskAnswer> => {
  const { context, range } = resolved;
  const conditions = transactionListConditions(
    db,
    organizationId,
    ledgerFilters(query, range)
  );
  const records = await db
    .select({
      accountName: financialAccount.name,
      amount: financialTransaction.amount,
      categoryName: category.name,
      currencyCode: financialTransaction.currencyCode,
      id: financialTransaction.id,
      notes: financialTransaction.notes,
      transactionDate: financialTransaction.transactionDate,
    })
    .from(financialTransaction)
    .leftJoin(
      financialAccount,
      eq(financialAccount.id, financialTransaction.accountId)
    )
    .leftJoin(category, eq(category.id, financialTransaction.categoryId))
    .where(and(...conditions))
    .orderBy(
      desc(financialTransaction.amount),
      desc(financialTransaction.transactionDate),
      desc(financialTransaction.id)
    )
    .limit(query.limit);

  const noun = query.kind === "income" ? "income" : "expense";
  const headline =
    records.length === 0
      ? `You have no ${noun} transactions${filterText(context)} ${periodText(range)}.`
      : `Your ${records.length === 1 ? `largest ${noun}` : `${records.length} largest ${noun}s`}${filterText(context)} ${periodText(range)}.`;
  return {
    context: { ...context, kind: query.kind },
    figures: [],
    headline,
    intent: query.intent,
    link: transactionsLink(query, range, [query.kind]),
    rows: records.map((record) => ({
      amount: record.amount,
      count: null,
      currencyCode: record.currencyCode,
      detail: [
        formatDate(record.transactionDate),
        record.categoryName,
        record.accountName,
      ]
        .filter(Boolean)
        .join(" · "),
      id: record.id,
      label: record.notes || record.categoryName || "Transaction",
    })),
    rowsLabel: records.length > 0 ? "Transactions" : null,
  };
};

const netWorthAnswer = async (
  db: Database,
  organizationId: string,
  query: AskQuery,
  resolved: Resolved
): Promise<AskAnswer> => {
  const { context, range, timezone, today } = resolved;
  let positions: {
    assets: string;
    currencyCode: string;
    liabilities: string;
    netWorth: string;
  }[];
  let asOf: string | null = null;
  if (query.period) {
    // A past date reads the history series at that one day; the future is today.
    asOf = range.dateTo < today ? range.dateTo : today;
    const history = await getNetWorthHistory(
      db,
      organizationId,
      { dateFrom: asOf, dateTo: asOf, timezone, today },
      "day"
    );
    positions = history.points[0]?.positions ?? [];
  } else {
    ({ positions } = await getNetWorth(db, organizationId));
  }
  const pick = (field: "assets" | "liabilities" | "netWorth") =>
    positions
      .map((position) => ({
        amount: position[field],
        currencyCode: position.currencyCode,
      }))
      .toSorted(byCurrency(resolved.defaultCurrency));
  let headline = `No accounts count toward your net worth${asOf ? ` on ${formatDate(asOf)}` : ""}.`;
  if (positions.length > 0) {
    headline = asOf
      ? `Your net worth on ${formatDate(asOf)} was ${formatAmounts(pick("netWorth"))}.`
      : `Your net worth is ${formatAmounts(pick("netWorth"))}.`;
  }
  return {
    context: {
      ...context,
      account: null,
      asOf: asOf ?? today,
      category: null,
      period: null,
      search: null,
    },
    figures: [
      { amounts: pick("netWorth"), label: "Net worth" },
      { amounts: pick("assets"), label: "Assets" },
      { amounts: pick("liabilities"), label: "Liabilities" },
    ],
    headline,
    intent: query.intent,
    link: { to: "/reports" },
    rows: [],
    rowsLabel: null,
  };
};

const balancesAnswer = async (
  db: Database,
  organizationId: string,
  query: AskQuery,
  resolved: Resolved
): Promise<AskAnswer> => {
  const { context, defaultCurrency, today } = resolved;
  const accounts = await db
    .select({
      accountClass: financialAccount.accountClass,
      currencyCode: financialAccount.currencyCode,
      id: financialAccount.id,
      name: financialAccount.name,
    })
    .from(financialAccount)
    .where(
      and(
        eq(financialAccount.organizationId, organizationId),
        isNull(financialAccount.archivedAt),
        query.accountId ? eq(financialAccount.id, query.accountId) : undefined
      )
    )
    .orderBy(asc(financialAccount.name));
  const balances = await getAccountBalances(
    db,
    organizationId,
    accounts.map((account) => account.id)
  );
  const rowOf = (account: (typeof accounts)[number]): AskRow => ({
    amount: balances.get(account.id) ?? "0",
    count: null,
    currencyCode: account.currencyCode,
    detail: account.accountClass === "liability" ? "Owed" : null,
    id: account.id,
    label: account.name,
  });
  const rows = accounts.map(rowOf);

  const [only] = rows;
  let headline = "You have no active accounts.";
  if (query.accountId && only) {
    headline =
      only.detail === "Owed"
        ? `You owe ${formatAmount(only)} on ${only.label}.`
        : `${only.label} has ${formatAmount(only)}.`;
  } else if (rows.length > 0) {
    headline = `Balances of your ${rows.length} active account${rows.length === 1 ? "" : "s"}.`;
  }
  const byClass = (accountClass: "asset" | "liability") =>
    sumByCurrency(
      accounts
        .filter((account) => account.accountClass === accountClass)
        .map(rowOf),
      defaultCurrency
    );
  return {
    context: {
      ...context,
      asOf: today,
      category: null,
      period: null,
      search: null,
    },
    figures: query.accountId
      ? []
      : [
          { amounts: byClass("asset"), label: "In accounts" },
          { amounts: byClass("liability"), label: "Owed" },
        ],
    headline,
    intent: query.intent,
    link:
      query.accountId && only
        ? { accountId: only.id, to: "/accounts/$accountId" }
        : { to: "/accounts" },
    rows: query.accountId ? [] : rows,
    rowsLabel: query.accountId || rows.length === 0 ? null : "Accounts",
  };
};

const ANSWERS = {
  account_balances: balancesAnswer,
  cash_flow: cashFlowAnswer,
  income: flowAnswer,
  largest_transactions: largestAnswer,
  net_worth: netWorthAnswer,
  spending: flowAnswer,
} satisfies Record<
  AskQuery["intent"],
  (
    db: Database,
    organizationId: string,
    query: AskQuery,
    resolved: Resolved
  ) => Promise<AskAnswer>
>;

/** `organizationId` is the caller's own; the plan carries names, never scope. */
export const runAskQuery = async (
  db: Database,
  organizationId: string,
  household: AskHousehold,
  query: AskQuery
): Promise<AskAnswer> => {
  const resolved = await resolveContext(db, organizationId, household, query);
  return ANSWERS[query.intent](db, organizationId, query, resolved);
};
