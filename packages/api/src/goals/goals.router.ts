import type { Database } from "@masdan/db";
import { financialAccount, savingsGoal } from "@masdan/db/schema/index";
import { ORPCError } from "@orpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import {
  orgMutationProcedure,
  orgProcedure,
  requirePermission,
} from "../procedures";
import { isoDate } from "../shared/dates";
import { notFound } from "../shared/errors";
import { positiveAmount } from "../shared/money";
import { lockOwned } from "../shared/ownership";
import { loadGoals } from "./goals.queries";
import type { Goal } from "./goals.queries";
import { goalStatus } from "./progress";
import type { GoalStatus } from "./progress";

const goalValues = z
  .object({
    accountId: z.uuid(),
    name: z.string().trim().min(1, "Name is required").max(80),
    targetAmount: positiveAmount,
    targetDate: isoDate.nullable(),
  })
  .strict();

const goalIdInput = z.object({ goalId: z.uuid() }).strict();

const findGoal = async (
  db: Database,
  organizationId: string,
  goalId: string
): Promise<Goal> => {
  const [goal] = await loadGoals(db, organizationId, goalId);
  if (!goal) {
    throw notFound("Savings goal");
  }
  return goal;
};

/** Row-locked, so two lifecycle changes to one goal never interleave. */
const lockGoal = async (
  db: Database,
  organizationId: string,
  goalId: string
) => {
  const locked = await lockOwned(
    db,
    savingsGoal,
    { id: goalId, organizationId },
    "Savings goal"
  );
  return { ...locked, status: goalStatus(locked) };
};

const requireStatus = (
  status: GoalStatus,
  allowed: GoalStatus,
  message: string
): void => {
  if (status !== allowed) {
    throw new ORPCError("BAD_REQUEST", { message });
  }
};

/**
 * The account must be this household's and hold assets. An archived account
 * is only accepted where the goal already tracks it.
 */
const assertTrackingAccount = async (
  db: Database,
  organizationId: string,
  accountId: string,
  currentAccountId?: string
): Promise<void> => {
  const [account] = await db
    .select({
      accountClass: financialAccount.accountClass,
      archivedAt: financialAccount.archivedAt,
    })
    .from(financialAccount)
    .where(
      and(
        eq(financialAccount.id, accountId),
        eq(financialAccount.organizationId, organizationId)
      )
    )
    .limit(1);
  if (!account) {
    throw notFound("Financial account");
  }
  if (account.accountClass !== "asset") {
    throw new ORPCError("BAD_REQUEST", {
      message: "Savings goals are tracked in an asset account",
    });
  }
  if (account.archivedAt !== null && accountId !== currentAccountId) {
    throw new ORPCError("BAD_REQUEST", {
      message: "Choose an active account",
    });
  }
};

const setLifecycle = async (
  db: Database,
  organizationId: string,
  goalId: string,
  values: { archivedAt?: Date | null; completedAt?: Date | null }
): Promise<Goal> => {
  await db
    .update(savingsGoal)
    .set(values)
    .where(
      and(
        eq(savingsGoal.id, goalId),
        eq(savingsGoal.organizationId, organizationId)
      )
    );
  return findGoal(db, organizationId, goalId);
};

/**
 * Savings goals: a planning layer over one account's ledger balance. Nothing
 * here writes to the ledger, and completing or archiving keeps the goal.
 */
export const goalsRouter = {
  archive: orgMutationProcedure
    .use(requirePermission({ savingsGoal: ["archive"] }))
    .input(goalIdInput)
    .handler(async ({ context, input }) => {
      const goal = await lockGoal(
        context.db,
        context.organizationId,
        input.goalId
      );
      if (goal.status === "archived") {
        throw new ORPCError("BAD_REQUEST", {
          message: "This goal is already archived",
        });
      }
      return setLifecycle(context.db, context.organizationId, input.goalId, {
        archivedAt: new Date(),
      });
    }),

  complete: orgMutationProcedure
    .use(requirePermission({ savingsGoal: ["update"] }))
    .input(goalIdInput)
    .handler(async ({ context, input }) => {
      const goal = await lockGoal(
        context.db,
        context.organizationId,
        input.goalId
      );
      requireStatus(goal.status, "active", "Only an active goal can complete");
      return setLifecycle(context.db, context.organizationId, input.goalId, {
        completedAt: new Date(),
      });
    }),

  create: orgMutationProcedure
    .use(requirePermission({ savingsGoal: ["create"] }))
    .input(goalValues)
    .handler(async ({ context, input }) => {
      await assertTrackingAccount(
        context.db,
        context.organizationId,
        input.accountId
      );
      const [created] = await context.db
        .insert(savingsGoal)
        .values({ ...input, organizationId: context.organizationId })
        .returning({ id: savingsGoal.id });
      if (!created) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: "Could not create the goal",
        });
      }
      return findGoal(context.db, context.organizationId, created.id);
    }),

  get: orgProcedure
    .use(requirePermission({ savingsGoal: ["read"] }))
    .input(goalIdInput)
    .handler(({ context, input }) =>
      findGoal(context.db, context.organizationId, input.goalId)
    ),

  list: orgProcedure
    .use(requirePermission({ savingsGoal: ["read"] }))
    .handler(({ context }) => loadGoals(context.db, context.organizationId)),

  reopen: orgMutationProcedure
    .use(requirePermission({ savingsGoal: ["update"] }))
    .input(goalIdInput)
    .handler(async ({ context, input }) => {
      const goal = await lockGoal(
        context.db,
        context.organizationId,
        input.goalId
      );
      requireStatus(
        goal.status,
        "completed",
        "Only a completed goal can reopen"
      );
      return setLifecycle(context.db, context.organizationId, input.goalId, {
        completedAt: null,
      });
    }),

  restore: orgMutationProcedure
    .use(requirePermission({ savingsGoal: ["restore"] }))
    .input(goalIdInput)
    .handler(async ({ context, input }) => {
      const goal = await lockGoal(
        context.db,
        context.organizationId,
        input.goalId
      );
      requireStatus(goal.status, "archived", "This goal is not archived");
      return setLifecycle(context.db, context.organizationId, input.goalId, {
        archivedAt: null,
      });
    }),

  update: orgMutationProcedure
    .use(requirePermission({ savingsGoal: ["update"] }))
    .input(goalValues.extend({ goalId: z.uuid() }))
    .handler(async ({ context, input }) => {
      const { goalId, ...values } = input;
      const goal = await lockGoal(context.db, context.organizationId, goalId);
      requireStatus(
        goal.status,
        "active",
        "Reopen or restore this goal before editing it"
      );
      await assertTrackingAccount(
        context.db,
        context.organizationId,
        values.accountId,
        goal.accountId
      );
      await context.db
        .update(savingsGoal)
        .set(values)
        .where(
          and(
            eq(savingsGoal.id, goalId),
            eq(savingsGoal.organizationId, context.organizationId)
          )
        );
      return findGoal(context.db, context.organizationId, goalId);
    }),
};
