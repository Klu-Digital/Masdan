import { z } from "zod";

import { findImport } from "../imports/imports.queries";
import {
  orgMutationProcedure,
  orgProcedure,
  rateLimit,
  requireFlag,
  requirePermission,
} from "../procedures";
import {
  acceptAllForImport,
  acceptForTransaction,
  resolveImportRows,
  suggestForImport,
} from "./suggestions.commands";
import { SUGGESTION_MAX_TAGS } from "./suggestions.plan";
import { importSummary, suggestForTransaction } from "./suggestions.queries";

const MAX_REVIEW_TAGS = 10;

const uniqueIds = (max: number) =>
  z
    .array(z.uuid())
    .max(max)
    .refine((ids) => new Set(ids).size === ids.length, "Duplicate id");

const importIdInput = z.object({ importId: z.uuid() });

const importDecision = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("accept"),
      categoryId: z.uuid(),
      rowId: z.uuid(),
      tagIds: uniqueIds(MAX_REVIEW_TAGS).default([]),
    })
    .strict(),
  z.object({ action: z.literal("reject"), rowId: z.uuid() }).strict(),
]);

const suggestionsProcedure = orgProcedure.use(
  requireFlag("FF__AI_CATEGORIZATION")
);
const suggestionsMutationProcedure = orgMutationProcedure.use(
  requireFlag("FF__AI_CATEGORIZATION")
);

export const suggestionsRouter = {
  acceptAllForImport: suggestionsMutationProcedure
    .use(requirePermission({ transaction: ["create"] }))
    .input(importIdInput)
    .handler(({ context, input }) =>
      acceptAllForImport(
        context.db,
        context.organizationId,
        context.session.user.id,
        input.importId
      )
    ),

  acceptForTransaction: suggestionsMutationProcedure
    .use(requirePermission({ transaction: ["update"] }))
    .input(
      z
        .object({
          categoryId: z.uuid(),
          suggested: z
            .object({
              categoryId: z.uuid().nullable(),
              tagIds: uniqueIds(SUGGESTION_MAX_TAGS),
            })
            .strict(),
          tagIds: uniqueIds(MAX_REVIEW_TAGS).default([]),
          transactionId: z.uuid(),
        })
        .strict()
    )
    .handler(({ context, input }) =>
      acceptForTransaction(
        context.db,
        context.organizationId,
        context.session.user.id,
        input
      )
    ),

  forImport: suggestionsProcedure
    .use(requirePermission({ transaction: ["create"] }))
    .use(rateLimit({ limit: 10, window: 60 }))
    .input(importIdInput)
    .handler(({ context, input }) =>
      suggestForImport(context.db, context.organizationId, input.importId)
    ),

  forTransaction: suggestionsProcedure
    .use(requirePermission({ transaction: ["update"] }))
    .use(rateLimit({ limit: 30, window: 60 }))
    .input(z.object({ transactionId: z.uuid() }))
    .handler(({ context, input }) =>
      suggestForTransaction(
        context.db,
        context.organizationId,
        input.transactionId
      )
    ),

  importSummary: suggestionsProcedure
    .use(requirePermission({ transaction: ["read"] }))
    .input(importIdInput)
    .handler(async ({ context, input }) => {
      const current = await findImport(
        context.db,
        context.organizationId,
        input.importId
      );
      return importSummary(context.db, context.organizationId, current);
    }),

  resolveImportRows: suggestionsMutationProcedure
    .use(requirePermission({ transaction: ["create"] }))
    .input(
      importIdInput.extend({
        decisions: z
          .array(importDecision)
          .min(1)
          .max(200)
          .refine(
            (decisions) =>
              new Set(decisions.map(({ rowId }) => rowId)).size ===
              decisions.length,
            "Decide each row once"
          ),
      })
    )
    .handler(({ context, input }) =>
      resolveImportRows(
        context.db,
        context.organizationId,
        context.session.user.id,
        input.importId,
        input.decisions
      )
    ),
};
