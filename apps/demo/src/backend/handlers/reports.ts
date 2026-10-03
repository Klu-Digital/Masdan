import { addDays } from "@masdan/api/recurring/recurrence";
import {
  autoGranularity,
  historyPointCount,
  monthStart,
  monthsIn,
} from "@masdan/api/reports/periods";
import type { HistoryGranularity } from "@masdan/api/reports/periods";
import { savingsRate } from "@masdan/api/reports/savings-rate";

import type { RouterOutputs } from "@/utils/orpc";

import {
  cashFlowTotals,
  categoryTotals,
  flowLines,
  monthlyCashFlow,
  resolvePeriod,
  spendingTotals,
  today,
} from "../flows";
import { accountView, postingDelta } from "../ledger";
import type { Section } from "../router";
import { db } from "../store";
import type { Account } from "../store";
import { badRequest, scaled, text } from "../util";
import { monthBudgets } from "./budgets";

type Outputs = RouterOutputs["reports"];

const MAX_HISTORY_POINTS = 1000;
const MAX_BUDGET_MONTHS = 36;

const publicPeriod = (period: ReturnType<typeof resolvePeriod>) => ({
  dateFrom: period.dateFrom,
  dateTo: period.dateTo,
  preset: period.preset,
  today: period.today,
});

const netWorthAccounts = (): Account[] =>
  db().accounts.filter(
    (row) => row.archivedAt === null && row.includeInNetWorth
  );

/** Default currency first, then alphabetical. */
const currencyOrder = (a: string, b: string): number => {
  const home = db().household.defaultCurrency;
  return Number(b === home) - Number(a === home) || a.localeCompare(b);
};

interface Position {
  accountCount: number;
  assets: bigint;
  liabilities: bigint;
  liquidity: Record<Account["liquidity"] & string, bigint>;
  unclassifiedAssets: bigint;
}

const emptyPosition = (): Position => ({
  accountCount: 0,
  assets: 0n,
  liabilities: 0n,
  liquidity: { illiquid: 0n, liquid: 0n, semi_liquid: 0n },
  unclassifiedAssets: 0n,
});

/** `getNetWorth` in packages/api/src/reports/reports.queries.ts. */
const netWorth = (): Outputs["netWorth"] => {
  const positions = new Map<string, Position>();
  const byType = new Map<
    string,
    { account: Account; count: number; total: bigint }
  >();
  for (const account of netWorthAccounts()) {
    const balance = scaled(accountView(account).balance);
    const position = positions.get(account.currencyCode) ?? emptyPosition();
    position.accountCount += 1;
    if (account.accountClass === "liability") {
      position.liabilities += balance;
    } else if (account.liquidity === null) {
      position.assets += balance;
      position.unclassifiedAssets += balance;
    } else {
      position.assets += balance;
      position.liquidity[account.liquidity] += balance;
    }
    positions.set(account.currencyCode, position);
    const key = `${account.currencyCode}|${account.accountClass}|${account.accountType}`;
    const type = byType.get(key) ?? { account, count: 0, total: 0n };
    type.count += 1;
    type.total += balance;
    byType.set(key, type);
  }
  return {
    byType: [...byType.values()]
      .toSorted(
        (a, b) =>
          currencyOrder(a.account.currencyCode, b.account.currencyCode) ||
          a.account.accountClass.localeCompare(b.account.accountClass) ||
          Number(b.total - a.total) ||
          a.account.accountType.localeCompare(b.account.accountType)
      )
      .map(({ account, count, total }) => ({
        accountClass: account.accountClass,
        accountCount: count,
        accountType: account.accountType,
        currencyCode: account.currencyCode,
        total: text(total),
      })),
    defaultCurrency: db().household.defaultCurrency,
    positions: [...positions]
      .toSorted(([a], [b]) => currencyOrder(a, b))
      .map(([currencyCode, position]) => ({
        accountCount: position.accountCount,
        assets: text(position.assets),
        currencyCode,
        illiquidAssets: text(position.liquidity.illiquid),
        liabilities: text(position.liabilities),
        liquidAssets: text(position.liquidity.liquid),
        liquidNetWorth: text(position.liquidity.liquid - position.liabilities),
        netWorth: text(position.assets - position.liabilities),
        semiLiquidAssets: text(position.liquidity.semi_liquid),
        unclassifiedAssets: text(position.unclassifiedAssets),
      })),
    today: today(),
  };
};

const BUCKET_STEP: Record<HistoryGranularity, (date: string) => string> = {
  day: (date) => addDays(date, 1),
  month: (date) => monthStart(date, 1),
  week: (date) => addDays(date, 7),
};

