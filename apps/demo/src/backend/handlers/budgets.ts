import { budgetArithmetic, netRemaining } from "@masdan/api/budgets/arithmetic";
import { monthEnd } from "@masdan/api/reports/periods";

import type { RouterOutputs } from "@/utils/orpc";

import { categoryTotals, today } from "../flows";
import type { Section } from "../router";
import { db } from "../store";
import type { Budget } from "../store";
import { find, newId, scaled, text } from "../util";

type MonthBudgets = RouterOutputs["categoryBudgets"]["month"];
type Line = MonthBudgets["lines"][number];

const ZERO = text(0n);

/** Household-currency lines only; other-currency budgets never mix in. */
const sumTotals = (
  lines: Line[],
  currencyCode: string
): MonthBudgets["totals"] => {
  let budgeted = 0n;
  let spent = 0n;
  let unbudgetedSpent = 0n;
  let budgetedCount = 0;
  let overspentCount = 0;
  for (const line of lines.filter((row) => row.currencyCode === currencyCode)) {
    if (line.budget) {
      budgeted += scaled(line.budget.amount);
      spent += scaled(line.spent);
      budgetedCount += 1;
      overspentCount += line.status === "overspent" ? 1 : 0;
    } else {
      unbudgetedSpent += scaled(line.spent);
    }
  }
  return {
    budgeted: text(budgeted),
    budgetedCount,
    currencyCode,
    ...netRemaining(budgeted, spent),
    overspentCount,
    spent: text(spent),
    unbudgetedSpent: text(unbudgetedSpent),
  };
};

/** `getMonthBudgets` in packages/api/src/budgets/budgets.queries.ts. */
export const monthBudgets = (requestedMonth?: string): MonthBudgets => {
  const { defaultCurrency, timezone } = db().household;
  const day = today();
  const currentMonth = day.slice(0, 7);
  const month = requestedMonth ?? currentMonth;
  const dateFrom = `${month}-01`;
  const lastDay = monthEnd(dateFrom);
  let dateTo: string | null = lastDay < day ? lastDay : day;
  if (dateTo < dateFrom) {
    dateTo = null;
  }
  const spending =
    dateTo === null ? [] : categoryTotals({ dateFrom, dateTo }, "expense");
  const budgets = db().budgets.filter((row) => row.month === dateFrom);

  const lines: Line[] = [];
  for (const category of db()
    .categories.filter((row) => row.type === "expense")
    .toSorted(
      (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)
    )) {
    const budget =
      budgets.find((row) => row.categoryId === category.id) ?? null;
    const spent = spending.filter((row) => row.categoryId === category.id);
    if (category.archivedAt !== null && budget === null && spent.length === 0) {
      continue;
    }
    const currencyCode = budget?.currencyCode ?? defaultCurrency;
    const own = spent.find((row) => row.currencyCode === currencyCode);
    const spentText = own ? own.total : ZERO;
    const base = {
      budget: budget && {
        amount: budget.amount,
        currencyCode: budget.currencyCode,
        id: budget.id,
        updatedAt: budget.updatedAt,
      },
      category: {
        archivedAt: category.archivedAt,
        color: category.color,
        icon: category.icon,
        id: category.id,
        name: category.name,
      },
      count: own?.count ?? 0,
      currencyCode,
      otherCurrencies: spent
        .filter((row) => row.currencyCode !== currencyCode)
        .map((row) => ({
          count: row.count,
          currencyCode: row.currencyCode,
          total: row.total,
        })),
      spent: spentText,
    };
    lines.push(
      budget
        ? { ...base, ...budgetArithmetic(budget.amount, spentText) }
        : {
            ...base,
            overBy: null,
            percentUsed: null,
            remaining: null,
            status: "unbudgeted",
          }
    );
  }

  return {
    currentMonth,
    dateFrom,
    dateTo,
    defaultCurrency,
    lines,
    month,
    timezone,
    today: day,
    totals: sumTotals(lines, defaultCurrency),
  };
};

const budgetRow = (budget: Budget) => ({
  amount: budget.amount,
  categoryId: budget.categoryId,
  currencyCode: budget.currencyCode,
  id: budget.id,
  month: budget.month,
  updatedAt: budget.updatedAt,
});

export const budgets: Section<"categoryBudgets"> = {
  clear: ({ categoryId, month }) => {
    const monthStart = `${month}-01`;
    const budget = db().budgets.find(
      (row) => row.categoryId === categoryId && row.month === monthStart
    );
    const cleared = find(budget ? [budget] : [], budget?.id, "Budget");
    db().budgets = db().budgets.filter((row) => row.id !== cleared.id);
    return budgetRow(cleared);
  },

  month: (input) => monthBudgets(input?.month),

  set: ({ amount, categoryId, month }) => {
    find(db().categories, categoryId, "Category");
    const monthStart = `${month}-01`;
    const existing = db().budgets.find(
      (row) => row.categoryId === categoryId && row.month === monthStart
    );
    const budget = existing ?? {
      amount,
      categoryId,
      currencyCode: db().household.defaultCurrency,
      id: newId(),
      month: monthStart,
      updatedAt: new Date(),
    };
    budget.amount = text(scaled(amount));
    budget.updatedAt = new Date();
    if (!existing) {
      db().budgets.push(budget);
    }
    return budgetRow(budget);
  },
};
