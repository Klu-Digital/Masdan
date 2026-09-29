import type { Database } from "@masdan/db";
import {
  category,
  financialAccount,
  financialTransaction,
  savingsGoal,
} from "@masdan/db/schema/index";
import { and, asc, desc, eq, sql } from "drizzle-orm";

import {
  balanceCategory,
  balanceExpression,
  balancePostings,
} from "../accounts/balances";
import { householdSettings } from "../shared/household";
import { goalProgress, goalStatus } from "./progress";
import type { GoalProgress, GoalStatus } from "./progress";

export interface Goal extends GoalProgress {
  accountArchivedAt: Date | null;
  accountId: string;
  accountName: string;
  archivedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  currencyCode: string;
  id: string;
  /** The household-local day progress is frozen at; null while active. */
  measuredOn: string | null;
  name: string;
  status: GoalStatus;
  targetAmount: string;
  targetDate: string | null;
  updatedAt: Date;
}

const closedAt = sql`coalesce(${savingsGoal.completedAt}, ${savingsGoal.archivedAt})`;

const LIFECYCLE_ORDER = sql`CASE WHEN ${savingsGoal.archivedAt} IS NOT NULL THEN 2 WHEN ${savingsGoal.completedAt} IS NOT NULL THEN 1 ELSE 0 END`;

/**
 * Goals with progress from the shared balance formula over their account.
 * An active goal reads the balance the accounts screen shows; a completed or
 * archived one reads it as of the household-local day it closed, so later
 * spending from the account does not rewrite a finished goal.
 */
export const loadGoals = async (
  db: Database,
  organizationId: string,
  goalId?: string
): Promise<Goal[]> => {
  const { timezone } = await householdSettings(db, organizationId);
  const measuredOn = sql`(${closedAt} at time zone 'UTC' at time zone ${timezone})::date`;
  const postings =
    balancePostings(sql`coalesce(${measuredOn}, 'infinity'::date)`) ??
    sql`false`;

  const rows = await db
    .select({
      accountArchivedAt: financialAccount.archivedAt,
      accountId: savingsGoal.accountId,
      accountName: financialAccount.name,
      archivedAt: savingsGoal.archivedAt,
      completedAt: savingsGoal.completedAt,
      createdAt: savingsGoal.createdAt,
      currencyCode: financialAccount.currencyCode,
      id: savingsGoal.id,
      measuredOn: sql<string | null>`to_char(${measuredOn}, 'YYYY-MM-DD')`,
      name: savingsGoal.name,
      saved: balanceExpression,
      targetAmount: savingsGoal.targetAmount,
      targetDate: savingsGoal.targetDate,
      updatedAt: savingsGoal.updatedAt,
    })
    .from(savingsGoal)
    .innerJoin(
      financialAccount,
      and(
        eq(financialAccount.id, savingsGoal.accountId),
        eq(financialAccount.organizationId, organizationId)
      )
    )
    .leftJoin(financialTransaction, postings)
    .leftJoin(category, balanceCategory)
    .where(
      and(
        eq(savingsGoal.organizationId, organizationId),
        goalId === undefined ? undefined : eq(savingsGoal.id, goalId)
      )
    )
    .groupBy(savingsGoal.id, financialAccount.id)
    .orderBy(
      LIFECYCLE_ORDER,
      sql`${savingsGoal.targetDate} ASC NULLS LAST`,
      desc(closedAt),
      asc(savingsGoal.createdAt),
      asc(savingsGoal.id)
    );

  return rows.map(({ saved, ...row }) => ({
    ...row,
    ...goalProgress(saved, row.targetAmount),
    status: goalStatus(row),
  }));
};
