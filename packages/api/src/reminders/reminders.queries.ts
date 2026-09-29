import type { Database } from "@masdan/db";
import {
  creditCardReminder,
  creditCardStatement,
  financialAccount,
  financialTransaction,
} from "@masdan/db/schema/index";
import type {
  CardReminderKind,
  CardReminderResolution,
} from "@masdan/db/schema/index";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";

import { getAccountBalances } from "../accounts/balances";
import { householdToday } from "../reports/periods";
import { householdSettings } from "../shared/household";
import { reminderResolution } from "./reminder-rules";
import type { ReminderCard, ReminderStatement } from "./reminder-rules";

/**
 * Everything here is scoped by `organizationId`: a household's reminders are
 * judged only against its own cards, statements and payments.
 */

interface HouseholdCard extends ReminderCard {
  cardLastFour: string | null;
  cardNetwork: string | null;
  cardProductKey: string | null;
  color: string | null;
  currencyCode: string;
  icon: string | null;
  id: string;
  institution: string | null;
  name: string;
}

export interface HouseholdCardState {
  cards: Map<string, HouseholdCard>;
  latest: Map<string, ReminderStatement>;
  today: string;
}

/** Credit cards (archived ones too, so their reminders can resolve) and their latest statements. */
export const loadHouseholdCards = async (
  db: Database,
  organizationId: string,
  now: Date
): Promise<HouseholdCardState> => {
  const { timezone } = await householdSettings(db, organizationId);
  const rows = await db
    .select({
      archivedAt: financialAccount.archivedAt,
      cardLastFour: financialAccount.cardLastFour,
      cardNetwork: financialAccount.cardNetwork,
      cardProductKey: financialAccount.cardProductKey,
      color: financialAccount.color,
      currencyCode: financialAccount.currencyCode,
      icon: financialAccount.icon,
      id: financialAccount.id,
      institution: financialAccount.institution,
      name: financialAccount.name,
      paymentDueDay: financialAccount.paymentDueDay,
      statementClosingDay: financialAccount.statementClosingDay,
    })
    .from(financialAccount)
    .where(
      and(
        eq(financialAccount.organizationId, organizationId),
        eq(financialAccount.accountType, "credit_card")
      )
    );
  const ids = rows.map(({ id }) => id);
  const balances = await getAccountBalances(db, organizationId, ids);
  const statements = ids.length
    ? await db
        .selectDistinctOn([creditCardStatement.accountId], {
          accountId: creditCardStatement.accountId,
          dueDate: creditCardStatement.dueDate,
          id: creditCardStatement.id,
          periodEnd: creditCardStatement.periodEnd,
          statementBalance: creditCardStatement.statementBalance,
          statementDate: creditCardStatement.statementDate,
        })
        .from(creditCardStatement)
        .where(
          and(
            eq(creditCardStatement.organizationId, organizationId),
            inArray(creditCardStatement.accountId, ids)
          )
        )
        .orderBy(
          creditCardStatement.accountId,
          desc(creditCardStatement.statementDate),
          desc(creditCardStatement.createdAt)
        )
    : [];

  return {
    cards: new Map(
      rows.map(({ archivedAt, ...card }) => [
        card.id,
        {
          ...card,
          archived: archivedAt !== null,
          balance: balances.get(card.id) ?? "0",
        },
      ])
    ),
    latest: new Map(
      statements.map(({ accountId, ...statement }) => [accountId, statement])
    ),
    today: householdToday(timezone, now),
  };
};

/** Transfers into the card after `payments_after`: what has been paid toward the reminder. */
const paidAmount = sql<string>`COALESCE((
  SELECT SUM(${financialTransaction.amount})
  FROM ${financialTransaction}
  WHERE ${financialTransaction.accountId} = ${creditCardReminder.accountId}
    AND ${financialTransaction.transferSide} = 'destination'
    AND ${financialTransaction.archivedAt} IS NULL
    AND ${financialTransaction.transactionDate} > ${creditCardReminder.paymentsAfter}
), 0)::text`;

export interface ActiveReminder {
  accountId: string;
  createdAt: Date;
  eventDate: string;
  id: string;
  kind: CardReminderKind;
  paidAmount: string;
  paymentsAfter: string | null;
  statement: (ReminderStatement & { minimumAmountDue: string | null }) | null;
  statementId: string | null;
}

export const loadActiveReminders = async (
  db: Database,
  organizationId: string
): Promise<ActiveReminder[]> => {
  const rows = await db
    .select({
      accountId: creditCardReminder.accountId,
      createdAt: creditCardReminder.createdAt,
      eventDate: creditCardReminder.eventDate,
      id: creditCardReminder.id,
      kind: creditCardReminder.kind,
      paidAmount,
      paymentsAfter: creditCardReminder.paymentsAfter,
      statementBalance: creditCardStatement.statementBalance,
      statementDate: creditCardStatement.statementDate,
      statementDueDate: creditCardStatement.dueDate,
      statementId: creditCardReminder.statementId,
      statementMinimum: creditCardStatement.minimumAmountDue,
      statementPeriodEnd: creditCardStatement.periodEnd,
    })
    .from(creditCardReminder)
    .leftJoin(
      creditCardStatement,
      and(
        eq(creditCardStatement.id, creditCardReminder.statementId),
        eq(creditCardStatement.organizationId, organizationId)
      )
    )
    .where(
      and(
        eq(creditCardReminder.organizationId, organizationId),
        eq(creditCardReminder.status, "active")
      )
    )
    .orderBy(asc(creditCardReminder.eventDate), asc(creditCardReminder.id));

  return rows.map((row) => ({
    accountId: row.accountId,
    createdAt: row.createdAt,
    eventDate: row.eventDate,
    id: row.id,
    kind: row.kind,
    paidAmount: row.paidAmount,
    paymentsAfter: row.paymentsAfter,
    statement:
      row.statementId &&
      row.statementBalance !== null &&
      row.statementDate !== null &&
      row.statementPeriodEnd !== null
        ? {
            dueDate: row.statementDueDate,
            id: row.statementId,
            minimumAmountDue: row.statementMinimum,
            periodEnd: row.statementPeriodEnd,
            statementBalance: row.statementBalance,
            statementDate: row.statementDate,
          }
        : null,
    statementId: row.statementId,
  }));
};

/** The same judgement the worker persists, so a fresh payment hides a reminder before the next sweep. */
export const resolutionOf = (
  reminder: ActiveReminder,
  state: HouseholdCardState
): CardReminderResolution | null => {
  const card = state.cards.get(reminder.accountId);
  if (!card) {
    return "account_archived";
  }
  return reminderResolution(reminder, {
    card,
    latest: state.latest.get(reminder.accountId) ?? null,
    paidAmount: reminder.paidAmount,
    statement: reminder.statement,
    today: state.today,
  });
};
