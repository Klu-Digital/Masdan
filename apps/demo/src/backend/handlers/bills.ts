import {
  billKey,
  billStatus,
  billTotals,
  cardBillDates,
  cardPaidAmount,
  cardPaidByTransfers,
  scheduleBillDates,
} from "@masdan/api/bills/bill-rules";
import { addDays } from "@masdan/api/recurring/recurrence";
import { daysBetween, monthEnd } from "@masdan/api/reports/periods";

import type { RouterInputs, RouterOutputs } from "@/utils/orpc";

import { today } from "../flows";
import { accountOf, balanceOf, categoryOf } from "../ledger";
import type { Section } from "../router";
import { db } from "../store";
import type { BillPayment, Transaction } from "../store";
import { badRequest, find, newId, text } from "../util";

type Bill = RouterOutputs["bills"]["month"]["bills"][number];
type Occurrence = RouterInputs["bills"]["candidates"];

const CANDIDATE_WINDOW_DAYS = 31;
const MAX_CANDIDATES = 20;

const paymentRecord = (payment: BillPayment | undefined) => {
  if (!payment) {
    return null;
  }
  const posting = db().transactions.find(
    (row) => row.id === payment.transactionId
  );
  return {
    confirmedAt: payment.createdAt,
    confirmedByName: db().user.name,
    id: payment.id,
    transaction: posting
      ? {
          amount: posting.amount,
          archived: posting.archivedAt !== null,
          currencyCode: posting.currencyCode,
          id: posting.id,
          paid: posting.paidStatus === "paid",
          transactionDate: posting.transactionDate,
        }
      : null,
  };
};

type PaymentRecord = ReturnType<typeof paymentRecord>;

const paymentHolds = (payment: PaymentRecord): boolean =>
  payment !== null &&
  (payment.transaction === null ||
    (payment.transaction.paid && !payment.transaction.archived));

const paymentKind = (payment: PaymentRecord): Bill["paidBy"] => {
  if (!(payment && paymentHolds(payment))) {
    return null;
  }
  return payment.transaction ? "payment" : "confirmation";
};

const paymentFor = (key: string) =>
  db().billPayments.find(
    (row) => billKey(row.kind, row.sourceId, row.dueDate) === key
  );

