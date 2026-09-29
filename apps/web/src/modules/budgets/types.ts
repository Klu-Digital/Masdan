import type { RouterOutputs } from "@/utils/orpc";

export type MonthBudgets = RouterOutputs["categoryBudgets"]["month"];
export type BudgetLine = MonthBudgets["lines"][number];
