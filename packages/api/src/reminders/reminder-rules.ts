import type {
  CardReminderKind,
  CardReminderResolution,
} from "@masdan/db/schema/reminders";

import { addDays } from "../recurring/recurrence";
import { daysBetween } from "../reports/periods";
import { signedScaledAmount } from "../shared/money";

/**
 * Leaf module: which reminders a card is owed on a given household day, and
 * when one stops being actionable. Dates are household calendar days
 * (`YYYY-MM-DD`); "today" is the caller's, from the household's timezone.
 */

/** A reminder surfaces this many days before its date. */
export const REMINDER_LEAD_DAYS = 7;
/** A closing date stays actionable this long for the statement to be recorded. */
const STATEMENT_RECORD_DAYS = 10;
/** A statement dated up to this many days before the closing day still counts. */
const STATEMENT_EARLY_DAYS = 7;
/** An unpaid due date stops nagging this long after it passed. */
export const PAYMENT_OVERDUE_DAYS = 30;
/** A recorded due date this close to the card's due day replaces the projection. */
export const STATEMENT_COVERS_DAYS = 15;

const utcDate = (iso: string): Date => {
  const [year = 1970, month = 1, day = 1] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
};

/** `day` in the month `offset` months from `iso`'s, clamped to that month's length. */
export const dayInMonth = (iso: string, day: number, offset = 0): string => {
  const base = utcDate(iso);
  const year = base.getUTCFullYear();
  const month = base.getUTCMonth() + offset;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(day, lastDay)))
    .toISOString()
    .slice(0, 10);
};

/** The next date carrying `day` on or after `today`. */
export const dayOfMonthOnOrAfter = (day: number, today: string): string => {
  const thisMonth = dayInMonth(today, day);
  return thisMonth >= today ? thisMonth : dayInMonth(today, day, 1);
};

/** The latest date carrying `day` on or before `today`. */
export const dayOfMonthOnOrBefore = (day: number, today: string): string => {
  const thisMonth = dayInMonth(today, day);
  return thisMonth <= today ? thisMonth : dayInMonth(today, day, -1);
};

const isPositive = (amount: string): boolean => signedScaledAmount(amount) > 0n;

export interface ReminderCard {
  archived: boolean;
  /** Current amount owed; positive means the household owes the card. */
  balance: string;
  paymentDueDay: number | null;
  statementClosingDay: number | null;
}

export interface ReminderStatement {
  dueDate: string | null;
  id: string;
  periodEnd: string;
  statementBalance: string;
  statementDate: string;
}

export interface ReminderCandidate {
  eventDate: string;
  kind: CardReminderKind;
  paymentsAfter: string | null;
  statementId: string | null;
}

const withinLead = (eventDate: string, today: string): boolean =>
  daysBetween(today, eventDate) <= REMINDER_LEAD_DAYS;

/** A recorded due date near the card's due day is the same cycle's bill. */
const coversDueDate = (
  latest: ReminderStatement | null,
  eventDate: string
): boolean =>
  latest?.dueDate !== null &&
  latest?.dueDate !== undefined &&
  Math.abs(daysBetween(latest.dueDate, eventDate)) <= STATEMENT_COVERS_DAYS;

const statementCandidates = (
  closingDay: number,
  today: string
): ReminderCandidate[] => {
  const dates = new Set<string>();
  const previous = dayOfMonthOnOrBefore(closingDay, today);
  if (daysBetween(previous, today) <= STATEMENT_RECORD_DAYS) {
    dates.add(previous);
  }
  const next = dayOfMonthOnOrAfter(closingDay, today);
  if (withinLead(next, today)) {
    dates.add(next);
  }
  return [...dates].map((eventDate) => ({
    eventDate,
    kind: "statement",
    paymentsAfter: null,
    statementId: null,
  }));
};

const statementPaymentCandidate = (
  latest: ReminderStatement | null,
  today: string
): ReminderCandidate | null => {
  if (!latest?.dueDate || !isPositive(latest.statementBalance)) {
    return null;
  }
  const { dueDate } = latest;
  if (
    !withinLead(dueDate, today) ||
    daysBetween(dueDate, today) > PAYMENT_OVERDUE_DAYS
  ) {
    return null;
  }
  return {
    eventDate: dueDate,
    kind: "payment",
    // Payments after the period closed are the ones the statement asks for.
    paymentsAfter: latest.periodEnd,
    statementId: latest.id,
  };
};

const projectedPaymentCandidate = (
  card: ReminderCard,
  latest: ReminderStatement | null,
  today: string
): ReminderCandidate | null => {
  if (card.paymentDueDay === null || !isPositive(card.balance)) {
    return null;
  }
  const dueDate = dayOfMonthOnOrAfter(card.paymentDueDay, today);
  if (!withinLead(dueDate, today) || coversDueDate(latest, dueDate)) {
    return null;
  }
  return {
    eventDate: dueDate,
    kind: "payment",
    // Anything paid since the previous due day belongs to this cycle.
    paymentsAfter: dayInMonth(dueDate, card.paymentDueDay, -1),
    statementId: null,
  };
};

/**
 * The reminders a card is owed today. Generation may repeat freely: the
 * caller inserts on the unique (card, kind, date) key and ignores conflicts.
 */
export const reminderCandidates = (
  card: ReminderCard,
  latest: ReminderStatement | null,
  today: string
): ReminderCandidate[] => {
  if (card.archived) {
    return [];
  }
  const candidates =
    card.statementClosingDay === null
      ? []
      : statementCandidates(card.statementClosingDay, today);
  const payment =
    statementPaymentCandidate(latest, today) ??
    projectedPaymentCandidate(card, latest, today);
  if (payment) {
    candidates.push(payment);
  }
  return candidates;
};

export interface ReminderFacts {
  card: Pick<ReminderCard, "archived" | "balance">;
  /** The card's most recent statement, whichever reminder is being judged. */
  latest: ReminderStatement | null;
  /** Transfers into the card dated after `paymentsAfter`. */
  paidAmount: string;
  /** The statement a payment reminder was generated from. */
  statement: ReminderStatement | null;
  today: string;
}

/** Why a reminder is no longer actionable, or `null` while it still is. */
export const reminderResolution = (
  reminder: Pick<ReminderCandidate, "eventDate" | "kind" | "statementId">,
  facts: ReminderFacts
): CardReminderResolution | null => {
  const { card, latest, statement, today } = facts;
  if (card.archived) {
    return "account_archived";
  }

  if (reminder.kind === "statement") {
    if (
      latest &&
      latest.statementDate >= addDays(reminder.eventDate, -STATEMENT_EARLY_DAYS)
    ) {
      return "recorded";
    }
    return daysBetween(reminder.eventDate, today) > STATEMENT_RECORD_DAYS
      ? "expired"
      : null;
  }

  if (reminder.statementId) {
    // A later statement carries any unpaid balance forward into its own bill.
    if (
      latest &&
      statement &&
      latest.id !== statement.id &&
      latest.statementDate > statement.statementDate
    ) {
      return "superseded";
    }
    if (
      statement &&
      signedScaledAmount(facts.paidAmount) >=
        signedScaledAmount(statement.statementBalance)
    ) {
      return "paid";
    }
  } else if (coversDueDate(latest, reminder.eventDate)) {
    return "superseded";
  } else if (isPositive(facts.paidAmount)) {
    // A projection has no amount to compare against; paying this cycle settles it.
    return "paid";
  }

  if (!isPositive(card.balance)) {
    return "paid";
  }
  return daysBetween(reminder.eventDate, today) > PAYMENT_OVERDUE_DAYS
    ? "expired"
    : null;
};
