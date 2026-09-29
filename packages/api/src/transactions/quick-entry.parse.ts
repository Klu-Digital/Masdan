import type { Database } from "@masdan/db";
import { category, financialAccount } from "@masdan/db/schema/index";
import { log, parseError } from "@masdan/observability";
import { and, asc, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { completeJson, isAiConfigured } from "../ai/gateway";
import { householdDate } from "../shared/household";
import {
  QUICK_ENTRY_MAX_LENGTH,
  quickEntryExtraction,
  quickEntryMessages,
  resolveQuickEntry,
} from "./quick-entry";
import type {
  QuickEntryExtraction,
  QuickEntryHousehold,
  QuickEntryResult,
} from "./quick-entry";

/** Long enough for a slow model, short enough that typing it by hand isn't faster. */
const QUICK_ENTRY_AI_TIMEOUT_MS = 8000;

export const quickEntryText = z
  .string()
  .trim()
  .min(1)
  .max(QUICK_ENTRY_MAX_LENGTH);

export type QuickEntryAiStatus = "failed" | "ok" | "unavailable";

export interface QuickEntryParse extends QuickEntryResult {
  ai: QuickEntryAiStatus;
}

/** Only this household's active accounts and categories can ever be matched. */
export const quickEntryHousehold = async (
  db: Database,
  organizationId: string
): Promise<QuickEntryHousehold> => {
  const [accounts, categories, today] = await Promise.all([
    db
      .select({
        accountType: financialAccount.accountType,
        cardLastFour: financialAccount.cardLastFour,
        cardNetwork: financialAccount.cardNetwork,
        cardProductKey: financialAccount.cardProductKey,
        currencyCode: financialAccount.currencyCode,
        id: financialAccount.id,
        institution: financialAccount.institution,
        name: financialAccount.name,
      })
      .from(financialAccount)
      .where(
        and(
          eq(financialAccount.organizationId, organizationId),
          isNull(financialAccount.archivedAt)
        )
      )
      .orderBy(asc(financialAccount.name)),
    db
      .select({ id: category.id, name: category.name, type: category.type })
      .from(category)
      .where(
        and(
          eq(category.organizationId, organizationId),
          isNull(category.archivedAt)
        )
      )
      .orderBy(asc(category.sortOrder), asc(category.name)),
    householdDate(db, organizationId),
  ]);

  return {
    accounts,
    categories: categories.flatMap((row) =>
      row.type === "expense" || row.type === "income"
        ? [{ ...row, type: row.type }]
        : []
    ),
    today,
  };
};

/**
 * Reads one line of text into create input, side-effect free. The caller must
 * already have authorized `organizationId`: this function checks nothing.
 * Throws a `ZodError` for empty or overlong text, before any model call.
 */
export const parseQuickEntryText = async (
  db: Database,
  organizationId: string,
  text: string
): Promise<QuickEntryParse> => {
  const note = quickEntryText.parse(text);
  const household = await quickEntryHousehold(db, organizationId);
  let ai: QuickEntryAiStatus = "unavailable";
  let extraction: QuickEntryExtraction | null = null;
  if (isAiConfigured("quickTransaction")) {
    try {
      extraction = await completeJson({
        feature: "quickTransaction",
        household: { db, organizationId },
        messages: quickEntryMessages(note, household),
        name: "quick_transaction",
        schema: quickEntryExtraction,
        timeoutMs: QUICK_ENTRY_AI_TIMEOUT_MS,
      });
      ai = "ok";
    } catch (error) {
      // The text is financial and never logged; the failure kind is enough.
      ai = "failed";
      log.warn({ action: "quickentry.ai.failed", ...parseError(error) });
    }
  }

  return { ai, ...resolveQuickEntry(note, household, extraction) };
};
