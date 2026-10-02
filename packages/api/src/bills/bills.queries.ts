import type { Database } from "@masdan/db";
import {
  billPayment,
  category,
  creditCardStatement,
  financialAccount,
  financialTransaction,
  recurringSchedule,
  user,
} from "@masdan/db/schema/index";
import type {
  BillKind,
  RecurringScheduleStatus,
} from "@masdan/db/schema/index";
import { and, eq, gte, inArray, isNotNull, isNull, lte } from "drizzle-orm";

import { getAccountBalances } from "../accounts/balances";
import {
  billKey,
  billStatus,
  cardBillDates,
  cardPaidAmount,
  cardPaidByTransfers,
  scheduleBillDates,
  transferWindow,
} from "./bill-rules";
import type { BillSource, BillStatus, CardTransfer } from "./bill-rules";

interface BillPaymentRecord {
  confirmedAt: Date;
  confirmedByName: string | null;
  id: string;
  /** Null for an explicit confirmation with no payment attached. */
  transaction: {
    amount: string;
    archived: boolean;
    currencyCode: string;
    id: string;
    paid: boolean;
    transactionDate: string;
  } | null;
}

export interface Bill {
  account: {
    color: string | null;
    icon: string | null;
    id: string;
    name: string;
  };
  /** Card bills: what the card looks like, for drawing it. */
  card: {
    cardLastFour: string | null;
    cardNetwork: string | null;
    cardProductKey: string | null;
    institution: string | null;
  } | null;
  /** Null when the amount is not known yet: a card due day with no statement. */
  amount: string | null;
  category: { color: string | null; icon: string | null; name: string } | null;
  currencyCode: string;
  dueDate: string;
  key: string;
  kind: BillKind;
  minimumAmountDue: string | null;
  name: string;
  /** Card bills: transfers into the card counted toward this bill. */
  paidAmount: string | null;
  /** What makes it paid; null while it is not. */
  paidBy: "confirmation" | "payment" | "posting" | "transfers" | null;
  payment: BillPaymentRecord | null;
  /** Recurring bills: the transaction the schedule posted for this day. */
  postedTransactionId: string | null;
  scheduleStatus: RecurringScheduleStatus | null;
  source: BillSource;
  sourceId: string;
  status: BillStatus;
  transactionType: "expense" | "income" | null;
}

const loadSchedules = (db: Database, organizationId: string) =>
  db
    .select({
      accountColor: financialAccount.color,
      accountIcon: financialAccount.icon,
      accountId: financialAccount.id,
      accountName: financialAccount.name,
      amount: recurringSchedule.amount,
      categoryColor: category.color,
      categoryIcon: category.icon,
      categoryName: category.name,
      currencyCode: financialAccount.currencyCode,
      endDate: recurringSchedule.endDate,
      frequency: recurringSchedule.frequency,
      id: recurringSchedule.id,
      interval: recurringSchedule.interval,
      name: recurringSchedule.name,
      nextOccurrenceDate: recurringSchedule.nextOccurrenceDate,
      startDate: recurringSchedule.startDate,
      status: recurringSchedule.status,
      transactionType: category.type,
    })
    .from(recurringSchedule)
    .innerJoin(
      financialAccount,
      eq(financialAccount.id, recurringSchedule.accountId)
    )
    .innerJoin(category, eq(category.id, recurringSchedule.categoryId))
    .where(eq(recurringSchedule.organizationId, organizationId));

const loadPostings = (
  db: Database,
  organizationId: string,
  scheduleIds: string[],
  from: string,
  to: string
) =>
  scheduleIds.length === 0
    ? Promise.resolve([])
    : db
        .select({
          amount: financialTransaction.amount,
          currencyCode: financialTransaction.currencyCode,
          id: financialTransaction.id,
          occurrenceDate: financialTransaction.recurringOccurrenceDate,
          scheduleId: financialTransaction.recurringScheduleId,
        })
        .from(financialTransaction)
        .where(
          and(
            eq(financialTransaction.organizationId, organizationId),
            inArray(financialTransaction.recurringScheduleId, scheduleIds),
            isNull(financialTransaction.archivedAt),
            gte(financialTransaction.recurringOccurrenceDate, from),
            lte(financialTransaction.recurringOccurrenceDate, to)
          )
        );

