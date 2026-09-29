import type { BillKind } from "@masdan/db/schema/bills";
import type {
  RecurringFrequency,
  RecurringScheduleStatus,
} from "@masdan/db/schema/transactions";

import { addDays, firstOccurrenceOnOrAfter } from "../recurring/recurrence";
import {
  PAYMENT_OVERDUE_DAYS,
  STATEMENT_COVERS_DAYS,
  dayInMonth,
} from "../reminders/reminder-rules";
import { daysBetween, monthStart } from "../reports/periods";
import { fixedAmountText, signedScaledAmount } from "../shared/money";

/**
 * Leaf module: which bills fall in a date range and whether each is paid.
 * Dates are household calendar days (`YYYY-MM-DD`); "today" is the caller's,
 * from the household's timezone. Nothing here reads a clock.
 */

export type BillStatus = "expected" | "overdue" | "paid";

/** Where a bill's date came from. */
export type BillSource = "schedule" | "statement" | "projected";

/** Bounds a daily schedule's expansion over a long feed range. */
export const MAX_OCCURRENCES_PER_SCHEDULE = 500;

/** Unpaid and past its due day is overdue; the due day itself is still expected. */
export const billStatus = (
  dueDate: string,
  today: string,
  paid: boolean
): BillStatus => {
  if (paid) {
    return "paid";
  }
  return dueDate < today ? "overdue" : "expected";
};

export interface ScheduleTiming {
  frequency: RecurringFrequency;
  interval: number;
  nextOccurrenceDate: string | null;
  startDate: string;
  status: RecurringScheduleStatus;
}

/**
 * A schedule's bill dates in `[from, to]`: every occurrence it posted, then —
 * while active — every one it is still due to post. Days skipped by a pause or
 * a re-timing were never owed, so they are not bills.
 */
export const scheduleBillDates = (
  schedule: ScheduleTiming,
  postedDates: readonly string[],
  from: string,
  to: string
): string[] => {
  const dates = new Set(
    postedDates.filter((date) => date >= from && date <= to)
  );
  if (schedule.status === "active" && schedule.nextOccurrenceDate) {
    const start =
      schedule.nextOccurrenceDate > from ? schedule.nextOccurrenceDate : from;
    let next = firstOccurrenceOnOrAfter(schedule, start);
    let count = 0;
    while (next <= to && count < MAX_OCCURRENCES_PER_SCHEDULE) {
      dates.add(next);
      next = firstOccurrenceOnOrAfter(schedule, addDays(next, 1));
      count += 1;
    }
  }
  return [...dates].toSorted();
};

/** Whether `date` is a day the schedule's rhythm lands on. */
export const isScheduleOccurrence = (
  schedule: Pick<ScheduleTiming, "frequency" | "interval" | "startDate">,
  date: string
): boolean =>
  date >= schedule.startDate &&
  firstOccurrenceOnOrAfter(schedule, date) === date;

export interface BillStatement {
  dueDate: string | null;
  id: string;
  minimumAmountDue: string | null;
  periodEnd: string;
  statementBalance: string;
  statementDate: string;
}

export interface BillCard {
  archived: boolean;
  /** Current amount owed; positive means the household owes the card. */
  balance: string;
  paymentDueDay: number | null;
}

export interface CardBillDate {
  /** The statement balance; null for a projection, which has no amount yet. */
  amount: string | null;
  dueDate: string;
  minimumAmountDue: string | null;
  /** Transfers into the card dated after this day count toward the bill. */
  paymentsAfter: string;
  /** ...and up to this day; null means no later cycle has closed yet. */
  paymentsThrough: string | null;
  source: "statement" | "projected";
  statementId: string | null;
}

const isPositive = (amount: string): boolean => signedScaledAmount(amount) > 0n;

/** The same "same cycle" test the reminders use to retire a projection. */
const coveredByStatement = (
  statements: readonly BillStatement[],
  dueDate: string
): boolean =>
  statements.some(
    (statement) =>
      statement.dueDate !== null &&
      Math.abs(daysBetween(statement.dueDate, dueDate)) <= STATEMENT_COVERS_DAYS
  );

/**
 * A card's due dates in `[from, to]`. Recorded statements with a balance are
 * bills on their due date; the card's due day fills in only from the current
 * cycle on, while the card owes something and no statement covers the date.
 */
