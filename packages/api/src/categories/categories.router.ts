import {
  category,
  categoryBudget,
  financialTransaction,
  financialTransactionSplit,
} from "@masdan/db/schema/index";
import { ORPCError } from "@orpc/server";
import { and, asc, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import {
  orgMutationProcedure,
  orgProcedure,
  requirePermission,
} from "../procedures";
import { CATEGORY_COLORS, CATEGORY_TYPES } from "./constants";

const emojiPattern = /\p{Extended_Pictographic}/u;
const categoryFields = {
  archivedAt: category.archivedAt,
  color: category.color,
  createdAt: category.createdAt,
  icon: category.icon,
  id: category.id,
  name: category.name,
  organizationId: category.organizationId,
  sortOrder: category.sortOrder,
  type: category.type,
  updatedAt: category.updatedAt,
};

const categoryValues = z.object({
  color: z.enum(CATEGORY_COLORS),
  icon: z
    .string()
    .trim()
    .min(1, "Choose an emoji")
    .max(16, "Emoji is too long")
    .refine((value) => emojiPattern.test(value), "Choose an emoji"),
  name: z.string().trim().min(1, "Name is required").max(80),
  sortOrder: z.number().int().min(0).max(1_000_000).optional(),
  type: z.enum(CATEGORY_TYPES),
});

const categoryIdInput = z.object({ categoryId: z.uuid() });

const isUniqueViolation = (error: unknown): boolean => {
  let current: unknown = error;
  for (let depth = 0; depth < 3; depth += 1) {
    if (
      typeof current === "object" &&
      current !== null &&
      "code" in current &&
      current.code === "23505"
    ) {
      return true;
    }
    current =
      typeof current === "object" && current !== null && "cause" in current
        ? current.cause
        : undefined;
  }
  return false;
};

const categoryNotFound = () =>
  new ORPCError("NOT_FOUND", { message: "Category not found" });

const categoryConflict = () =>
  new ORPCError("CONFLICT", {
    message: "A category with this name already exists",
  });

export const categoriesRouter = {
  archive: orgMutationProcedure
    .use(requirePermission({ category: ["archive"] }))
    .input(categoryIdInput)
    .handler(async ({ context, input }) => {
      const [archived] = await context.db
        .update(category)
        .set({ archivedAt: new Date() })
        .where(
          and(
            eq(category.id, input.categoryId),
            eq(category.organizationId, context.organizationId)
          )
        )
        .returning(categoryFields);

      if (!archived) {
        throw categoryNotFound();
      }
      return archived;
    }),

  create: orgMutationProcedure
    .use(requirePermission({ category: ["create"] }))
    .input(categoryValues)
    .handler(async ({ context, input }) => {
      try {
        const [created] = await context.db
          .insert(category)
          .values({ ...input, organizationId: context.organizationId })
          .returning(categoryFields);

        if (!created) {
          throw new ORPCError("INTERNAL_SERVER_ERROR", {
            message: "Could not create category",
          });
        }
        return created;
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw categoryConflict();
        }
        throw error;
      }
    }),

  list: orgProcedure
    .use(requirePermission({ category: ["read"] }))
    .input(z.object({ includeArchived: z.boolean().default(false) }).optional())
    .handler(({ context, input }) => {
      const conditions = [eq(category.organizationId, context.organizationId)];
      if (!input?.includeArchived) {
        conditions.push(isNull(category.archivedAt));
      }

      return context.db
        .select(categoryFields)
        .from(category)
        .where(and(...conditions))
        .orderBy(asc(category.sortOrder), asc(category.name));
    }),

  restore: orgMutationProcedure
    .use(requirePermission({ category: ["restore"] }))
    .input(categoryIdInput)
    .handler(async ({ context, input }) => {
      const [restored] = await context.db
        .update(category)
        .set({ archivedAt: null })
        .where(
          and(
            eq(category.id, input.categoryId),
            eq(category.organizationId, context.organizationId)
          )
        )
        .returning(categoryFields);

      if (!restored) {
        throw categoryNotFound();
      }
      return restored;
    }),

  update: orgMutationProcedure
    .use(requirePermission({ category: ["update"] }))
    .input(categoryValues.extend({ categoryId: z.uuid() }))
    .handler(async ({ context, input }) => {
      const { categoryId, ...values } = input;
      try {
        const [existing] = await context.db
          .select({ type: category.type })
          .from(category)
          .where(
            and(
              eq(category.id, categoryId),
              eq(category.organizationId, context.organizationId)
            )
          )
          .limit(1);
        if (!existing) {
          throw categoryNotFound();
        }
        if (existing.type !== values.type) {
          const transactions = await context.db
            .select({ id: financialTransaction.id })
            .from(financialTransaction)
            .where(eq(financialTransaction.categoryId, categoryId))
            .limit(1);
          const splits = transactions.length
            ? []
            : await context.db
                .select({ id: financialTransactionSplit.id })
                .from(financialTransactionSplit)
                .where(eq(financialTransactionSplit.categoryId, categoryId))
                .limit(1);
          if (transactions.length || splits.length) {
            throw new ORPCError("BAD_REQUEST", {
              message: "Category type cannot change after transactions use it",
            });
          }
          const [budgeted] = await context.db
            .select({ id: categoryBudget.id })
            .from(categoryBudget)
            .where(eq(categoryBudget.categoryId, categoryId))
            .limit(1);
          if (budgeted) {
            throw new ORPCError("BAD_REQUEST", {
              message: "Category type cannot change after budgets use it",
            });
          }
        }
        const [updated] = await context.db
          .update(category)
          .set(values)
          .where(
            and(
              eq(category.id, categoryId),
              eq(category.organizationId, context.organizationId)
            )
          )
          .returning(categoryFields);

        if (!updated) {
          throw categoryNotFound();
        }
        return updated;
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw categoryConflict();
        }
        throw error;
      }
    }),
};
