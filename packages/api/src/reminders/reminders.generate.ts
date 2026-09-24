import type { Database } from "@masdan/db";
import {
  creditCardReminder,
  creditCardStatement,
  financialAccount,
  organization,
} from "@masdan/db/schema/index";
import type { CardReminderResolution } from "@masdan/db/schema/index";
import {
  and,
  eq,
  exists,
  inArray,
  isNotNull,
  isNull,
  or,
  sql,
} from "drizzle-orm";

import { reminderCandidates } from "./reminder-rules";
import {
  loadActiveReminders,
  loadHouseholdCards,
  resolutionOf,
} from "./reminders.queries";

/**
 * Worker-side generation. No procedure ladder: apps/workers runs it, one
 * household per job, so every read and write below stays inside that
 * household.
 */

export interface RefreshResult {
  /** Reminders inserted in this run. */
  created: number;
  /** Active reminders this run marked resolved. */
  resolved: number;
}

/**
 * Inserts the reminders the household's cards are owed today and resolves
 * the ones that stopped being actionable. Safe to run twice or concurrently:
 * the unique (card, kind, date) index turns a repeat insert into a no-op, and
 * a resolution only ever moves an `active` row.
 */
export const refreshHouseholdReminders = async (
  db: Database,
  organizationId: string,
  now: Date
): Promise<RefreshResult> => {
  const [household] = await db
    .select({ id: organization.id })
    .from(organization)
    .where(eq(organization.id, organizationId))
    .limit(1);
  if (!household) {
    return { created: 0, resolved: 0 };
  }

  return db.transaction(async (tx) => {
    const state = await loadHouseholdCards(tx, organizationId, now);
    const candidates = [...state.cards.values()].flatMap((card) =>
      reminderCandidates(
        card,
        state.latest.get(card.id) ?? null,
        state.today
      ).map((candidate) => ({
        ...candidate,
        accountId: card.id,
        organizationId,
      }))
    );
    const inserted = candidates.length
      ? await tx
          .insert(creditCardReminder)
          .values(candidates)
          .onConflictDoNothing()
          .returning({ id: creditCardReminder.id })
      : [];

    const byResolution = new Map<CardReminderResolution, string[]>();
    for (const reminder of await loadActiveReminders(tx, organizationId)) {
      const resolution = resolutionOf(reminder, state);
      if (resolution) {
        byResolution.set(resolution, [
          ...(byResolution.get(resolution) ?? []),
          reminder.id,
        ]);
      }
    }
    let resolved = 0;
    for (const [resolution, ids] of byResolution) {
      const rows = await tx
        .update(creditCardReminder)
        .set({ resolution, resolvedAt: now, status: "resolved" })
        .where(
          and(
            eq(creditCardReminder.organizationId, organizationId),
            eq(creditCardReminder.status, "active"),
            inArray(creditCardReminder.id, ids)
          )
        )
        .returning({ id: creditCardReminder.id });
      resolved += rows.length;
    }

    return { created: inserted.length, resolved };
  });
};

/**
 * Households with something to generate or resolve: an open card with a
 * closing or due day, a statement, or a reminder still active.
 */
export const findHouseholdsToRefresh = async (
  db: Database
): Promise<string[]> => {
  const rows = await db
    .selectDistinct({ organizationId: financialAccount.organizationId })
    .from(financialAccount)
    .where(
      and(
        eq(financialAccount.accountType, "credit_card"),
        isNull(financialAccount.archivedAt),
        or(
          isNotNull(financialAccount.statementClosingDay),
          isNotNull(financialAccount.paymentDueDay),
          exists(
            db
              .select({ one: sql`1` })
              .from(creditCardStatement)
              .where(eq(creditCardStatement.accountId, financialAccount.id))
          )
        )
      )
    )
    .union(
      db
        .selectDistinct({ organizationId: creditCardReminder.organizationId })
        .from(creditCardReminder)
        .where(eq(creditCardReminder.status, "active"))
    );
  return rows.map(({ organizationId }) => organizationId);
};
