import type { RouterOutputs } from "@/utils/orpc";

export type MonthBudgets = RouterOutputs["budgets"]["month"];
export type BudgetLine = MonthBudgets["lines"][number];
