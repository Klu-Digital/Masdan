import type { Database } from "@masdan/db";
import { category, categoryBudget } from "@masdan/db/schema/index";
import { ORPCError } from "@orpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import {
  orgMutationProcedure,
  orgProcedure,
  requirePermission,
} from "../procedures";
import { notFound } from "../shared/errors";
import { householdSettings } from "../shared/household";
import { positiveAmount } from "../shared/money";
import {
  BUDGET_MONTH_PATTERN,
  getMonthBudgets,
  monthStartOf,
} from "./budgets.queries";

const month = z.string().regex(BUDGET_MONTH_PATTERN, "Use a YYYY-MM month");

const budgetKey = z.object({ categoryId: z.uuid(), month }).strict();

const budgetFields = {
  amount: categoryBudget.amount,
  categoryId: categoryBudget.categoryId,
  currencyCode: categoryBudget.currencyCode,
  id: categoryBudget.id,
  month: categoryBudget.month,
  updatedAt: categoryBudget.updatedAt,
};

/** Only an active expense category of this household takes budget changes. */
const budgetableCategory = async (
  db: Database,
  organizationId: string,
  categoryId: string
): Promise<void> => {
  const [selected] = await db
    .select({ archivedAt: category.archivedAt, type: category.type })
    .from(category)
    .where(
      and(
        eq(category.id, categoryId),
        eq(category.organizationId, organizationId)
      )
    )
    .limit(1);
  if (!selected) {
    throw notFound("Category");
  }
  if (selected.type !== "expense") {
    throw new ORPCError("BAD_REQUEST", {
      message: "Budgets are for expense categories",
    });
  }
  if (selected.archivedAt !== null) {
    throw new ORPCError("BAD_REQUEST", {
      message: "Restore this category to change its budgets",
    });
  }
};

export const budgetsRouter = {
  clear: orgMutationProcedure
    .use(requirePermission({ budget: ["delete"] }))
    .input(budgetKey)
    .handler(async ({ context, input }) => {
      await budgetableCategory(
        context.db,
        context.organizationId,
        input.categoryId
      );
      const [removed] = await context.db
        .delete(categoryBudget)
        .where(
          and(
            eq(categoryBudget.organizationId, context.organizationId),
            eq(categoryBudget.month, monthStartOf(input.month)),
            eq(categoryBudget.categoryId, input.categoryId)
          )
        )
        .returning(budgetFields);
      if (!removed) {
        throw new ORPCError("NOT_FOUND", {
          message: "No budget is set for that month",
        });
      }
      return removed;
    }),

  month: orgProcedure
    .use(requirePermission({ budget: ["read"], transaction: ["read"] }))
    .input(z.object({ month: month.optional() }).strict().optional())
    .handler(({ context, input }) =>
      getMonthBudgets(context.db, context.organizationId, input?.month)
    ),

  set: orgMutationProcedure
    .use(requirePermission({ budget: ["update"] }))
    .input(budgetKey.extend({ amount: positiveAmount }))
    .handler(async ({ context, input }) => {
      await budgetableCategory(
        context.db,
        context.organizationId,
        input.categoryId
      );
      const { defaultCurrency } = await householdSettings(
        context.db,
        context.organizationId
      );
      const [saved] = await context.db
        .insert(categoryBudget)
        .values({
          amount: input.amount,
          categoryId: input.categoryId,
          currencyCode: defaultCurrency,
          month: monthStartOf(input.month),
          organizationId: context.organizationId,
        })
        .onConflictDoUpdate({
          set: {
            amount: input.amount,
            currencyCode: defaultCurrency,
            updatedAt: new Date(),
          },
          target: [
            categoryBudget.organizationId,
            categoryBudget.month,
            categoryBudget.categoryId,
          ],
        })
        .returning(budgetFields);
      if (!saved) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: "Could not save the budget",
        });
      }
      return saved;
    }),
};
