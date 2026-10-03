import { goalProgress, goalStatus } from "@masdan/api/goals/progress";
import { householdToday } from "@masdan/api/reports/periods";

import type { RouterOutputs } from "@/utils/orpc";

import { balanceOf } from "../ledger";
import type { Section } from "../router";
import { db } from "../store";
import type { Goal } from "../store";
import { find, newId, scaled, text } from "../util";

type GoalView = RouterOutputs["goals"]["list"][number];

const LIFECYCLE = { active: 0, archived: 2, completed: 1 } as const;

// A closed goal reads the balance as of the day it closed.
const goalView = (goal: Goal): GoalView => {
  const account = find(db().accounts, goal.accountId, "Financial account");
  const closedAt = goal.completedAt ?? goal.archivedAt;
  const measuredOn = closedAt
    ? householdToday(db().household.timezone, closedAt)
    : null;
  return {
    ...goal,
    accountArchivedAt: account.archivedAt,
    accountName: account.name,
    currencyCode: account.currencyCode,
    measuredOn,
    ...goalProgress(
      text(balanceOf(account, measuredOn ?? undefined)),
      goal.targetAmount
    ),
    status: goalStatus(goal),
  };
};

const closedTime = (goal: Goal): number =>
  (goal.completedAt ?? goal.archivedAt)?.getTime() ?? 0;

const change = (goalId: string, values: Partial<Goal>): GoalView => {
  const goal = find(db().goals, goalId, "Goal");
  Object.assign(goal, values, { updatedAt: new Date() });
  return goalView(goal);
};

export const goals: Section<"goals"> = {
  archive: ({ goalId }) => change(goalId, { archivedAt: new Date() }),

  complete: ({ goalId }) => change(goalId, { completedAt: new Date() }),

  create: (input) => {
    find(db().accounts, input.accountId, "Financial account");
    const now = new Date();
    const goal: Goal = {
      accountId: input.accountId,
      archivedAt: null,
      completedAt: null,
      createdAt: now,
      id: newId(),
      name: input.name,
      targetAmount: text(scaled(input.targetAmount)),
      targetDate: input.targetDate,
      updatedAt: now,
    };
    db().goals.push(goal);
    return goalView(goal);
  },

  list: () =>
    db()
      .goals.map(goalView)
      .toSorted(
        (a, b) =>
          LIFECYCLE[a.status] - LIFECYCLE[b.status] ||
          (a.targetDate ?? "9999").localeCompare(b.targetDate ?? "9999") ||
          closedTime(find(db().goals, b.id, "Goal")) -
            closedTime(find(db().goals, a.id, "Goal")) ||
          a.createdAt.getTime() - b.createdAt.getTime() ||
          a.id.localeCompare(b.id)
      ),

  reopen: ({ goalId }) => change(goalId, { completedAt: null }),

  restore: ({ goalId }) => change(goalId, { archivedAt: null }),

  update: ({ goalId, ...values }) =>
    change(goalId, {
      accountId: values.accountId,
      name: values.name,
      targetAmount: text(scaled(values.targetAmount)),
      targetDate: values.targetDate,
    }),
};