const bucketStart = (date: string, granularity: HistoryGranularity): string => {
  if (granularity === "month") {
    return monthStart(date);
  }
  if (granularity === "week") {
    // Postgres weeks start on Monday.
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    return addDays(date, -((weekday + 6) % 7));
  }
  return date;
};

/** Each point is the balance at the end of its bucket, capped at the range end. */
const historyPoints = (
  dateFrom: string,
  dateTo: string,
  granularity: HistoryGranularity
): string[] => {
  const points: string[] = [];
  for (
    let bucket = bucketStart(dateFrom, granularity);
    bucket <= dateTo;
    bucket = BUCKET_STEP[granularity](bucket)
  ) {
    const end = addDays(BUCKET_STEP[granularity](bucket), -1);
    points.push(end < dateTo ? end : dateTo);
  }
  return points;
};

const netWorthHistory = (
  dateFrom: string,
  dateTo: string,
  requested: HistoryGranularity | undefined
) => {
  const accounts = db().accounts.filter((row) => row.includeInNetWorth);
  const earliest =
    accounts.map((row) => row.openingBalanceDate).toSorted()[0] ?? null;
  const from = earliest !== null && earliest > dateFrom ? earliest : dateFrom;
  const to = dateTo < today() ? dateTo : today();
  const granularity = requested ?? autoGranularity(from, to);
  if (earliest === null || from > to) {
    return { dateFrom: null, dateTo: null, granularity, points: [] };
  }
  if (historyPointCount(from, to, granularity) > MAX_HISTORY_POINTS) {
    throw badRequest(
      "That range has too many points; pick a coarser granularity"
    );
  }
  const { timezone } = db().household;
  const deltas = new Map(
    accounts.map((account) => [
      account.id,
      db()
        .transactions.filter(
          (row) =>
            row.accountId === account.id &&
            row.archivedAt === null &&
            row.transactionDate >= account.openingBalanceDate
        )
        .map((row) => ({
          date: row.transactionDate,
          delta: postingDelta(row, account),
        })),
    ])
  );
  const points = historyPoints(from, to, granularity).map((date) => {
    const positions = new Map<
      string,
      { assets: bigint; liabilities: bigint; liquidAssets: bigint }
    >();
    for (const account of accounts) {
      const archivedOn = account.archivedAt
        ? new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(
            account.archivedAt
          )
        : null;
      if (
        account.openingBalanceDate > date ||
        (archivedOn !== null && archivedOn <= date)
      ) {
        continue;
      }
      let balance = scaled(account.openingBalance);
      for (const row of deltas.get(account.id) ?? []) {
        if (row.date <= date) {
          balance += row.delta;
        }
      }
      const position = positions.get(account.currencyCode) ?? {
        assets: 0n,
        liabilities: 0n,
        liquidAssets: 0n,
      };
      if (account.accountClass === "asset") {
        position.assets += balance;
        if (account.liquidity === "liquid") {
          position.liquidAssets += balance;
        }
      } else {
        position.liabilities += balance;
      }
      positions.set(account.currencyCode, position);
    }
    return {
      date,
      positions: [...positions]
        .toSorted(([a], [b]) => a.localeCompare(b))
        .map(([currencyCode, position]) => ({
          assets: text(position.assets),
          currencyCode,
          liabilities: text(position.liabilities),
          liquidAssets: text(position.liquidAssets),
          netWorth: text(position.assets - position.liabilities),
        })),
    };
  });
  return { dateFrom: from, dateTo: to, granularity, points };
};

const performanceTotals = (
  lines: { budgeted: string; currencyCode: string; spent: string }[]
) => {
  const sums = new Map<string, { budgeted: bigint; spent: bigint }>();
  for (const line of lines) {
    const entry = sums.get(line.currencyCode) ?? { budgeted: 0n, spent: 0n };
    entry.budgeted += scaled(line.budgeted);
    entry.spent += scaled(line.spent);
    sums.set(line.currencyCode, entry);
  }
  return [...sums]
    .toSorted(([a], [b]) => currencyOrder(a, b))
    .map(([currencyCode, entry]) => ({
      budgeted: text(entry.budgeted),
      currencyCode,
      spent: text(entry.spent),
      variance: text(entry.budgeted - entry.spent),
    }));
};

