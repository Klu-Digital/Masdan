import type { Database } from "@masdan/db";
import {
  billCalendarFeed,
  billKinds,
  billPayment,
  category,
  creditCardStatement,
  financialAccount,
  financialTransaction,
  recurringSchedule,
} from "@masdan/db/schema/index";
import type { BillKind } from "@masdan/db/schema/index";
import { ORPCError } from "@orpc/server";
import {
  and,
  asc,
  desc,
  eq,
  gte,
  isNotNull,
  isNull,
  lte,
  notExists,
  or,
  sql,
} from "drizzle-orm";
import { z } from "zod";

import { BUDGET_MONTH_PATTERN } from "../budgets/budgets.queries";
import {
  orgMutationProcedure,
  orgProcedure,
  rateLimit,
  requirePermission,
} from "../procedures";
import { addDays } from "../recurring/recurrence";
import { dayInMonth } from "../reminders/reminder-rules";
import { householdToday, monthEnd } from "../reports/periods";
import { isoDate } from "../shared/dates";
import { notFound } from "../shared/errors";
import { householdSettings } from "../shared/household";
import { findOwned } from "../shared/ownership";
import { billTotals, isScheduleOccurrence } from "./bill-rules";
import { feedPath, generateFeedToken, hashFeedToken } from "./bills.feed";
import { loadBills } from "./bills.queries";

const month = z.string().regex(BUDGET_MONTH_PATTERN, "Use a YYYY-MM month");

const occurrenceInput = z
  .object({
    dueDate: isoDate,
    kind: z.enum(billKinds),
    sourceId: z.uuid(),
  })
  .strict();

type Occurrence = z.output<typeof occurrenceInput>;

/** How far either side of a due date a payment is looked for. */
const CANDIDATE_WINDOW_DAYS = 31;
const MAX_CANDIDATES = 20;

// Anything else is a typo or someone probing another household's ids.
const assertOccurrence = async (
  db: Database,
  organizationId: string,
  occurrence: Occurrence
): Promise<void> => {
  if (occurrence.kind === "recurring") {
    const [schedule] = await db
      .select({
        endDate: recurringSchedule.endDate,
        frequency: recurringSchedule.frequency,
        interval: recurringSchedule.interval,
        startDate: recurringSchedule.startDate,
      })
      .from(recurringSchedule)
      .innerJoin(category, eq(category.id, recurringSchedule.categoryId))
      .where(
        and(
          eq(recurringSchedule.id, occurrence.sourceId),
          eq(recurringSchedule.organizationId, organizationId),
          eq(category.type, "expense")
        )
      )
      .limit(1);
    if (!schedule) {
      throw notFound("Bill");
    }
    if (isScheduleOccurrence(schedule, occurrence.dueDate)) {
      return;
    }
    // A re-timed schedule's earlier days are occurrences only if it posted them.
    const [posted] = await db
      .select({ id: financialTransaction.id })
      .from(financialTransaction)
      .where(
        and(
          eq(financialTransaction.organizationId, organizationId),
          eq(financialTransaction.recurringScheduleId, occurrence.sourceId),
          eq(financialTransaction.recurringOccurrenceDate, occurrence.dueDate)
        )
      )
      .limit(1);
    if (!posted) {
      throw notFound("Bill");
    }
    return;
  }

  const [card] = await db
    .select({ paymentDueDay: financialAccount.paymentDueDay })
    .from(financialAccount)
    .where(
      and(
        eq(financialAccount.id, occurrence.sourceId),
        eq(financialAccount.organizationId, organizationId),
        eq(financialAccount.accountType, "credit_card")
      )
    )
    .limit(1);
  if (!card) {
    throw notFound("Bill");
  }
  if (
    card.paymentDueDay !== null &&
    dayInMonth(occurrence.dueDate, card.paymentDueDay) === occurrence.dueDate
  ) {
    return;
  }
  const [statement] = await db
    .select({ id: creditCardStatement.id })
    .from(creditCardStatement)
    .where(
      and(
        eq(creditCardStatement.organizationId, organizationId),
        eq(creditCardStatement.accountId, occurrence.sourceId),
        eq(creditCardStatement.dueDate, occurrence.dueDate)
      )
    )
    .limit(1);
  if (!statement) {
    throw notFound("Bill");
  }
};

