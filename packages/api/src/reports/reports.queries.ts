import type { Database } from "@masdan/db";
import {
  category,
  financialAccount,
  financialTransaction,
  financialTransactionSplit,
} from "@masdan/db/schema/index";
import { ORPCError } from "@orpc/server";
import {
  and,
  asc,
  countDistinct,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lte,
  min,
  sql,
} from "drizzle-orm";
import type { SQL } from "drizzle-orm";

import {
  balanceCategory,
  balanceExpression,
  balancePostings,
} from "../accounts/balances";
import type { CategoryType } from "../categories/constants";
import { householdSettings } from "../shared/household";
import type { HouseholdSettings } from "../shared/household";
import {
  autoGranularity,
  historyPointCount,
  householdToday,
  monthsIn,
  presetRange,
} from "./periods";
import type { HistoryGranularity, ReportPeriod, ReportPreset } from "./periods";
import { savingsRate } from "./savings-rate";

export interface PeriodInput {
  dateFrom?: string;
  dateTo?: string;
  preset: ReportPreset;
}

/** The first calendar day the household's ledger says anything about. */
const earliestLedgerDate = async (
  db: Database,
  organizationId: string
): Promise<string | null> => {
  const [[accounts], [transactions]] = await Promise.all([
    db
      .select({ date: min(financialAccount.openingBalanceDate) })
      .from(financialAccount)
      .where(eq(financialAccount.organizationId, organizationId)),
    db
      .select({ date: min(financialTransaction.transactionDate) })
      .from(financialTransaction)
      .where(
        and(
          eq(financialTransaction.organizationId, organizationId),
          isNull(financialTransaction.archivedAt)
        )
      ),
  ]);
  const dates = [accounts?.date, transactions?.date].filter(
    (date): date is string => typeof date === "string"
  );
  return dates.toSorted()[0] ?? null;
};

/** Resolves a preset against the household's own "today", never the server's. */
export const resolveReportPeriod = async (
  db: Database,
  organizationId: string,
  input: PeriodInput,
  now: Date = new Date()
): Promise<ReportPeriod & HouseholdSettings> => {
  const settings = await householdSettings(db, organizationId);
  const today = householdToday(settings.timezone, now);
  if (input.preset === "custom") {
    if (!(input.dateFrom && input.dateTo)) {
      throw new ORPCError("BAD_REQUEST", {
        message: "A custom period needs a start and an end date",
      });
    }
    return {
      ...settings,
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
      preset: "custom",
      today,
    };
  }
  const earliest =
    input.preset === "all_time"
      ? await earliestLedgerDate(db, organizationId)
      : null;
  return {
    ...settings,
    ...presetRange(input.preset, today, earliest),
    preset: input.preset,
    today,
  };
};

/* ------------------------------------------------------------------ */
/* Net worth                                                           */
/* ------------------------------------------------------------------ */

/**
 * Current balances of the accounts net worth counts: active, included. No
 * `asOf`, so this matches the balances the accounts screen shows.
 */
const includedBalances = (db: Database, organizationId: string) =>
  db
    .select({
      accountClass: financialAccount.accountClass,
      accountType: financialAccount.accountType,
      balance: balanceExpression.as("balance"),
      currencyCode: financialAccount.currencyCode,
      liquidity: financialAccount.liquidity,
    })
    .from(financialAccount)
    .leftJoin(financialTransaction, balancePostings())
    .leftJoin(category, balanceCategory)
    .where(
      and(
        eq(financialAccount.organizationId, organizationId),
        isNull(financialAccount.archivedAt),
        eq(financialAccount.includeInNetWorth, true)
      )
    )
    .groupBy(financialAccount.id)
    .as("balances");

interface NetWorthPosition {
  accountCount: number;
  assets: string;
  currencyCode: string;
  illiquidAssets: string;
  liabilities: string;
  liquidAssets: string;
  /** Liquid assets minus every liability. */
  liquidNetWorth: string;
  netWorth: string;
  semiLiquidAssets: string;
  /** Assets with no liquidity classification. */
  unclassifiedAssets: string;
}

interface NetWorthTypeTotal {
  accountClass: string;
  accountCount: number;
  accountType: string;
  currencyCode: string;
  total: string;
}

export interface NetWorthReport {
  byType: NetWorthTypeTotal[];
  defaultCurrency: string;
  /** Default currency first, then alphabetical; never converted or mixed. */
  positions: NetWorthPosition[];
  today: string;
}

const money = (expression: SQL) =>
  sql<string>`coalesce(${expression}, 0)::text`;