export const reports: Section<"reports"> = {
  budgetPerformance: (input) => {
    const period = resolvePeriod(input);
    const currentMonth = monthStart(period.today);
    const budgeted = [
      ...new Set(
        db()
          .budgets.map((row) => row.month)
          .filter(
            (month) =>
              month >= `${period.dateFrom.slice(0, 7)}-01` &&
              month <= period.dateTo &&
              month <= currentMonth
          )
      ),
    ].toSorted((a, b) => b.localeCompare(a));
    const months = budgeted
      .slice(0, MAX_BUDGET_MONTHS)
      .toReversed()
      .map((month) => {
        const lines = monthBudgets(month.slice(0, 7)).lines.flatMap((line) =>
          line.budget
            ? [
                {
                  archived: line.category.archivedAt !== null,
                  budgeted: line.budget.amount,
                  categoryId: line.category.id,
                  color: line.category.color,
                  currencyCode: line.currencyCode,
                  icon: line.category.icon,
                  name: line.category.name,
                  percentUsed: line.percentUsed ?? 0,
                  spent: line.spent,
                  status:
                    line.status === "overspent"
                      ? ("overspent" as const)
                      : ("within" as const),
                  variance: text(
                    scaled(line.budget.amount) - scaled(line.spent)
                  ),
                },
              ]
            : []
        );
        return {
          lines,
          month: month.slice(0, 7),
          totals: performanceTotals(lines),
        };
      });
    return {
      defaultCurrency: db().household.defaultCurrency,
      months,
      period: publicPeriod(period),
      totals: performanceTotals(months.flatMap((month) => month.lines)),
      truncated: budgeted.length > MAX_BUDGET_MONTHS,
    };
  },

  cashFlow: (input) => {
    const period = resolvePeriod(input);
    const range = { ...period, accountIds: input.accountIds };
    return {
      defaultCurrency: db().household.defaultCurrency,
      monthly: monthlyCashFlow(range).map((row) => ({
        ...row,
        savingsRate: savingsRate(row.income, row.expense),
      })),
      months: monthsIn(period.dateFrom, period.dateTo),
      period: publicPeriod(period),
      totals: cashFlowTotals(range).map((row) => ({
        ...row,
        savingsRate: savingsRate(row.income, row.expense),
      })),
    };
  },

  // One currency, so consolidating is the identity.
  consolidatedNetWorth: () => {
    const report = netWorth();
    const home = db().household.defaultCurrency;
    const position = report.positions.find((row) => row.currencyCode === home);
    return {
      accounts: netWorthAccounts().map((account) => {
        const { balance } = accountView(account);
        return {
          accountClass: account.accountClass,
          accountId: account.id,
          accountType: account.accountType,
          balance,
          convertedBalance: account.currencyCode === home ? balance : null,
          currencyCode: account.currencyCode,
        };
      }),
      assets: position?.assets ?? text(0n),
      defaultCurrency: home,
      liabilities: position?.liabilities ?? text(0n),
      netWorth: position?.netWorth ?? text(0n),
      rates: [
        {
          currencyCode: home,
          rate: "1",
          rateDate: report.today,
          source: "identity" as const,
          status: "ok" as const,
        },
      ],
      status: "complete" as const,
      today: report.today,
      unconverted: [],
    };
  },

  netWorth,

  netWorthHistory: (input) => {
    const period = resolvePeriod(input);
    return {
      ...netWorthHistory(period.dateFrom, period.dateTo, input.granularity),
      defaultCurrency: db().household.defaultCurrency,
      period: publicPeriod(period),
    };
  },

  spendingByCategory: (input) => {
    const period = resolvePeriod(input);
    const range = { ...period, accountIds: input.accountIds };
    return {
      categories: categoryTotals(range, "expense"),
      defaultCurrency: db().household.defaultCurrency,
      period: publicPeriod(period),
      totals: spendingTotals(range),
    };
  },

  spendingByTag: (input) => {
    const period = resolvePeriod(input);
    const range = { ...period, accountIds: input.accountIds };
    const totals = new Map<
      string,
      { count: Set<string>; currencyCode: string; tagId: string; total: bigint }
    >();
    for (const line of flowLines(range, "expense")) {
      for (const tagId of line.posting.tagIds) {
        const key = `${tagId}|${line.posting.currencyCode}`;
        const entry = totals.get(key) ?? {
          count: new Set<string>(),
          currencyCode: line.posting.currencyCode,
          tagId,
          total: 0n,
        };
        entry.count.add(line.posting.id);
        entry.total += line.amount;
        totals.set(key, entry);
      }
    }
    return {
      defaultCurrency: db().household.defaultCurrency,
      period: publicPeriod(period),
      tags: [...totals.values()]
        .flatMap((entry) => {
          const tag = db().tags.find((row) => row.id === entry.tagId);
          return tag
            ? [
                {
                  archived: tag.archivedAt !== null,
                  color: tag.color,
                  count: entry.count.size,
                  currencyCode: entry.currencyCode,
                  name: tag.name,
                  tagId: tag.id,
                  total: text(entry.total),
                },
              ]
            : [];
        })
        .toSorted(
          (a, b) =>
            Number(scaled(b.total) - scaled(a.total)) ||
            a.name.localeCompare(b.name)
        ),
      totals: spendingTotals(range),
    };
  },
};