export const cardBillDates = (
  card: BillCard,
  statements: readonly BillStatement[],
  from: string,
  to: string,
  today: string
): CardBillDate[] => {
  const byDate = statements.toSorted((a, b) =>
    a.statementDate.localeCompare(b.statementDate)
  );
  const bills: CardBillDate[] = [];
  for (const [index, statement] of byDate.entries()) {
    const { dueDate } = statement;
    if (
      dueDate === null ||
      dueDate < from ||
      dueDate > to ||
      !isPositive(statement.statementBalance)
    ) {
      continue;
    }
    bills.push({
      amount: statement.statementBalance,
      dueDate,
      minimumAmountDue: statement.minimumAmountDue,
      // Payments before the period closed are already in the balance.
      paymentsAfter: statement.periodEnd,
      // A later statement carries whatever is unpaid into its own bill.
      paymentsThrough: byDate[index + 1]?.periodEnd ?? null,
      source: "statement",
      statementId: statement.id,
    });
  }

  const { paymentDueDay } = card;
  if (card.archived || paymentDueDay === null || !isPositive(card.balance)) {
    return bills;
  }
  const earliest = addDays(today, -PAYMENT_OVERDUE_DAYS);
  for (
    let month = monthStart(from);
    month <= to;
    month = monthStart(month, 1)
  ) {
    const dueDate = dayInMonth(month, paymentDueDay);
    if (
      dueDate < from ||
      dueDate > to ||
      dueDate < earliest ||
      coveredByStatement(statements, dueDate)
    ) {
      continue;
    }
    bills.push({
      amount: null,
      dueDate,
      minimumAmountDue: null,
      paymentsAfter: dayInMonth(dueDate, paymentDueDay, -1),
      // A projection has no amount, so only an on-time payment settles it.
      paymentsThrough: dueDate,
      source: "projected",
      statementId: null,
    });
  }
  return bills.toSorted((a, b) => a.dueDate.localeCompare(b.dueDate));
};

export interface CardTransfer {
  amount: string;
  transactionDate: string;
}

/** What transfers into the card in the bill's payment window add up to. */
export const cardPaidAmount = (
  bill: Pick<CardBillDate, "paymentsAfter" | "paymentsThrough">,
  transfers: readonly CardTransfer[]
): string => {
  let total = 0n;
  for (const transfer of transfers) {
    if (
      transfer.transactionDate > bill.paymentsAfter &&
      (bill.paymentsThrough === null ||
        transfer.transactionDate <= bill.paymentsThrough)
    ) {
      total += signedScaledAmount(transfer.amount);
    }
  }
  return fixedAmountText(total);
};

/** A statement is paid once transfers cover it; a projection by any payment. */
export const cardPaidByTransfers = (
  bill: Pick<CardBillDate, "amount">,
  paidAmount: string
): boolean =>
  bill.amount === null
    ? isPositive(paidAmount)
    : signedScaledAmount(paidAmount) >= signedScaledAmount(bill.amount);

/** The inclusive transfer window every card bill in a set reads from. */
export const transferWindow = (
  bills: readonly Pick<CardBillDate, "paymentsAfter" | "paymentsThrough">[],
  to: string
): { from: string; to: string } | null => {
  if (bills.length === 0) {
    return null;
  }
  let start = bills[0]?.paymentsAfter ?? to;
  let end = to;
  for (const bill of bills) {
    if (bill.paymentsAfter < start) {
      start = bill.paymentsAfter;
    }
    if (bill.paymentsThrough === null) {
      return { from: addDays(start, 1), to: "9999-12-31" };
    }
    if (bill.paymentsThrough > end) {
      end = bill.paymentsThrough;
    }
  }
  return { from: addDays(start, 1), to: end };
};

export interface BillTotalsInput {
  amount: string | null;
  currencyCode: string;
  status: BillStatus;
}

export interface BillTotals {
  currencyCode: string;
  /** Every bill with a known amount. */
  due: string;
  expected: string;
  overdue: string;
  paid: string;
  /** Bills whose amount is not known yet, left out of every sum. */
  unknownAmountCount: number;
}

/**
 * Per currency, never combined: a household with a USD card and PHP rent sees
 * two sets of totals rather than one number that means nothing.
 */
export const billTotals = (bills: readonly BillTotalsInput[]): BillTotals[] => {
  const totals = new Map<
    string,
    {
      due: bigint;
      expected: bigint;
      overdue: bigint;
      paid: bigint;
      unknown: number;
    }
  >();
  for (const bill of bills) {
    const entry = totals.get(bill.currencyCode) ?? {
      due: 0n,
      expected: 0n,
      overdue: 0n,
      paid: 0n,
      unknown: 0,
    };
    totals.set(bill.currencyCode, entry);
    if (bill.amount === null) {
      entry.unknown += 1;
      continue;
    }
    const amount = signedScaledAmount(bill.amount);
    entry.due += amount;
    entry[bill.status] += amount;
  }
  return [...totals.entries()]
    .toSorted(([a], [b]) => a.localeCompare(b))
    .map(([currencyCode, entry]) => ({
      currencyCode,
      due: fixedAmountText(entry.due),
      expected: fixedAmountText(entry.expected),
      overdue: fixedAmountText(entry.overdue),
      paid: fixedAmountText(entry.paid),
      unknownAmountCount: entry.unknown,
    }));
};

/** A stable id for one occurrence, used by the web client and the feed's UID. */
export const billKey = (
  kind: BillKind,
  sourceId: string,
  dueDate: string
): string => `${kind}:${sourceId}:${dueDate}`;