export const getNetWorth = async (
  db: Database,
  organizationId: string,
  now: Date = new Date()
): Promise<NetWorthReport> => {
  const settings = await householdSettings(db, organizationId);
  const balances = includedBalances(db, organizationId);
  const asset = sql`${balances.accountClass} = 'asset'`;
  const assetWith = (liquidity: SQL) =>
    money(
      sql`sum(${balances.balance}) filter (where ${asset} and ${liquidity})`
    );

  const [positions, byType] = await Promise.all([
    db
      .select({
        accountCount: sql<number>`count(*)::int`,
        assets: money(sql`sum(${balances.balance}) filter (where ${asset})`),
        currencyCode: balances.currencyCode,
        illiquidAssets: assetWith(sql`${balances.liquidity} = 'illiquid'`),
        liabilities: money(
          sql`sum(${balances.balance}) filter (where not ${asset})`
        ),
        liquidAssets: assetWith(sql`${balances.liquidity} = 'liquid'`),
        liquidNetWorth: money(
          sql`coalesce(sum(${balances.balance}) filter (where ${asset} and ${balances.liquidity} = 'liquid'), 0) - coalesce(sum(${balances.balance}) filter (where not ${asset}), 0)`
        ),
        netWorth: money(
          sql`sum(case when ${asset} then ${balances.balance} else -${balances.balance} end)`
        ),
        semiLiquidAssets: assetWith(sql`${balances.liquidity} = 'semi_liquid'`),
        unclassifiedAssets: assetWith(sql`${balances.liquidity} is null`),
      })
      .from(balances)
      .groupBy(balances.currencyCode)
      .orderBy(
        desc(sql`${balances.currencyCode} = ${settings.defaultCurrency}`),
        asc(balances.currencyCode)
      ),
    db
      .select({
        accountClass: balances.accountClass,
        accountCount: sql<number>`count(*)::int`,
        accountType: balances.accountType,
        currencyCode: balances.currencyCode,
        total: money(sql`sum(${balances.balance})`),
      })
      .from(balances)
      .groupBy(
        balances.currencyCode,
        balances.accountClass,
        balances.accountType
      )
      .orderBy(
        desc(sql`${balances.currencyCode} = ${settings.defaultCurrency}`),
        asc(balances.currencyCode),
        asc(balances.accountClass),
        desc(sql`sum(${balances.balance})`),
        asc(balances.accountType)
      ),
  ]);

  return {
    byType,
    defaultCurrency: settings.defaultCurrency,
    positions,
    today: householdToday(settings.timezone, now),
  };
};

interface NetWorthHistoryPosition {
  assets: string;
  currencyCode: string;
  liabilities: string;
  liquidAssets: string;
  netWorth: string;
}

interface NetWorthHistoryPoint {
  date: string;
  positions: NetWorthHistoryPosition[];
}

export interface NetWorthHistory {
  dateFrom: string | null;
  dateTo: string | null;
  granularity: HistoryGranularity;
  points: NetWorthHistoryPoint[];
}

const MAX_HISTORY_POINTS = 1000;

const BUCKET_INTERVALS = {
  day: sql.raw("interval '1 day'"),
  month: sql.raw("interval '1 month'"),
  week: sql.raw("interval '1 week'"),
} as const satisfies Record<HistoryGranularity, SQL>;

interface HistoryRow extends Record<string, unknown> {
  assets: string;
  currency_code: string | null;
  date: string;
  liabilities: string;
  liquid_assets: string;
  net_worth: string;
}

/**
 * The shared balance formula as of each bucket end. An account counts from
 * its opening date until the household-local day it was archived.
 */
