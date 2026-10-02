import type { Database } from "@masdan/db";
import {
  category,
  tag,
  transactionImport,
  transactionImportRow,
} from "@masdan/db/schema/index";
import type {
  CategorizationProposal,
  TransactionImportRowSuggestion,
  TransactionSuggestionApplication,
} from "@masdan/db/schema/index";
import { ORPCError } from "@orpc/server";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";

import { isAiConfigured } from "../ai/gateway";
import { findImport } from "../imports/imports.queries";
import { chunks } from "../shared/chunks";
import { lockOwned } from "../shared/ownership";
import { updateTransaction } from "../transactions/transactions.commands";
import { validCategory, validTags } from "../transactions/transactions.write";
import {
  EMPTY_PROPOSAL,
  SUGGESTION_BATCH_SIZE,
  isEmptyProposal,
  minimizeSuggestionText,
} from "./suggestions.plan";
import type { SuggestionSubject } from "./suggestions.plan";
import {
  UNAVAILABLE_MESSAGE,
  againstCurrent,
  askModel,
  importSummary,
  pendingRows,
  suggestionHousehold,
  suggestionTarget,
  unsuggestedRows,
} from "./suggestions.queries";

const WRITE_CHUNK_SIZE = 500;

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

export const acceptForTransaction = async (
  db: Database,
  organizationId: string,
  userId: string,
  input: {
    categoryId: string;
    suggested: CategorizationProposal;
    tagIds: string[];
    transactionId: string;
  }
) => {
  const target = await suggestionTarget(
    db,
    organizationId,
    input.transactionId
  );
  if (target.eligibility) {
    throw new ORPCError("BAD_REQUEST", { message: target.eligibility });
  }
  const chosen = await validCategory(
    db,
    organizationId,
    input.categoryId,
    input.categoryId === target.categoryId
  );
  if (chosen.type !== target.type) {
    throw new ORPCError("BAD_REQUEST", {
      message: `Choose a money ${target.type === "income" ? "in" : "out"} category`,
    });
  }
  await validTags(db, organizationId, input.tagIds, new Set(target.tagIds));
  await assertHouseholdProposal(db, organizationId, input.suggested);

  const addedTagIds = input.tagIds.filter((id) => !target.tagIds.includes(id));
  const { transaction } = target;
  return updateTransaction(
    db,
    organizationId,
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
        acceptedByUserId: userId,
        categoryId: input.categoryId,
        suggested: input.suggested,
        tagIds: addedTagIds,
      },
    }
  );
};

// --- Import review -----------------------------------------------------------

const REVIEW_CONFLICT =
  "Suggestions can only change while the import awaits review";

/** Suggestions are written and reviewed only while the import awaits review. */
const lockReadyImport = async (
  db: Database,
  organizationId: string,
  importId: string
): Promise<void> => {
  const locked = await lockOwned(
    db,
    transactionImport,
    { id: importId, organizationId },
    "Import"
  );
  if (locked.status !== "ready") {
    throw new ORPCError("CONFLICT", { message: REVIEW_CONFLICT });
  }
};

export type ImportDecision =
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

/** Accept (as proposed or edited) or reject pending import suggestions. */
export const resolveImportRows = async (
  db: Database,
  organizationId: string,
  userId: string,
  importId: string,
  decisions: ImportDecision[]
) => {
  const current = await findImport(db, organizationId, importId);
  await lockReadyImport(db, organizationId, current.id);
  const result = await applyImportDecisions(
    db,
    organizationId,
    userId,
    current.id,
    decisions
  );
  return {
    ...result,
    ...(await importSummary(db, organizationId, current)),
  };
};

/** Accepts every pending suggestion as proposed; skips ones gone stale. */
export const acceptAllForImport = async (
  db: Database,
  organizationId: string,
  userId: string,
  importId: string
) => {
  const current = await findImport(db, organizationId, importId);
  await lockReadyImport(db, organizationId, current.id);
  const rows = await db
    .select({
      categoryId: transactionImportRow.categoryId,
      id: transactionImportRow.id,
      suggestion: transactionImportRow.suggestion,
      type: transactionImportRow.type,
    })
    .from(transactionImportRow)
    .where(pendingRows(organizationId, current.id));
  const household = await suggestionHousehold(db, organizationId);
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
          db,
          organizationId,
          userId,
          current.id,
          decisions
        );
  return {
    ...result,
    ...(await importSummary(db, organizationId, current)),
  };
};

export const suggestForImport = async (
  db: Database,
  organizationId: string,
  importId: string
) => {
  const current = await findImport(db, organizationId, importId);
  if (current.status !== "ready") {
    throw new ORPCError("CONFLICT", { message: REVIEW_CONFLICT });
  }
  const rows = await db
    .select({
      description: transactionImportRow.description,
      id: transactionImportRow.id,
      notes: transactionImportRow.notes,
      type: transactionImportRow.type,
    })
    .from(transactionImportRow)
    .where(unsuggestedRows(organizationId, current))
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
      { db, organizationId },
      batch.map(({ subject }) => subject),
      await suggestionHousehold(db, organizationId)
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

  await db.transaction(async (tx) => {
    await lockReadyImport(tx, organizationId, current.id);
    for (const { rowIds, suggestion } of writes) {
      for (const ids of chunks(rowIds, WRITE_CHUNK_SIZE)) {
        await tx
          .update(transactionImportRow)
          .set({ suggestion })
          .where(
            and(
              eq(transactionImportRow.importId, current.id),
              eq(transactionImportRow.organizationId, organizationId),
              inArray(transactionImportRow.id, ids),
              isNull(transactionImportRow.suggestion)
            )
          );
      }
    }
  });

  return {
    status: "suggested" as const,
    ...(await importSummary(db, organizationId, current)),
  };
};