/** Not already settling another bill. */
const unlinked = notExists(
  sql`(SELECT 1 FROM ${billPayment} WHERE ${billPayment.transactionId} = ${financialTransaction.id})`
);

const candidateConditions = async (
  db: Database,
  organizationId: string,
  occurrence: Occurrence
) => {
  const base = [
    eq(financialTransaction.organizationId, organizationId),
    isNull(financialTransaction.archivedAt),
    eq(financialTransaction.paidStatus, "paid"),
    unlinked,
  ];
  if (occurrence.kind === "card") {
    return [
      ...base,
      eq(financialTransaction.accountId, occurrence.sourceId),
      eq(financialTransaction.transferSide, "destination"),
      isNotNull(financialTransaction.transferId),
    ];
  }
  const schedule = await findOwned(
    db,
    recurringSchedule,
    { id: occurrence.sourceId, organizationId },
    "Bill"
  );
  return [
    ...base,
    isNull(financialTransaction.transferId),
    eq(category.type, "expense"),
    or(
      eq(financialTransaction.accountId, schedule.accountId),
      eq(financialTransaction.categoryId, schedule.categoryId)
    ),
  ];
};

const feedStatus = async (
  db: Database,
  organizationId: string,
  userId: string
) => {
  const [feed] = await db
    .select({
      createdAt: billCalendarFeed.createdAt,
      lastUsedAt: billCalendarFeed.lastUsedAt,
    })
    .from(billCalendarFeed)
    .where(
      and(
        eq(billCalendarFeed.userId, userId),
        eq(billCalendarFeed.organizationId, organizationId)
      )
    )
    .limit(1);
  return feed ?? null;
};