export const getNetWorthHistory = async (
  db: Database,
  organizationId: string,
  period: { dateFrom: string; dateTo: string; timezone: string; today: string },
  requested?: HistoryGranularity
): Promise<NetWorthHistory> => {
  const [first] = await db
    .select({ date: min(financialAccount.openingBalanceDate) })
    .from(financialAccount)
    .where(
      and(
        eq(financialAccount.organizationId, organizationId),
        eq(financialAccount.includeInNetWorth, true)
      )
    );
  const earliest = first?.date ?? null;
  const dateFrom =
    earliest !== null && earliest > period.dateFrom
      ? earliest
      : period.dateFrom;
  const dateTo = period.dateTo < period.today ? period.dateTo : period.today;
  const granularity = requested ?? autoGranularity(dateFrom, dateTo);

  if (earliest === null || dateFrom > dateTo) {
    return { dateFrom: null, dateTo: null, granularity, points: [] };
  }
  if (historyPointCount(dateFrom, dateTo, granularity) > MAX_HISTORY_POINTS) {
    throw new ORPCError("BAD_REQUEST", {
      message: "That range has too many points; pick a coarser granularity",
    });
  }

  const pointDate = sql`points.point_date`;
  const interval = BUCKET_INTERVALS[granularity];
  const archivedLocalDate = sql`(${financialAccount.archivedAt} at time zone ${period.timezone})::date`;
  const postings = balancePostings(pointDate) ?? sql`false`;
  const accountFilter =
    and(
      eq(financialAccount.organizationId, organizationId),
      eq(financialAccount.includeInNetWorth, true),
      lte(financialAccount.openingBalanceDate, pointDate),
      sql`(${financialAccount.archivedAt} is null or ${archivedLocalDate} > ${pointDate})`
    ) ?? sql`false`;
  const result = await db.execute<HistoryRow>(sql`
    with points as (
      select least(
        (bucket + ${interval} - interval '1 day')::date,
        ${dateTo}::date
      ) as point_date
      from generate_series(
        date_trunc(${granularity}, ${dateFrom}::timestamp),
        ${dateTo}::timestamp,
        ${interval}
      ) as bucket
    )
    select
      to_char(points.point_date, 'YYYY-MM-DD') as date,
      balances.currency_code,
      coalesce(sum(balances.balance) filter (where balances.account_class = 'asset'), 0)::text as assets,
      coalesce(sum(balances.balance) filter (where balances.account_class <> 'asset'), 0)::text as liabilities,
      coalesce(sum(balances.balance) filter (where balances.account_class = 'asset' and balances.liquidity = 'liquid'), 0)::text as liquid_assets,
      coalesce(sum(case when balances.account_class = 'asset' then balances.balance else -balances.balance end), 0)::text as net_worth
    from points
    left join lateral (
      select
        ${financialAccount.currencyCode} as currency_code,
        ${financialAccount.accountClass} as account_class,
        ${financialAccount.liquidity} as liquidity,
        ${balanceExpression} as balance
      from ${financialAccount}
      left join ${financialTransaction} on ${postings}
      left join ${category} on ${balanceCategory}
      where ${accountFilter}
      group by ${financialAccount.id}
    ) as balances on true
    group by points.point_date, balances.currency_code
    order by points.point_date, balances.currency_code
  `);

  const points: NetWorthHistoryPoint[] = [];
  for (const row of result.rows) {
    let point = points.at(-1);
    if (point?.date !== row.date) {
      point = { date: row.date, positions: [] };
      points.push(point);
    }
    if (row.currency_code !== null) {
      point.positions.push({
        assets: row.assets,
        currencyCode: row.currency_code,
        liabilities: row.liabilities,
        liquidAssets: row.liquid_assets,
        netWorth: row.net_worth,
      });
    }
  }
  return { dateFrom, dateTo, granularity, points };
};

/* ------------------------------------------------------------------ */
/* Cash flow and categories                                            */
/* ------------------------------------------------------------------ */

export interface LedgerRange {
  accountIds?: string[];
  dateFrom: string;
  dateTo: string;
}

/**
 * Income and expense events: categorized, unarchived, in range. Transfers
 * move money between the household's own accounts and are never counted.
 */
const flowConditions = (organizationId: string, range: LedgerRange) => {
  const conditions = [
    eq(financialTransaction.organizationId, organizationId),
    isNull(financialTransaction.archivedAt),
    isNull(financialTransaction.transferId),
    isNull(financialTransaction.reconciliationSnapshotId),
    gte(financialTransaction.transactionDate, range.dateFrom),
    lte(financialTransaction.transactionDate, range.dateTo),
  ];
  if (range.accountIds && range.accountIds.length > 0) {
    conditions.push(inArray(financialTransaction.accountId, range.accountIds));
  }
  return conditions;
};

const sumWhereType = (type: CategoryType) =>
  sql`sum(${financialTransaction.amount}) filter (where ${category.type} = ${type})`;
export const incomeTotal = money(sumWhereType("income"));
export const expenseTotal = money(sumWhereType("expense"));
const netTotal = money(
  sql`sum(case when ${category.type} = 'income' then ${financialTransaction.amount} else -${financialTransaction.amount} end)`
);
const transactionMonth = sql<string>`to_char(${financialTransaction.transactionDate}, 'YYYY-MM')`;

interface CashFlowMonth {
  currencyCode: string;
  expense: string;
  income: string;
  month: string;
  net: string;
  savingsRate: number | null;
}

interface CashFlowTotal {
  currencyCode: string;
  expense: string;
  income: string;
  net: string;
  savingsRate: number | null;
}

type CashFlowSqlMonth = Omit<CashFlowMonth, "savingsRate">;
type CashFlowSqlTotal = Omit<CashFlowTotal, "savingsRate">;

