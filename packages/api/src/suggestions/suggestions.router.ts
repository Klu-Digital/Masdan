import type { Database } from "@masdan/db";
import {
  category,
  financialTransaction,
  financialTransactionSplit,
  financialTransactionTag,
  tag,
  transactionImport,
  transactionImportRow,
} from "@masdan/db/schema/index";
import type {
  CategorizationProposal,
  TransactionImportRowSuggestion,
  TransactionSuggestionApplication,
} from "@masdan/db/schema/index";
import { log, parseError } from "@masdan/observability";
import { ORPCError } from "@orpc/server";
import { and, asc, count, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";

import { completeJson, isAiConfigured } from "../ai/gateway";
import { findImport } from "../imports/imports.router";
import {
  orgMutationProcedure,
  orgProcedure,
  rateLimit,
  requireFlag,
  requirePermission,
} from "../procedures";
import { findMatchingRule } from "../rules/engine";
import { loadRules, runnableRules } from "../rules/rules.data";
import { updateTransaction } from "../transactions/transactions.router";
import { validCategory, validTags } from "../transactions/transactions.write";
import {
  EMPTY_PROPOSAL,
  SUGGESTION_BATCH_SIZE,
  SUGGESTION_MAX_TAGS,
  isEmptyProposal,
  minimizeSuggestionText,
  resolveSuggestions,
  suggestionExtraction,
  suggestionMessages,
} from "./suggestions.plan";
import type {
  SuggestionHousehold,
  SuggestionKind,
  SuggestionSubject,
} from "./suggestions.plan";

/** A batch of 40 descriptions is one call; give a slow model room for it. */
const SUGGESTION_AI_TIMEOUT_MS = 20_000;
const MAX_REVIEW_TAGS = 10;
const WRITE_CHUNK_SIZE = 500;

const UNAVAILABLE_MESSAGE =
  "Suggestions aren’t available right now. You can still pick a category yourself.";

const uniqueIds = (max: number) =>
  z
    .array(z.uuid())
    .max(max)
    .refine((ids) => new Set(ids).size === ids.length, "Duplicate id");

const importIdInput = z.object({ importId: z.uuid() });

/** Only this household's active categories and tags can ever be suggested. */
const suggestionHousehold = async (
  db: Database,
  organizationId: string
): Promise<SuggestionHousehold> => {
  // Sequential: callers inside a mutation share one transaction connection.
  const categories = await db
    .select({ id: category.id, name: category.name, type: category.type })
    .from(category)
    .where(
      and(
        eq(category.organizationId, organizationId),
        isNull(category.archivedAt)
      )
    )
    .orderBy(asc(category.sortOrder), asc(category.name));
  const tags = await db
    .select({ id: tag.id, name: tag.name })
    .from(tag)
    .where(and(eq(tag.organizationId, organizationId), isNull(tag.archivedAt)))
    .orderBy(asc(tag.name));
  return {
    categories: categories.flatMap((row) =>
      row.type === "expense" || row.type === "income"
        ? [{ ...row, type: row.type }]
        : []
    ),
    tags,
  };
};

/** `null` on any AI failure: the caller reports unavailable, never guesses. */
const askModel = async (
  subjects: SuggestionSubject[],
  household: SuggestionHousehold
): Promise<Map<string, CategorizationProposal> | null> => {
  try {
    const extraction = await completeJson({
      feature: "categorize",
      messages: suggestionMessages(subjects, household),
      name: "categorize_transactions",
      schema: suggestionExtraction,
      timeoutMs: SUGGESTION_AI_TIMEOUT_MS,
    });
    return resolveSuggestions(subjects, household, extraction);
  } catch (error) {
    // Descriptions are financial and never logged; the failure kind is enough.
    log.warn({ action: "suggestions.ai.failed", ...parseError(error) });
    return null;
  }
};

/** A proposal that only restates what the row already has proposes nothing. */
const againstCurrent = (
  proposal: CategorizationProposal,
  current: { categoryId: string; tagIds: readonly string[] }
): CategorizationProposal => ({
  categoryId:
    proposal.categoryId === current.categoryId ? null : proposal.categoryId,
  tagIds: proposal.tagIds.filter((id) => !current.tagIds.includes(id)),
});

// --- Saved transactions ------------------------------------------------------

/** A saved transaction as suggestions see it, or why they can't touch it. */
const suggestionTarget = async (
  db: Database,
  organizationId: string,
  transactionId: string
) => {
  const [row] = await db
    .select({
      accountId: financialTransaction.accountId,
      amount: financialTransaction.amount,
      archivedAt: financialTransaction.archivedAt,
      categoryId: financialTransaction.categoryId,
      id: financialTransaction.id,
      notes: financialTransaction.notes,
      paidStatus: financialTransaction.paidStatus,
      transactionDate: financialTransaction.transactionDate,
      transferId: financialTransaction.transferId,
      type: category.type,
    })
    .from(financialTransaction)
    .leftJoin(category, eq(category.id, financialTransaction.categoryId))
    .where(
      and(
        eq(financialTransaction.id, transactionId),
        eq(financialTransaction.organizationId, organizationId)
      )
    )
    .limit(1);
  if (!row) {
    throw new ORPCError("NOT_FOUND", { message: "Transaction not found" });
  }

  const tagRows = await db
    .select({ tagId: financialTransactionTag.tagId })
    .from(financialTransactionTag)
    .where(eq(financialTransactionTag.transactionId, row.id));
  const [splitCount] = await db
    .select({ total: count() })
    .from(financialTransactionSplit)
    .where(eq(financialTransactionSplit.transactionId, row.id));

  let eligibility: string | null = null;
  if (row.transferId !== null || row.categoryId === null) {
    eligibility = "Suggestions don’t apply to transfers.";
  } else if (row.archivedAt !== null) {
    eligibility = "Restore the transaction first.";
  } else if ((splitCount?.total ?? 0) > 0) {
    eligibility = "Split transactions keep the categories on their splits.";
  }

  const type: SuggestionKind = row.type === "income" ? "income" : "expense";
  return {
    categoryId: row.categoryId ?? "",
    eligibility,
    tagIds: tagRows.map(({ tagId }) => tagId),
    transaction: row,
    type,
  };
};

export type TransactionSuggestionResult =
  | { status: "suggested"; suggested: CategorizationProposal }
  | {
      message: string;
      status: "ineligible" | "none" | "rule" | "unavailable";
    };

/** The ids a client says were suggested must at least be this household's. */
const assertHouseholdProposal = async (
  db: Database,
  organizationId: string,
  proposal: CategorizationProposal
): Promise<void> => {
  const categories = proposal.categoryId
    ? await db
        .select({ id: category.id })
        .from(category)
        .where(
          and(
            eq(category.organizationId, organizationId),
            eq(category.id, proposal.categoryId)
          )
        )
    : [];
  const tags =
    proposal.tagIds.length > 0
      ? await db
          .select({ id: tag.id })
          .from(tag)
          .where(
            and(
              eq(tag.organizationId, organizationId),
              inArray(tag.id, proposal.tagIds)
            )
          )
      : [];
  if (
    categories.length !== (proposal.categoryId ? 1 : 0) ||
    tags.length !== proposal.tagIds.length
  ) {
    throw new ORPCError("BAD_REQUEST", {
      message: "The suggestion doesn’t belong to this household",
    });
  }
};

// --- Import review -----------------------------------------------------------

type ImportDefaults = Pick<
  Awaited<ReturnType<typeof findImport>>,
  "defaultExpenseCategoryId" | "defaultIncomeCategoryId" | "id"
>;

/**
 * Rows no rule and no mapped category column already decided: ready, still on
 * the import's default category, and not yet sent for a suggestion.
 */
const unsuggestedRows = (organizationId: string, current: ImportDefaults) =>
  and(
    eq(transactionImportRow.importId, current.id),
    eq(transactionImportRow.organizationId, organizationId),
    eq(transactionImportRow.status, "valid"),
    isNull(transactionImportRow.ruleApplication),
    isNull(transactionImportRow.suggestion),
    or(
      and(
        eq(transactionImportRow.type, "expense"),
        eq(transactionImportRow.categoryId, current.defaultExpenseCategoryId)
      ),
      and(
        eq(transactionImportRow.type, "income"),
        eq(transactionImportRow.categoryId, current.defaultIncomeCategoryId)
      )
    )
  );

const pendingRows = (organizationId: string, importId: string) =>
  and(
    eq(transactionImportRow.importId, importId),
    eq(transactionImportRow.organizationId, organizationId),
    eq(transactionImportRow.status, "valid"),
    sql`${transactionImportRow.suggestion}->>'status' = 'pending'`
  );

const countRows = async (
  db: Database,
  where: ReturnType<typeof pendingRows>
): Promise<number> => {
  const [row] = await db
    .select({ total: count() })
    .from(transactionImportRow)
    .where(where);
  return row?.total ?? 0;
};

const importSummary = async (
  db: Database,
  organizationId: string,
  current: ImportDefaults
) => {
  const pending = await countRows(db, pendingRows(organizationId, current.id));
  const unsuggested = await countRows(
    db,
    unsuggestedRows(organizationId, current)
  );
  return { pending, unsuggested };
};

/** Suggestions are written and reviewed only while the import awaits review. */
const lockReadyImport = async (
  db: Database,
  organizationId: string,
  importId: string
) => {
  const [locked] = await db
    .select({ status: transactionImport.status })
    .from(transactionImport)
    .where(
      and(
        eq(transactionImport.id, importId),
        eq(transactionImport.organizationId, organizationId)
      )
    )
    .for("update")
    .limit(1);
  if (!locked) {
    throw new ORPCError("NOT_FOUND", { message: "Import not found" });
  }
  if (locked.status !== "ready") {
    throw new ORPCError("CONFLICT", {
      message: "Suggestions can only change while the import awaits review",
    });
  }
};

type ImportDecision =
  | { action: "accept"; categoryId: string; rowId: string; tagIds: string[] }
  | { action: "reject"; rowId: string };

const rowUpdate = (
  decision: ImportDecision,
  suggestion: TransactionImportRowSuggestion,
  userId: string,
  acceptedAt: string
): Partial<typeof transactionImportRow.$inferInsert> => {
  if (decision.action === "reject") {
    return { suggestion: { ...suggestion, status: "rejected" } };
  }
  const application: TransactionSuggestionApplication = {
    acceptedAt,
    acceptedByUserId: userId,
    categoryId: decision.categoryId,
    suggested: suggestion.suggested,
    tagIds: decision.tagIds,
  };
  return {
    categoryId: decision.categoryId,
    suggestion: { ...suggestion, status: "accepted" },
    suggestionApplication: application,
  };
};

/**
 * Every accepted category and tag goes through the same household, archive
 * and direction checks as a manual edit before any row changes.
 */
const applyImportDecisions = async (
  db: Database,
  organizationId: string,
  userId: string,
  importId: string,
  decisions: ImportDecision[]
): Promise<{ accepted: number; rejected: number }> => {
  const rows = await db
    .select({
      id: transactionImportRow.id,
      suggestion: transactionImportRow.suggestion,
      type: transactionImportRow.type,
    })
    .from(transactionImportRow)
    .where(
      and(
        pendingRows(organizationId, importId),
        inArray(
          transactionImportRow.id,
          decisions.map(({ rowId }) => rowId)
        )
      )
    );
  const byId = new Map(rows.map((row) => [row.id, row]));
  if (decisions.some(({ rowId }) => !byId.has(rowId))) {
    throw new ORPCError("CONFLICT", {
      message:
        "Some of these suggestions were already reviewed. Reload the rows.",
    });
  }

  const accepted = decisions.filter((decision) => decision.action === "accept");
  const categoryIds = [
    ...new Set(accepted.map(({ categoryId }) => categoryId)),
  ];
  const categories = new Map<string, { type: string }>();
  for (const id of categoryIds) {
    categories.set(id, await validCategory(db, organizationId, id, false));
  }
  if (
    accepted.some(
      ({ categoryId, rowId }) =>
        categories.get(categoryId)?.type !== byId.get(rowId)?.type
    )
  ) {
    throw new ORPCError("BAD_REQUEST", {
      message: "Each row needs a category of its own direction",
    });
  }
  await validTags(db, organizationId, [
    ...new Set(accepted.flatMap(({ tagIds }) => tagIds)),
  ]);

  const acceptedAt = new Date().toISOString();
  for (const decision of decisions) {
    const suggestion = byId.get(decision.rowId)?.suggestion;
    if (!suggestion) {
      continue;
    }
    await db
      .update(transactionImportRow)
      .set(rowUpdate(decision, suggestion, userId, acceptedAt))
      .where(
        and(
          eq(transactionImportRow.id, decision.rowId),
          eq(transactionImportRow.organizationId, organizationId)
        )
      );
  }
  return {
    accepted: accepted.length,
    rejected: decisions.length - accepted.length,
  };
};

const chunked = <T>(items: T[]): T[][] => {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += WRITE_CHUNK_SIZE) {
    result.push(items.slice(index, index + WRITE_CHUNK_SIZE));
  }
  return result;
};

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
  /** Accepts every pending suggestion as proposed; skips ones gone stale. */
  acceptAllForImport: suggestionsMutationProcedure
    .use(requirePermission({ transaction: ["create"] }))
    .input(importIdInput)
    .handler(async ({ context, input }) => {
      const current = await findImport(
        context.db,
        context.organizationId,
        input.importId
      );
      await lockReadyImport(context.db, context.organizationId, current.id);
      const rows = await context.db
        .select({
          categoryId: transactionImportRow.categoryId,
          id: transactionImportRow.id,
          suggestion: transactionImportRow.suggestion,
          type: transactionImportRow.type,
        })
        .from(transactionImportRow)
        .where(pendingRows(context.organizationId, current.id));
      const household = await suggestionHousehold(
        context.db,
        context.organizationId
      );
      const activeCategories = new Map(
        household.categories.map((item) => [item.id, item.type])
      );
      const activeTags = new Set(household.tags.map(({ id }) => id));

      const decisions: ImportDecision[] = rows.flatMap((row) => {
        const suggested = row.suggestion?.suggested;
        const categoryId = suggested?.categoryId ?? row.categoryId;
        const stale =
          !suggested ||
          !categoryId ||
          activeCategories.get(categoryId) !== row.type ||
          suggested.tagIds.some((id) => !activeTags.has(id));
        return stale
          ? []
          : [
              {
                action: "accept" as const,
                categoryId,
                rowId: row.id,
                tagIds: suggested.tagIds,
              },
            ];
      });
      const result =
        decisions.length === 0
          ? { accepted: 0, rejected: 0 }
          : await applyImportDecisions(
              context.db,
              context.organizationId,
              context.session.user.id,
              current.id,
              decisions
            );
      return {
        ...result,
        ...(await importSummary(context.db, context.organizationId, current)),
      };
    }),

  /**
   * Accepts a single-transaction suggestion through the manual edit path, as
   * the user left it: `categoryId` and `tagIds` are what they kept, and
   * `suggested` is what was proposed, recorded next to it as provenance.
   */
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
    .handler(async ({ context, input }) => {
      const target = await suggestionTarget(
        context.db,
        context.organizationId,
        input.transactionId
      );
      if (target.eligibility) {
        throw new ORPCError("BAD_REQUEST", { message: target.eligibility });
      }
      const chosen = await validCategory(
        context.db,
        context.organizationId,
        input.categoryId,
        input.categoryId === target.categoryId
      );
      if (chosen.type !== target.type) {
        throw new ORPCError("BAD_REQUEST", {
          message: `Choose a money ${target.type === "income" ? "in" : "out"} category`,
        });
      }
      await validTags(
        context.db,
        context.organizationId,
        input.tagIds,
        new Set(target.tagIds)
      );
      await assertHouseholdProposal(
        context.db,
        context.organizationId,
        input.suggested
      );

      const addedTagIds = input.tagIds.filter(
        (id) => !target.tagIds.includes(id)
      );
      const { transaction } = target;
      return updateTransaction(
        context.db,
        context.organizationId,
        {
          accountId: transaction.accountId,
          amount: transaction.amount,
          categoryId: input.categoryId,
          notes: transaction.notes,
          paidStatus: transaction.paidStatus,
          tagIds: [...target.tagIds, ...addedTagIds],
          transactionDate: transaction.transactionDate,
          transactionId: transaction.id,
        },
        {
          suggestionApplication: {
            acceptedAt: new Date().toISOString(),
            acceptedByUserId: context.session.user.id,
            categoryId: input.categoryId,
            suggested: input.suggested,
            tagIds: addedTagIds,
          },
        }
      );
    }),

  /**
   * Suggests for the next batch of distinct descriptions in an import under
   * review. Rows are only annotated: a row's category changes on accept.
   * Rows sharing a description share one suggestion, so each is sent once.
   */
  forImport: suggestionsProcedure
    .use(requirePermission({ transaction: ["create"] }))
    .use(rateLimit({ limit: 10, window: 60 }))
    .input(importIdInput)
    .handler(async ({ context, input }) => {
      const current = await findImport(
        context.db,
        context.organizationId,
        input.importId
      );
      if (current.status !== "ready") {
        throw new ORPCError("CONFLICT", {
          message: "Suggestions can only change while the import awaits review",
        });
      }
      const rows = await context.db
        .select({
          description: transactionImportRow.description,
          id: transactionImportRow.id,
          notes: transactionImportRow.notes,
          type: transactionImportRow.type,
        })
        .from(transactionImportRow)
        .where(unsuggestedRows(context.organizationId, current))
        .orderBy(asc(transactionImportRow.rowNumber));

      const groups = new Map<
        string,
        { rowIds: string[]; subject: SuggestionSubject }
      >();
      const textless: string[] = [];
      for (const row of rows) {
        const text = minimizeSuggestionText(row.description ?? row.notes ?? "");
        if (!row.type || !text) {
          textless.push(row.id);
          continue;
        }
        const key = `${row.type}:${text.toLowerCase()}`;
        const group = groups.get(key);
        if (group) {
          group.rowIds.push(row.id);
        } else {
          groups.set(key, {
            rowIds: [row.id],
            subject: { key, text, type: row.type },
          });
        }
      }
      const batch = [...groups.values()].slice(0, SUGGESTION_BATCH_SIZE);

      let proposals = new Map<string, CategorizationProposal>();
      if (batch.length > 0) {
        if (!isAiConfigured("categorize")) {
          return {
            message: UNAVAILABLE_MESSAGE,
            status: "unavailable" as const,
          };
        }
        const answered = await askModel(
          batch.map(({ subject }) => subject),
          await suggestionHousehold(context.db, context.organizationId)
        );
        if (!answered) {
          return {
            message: UNAVAILABLE_MESSAGE,
            status: "unavailable" as const,
          };
        }
        proposals = answered;
      }

      const suggestedAt = new Date().toISOString();
      const writes: {
        rowIds: string[];
        suggestion: TransactionImportRowSuggestion;
      }[] = batch.map(({ rowIds, subject }) => {
        const suggested = againstCurrent(
          proposals.get(subject.key) ?? EMPTY_PROPOSAL,
          {
            categoryId:
              subject.type === "income"
                ? current.defaultIncomeCategoryId
                : current.defaultExpenseCategoryId,
            tagIds: [],
          }
        );
        return {
          rowIds,
          suggestion: {
            status: isEmptyProposal(suggested) ? "empty" : "pending",
            suggested,
            suggestedAt,
          },
        };
      });
      if (textless.length > 0) {
        writes.push({
          rowIds: textless,
          suggestion: {
            status: "empty",
            suggested: EMPTY_PROPOSAL,
            suggestedAt,
          },
        });
      }

      await context.db.transaction(async (tx) => {
        await lockReadyImport(tx, context.organizationId, current.id);
        for (const { rowIds, suggestion } of writes) {
          for (const ids of chunked(rowIds)) {
            await tx
              .update(transactionImportRow)
              .set({ suggestion })
              .where(
                and(
                  eq(transactionImportRow.importId, current.id),
                  eq(
                    transactionImportRow.organizationId,
                    context.organizationId
                  ),
                  inArray(transactionImportRow.id, ids),
                  isNull(transactionImportRow.suggestion)
                )
              );
          }
        }
      });

      return {
        status: "suggested" as const,
        ...(await importSummary(context.db, context.organizationId, current)),
      };
    }),

  /**
   * Suggests a category and tags for one saved transaction. Read-only: a
   * rule that matches answers first, and nothing changes until accepted.
   */
  forTransaction: suggestionsProcedure
    .use(requirePermission({ transaction: ["update"] }))
    .use(rateLimit({ limit: 30, window: 60 }))
    .input(z.object({ transactionId: z.uuid() }))
    .handler(
      async ({ context, input }): Promise<TransactionSuggestionResult> => {
        const target = await suggestionTarget(
          context.db,
          context.organizationId,
          input.transactionId
        );
        if (target.eligibility) {
          return { message: target.eligibility, status: "ineligible" };
        }
        const text = minimizeSuggestionText(target.transaction.notes ?? "");
        if (!text) {
          return {
            message: "Add a note first: suggestions read what it says.",
            status: "ineligible",
          };
        }
        const rule = findMatchingRule(
          runnableRules(await loadRules(context.db, context.organizationId)),
          {
            accountId: target.transaction.accountId,
            amount: target.transaction.amount,
            description: target.transaction.notes,
            type: target.type,
          }
        );
        if (rule) {
          return {
            message: `Your rule “${rule.rule.name}” covers this transaction.`,
            status: "rule",
          };
        }
        if (!isAiConfigured("categorize")) {
          return { message: UNAVAILABLE_MESSAGE, status: "unavailable" };
        }

        const subject = { key: target.transaction.id, text, type: target.type };
        const proposals = await askModel(
          [subject],
          await suggestionHousehold(context.db, context.organizationId)
        );
        if (!proposals) {
          return { message: UNAVAILABLE_MESSAGE, status: "unavailable" };
        }
        const suggested = againstCurrent(
          proposals.get(subject.key) ?? EMPTY_PROPOSAL,
          target
        );
        return isEmptyProposal(suggested)
          ? {
              message: "Nothing to suggest beyond what it has.",
              status: "none",
            }
          : { status: "suggested", suggested };
      }
    ),

  /** How many rows await review, and how many could still be suggested. */
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

  /** Accept (as proposed or edited) or reject pending import suggestions. */
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
    .handler(async ({ context, input }) => {
      const current = await findImport(
        context.db,
        context.organizationId,
        input.importId
      );
      await lockReadyImport(context.db, context.organizationId, current.id);
      const result = await applyImportDecisions(
        context.db,
        context.organizationId,
        context.session.user.id,
        current.id,
        input.decisions
      );
      return {
        ...result,
        ...(await importSummary(context.db, context.organizationId, current)),
      };
    }),
};
