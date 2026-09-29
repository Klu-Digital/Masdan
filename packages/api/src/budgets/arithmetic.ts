import { fixedAmountText, signedScaledAmount } from "../shared/money";

export const BUDGET_STATUSES = ["unbudgeted", "within", "overspent"] as const;
export type BudgetStatus = (typeof BUDGET_STATUSES)[number];

const PERCENT = 100n;

const nonNegative = (value: bigint): bigint => (value > 0n ? value : 0n);

export interface BudgetArithmetic {
  overBy: string;
  /** Floored, so 99.99% never reads as 100%; uncapped above 100. */
  percentUsed: number;
  remaining: string;
  status: Exclude<BudgetStatus, "unbudgeted">;
}

/** Exact six-place arithmetic; spending exactly the budget is not overspent. */
export const budgetArithmetic = (
  amount: string,
  spent: string
): BudgetArithmetic => {
  const budgeted = signedScaledAmount(amount);
  const used = signedScaledAmount(spent);
  return {
    overBy: fixedAmountText(nonNegative(used - budgeted)),
    percentUsed:
      budgeted > 0n ? Number((nonNegative(used) * PERCENT) / budgeted) : 0,
    remaining: fixedAmountText(nonNegative(budgeted - used)),
    status: used > budgeted ? "overspent" : "within",
  };
};

export interface BudgetTotalsArithmetic {
  overBy: string;
  remaining: string;
}

/** Net across categories: one category's overspend eats another's slack. */
export const netRemaining = (
  budgeted: bigint,
  spent: bigint
): BudgetTotalsArithmetic => ({
  overBy: fixedAmountText(nonNegative(spent - budgeted)),
  remaining: fixedAmountText(nonNegative(budgeted - spent)),
});