export const getMonthlyCashFlow = (
  db: Database,
  organizationId: string,
  range: LedgerRange
): Promise<CashFlowSqlMonth[]> =>
  db
    .select({
      currencyCode: financialTransaction.currencyCode,
      expense: expenseTotal,
      income: incomeTotal,
      month: transactionMonth,
      net: netTotal,
    })
    .from(financialTransaction)
    .innerJoin(category, eq(category.id, financialTransaction.categoryId))
    .where(and(...flowConditions(organizationId, range)))
    .groupBy(transactionMonth, financialTransaction.currencyCode)
    .orderBy(asc(transactionMonth), asc(financialTransaction.currencyCode));

const getCashFlowTotals = (
  db: Database,
  organizationId: string,
  range: LedgerRange
): Promise<CashFlowSqlTotal[]> =>
  db
    .select({
      currencyCode: financialTransaction.currencyCode,
      expense: expenseTotal,
      income: incomeTotal,
      net: netTotal,
    })
    .from(financialTransaction)
    .innerJoin(category, eq(category.id, financialTransaction.categoryId))
    .where(and(...flowConditions(organizationId, range)))
    .groupBy(financialTransaction.currencyCode)
    .orderBy(asc(financialTransaction.currencyCode));

export interface CashFlowReport {
  /** Every month the range touches, including ones with no activity. */
  months: string[];
  monthly: CashFlowMonth[];
  totals: CashFlowTotal[];
}

export const getCashFlow = async (
  db: Database,
  organizationId: string,
  range: LedgerRange
): Promise<CashFlowReport> => {
  const [monthly, totals] = await Promise.all([
    getMonthlyCashFlow(db, organizationId, range),
    getCashFlowTotals(db, organizationId, range),
  ]);
  return {
    monthly: monthly.map((row) => ({
      ...row,
      savingsRate: savingsRate(row.income, row.expense),
    })),
    months: monthsIn(range.dateFrom, range.dateTo),
    totals: totals.map((row) => ({
      ...row,
      savingsRate: savingsRate(row.income, row.expense),
    })),
  };
};

// A split parent's own category must not also receive the full amount.
const lineCategoryId = sql`coalesce(${financialTransactionSplit.categoryId}, ${financialTransaction.categoryId})`;
const lineAmount = sql`coalesce(${financialTransactionSplit.amount}, ${financialTransaction.amount})`;
const lineTotal = sql`coalesce(sum(${lineAmount}), 0)`;

const splitLines = eq(
  financialTransactionSplit.transactionId,
  financialTransaction.id
);
const lineCategory = (organizationId: string) =>
  and(
    eq(category.id, lineCategoryId),
    eq(category.organizationId, organizationId)
  );
const lineConditions = (
  organizationId: string,
  range: LedgerRange,
  type: CategoryType | undefined
) =>
  and(
    ...flowConditions(organizationId, range),
    type === undefined ? undefined : eq(category.type, type)
  );

export interface CategoryTotal {
  categoryId: string;
  color: string;
  count: number;
  currencyCode: string;
  icon: string;
  name: string;
  total: string;
  type: CategoryType;
}

/** Split-aware: each split line counts toward its own category. */
export const getCategoryTotals = (
  db: Database,
  organizationId: string,
  range: LedgerRange,
  type?: CategoryType
): Promise<CategoryTotal[]> =>
  db
    .select({
      categoryId: category.id,
      color: category.color,
      count: countDistinct(financialTransaction.id),
      currencyCode: financialTransaction.currencyCode,
      icon: category.icon,
      name: category.name,
      total: sql<string>`${lineTotal}::text`,
      type: sql<CategoryType>`${category.type}`,
    })
    .from(financialTransaction)
    .leftJoin(financialTransactionSplit, splitLines)
    .innerJoin(category, lineCategory(organizationId))
    .where(lineConditions(organizationId, range, type))
    .groupBy(category.id, financialTransaction.currencyCode)
    .orderBy(
      desc(lineTotal),
      asc(category.name),
      asc(financialTransaction.currencyCode)
    );

export interface SpendingReport {
  categories: CategoryTotal[];
  totals: { currencyCode: string; total: string }[];
}

export const getSpendingByCategory = async (
  db: Database,
  organizationId: string,
  range: LedgerRange
): Promise<SpendingReport> => {
  const [categories, totals] = await Promise.all([
    getCategoryTotals(db, organizationId, range, "expense"),
    db
      .select({
        currencyCode: financialTransaction.currencyCode,
        total: sql<string>`${lineTotal}::text`,
      })
      .from(financialTransaction)
      .leftJoin(financialTransactionSplit, splitLines)
      .innerJoin(category, lineCategory(organizationId))
      .where(lineConditions(organizationId, range, "expense"))
      .groupBy(financialTransaction.currencyCode)
      .orderBy(asc(financialTransaction.currencyCode)),
  ]);
  return { categories, totals };
};