const loadCards = async (db: Database, organizationId: string) => {
  const cards = await db
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
    })
    .from(financialAccount)
    .where(
      and(
        eq(financialAccount.organizationId, organizationId),
        eq(financialAccount.accountType, "credit_card")
      )
    );
  const ids = cards.map(({ id }) => id);
  const [balances, statements] = await Promise.all([
    getAccountBalances(db, organizationId, ids),
    ids.length === 0
      ? Promise.resolve([])
      : db
          .select({
            accountId: creditCardStatement.accountId,
            dueDate: creditCardStatement.dueDate,
            id: creditCardStatement.id,
            minimumAmountDue: creditCardStatement.minimumAmountDue,
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
          ),
  ]);
  return cards.map((card) => ({
    ...card,
    balance: balances.get(card.id) ?? "0",
    statements: statements.filter(({ accountId }) => accountId === card.id),
  }));
};

const loadPayments = async (
  db: Database,
  organizationId: string,
  from: string,
  to: string
) => {
  const rows = await db
    .select({
      accountId: billPayment.accountId,
      confirmedAt: billPayment.createdAt,
      confirmedByName: user.name,
      dueDate: billPayment.dueDate,
      id: billPayment.id,
      kind: billPayment.kind,
      scheduleId: billPayment.scheduleId,
      transactionAmount: financialTransaction.amount,
      transactionArchivedAt: financialTransaction.archivedAt,
      transactionCurrency: financialTransaction.currencyCode,
      transactionDate: financialTransaction.transactionDate,
      transactionId: financialTransaction.id,
      transactionPaidStatus: financialTransaction.paidStatus,
    })
    .from(billPayment)
    .leftJoin(user, eq(user.id, billPayment.confirmedByUserId))
    .leftJoin(
      financialTransaction,
      and(
        eq(financialTransaction.id, billPayment.transactionId),
        eq(financialTransaction.organizationId, organizationId)
      )
    )
    .where(
      and(
        eq(billPayment.organizationId, organizationId),
        gte(billPayment.dueDate, from),
        lte(billPayment.dueDate, to)
      )
    );
  return new Map(
    rows.map((row) => {
      const sourceId =
        row.kind === "recurring" ? row.scheduleId : row.accountId;
      const record: BillPaymentRecord = {
        confirmedAt: row.confirmedAt,
        confirmedByName: row.confirmedByName,
        id: row.id,
        transaction:
          row.transactionId &&
          row.transactionAmount !== null &&
          row.transactionCurrency !== null &&
          row.transactionDate !== null
            ? {
                amount: row.transactionAmount,
                archived: row.transactionArchivedAt !== null,
                currencyCode: row.transactionCurrency,
                id: row.transactionId,
                paid: row.transactionPaidStatus === "paid",
                transactionDate: row.transactionDate,
              }
            : null,
      };
      return [billKey(row.kind, sourceId ?? "", row.dueDate), record] as const;
    })
  );
};

const loadCardTransfers = async (
  db: Database,
  organizationId: string,
  accountIds: string[],
  window: { from: string; to: string } | null
): Promise<Map<string, CardTransfer[]>> => {
  const byAccount = new Map<string, CardTransfer[]>();
  if (accountIds.length === 0 || !window) {
    return byAccount;
  }
  const rows = await db
    .select({
      accountId: financialTransaction.accountId,
      amount: financialTransaction.amount,
      transactionDate: financialTransaction.transactionDate,
    })
    .from(financialTransaction)
    .where(
      and(
        eq(financialTransaction.organizationId, organizationId),
        inArray(financialTransaction.accountId, accountIds),
        eq(financialTransaction.transferSide, "destination"),
        isNotNull(financialTransaction.transferId),
        isNull(financialTransaction.archivedAt),
        gte(financialTransaction.transactionDate, window.from),
        lte(financialTransaction.transactionDate, window.to)
      )
    );
  for (const row of rows) {
    if (!row.accountId) {
      continue;
    }
    const list = byAccount.get(row.accountId) ?? [];
    list.push(row);
    byAccount.set(row.accountId, list);
  }
  return byAccount;
};

/** A linked payment only counts while it is live and marked paid. */
const paymentHolds = (payment: BillPaymentRecord | null): boolean =>
  payment !== null &&
  (payment.transaction === null ||
    (payment.transaction.paid && !payment.transaction.archived));