/** Household calendar computed from schedules and credit-card due dates. */
export const billsRouter = {
  /** Transactions that could be a bill's payment, the schedule's own posting first. */
  candidates: orgProcedure
    .use(requirePermission({ bill: ["read"], transaction: ["read"] }))
    .input(occurrenceInput)
    .handler(async ({ context, input }) => {
      await assertOccurrence(context.db, context.organizationId, input);
      const conditions = await candidateConditions(
        context.db,
        context.organizationId,
        input
      );
      const posting =
        input.kind === "recurring"
          ? and(
              eq(financialTransaction.recurringScheduleId, input.sourceId),
              eq(financialTransaction.recurringOccurrenceDate, input.dueDate)
            )
          : sql`false`;
      return context.db
        .select({
          accountName: financialAccount.name,
          amount: financialTransaction.amount,
          categoryName: category.name,
          currencyCode: financialTransaction.currencyCode,
          id: financialTransaction.id,
          isPosting: sql<boolean>`COALESCE(${posting}, false)`,
          notes: financialTransaction.notes,
          transactionDate: financialTransaction.transactionDate,
        })
        .from(financialTransaction)
        .innerJoin(
          financialAccount,
          eq(financialAccount.id, financialTransaction.accountId)
        )
        .leftJoin(category, eq(category.id, financialTransaction.categoryId))
        .where(
          and(
            ...conditions,
            gte(
              financialTransaction.transactionDate,
              addDays(input.dueDate, -CANDIDATE_WINDOW_DAYS)
            ),
            lte(
              financialTransaction.transactionDate,
              addDays(input.dueDate, CANDIDATE_WINDOW_DAYS)
            )
          )
        )
        .orderBy(
          desc(sql`COALESCE(${posting}, false)`),
          asc(
            sql`ABS(${financialTransaction.transactionDate} - ${input.dueDate}::date)`
          ),
          asc(financialTransaction.id)
        )
        .limit(MAX_CANDIDATES);
    }),

  confirm: orgMutationProcedure
    .use(requirePermission({ bill: ["confirm"], transaction: ["read"] }))
    .input(occurrenceInput.extend({ transactionId: z.uuid().nullable() }))
    .handler(async ({ context, input }) => {
      await assertOccurrence(context.db, context.organizationId, input);
      if (input.transactionId) {
        const conditions = await candidateConditions(
          context.db,
          context.organizationId,
          input
        );
        const [eligible] = await context.db
          .select({ id: financialTransaction.id })
          .from(financialTransaction)
          .leftJoin(category, eq(category.id, financialTransaction.categoryId))
          .where(
            and(eq(financialTransaction.id, input.transactionId), ...conditions)
          )
          .limit(1);
        if (!eligible) {
          throw new ORPCError("BAD_REQUEST", {
            message:
              input.kind === "card"
                ? "Pick a paid transfer into this card that isn’t already linked to a bill"
                : "Pick a paid expense that isn’t already linked to a bill",
          });
        }
      }
      const kind: BillKind = input.kind;
      const [created] = await context.db
        .insert(billPayment)
        .values({
          accountId: kind === "card" ? input.sourceId : null,
          confirmedByUserId: context.session.user.id,
          dueDate: input.dueDate,
          kind,
          organizationId: context.organizationId,
          scheduleId: kind === "recurring" ? input.sourceId : null,
          transactionId: input.transactionId,
        })
        // Any of the three unique keys: a double click, or a payment another
        // member just linked elsewhere.
        .onConflictDoNothing()
        .returning({ id: billPayment.id });
      if (!created) {
        throw new ORPCError("CONFLICT", {
          message: "This bill or payment was just marked by someone else",
        });
      }
      return created;
    }),

  feed: {
    /** Replaces any existing link: the old URL stops working at once. */
    create: orgMutationProcedure
      .use(requirePermission({ bill: ["read"] }))
      .use(rateLimit({ limit: 10, window: 60 }))
      .handler(async ({ context }) => {
        const token = generateFeedToken();
        const owner = {
          organizationId: context.organizationId,
          userId: context.session.user.id,
        };
        await context.db
          .insert(billCalendarFeed)
          .values({ ...owner, tokenHash: hashFeedToken(token) })
          .onConflictDoUpdate({
            set: {
              createdAt: new Date(),
              lastUsedAt: null,
              tokenHash: hashFeedToken(token),
            },
            target: [billCalendarFeed.userId, billCalendarFeed.organizationId],
          });
        return { path: feedPath(token) };
      }),

    /** Anyone may revoke their own link, whatever their role now. */
    revoke: orgMutationProcedure.handler(async ({ context }) => {
      const removed = await context.db
        .delete(billCalendarFeed)
        .where(
          and(
            eq(billCalendarFeed.userId, context.session.user.id),
            eq(billCalendarFeed.organizationId, context.organizationId)
          )
        )
        .returning({ id: billCalendarFeed.id });
      return { revoked: removed.length > 0 };
    }),

    /** The URL itself is shown once, at creation; only its hash is kept. */
    status: orgProcedure
      .use(requirePermission({ bill: ["read"] }))
      .handler(async ({ context }) => ({
        feed: await feedStatus(
          context.db,
          context.organizationId,
          context.session.user.id
        ),
      })),
  },

  /** One household month of bills, with per-currency totals. */
  month: orgProcedure
    .use(requirePermission({ bill: ["read"] }))
    .input(z.object({ month: month.optional() }).strict().optional())
    .handler(async ({ context, input }) => {
      const { timezone } = await householdSettings(
        context.db,
        context.organizationId
      );
      const today = householdToday(timezone, new Date());
      const currentMonth = today.slice(0, 7);
      const shown = input?.month ?? currentMonth;
      const dateFrom = `${shown}-01`;
      const dateTo = monthEnd(dateFrom);
      const bills = await loadBills(context.db, context.organizationId, {
        from: dateFrom,
        to: dateTo,
        today,
      });
      return {
        bills,
        currentMonth,
        dateFrom,
        dateTo,
        month: shown,
        timezone,
        today,
        totals: billTotals(
          bills.filter((bill) => bill.transactionType !== "income")
        ),
      };
    }),

  /** Undoes a confirmation or unlinks a payment; the ledger is untouched. */
  unconfirm: orgMutationProcedure
    .use(requirePermission({ bill: ["confirm"] }))
    .input(z.object({ paymentId: z.uuid() }).strict())
    .handler(async ({ context, input }) => {
      const [removed] = await context.db
        .delete(billPayment)
        .where(
          and(
            eq(billPayment.id, input.paymentId),
            eq(billPayment.organizationId, context.organizationId)
          )
        )
        .returning({ id: billPayment.id });
      if (!removed) {
        throw notFound("Payment");
      }
      return removed;
    }),
};
