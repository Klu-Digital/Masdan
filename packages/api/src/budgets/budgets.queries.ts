import type { Database } from "@masdan/db";
import { category, categoryBudget } from "@masdan/db/schema/index";
import { and, asc, eq } from "drizzle-orm";

import { householdToday, monthEnd } from "../reports/periods";
import { getCategoryTotals } from "../reports/reports.queries";
import type { CategoryTotal } from "../reports/reports.queries";
import { householdSettings } from "../shared/household";
import { fixedAmountText, signedScaledAmount } from "../shared/money";
import { budgetArithmetic, netRemaining } from "./arithmetic";
import type { BudgetStatus } from "./arithmetic";

/** `YYYY-MM`, bounded so the first day is always a valid Postgres date. */
export const BUDGET_MONTH_PATTERN = /^[12]\d{3}-(?:0[1-9]|1[0-2])$/u;

export const monthStartOf = (month: string): string => `${month}-01`;

const ZERO = "0.000000";

interface BudgetLine {
  budget: {
    amount: string;
    currencyCode: string;
    id: string;
    updatedAt: Date;
  } | null;
  category: {
    archivedAt: Date | null;
    color: string;
    icon: string;
    id: string;
    name: string;
  };
  /** Entries counted into `spent`. */
  count: number;
  /** The budget's currency, or the household's when there is no budget. */
  currencyCode: string;
  /** Spending in other currencies. There is no FX data, so never added in. */
  otherCurrencies: { count: number; currencyCode: string; total: string }[];
  overBy: string | null;
  percentUsed: number | null;
  remaining: string | null;
  spent: string;
  status: BudgetStatus;
}

interface BudgetTotals {
  budgeted: string;
  budgetedCount: number;
  currencyCode: string;
  overBy: string;
  overspentCount: number;
  remaining: string;
  /** Spent in budgeted categories only. */
  spent: string;
  /** Spent in expense categories with no budget this month. */
  unbudgetedSpent: string;
}

export interface MonthBudgets {
  /** The household's current month, `YYYY-MM`. */
  currentMonth: string;
  dateFrom: string;
  /** Last day counted: month end, or today for the current month. */
  dateTo: string | null;
  defaultCurrency: string;
  lines: BudgetLine[];
  month: string;
  timezone: string;
  today: string;
  totals: BudgetTotals;
}

type LineCategory = BudgetLine["category"];
type LineBudget = NonNullable<BudgetLine["budget"]>;

const toLine = (
  row: LineCategory,
  budget: LineBudget | null,
  spent: CategoryTotal[],
  defaultCurrency: string
): BudgetLine => {
  const currencyCode = budget?.currencyCode ?? defaultCurrency;
  const own = spent.find((total) => total.currencyCode === currencyCode);
  const spentText = own ? fixedAmountText(signedScaledAmount(own.total)) : ZERO;
  const base = {
    budget,
    category: row,
    count: own?.count ?? 0,
    currencyCode,
    otherCurrencies: spent
      .filter((total) => total.currencyCode !== currencyCode)
      .map((total) => ({
        count: total.count,
        currencyCode: total.currencyCode,
        total: fixedAmountText(signedScaledAmount(total.total)),
      })),
    spent: spentText,
  };
  if (!budget) {
    return {
      ...base,
      overBy: null,
      percentUsed: null,
      remaining: null,
      status: "unbudgeted",
    };
  }
  return { ...base, ...budgetArithmetic(budget.amount, spentText) };
};

/** Household-currency lines only; other-currency budgets never mix in. */
const sumTotals = (lines: BudgetLine[], currencyCode: string): BudgetTotals => {
  let budgeted = 0n;
  let spent = 0n;
  let unbudgetedSpent = 0n;
  let budgetedCount = 0;
  let overspentCount = 0;
  for (const line of lines) {
    if (line.currencyCode !== currencyCode) {
      continue;
    }
    if (line.budget) {
      budgeted += signedScaledAmount(line.budget.amount);
      spent += signedScaledAmount(line.spent);
      budgetedCount += 1;
      overspentCount += line.status === "overspent" ? 1 : 0;
    } else {
      unbudgetedSpent += signedScaledAmount(line.spent);
    }
  }
  return {
    budgeted: fixedAmountText(budgeted),
    budgetedCount,
    currencyCode,
    ...netRemaining(budgeted, spent),
    overspentCount,
    spent: fixedAmountText(spent),
    unbudgetedSpent: fixedAmountText(unbudgetedSpent),
  };
};

/**
 * Budgets for one household-local month beside what the ledger says was
 * spent, through the same category totals the spending report uses. Like
 * the reports, the current month counts up to today and a future month has
 * no actuals yet.
 */
export const getMonthBudgets = async (
  db: Database,
  organizationId: string,
  requestedMonth: string | undefined,
  now: Date = new Date()
): Promise<MonthBudgets> => {
  const settings = await householdSettings(db, organizationId);
  const today = householdToday(settings.timezone, now);
  const currentMonth = today.slice(0, 7);
  const month = requestedMonth ?? currentMonth;
  const dateFrom = monthStartOf(month);
  const lastDay = monthEnd(dateFrom);
  let dateTo: string | null = lastDay < today ? lastDay : today;
  if (dateTo < dateFrom) {
    dateTo = null;
  }

  const [budgets, categories, spending] = await Promise.all([
    db
      .select({
        amount: categoryBudget.amount,
        categoryId: categoryBudget.categoryId,
        currencyCode: categoryBudget.currencyCode,
        id: categoryBudget.id,
        updatedAt: categoryBudget.updatedAt,
      })
      .from(categoryBudget)
      .where(
        and(
          eq(categoryBudget.organizationId, organizationId),
          eq(categoryBudget.month, dateFrom)
        )
      ),
    db
      .select({
        archivedAt: category.archivedAt,
        color: category.color,
        icon: category.icon,
        id: category.id,
        name: category.name,
      })
      .from(category)
      .where(
        and(
          eq(category.organizationId, organizationId),
          eq(category.type, "expense")
        )
      )
      .orderBy(asc(category.sortOrder), asc(category.name), asc(category.id)),
    dateTo === null
      ? Promise.resolve([])
      : getCategoryTotals(db, organizationId, { dateFrom, dateTo }, "expense"),
  ]);

  const budgetFor = new Map(budgets.map((row) => [row.categoryId, row]));
  const spendFor = new Map<string, typeof spending>();
  for (const row of spending) {
    const rows = spendFor.get(row.categoryId) ?? [];
    rows.push(row);
    spendFor.set(row.categoryId, rows);
  }

  const lines: BudgetLine[] = [];
  for (const row of categories) {
    const budget = budgetFor.get(row.id) ?? null;
    const spent = spendFor.get(row.id) ?? [];
    // Archived categories stay only where this month has history to show.
    if (row.archivedAt === null || budget !== null || spent.length > 0) {
      lines.push(toLine(row, budget, spent, settings.defaultCurrency));
    }
  }

  return {
    currentMonth,
    dateFrom,
    dateTo,
    defaultCurrency: settings.defaultCurrency,
    lines,
    month,
    timezone: settings.timezone,
    today,
    totals: sumTotals(lines, settings.defaultCurrency),
  };
};