const paymentKind = (payment: BillPaymentRecord | null): Bill["paidBy"] => {
  if (!payment || !paymentHolds(payment)) {
    return null;
  }
  return payment.transaction ? "payment" : "confirmation";
};

/** Recurring postings settle automatically; card bills track payments. */
export const loadBills = async (
  db: Database,
  organizationId: string,
  range: { from: string; to: string; today: string }
): Promise<Bill[]> => {
  const { from, to, today } = range;
  const [schedules, cards, payments] = await Promise.all([
    loadSchedules(db, organizationId),
    loadCards(db, organizationId),
    loadPayments(db, organizationId, from, to),
  ]);
  const postings = await loadPostings(
    db,
    organizationId,
    schedules.map(({ id }) => id),
    from,
    to
  );

  const bills: Bill[] = [];
  for (const schedule of schedules) {
    const posted = new Map(
      postings
        .filter((posting) => posting.scheduleId === schedule.id)
        .map((posting) => [posting.occurrenceDate ?? "", posting] as const)
    );
    const confirmed = [...payments.keys()]
      .filter((key) => key.startsWith(`recurring:${schedule.id}:`))
      .map((key) => key.slice(-10));
    const dates = scheduleBillDates(
      schedule,
      [...posted.keys(), ...confirmed],
      from,
      to
    );
    for (const dueDate of dates) {
      const key = billKey("recurring", schedule.id, dueDate);
      const posting = posted.get(dueDate) ?? null;
      const payment = payments.get(key) ?? null;
      const paidBy = posting ? "posting" : paymentKind(payment);
      bills.push({
        account: {
          color: schedule.accountColor,
          icon: schedule.accountIcon,
          id: schedule.accountId,
          name: schedule.accountName,
        },
        amount: posting?.amount ?? schedule.amount,
        card: null,
        category: {
          color: schedule.categoryColor,
          icon: schedule.categoryIcon,
          name: schedule.categoryName,
        },
        currencyCode: posting?.currencyCode ?? schedule.currencyCode,
        dueDate,
        key,
        kind: "recurring",
        minimumAmountDue: null,
        name: schedule.name,
        paidAmount: null,
        paidBy,
        payment,
        postedTransactionId: posting?.id ?? null,
        scheduleStatus: schedule.status,
        source: "schedule",
        sourceId: schedule.id,
        status: paidBy === null ? "expected" : "paid",
        transactionType: schedule.transactionType,
      });
    }
  }

  const cardDates = cards.map((card) => ({
    card,
    dates: cardBillDates(
      { ...card, archived: card.archivedAt !== null },
      card.statements,
      from,
      to,
      today
    ),
  }));
  const transfers = await loadCardTransfers(
    db,
    organizationId,
    cards.map(({ id }) => id),
    transferWindow(
      cardDates.flatMap(({ dates }) => dates),
      to
    )
  );
  for (const { card, dates } of cardDates) {
    for (const date of dates) {
      const key = billKey("card", card.id, date.dueDate);
      const payment = payments.get(key) ?? null;
      const paidAmount = cardPaidAmount(date, transfers.get(card.id) ?? []);
      const confirmed = paymentHolds(payment);
      const covered = cardPaidByTransfers(date, paidAmount);
      let paidBy: Bill["paidBy"] = null;
      if (confirmed && payment) {
        paidBy = paymentKind(payment);
      } else if (covered) {
        paidBy = "transfers";
      }
      bills.push({
        account: {
          color: card.color,
          icon: card.icon,
          id: card.id,
          name: card.name,
        },
        amount: date.amount,
        card: {
          cardLastFour: card.cardLastFour,
          cardNetwork: card.cardNetwork,
          cardProductKey: card.cardProductKey,
          institution: card.institution,
        },
        category: null,
        currencyCode: card.currencyCode,
        dueDate: date.dueDate,
        key,
        kind: "card",
        minimumAmountDue: date.minimumAmountDue,
        name: card.name,
        paidAmount,
        paidBy,
        payment,
        postedTransactionId: null,
        scheduleStatus: null,
        source: date.source,
        sourceId: card.id,
        status: billStatus(date.dueDate, today, paidBy !== null),
        transactionType: null,
      });
    }
  }

  return bills.toSorted(
    (a, b) =>
      a.dueDate.localeCompare(b.dueDate) ||
      a.name.localeCompare(b.name) ||
      a.key.localeCompare(b.key)
  );
};
