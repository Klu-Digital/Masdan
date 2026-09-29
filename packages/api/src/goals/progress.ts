import { fixedAmountText, signedScaledAmount } from "../shared/money";

const GOAL_STATUSES = ["active", "completed", "archived"] as const;
export type GoalStatus = (typeof GOAL_STATUSES)[number];

const PERCENT = 100n;

export const goalStatus = (goal: {
  archivedAt: Date | null;
  completedAt: Date | null;
}): GoalStatus => {
  if (goal.archivedAt) {
    return "archived";
  }
  return goal.completedAt ? "completed" : "active";
};

export interface GoalProgress {
  /** Whole percent, floored and held to 0–100: 99.99% never reads as done. */
  percent: number;
  reached: boolean;
  /** Still to save; zero once the target is met, never negative. */
  remaining: string;
  /** The account balance as measured, which may be negative or past target. */
  saved: string;
}

/** Exact six-place arithmetic over numeric text; no floats. */
export const goalProgress = (saved: string, target: string): GoalProgress => {
  const have = signedScaledAmount(saved);
  const want = signedScaledAmount(target);
  let counted = have;
  if (counted < 0n) {
    counted = 0n;
  } else if (counted > want) {
    counted = want;
  }
  return {
    percent: want > 0n ? Number((counted * PERCENT) / want) : 0,
    reached: have >= want,
    remaining: fixedAmountText(have >= want ? 0n : want - have),
    saved: fixedAmountText(have),
  };
};
