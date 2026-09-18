import { tag } from "@masdan/db/schema/index";
import { ORPCError } from "@orpc/server";
import { and, asc, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import {
  orgMutationProcedure,
  orgProcedure,
  requirePermission,
} from "../procedures";
import { TAG_COLORS } from "./constants";

const tagFields = {
  archivedAt: tag.archivedAt,
  color: tag.color,
  createdAt: tag.createdAt,
  id: tag.id,
  name: tag.name,
  organizationId: tag.organizationId,
  updatedAt: tag.updatedAt,
};

const tagValues = z.object({
  color: z.enum(TAG_COLORS),
  name: z.string().trim().min(1, "Name is required").max(80),
});

const tagIdInput = z.object({ tagId: z.uuid() });

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

const tagNotFound = () =>
  new ORPCError("NOT_FOUND", { message: "Tag not found" });

const tagConflict = () =>
  new ORPCError("CONFLICT", {
    message: "A tag with this name already exists",
  });

export const tagsRouter = {
  archive: orgMutationProcedure
    .use(requirePermission({ tag: ["archive"] }))
    .input(tagIdInput)
    .handler(async ({ context, input }) => {
      const [archived] = await context.db
        .update(tag)
        .set({ archivedAt: new Date() })
        .where(
          and(
            eq(tag.id, input.tagId),
            eq(tag.organizationId, context.organizationId)
          )
        )
        .returning(tagFields);

      if (!archived) {
        throw tagNotFound();
      }
      return archived;
    }),

  create: orgMutationProcedure
    .use(requirePermission({ tag: ["create"] }))
    .input(tagValues)
    .handler(async ({ context, input }) => {
      try {
        const [created] = await context.db
          .insert(tag)
          .values({ ...input, organizationId: context.organizationId })
          .returning(tagFields);

        if (!created) {
          throw new ORPCError("INTERNAL_SERVER_ERROR", {
            message: "Could not create tag",
          });
        }
        return created;
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw tagConflict();
        }
        throw error;
      }
    }),

  list: orgProcedure
    .use(requirePermission({ tag: ["read"] }))
    .input(z.object({ includeArchived: z.boolean().default(false) }).optional())
    .handler(({ context, input }) => {
      const conditions = [eq(tag.organizationId, context.organizationId)];
      if (!input?.includeArchived) {
        conditions.push(isNull(tag.archivedAt));
      }

      return context.db
        .select(tagFields)
        .from(tag)
        .where(and(...conditions))
        .orderBy(asc(tag.name));
    }),

  restore: orgMutationProcedure
    .use(requirePermission({ tag: ["restore"] }))
    .input(tagIdInput)
    .handler(async ({ context, input }) => {
      const [restored] = await context.db
        .update(tag)
        .set({ archivedAt: null })
        .where(
          and(
            eq(tag.id, input.tagId),
            eq(tag.organizationId, context.organizationId)
          )
        )
        .returning(tagFields);

      if (!restored) {
        throw tagNotFound();
      }
      return restored;
    }),

  update: orgMutationProcedure
    .use(requirePermission({ tag: ["update"] }))
    .input(tagValues.extend({ tagId: z.uuid() }))
    .handler(async ({ context, input }) => {
      const { tagId, ...values } = input;
      try {
        const [updated] = await context.db
          .update(tag)
          .set(values)
          .where(
            and(
              eq(tag.id, tagId),
              eq(tag.organizationId, context.organizationId)
            )
          )
          .returning(tagFields);

        if (!updated) {
          throw tagNotFound();
        }
        return updated;
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw tagConflict();
        }
        throw error;
      }
    }),
};
