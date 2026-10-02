import type { Database } from "@masdan/db";
import {
  category,
  financialTransaction,
  financialTransactionSplit,
  financialTransactionTag,
  tag,
  transactionImportRow,
} from "@masdan/db/schema/index";
import type { CategorizationProposal } from "@masdan/db/schema/index";
import { log, parseError } from "@masdan/observability";
import { and, asc, count, eq, isNull, or, sql } from "drizzle-orm";

import { completeJson, isAiConfigured } from "../ai/gateway";
import type { AiSpender } from "../ai/usage";
import type { findImport } from "../imports/imports.queries";
import { findMatchingRule } from "../rules/engine";
import { loadRules, runnableRules } from "../rules/rules.data";
import { notFound } from "../shared/errors";
import {
  EMPTY_PROPOSAL,
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

export const UNAVAILABLE_MESSAGE =
  "Suggestions aren’t available right now. You can still pick a category yourself.";

/** Only this household's active categories and tags can ever be suggested. */
export const suggestionHousehold = async (
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
export const askModel = async (
  spender: AiSpender,
  subjects: SuggestionSubject[],
  household: SuggestionHousehold
): Promise<Map<string, CategorizationProposal> | null> => {
  try {
    const extraction = await completeJson({
      feature: "categorize",
      messages: suggestionMessages(subjects, household),
      name: "categorize_transactions",
      schema: suggestionExtraction,
      spender,
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
export const againstCurrent = (
  proposal: CategorizationProposal,
  current: { categoryId: string; tagIds: readonly string[] }
): CategorizationProposal => ({
  categoryId:
    proposal.categoryId === current.categoryId ? null : proposal.categoryId,
  tagIds: proposal.tagIds.filter((id) => !current.tagIds.includes(id)),
});

// --- Saved transactions ------------------------------------------------------

/** A saved transaction as suggestions see it, or why they can't touch it. */
export const suggestionTarget = async (
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
    throw notFound("Transaction");
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

export const suggestForTransaction = async (
  db: Database,
  organizationId: string,
  userId: string,
  transactionId: string
): Promise<TransactionSuggestionResult> => {
  const target = await suggestionTarget(db, organizationId, transactionId);
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
    runnableRules(await loadRules(db, organizationId)),
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
    { db, organizationId, userId },
    [subject],
    await suggestionHousehold(db, organizationId)
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
};

// --- Import review -----------------------------------------------------------

export type ImportDefaults = Pick<
  Awaited<ReturnType<typeof findImport>>,
  "defaultExpenseCategoryId" | "defaultIncomeCategoryId" | "id"
>;

export const unsuggestedRows = (
  organizationId: string,
  current: ImportDefaults
) =>
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

export const pendingRows = (organizationId: string, importId: string) =>
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

/** How many rows await review, and how many could still be suggested. */
export const importSummary = async (
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
