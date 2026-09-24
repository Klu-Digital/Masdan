import type { Database } from "@masdan/db";
import { creditCardReminder } from "@masdan/db/schema/index";
import type {
  CardReminderKind,
  CardReminderStatus,
} from "@masdan/db/schema/index";
import { queue } from "@masdan/queue";
import { ORPCError } from "@orpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import {
  orgMutationProcedure,
  orgProcedure,
  requirePermission,
} from "../procedures";
import { daysBetween } from "../reports/periods";
import { signedScaledAmount } from "../transactions/amounts";
import { REMINDER_LEAD_DAYS } from "./reminder-rules";
import {
  loadActiveReminders,
  loadHouseholdCards,
  resolutionOf,
} from "./reminders.queries";

export interface CardReminder {
  account: {
    cardLastFour: string | null;
    cardNetwork: string | null;
    color: string | null;
    currencyCode: string;
    icon: string | null;
    id: string;
    name: string;
  };
  /** The card's current amount owed. */
  balance: string;
  /** Negative once the date has passed. */
  daysLeft: number;
  eventDate: string;
  id: string;
  kind: CardReminderKind;
  minimumAmountDue: string | null;
  /** Payment reminders only: whether payments so far cover the statement's minimum. */
  minimumPaid: boolean;
  /** Payment reminders only: transfers into the card counted toward it. */
  paidAmount: string | null;
  /** A payment's amount comes from a recorded statement or is projected from the card's due day. */
  source: "statement" | "card";
  statementBalance: string | null;
}

const reminderIdInput = z.object({ reminderId: z.uuid() });

const reminderNotFound = () =>
  new ORPCError("NOT_FOUND", { message: "Reminder not found" });

/**
 * Asks the worker to regenerate the household's reminders after a change to
 * its cards or statements, on the mutation's transaction so the job only
 * exists if the change commits. The hourly sweep covers it when the queue is
 * down; the per-household `singletonKey` collapses a burst of edits into one
 * queued refresh.
 */
export const enqueueReminderRefresh = async (
  db: Database,
  organizationId: string
): Promise<void> => {
  if (!queue.isStarted()) {
    return;
  }
  await queue.enqueue(
    "reminders.refresh",
    { organizationId },
    { singletonKey: organizationId, tx: db }
  );
};

const transition = async (
  db: Database,
  organizationId: string,
  reminderId: string,
  from: CardReminderStatus,
  values: Partial<typeof creditCardReminder.$inferInsert>
): Promise<{ id: string; status: CardReminderStatus }> => {
  const [updated] = await db
    .update(creditCardReminder)
    .set(values)
    .where(
      and(
        eq(creditCardReminder.id, reminderId),
        eq(creditCardReminder.organizationId, organizationId),
        eq(creditCardReminder.status, from)
      )
    )
    .returning({
      id: creditCardReminder.id,
      status: creditCardReminder.status,
    });
  if (updated) {
    return updated;
  }
  // Already moved on — dismissed twice, or resolved by the worker meanwhile.
  const [current] = await db
    .select({
      id: creditCardReminder.id,
      status: creditCardReminder.status,
    })
    .from(creditCardReminder)
    .where(
      and(
        eq(creditCardReminder.id, reminderId),
        eq(creditCardReminder.organizationId, organizationId)
      )
    )
    .limit(1);
  if (!current) {
    throw reminderNotFound();
  }
  return current;
};

export const remindersRouter = {
  dismiss: orgMutationProcedure
    .use(requirePermission({ reminder: ["dismiss"] }))
    .input(reminderIdInput)
    .handler(({ context, input }) =>
      transition(
        context.db,
        context.organizationId,
        input.reminderId,
        "active",
        {
          dismissedAt: new Date(),
          dismissedByUserId: context.session.user.id,
          status: "dismissed",
        }
      )
    ),

  /**
   * Active, still-actionable reminders, soonest first. Judged live against
   * the ledger, so paying a card or recording its statement hides a reminder
   * immediately; the worker persists the same judgement on its next run.
   */
  list: orgProcedure
    .use(requirePermission({ financialAccount: ["read"], reminder: ["read"] }))
    .handler(async ({ context }) => {
      const [state, reminders] = await Promise.all([
        loadHouseholdCards(context.db, context.organizationId, new Date()),
        loadActiveReminders(context.db, context.organizationId),
      ]);
      const items: CardReminder[] = [];
      for (const reminder of reminders) {
        const card = state.cards.get(reminder.accountId);
        const daysLeft = daysBetween(state.today, reminder.eventDate);
        if (
          !card ||
          daysLeft > REMINDER_LEAD_DAYS ||
          resolutionOf(reminder, state) !== null
        ) {
          continue;
        }
        const payment = reminder.kind === "payment";
        const minimum = reminder.statement?.minimumAmountDue ?? null;
        items.push({
          account: {
            cardLastFour: card.cardLastFour,
            cardNetwork: card.cardNetwork,
            color: card.color,
            currencyCode: card.currencyCode,
            icon: card.icon,
            id: card.id,
            name: card.name,
          },
          balance: card.balance,
          daysLeft,
          eventDate: reminder.eventDate,
          id: reminder.id,
          kind: reminder.kind,
          minimumAmountDue: minimum,
          minimumPaid:
            payment &&
            minimum !== null &&
            signedScaledAmount(minimum) > 0n &&
            signedScaledAmount(reminder.paidAmount) >=
              signedScaledAmount(minimum),
          paidAmount: payment ? reminder.paidAmount : null,
          source: reminder.statement ? "statement" : "card",
          statementBalance: reminder.statement?.statementBalance ?? null,
        });
      }
      return { items, today: state.today };
    }),

  /** Undoes a dismissal. The reminder is judged afresh, so it only reappears if still actionable. */
  restore: orgMutationProcedure
    .use(requirePermission({ reminder: ["dismiss"] }))
    .input(reminderIdInput)
    .handler(({ context, input }) =>
      transition(
        context.db,
        context.organizationId,
        input.reminderId,
        "dismissed",
        { dismissedAt: null, dismissedByUserId: null, status: "active" }
      )
    ),
};
