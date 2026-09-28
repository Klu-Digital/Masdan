import type { Database } from "@masdan/db";
import { categoryBudget } from "@masdan/db/schema/index";
import { and, desc, eq, gte, lte } from "drizzle-orm";

import { getMonthBudgets } from "../budgets/budgets.queries";
import { fixedAmountText, signedScaledAmount } from "../transactions/amounts";
import { householdToday, monthStart } from "./periods";
import { householdSettings } from "./reports.queries";

const MAX_MONTHS = 36;

type BudgetLine = Awaited<ReturnType<typeof getMonthBudgets>>["lines"][number];
type BudgetedLine = BudgetLine & {
  budget: NonNullable<BudgetLine["budget"]>;
};

interface PerformanceLine {
  archived: boolean;
  budgeted: string;
  categoryId: string;
  color: string;
  currencyCode: string;
  icon: string;
  name: string;
  percentUsed: number;
  spent: string;
  status: "within" | "overspent";
  variance: string;
}

interface PerformanceTotal {
  budgeted: string;
  currencyCode: string;
  spent: string;
  variance: string;
}

interface PerformanceMonth {
  lines: PerformanceLine[];
  month: string;
  totals: PerformanceTotal[];
}

const totalsFor = (
  lines: { budgeted: string; currencyCode: string; spent: string }[],
  defaultCurrency: string
): PerformanceTotal[] => {
  const sums = new Map<string, { budgeted: bigint; spent: bigint }>();
  for (const line of lines) {
    const sum = sums.get(line.currencyCode) ?? { budgeted: 0n, spent: 0n };
    sum.budgeted += signedScaledAmount(line.budgeted);
    sum.spent += signedScaledAmount(line.spent);
    sums.set(line.currencyCode, sum);
  }
  return [...sums]
    .toSorted(([a], [b]) => {
      if (a === defaultCurrency) {
        return -1;
      }
      if (b === defaultCurrency) {
        return 1;
      }
      return a.localeCompare(b);
    })
    .map(([currencyCode, sum]) => ({
      budgeted: fixedAmountText(sum.budgeted),
      currencyCode,
      spent: fixedAmountText(sum.spent),
      variance: fixedAmountText(sum.budgeted - sum.spent),
    }));
};

const performanceLine = (line: BudgetedLine): PerformanceLine => ({
  archived: line.category.archivedAt !== null,
  budgeted: line.budget.amount,
  categoryId: line.category.id,
  color: line.category.color,
  currencyCode: line.currencyCode,
  icon: line.category.icon,
  name: line.category.name,
  percentUsed: line.percentUsed ?? 0,
  spent: line.spent,
  status: line.status === "overspent" ? "overspent" : "within",
  variance: fixedAmountText(
    signedScaledAmount(line.budget.amount) - signedScaledAmount(line.spent)
  ),
});

export const getBudgetPerformance = async (
  db: Database,
  organizationId: string,
  range: { dateFrom: string; dateTo: string },
  now: Date = new Date()
) => {
  const { defaultCurrency, timezone } = await householdSettings(
    db,
    organizationId
  );
  const currentMonth = monthStart(householdToday(timezone, now));
  const budgetedMonths = await db
    .selectDistinct({ month: categoryBudget.month })
    .from(categoryBudget)
    .where(
      and(
        eq(categoryBudget.organizationId, organizationId),
        gte(categoryBudget.month, `${range.dateFrom.slice(0, 7)}-01`),
        lte(categoryBudget.month, range.dateTo),
        lte(categoryBudget.month, currentMonth)
      )
    )
    .orderBy(desc(categoryBudget.month))
    .limit(MAX_MONTHS + 1);
  const truncated = budgetedMonths.length > MAX_MONTHS;
  const months: PerformanceMonth[] = [];
  for (const { month } of budgetedMonths.slice(0, MAX_MONTHS).toReversed()) {
    const monthLabel = month.slice(0, 7);
    const budget = await getMonthBudgets(db, organizationId, monthLabel, now);
    const lines = budget.lines
      .filter((line): line is BudgetedLine => line.budget !== null)
      .map(performanceLine);
    months.push({
      lines,
      month: monthLabel,
      totals: totalsFor(lines, defaultCurrency),
    });
  }
  return {
    months,
    totals: totalsFor(
      months.flatMap((month) => month.lines),
      defaultCurrency
    ),
    truncated,
  };
};