/** `loadBills` in packages/api/src/bills/bills.queries.ts. */
const loadBills = (from: string, to: string, day: string): Bill[] => {
  const bills: Bill[] = [];
  for (const schedule of db().schedules) {
    const account = find(db().accounts, schedule.accountId, "Account");
    const category = find(db().categories, schedule.categoryId, "Category");
    const posted = new Map(
      db()
        .transactions.filter(
          (row) =>
            row.recurringScheduleId === schedule.id &&
            row.archivedAt === null &&
            (row.recurringOccurrenceDate ?? "") >= from &&
            (row.recurringOccurrenceDate ?? "") <= to
        )
        .map((row) => [row.recurringOccurrenceDate ?? "", row] as const)
    );
    const confirmed = db()
      .billPayments.filter(
        (row) => row.kind === "recurring" && row.sourceId === schedule.id
      )
      .map((row) => row.dueDate);
    for (const dueDate of scheduleBillDates(
      schedule,
      [...posted.keys(), ...confirmed],
      from,
      to
    )) {
      const key = billKey("recurring", schedule.id, dueDate);
      const posting = posted.get(dueDate) ?? null;
      const payment = paymentRecord(paymentFor(key));
      const paidBy = posting ? "posting" : paymentKind(payment);
      bills.push({
        account: {
          color: account.color,
          icon: account.icon,
          id: account.id,
          name: account.name,
        },
        amount: posting?.amount ?? schedule.amount,
        card: null,
        category: {
          color: category.color,
          icon: category.icon,
          name: category.name,
        },
        currencyCode: posting?.currencyCode ?? account.currencyCode,
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
        transactionType: category.type,
      });
    }
  }

  for (const card of db().accounts.filter(
    (row) => row.accountType === "credit_card"
  )) {
    const statements = db().statements.filter(
      (row) => row.accountId === card.id
    );
    const transfersIn = db()
      .transactions.filter(
        (row) =>
          row.accountId === card.id &&
          row.transferSide === "destination" &&
          row.archivedAt === null
      )
      .map((row) => ({
        amount: row.amount,
        transactionDate: row.transactionDate,
      }));
    for (const date of cardBillDates(
      {
        archived: card.archivedAt !== null,
        balance: text(balanceOf(card)),
        paymentDueDay: card.paymentDueDay,
      },
      statements,
      from,
      to,
      day
    )) {
      const key = billKey("card", card.id, date.dueDate);
      const payment = paymentRecord(paymentFor(key));
      const paidAmount = cardPaidAmount(date, transfersIn);
      let paidBy: Bill["paidBy"] = null;
      if (paymentHolds(payment)) {
        paidBy = paymentKind(payment);
      } else if (cardPaidByTransfers(date, paidAmount)) {
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
        status: billStatus(date.dueDate, day, paidBy !== null),
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

const linked = (posting: Transaction): boolean =>
  db().billPayments.some((row) => row.transactionId === posting.id);

const candidatePostings = (occurrence: Occurrence): Transaction[] => {
  const base = db().transactions.filter(
    (row) =>
      row.archivedAt === null && row.paidStatus === "paid" && !linked(row)
  );
  if (occurrence.kind === "card") {
    return base.filter(
      (row) =>
        row.accountId === occurrence.sourceId &&
        row.transferSide === "destination"
    );
  }
  const schedule = find(db().schedules, occurrence.sourceId, "Bill");
  return base.filter(
    (row) =>
      row.transferId === null &&
      categoryOf(row.categoryId)?.type === "expense" &&
      (row.accountId === schedule.accountId ||
        row.categoryId === schedule.categoryId)
  );
};

const isPosting = (posting: Transaction, occurrence: Occurrence): boolean =>
  occurrence.kind === "recurring" &&
  posting.recurringScheduleId === occurrence.sourceId &&
  posting.recurringOccurrenceDate === occurrence.dueDate;

export const bills: Section<"bills"> = {
  candidates: (occurrence) =>
    candidatePostings(occurrence)
      .filter(
        (row) =>
          row.transactionDate >=
            addDays(occurrence.dueDate, -CANDIDATE_WINDOW_DAYS) &&
          row.transactionDate <=
            addDays(occurrence.dueDate, CANDIDATE_WINDOW_DAYS)
      )
      .toSorted(
        (a, b) =>
          Number(isPosting(b, occurrence)) - Number(isPosting(a, occurrence)) ||
          Math.abs(daysBetween(a.transactionDate, occurrence.dueDate)) -
            Math.abs(daysBetween(b.transactionDate, occurrence.dueDate)) ||
          a.id.localeCompare(b.id)
      )
      .slice(0, MAX_CANDIDATES)
      .map((row) => ({
        accountName: accountOf(row.accountId)?.name ?? "",
        amount: row.amount,
        categoryName: categoryOf(row.categoryId)?.name ?? null,
        currencyCode: row.currencyCode,
        id: row.id,
        isPosting: isPosting(row, occurrence),
        notes: row.notes,
        transactionDate: row.transactionDate,
      })),

  confirm: (input) => {
    if (
      input.transactionId &&
      !candidatePostings(input).some((row) => row.id === input.transactionId)
    ) {
      throw badRequest(
        input.kind === "card"
          ? "Pick a paid transfer into this card that isn’t already linked to a bill"
          : "Pick a paid expense that isn’t already linked to a bill"
      );
    }
    const key = billKey(input.kind, input.sourceId, input.dueDate);
    if (paymentFor(key)) {
      throw badRequest("This bill or payment was just marked by someone else");
    }
    const payment: BillPayment = {
      createdAt: new Date(),
      dueDate: input.dueDate,
      id: newId(),
      kind: input.kind,
      sourceId: input.sourceId,
      transactionId: input.transactionId,
    };
    db().billPayments.push(payment);
    return { id: payment.id };
  },

  month: (input) => {
    const day = today();
    const currentMonth = day.slice(0, 7);
    const month = input?.month ?? currentMonth;
    const dateFrom = `${month}-01`;
    const dateTo = monthEnd(dateFrom);
    const rows = loadBills(dateFrom, dateTo, day);
    return {
      bills: rows,
      currentMonth,
      dateFrom,
      dateTo,
      month,
      timezone: db().household.timezone,
      today: day,
      totals: billTotals(
        rows.filter((bill) => bill.transactionType !== "income")
      ),
    };
  },

  unconfirm: ({ paymentId }) => {
    find(db().billPayments, paymentId, "Payment");
    db().billPayments = db().billPayments.filter((row) => row.id !== paymentId);
    return { id: paymentId };
  },
};
