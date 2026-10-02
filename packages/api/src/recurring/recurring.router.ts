import type { Database } from "@masdan/db";
import {
  MAX_RECURRING_INTERVAL,
  category,
  financialAccount,
  financialTransaction,
  recurringSchedule,
  recurringScheduleTag,
  tag,
} from "@masdan/db/schema/index";
import type { RecurringScheduleStatus } from "@masdan/db/schema/index";
import { queue } from "@masdan/queue";
import { ORPCError } from "@orpc/server";
import { and, asc, count, desc, eq, inArray, max, sql } from "drizzle-orm";
import { z } from "zod";

import {
  orgMutationProcedure,
  orgProcedure,
  requirePermission,
} from "../procedures";
import { isoDate } from "../shared/dates";
import { notFound } from "../shared/errors";
import { householdDate } from "../shared/household";
import { positiveAmount } from "../shared/money";
import { lockOwned } from "../shared/ownership";
import { TRANSACTION_PAID_STATUSES } from "../transactions/constants";
import { assertReferences } from "../transactions/transactions.write";
import {
  RECURRING_FREQUENCIES,
  initialNextOccurrence,
  isBeforeEnd,
  resumedNextOccurrence,
} from "./recurrence";
import type { Recurrence } from "./recurrence";

const scheduleValues = z
  .object({
    accountId: z.uuid(),
    amount: positiveAmount,
    categoryId: z.uuid(),
    endDate: isoDate.nullable(),
    frequency: z.enum(RECURRING_FREQUENCIES),
    interval: z.number().int().min(1).max(MAX_RECURRING_INTERVAL),
    name: z.string().trim().min(1, "Name is required").max(80),
    notes: z.string().trim().max(2000).nullable(),
    paidStatus: z.enum(TRANSACTION_PAID_STATUSES),
    startDate: isoDate,
    tagIds: z
      .array(z.uuid())
      .max(50)
      .refine((ids) => new Set(ids).size === ids.length, "Duplicate tag"),
  })
  .strict();

type ScheduleValues = z.output<typeof scheduleValues>;

// Applied to each input, since zod refuses to `.extend()` a refined object.
const endsOnOrAfterStart = (
  values: Pick<ScheduleValues, "endDate" | "startDate">
): boolean => values.endDate === null || values.endDate >= values.startDate;
const endBeforeStart = {
  message: "The end date can't be before the start date",
  path: ["endDate"],
};

const scheduleIdInput = z.object({ scheduleId: z.uuid() });

const stoppedSchedule = () =>
  new ORPCError("BAD_REQUEST", {
    message: "This schedule is stopped. Create a new one instead.",
  });

/** What a schedule with nothing left to post before its end date becomes. */
const ended = () => ({
  nextOccurrenceDate: null,
  status: "stopped" as const,
  stoppedAt: new Date(),
});

const scheduleColumns = {
  accountId: recurringSchedule.accountId,
  accountName: financialAccount.name,
  amount: recurringSchedule.amount,
  categoryColor: category.color,
  categoryIcon: category.icon,
  categoryId: recurringSchedule.categoryId,
  categoryName: category.name,
  createdAt: recurringSchedule.createdAt,
  currencyCode: financialAccount.currencyCode,
  endDate: recurringSchedule.endDate,
  frequency: recurringSchedule.frequency,
  id: recurringSchedule.id,
  interval: recurringSchedule.interval,
  lastError: recurringSchedule.lastError,
  name: recurringSchedule.name,
  nextOccurrenceDate: recurringSchedule.nextOccurrenceDate,
  notes: recurringSchedule.notes,
  paidStatus: recurringSchedule.paidStatus,
  pausedAt: recurringSchedule.pausedAt,
  startDate: recurringSchedule.startDate,
  status: recurringSchedule.status,
  stoppedAt: recurringSchedule.stoppedAt,
  type: category.type,
  updatedAt: recurringSchedule.updatedAt,
};

const STATUS_ORDER = sql`CASE ${recurringSchedule.status} WHEN 'active' THEN 0 WHEN 'paused' THEN 1 ELSE 2 END`;

/** Schedules with their template's names and what they have posted so far. */
const loadSchedules = async (
  db: Database,
  organizationId: string,
  scheduleId?: string
) => {
  const conditions = [eq(recurringSchedule.organizationId, organizationId)];
  if (scheduleId) {
    conditions.push(eq(recurringSchedule.id, scheduleId));
  }
  const rows = await db
    .select(scheduleColumns)
    .from(recurringSchedule)
    .innerJoin(
      financialAccount,
      eq(financialAccount.id, recurringSchedule.accountId)
    )
    .innerJoin(category, eq(category.id, recurringSchedule.categoryId))
    .where(and(...conditions))
    .orderBy(
      STATUS_ORDER,
      asc(recurringSchedule.nextOccurrenceDate),
      asc(recurringSchedule.name),
      asc(recurringSchedule.id)
    );
  if (rows.length === 0) {
    return [];
  }

  const ids = rows.map(({ id }) => id);
  const [tagRows, postedRows] = await Promise.all([
    db
      .select({
        archivedAt: tag.archivedAt,
        color: tag.color,
        id: tag.id,
        name: tag.name,
        scheduleId: recurringScheduleTag.scheduleId,
      })
      .from(recurringScheduleTag)
      .innerJoin(tag, eq(tag.id, recurringScheduleTag.tagId))
      .where(inArray(recurringScheduleTag.scheduleId, ids))
      .orderBy(asc(tag.name)),
    db
      .select({
        lastOccurrenceDate: max(financialTransaction.recurringOccurrenceDate),
        postedCount: count(),
        scheduleId: financialTransaction.recurringScheduleId,
      })
      .from(financialTransaction)
      .where(
        and(
          eq(financialTransaction.organizationId, organizationId),
          inArray(financialTransaction.recurringScheduleId, ids)
        )
      )
      .groupBy(financialTransaction.recurringScheduleId),
  ]);

  const posted = new Map(
    postedRows.map((row) => [row.scheduleId, row] as const)
  );
  return rows.map((row) => ({
    ...row,
    lastOccurrenceDate: posted.get(row.id)?.lastOccurrenceDate ?? null,
    postedCount: posted.get(row.id)?.postedCount ?? 0,
    tags: tagRows
      .filter((tagRow) => tagRow.scheduleId === row.id)
      .map((tagRow) => ({
        archivedAt: tagRow.archivedAt,
        color: tagRow.color,
        id: tagRow.id,
        name: tagRow.name,
      })),
  }));
};

const findSchedule = async (
  db: Database,
  organizationId: string,
  scheduleId: string
) => {
  const [schedule] = await loadSchedules(db, organizationId, scheduleId);
  if (!schedule) {
    throw notFound("Recurring schedule");
  }
  return schedule;
};

/** Row-locked, so a lifecycle change and a generation run never interleave. */
const lockSchedule = (
  db: Database,
  organizationId: string,
  scheduleId: string
) =>
  lockOwned(
    db,
    recurringSchedule,
    { id: scheduleId, organizationId },
    "Recurring schedule"
  );

const replaceScheduleTags = async (
  db: Database,
  organizationId: string,
  scheduleId: string,
  tagIds: string[]
): Promise<void> => {
  await db
    .delete(recurringScheduleTag)
    .where(eq(recurringScheduleTag.scheduleId, scheduleId));
  if (tagIds.length > 0) {
    await db
      .insert(recurringScheduleTag)
      .values(tagIds.map((tagId) => ({ organizationId, scheduleId, tagId })));
  }
};

const templateColumns = (values: ScheduleValues) => ({
  accountId: values.accountId,
  amount: values.amount,
  categoryId: values.categoryId,
  endDate: values.endDate,
  frequency: values.frequency,
  interval: values.interval,
  name: values.name,
  notes: values.notes || null,
  paidStatus: "paid" as const,
  startDate: values.startDate,
});

const enqueueIfDue = async (
  db: Database,
  scheduleId: string,
  status: RecurringScheduleStatus,
  nextOccurrenceDate: string | null,
  today: string
): Promise<void> => {
  if (
    status !== "active" ||
    nextOccurrenceDate === null ||
    nextOccurrenceDate > today ||
    !queue.isStarted()
  ) {
    return;
  }
  await queue.enqueue(
    "recurring.generate",
    { scheduleId },
    { singletonKey: scheduleId, tx: db }
  );
};

const sameTiming = (a: Recurrence, b: Recurrence): boolean =>
  a.frequency === b.frequency &&
  a.interval === b.interval &&
  a.startDate === b.startDate;

export const recurringRouter = {
  create: orgMutationProcedure
    .use(
      requirePermission({
        recurringTransaction: ["create"],
        transaction: ["create"],
      })
    )
    .input(scheduleValues.refine(endsOnOrAfterStart, endBeforeStart))
    .handler(async ({ context, input }) => {
      await assertReferences(context.db, context.organizationId, input);
      const today = await householdDate(context.db, context.organizationId);
      const nextOccurrenceDate = initialNextOccurrence(input, today);
      if (!isBeforeEnd(input, nextOccurrenceDate)) {
        throw new ORPCError("BAD_REQUEST", {
          message:
            "Nothing would post: the end date is before the first occurrence from today.",
        });
      }
      const [created] = await context.db
        .insert(recurringSchedule)
        .values({
          ...templateColumns(input),
          nextOccurrenceDate,
          organizationId: context.organizationId,
          status: "active",
        })
        .returning({ id: recurringSchedule.id });
      if (!created) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: "Could not create the schedule",
        });
      }
      await replaceScheduleTags(
        context.db,
        context.organizationId,
        created.id,
        input.tagIds
      );
      await enqueueIfDue(
        context.db,
        created.id,
        "active",
        nextOccurrenceDate,
        today
      );
      return findSchedule(context.db, context.organizationId, created.id);
    }),

  list: orgProcedure
    .use(requirePermission({ recurringTransaction: ["read"] }))
    .handler(({ context }) =>
      loadSchedules(context.db, context.organizationId)
    ),

  /** Holds posting; the next occurrence is kept for resume to start from. */
  pause: orgMutationProcedure
    .use(requirePermission({ recurringTransaction: ["update"] }))
    .input(scheduleIdInput)
    .handler(async ({ context, input }) => {
      const current = await lockSchedule(
        context.db,
        context.organizationId,
        input.scheduleId
      );
      if (current.status === "stopped") {
        throw stoppedSchedule();
      }
      if (current.status === "active") {
        await context.db
          .update(recurringSchedule)
          .set({ pausedAt: new Date(), status: "paused" })
          .where(eq(recurringSchedule.id, current.id));
      }
      return findSchedule(context.db, context.organizationId, current.id);
    }),

  /** The transactions a schedule has posted, newest occurrence first. */
  postings: orgProcedure
    .use(
      requirePermission({
        recurringTransaction: ["read"],
        transaction: ["read"],
      })
    )
    .input(scheduleIdInput)
    .handler(async ({ context, input }) => {
      await findSchedule(context.db, context.organizationId, input.scheduleId);
      return context.db
        .select({
          amount: financialTransaction.amount,
          archivedAt: financialTransaction.archivedAt,
          currencyCode: financialTransaction.currencyCode,
          id: financialTransaction.id,
          occurrenceDate: financialTransaction.recurringOccurrenceDate,
          transactionDate: financialTransaction.transactionDate,
        })
        .from(financialTransaction)
        .where(
          and(
            eq(financialTransaction.organizationId, context.organizationId),
            eq(financialTransaction.recurringScheduleId, input.scheduleId)
          )
        )
        .orderBy(desc(financialTransaction.recurringOccurrenceDate))
        .limit(50);
    }),

  // Occurrences that fell due while paused are skipped, not backfilled.
  resume: orgMutationProcedure
    .use(requirePermission({ recurringTransaction: ["update"] }))
    .input(scheduleIdInput)
    .handler(async ({ context, input }) => {
      const current = await lockSchedule(
        context.db,
        context.organizationId,
        input.scheduleId
      );
      if (current.status === "stopped") {
        throw stoppedSchedule();
      }
      if (current.status === "paused") {
        const tagRows = await context.db
          .select({ tagId: recurringScheduleTag.tagId })
          .from(recurringScheduleTag)
          .where(eq(recurringScheduleTag.scheduleId, current.id));
        await assertReferences(context.db, context.organizationId, {
          accountId: current.accountId,
          categoryId: current.categoryId,
          tagIds: tagRows.map(({ tagId }) => tagId),
        });
        const today = await householdDate(context.db, context.organizationId);
        const nextOccurrenceDate = resumedNextOccurrence(
          current,
          current.nextOccurrenceDate ?? today,
          today
        );
        await context.db
          .update(recurringSchedule)
          .set({
            lastError: null,
            pausedAt: null,
            ...(isBeforeEnd(current, nextOccurrenceDate)
              ? { nextOccurrenceDate, status: "active" as const }
              : ended()),
          })
          .where(eq(recurringSchedule.id, current.id));
        await enqueueIfDue(
          context.db,
          current.id,
          "active",
          nextOccurrenceDate,
          today
        );
      }
      return findSchedule(context.db, context.organizationId, current.id);
    }),

  stop: orgMutationProcedure
    .use(requirePermission({ recurringTransaction: ["stop"] }))
    .input(scheduleIdInput)
    .handler(async ({ context, input }) => {
      const current = await lockSchedule(
        context.db,
        context.organizationId,
        input.scheduleId
      );
      if (current.status !== "stopped") {
        await context.db
          .update(recurringSchedule)
          .set({
            nextOccurrenceDate: null,
            status: "stopped",
            stoppedAt: new Date(),
          })
          .where(eq(recurringSchedule.id, current.id));
      }
      return findSchedule(context.db, context.organizationId, current.id);
    }),

  // Posted transactions are never touched; past days are not backfilled.
  update: orgMutationProcedure
    .use(requirePermission({ recurringTransaction: ["update"] }))
    .input(
      scheduleValues
        .extend({ scheduleId: z.uuid() })
        .refine(endsOnOrAfterStart, endBeforeStart)
    )
    .handler(async ({ context, input }) => {
      const { scheduleId, ...values } = input;
      const current = await lockSchedule(
        context.db,
        context.organizationId,
        scheduleId
      );
      if (current.status === "stopped") {
        throw stoppedSchedule();
      }
      await assertReferences(context.db, context.organizationId, values);
      const today = await householdDate(context.db, context.organizationId);
      const nextOccurrenceDate = sameTiming(current, values)
        ? current.nextOccurrenceDate
        : initialNextOccurrence(values, today);
      const timing =
        nextOccurrenceDate !== null && isBeforeEnd(values, nextOccurrenceDate)
          ? { nextOccurrenceDate, status: current.status }
          : ended();

      await context.db
        .update(recurringSchedule)
        // An edit is how a household fixes what paused the schedule.
        .set({
          ...templateColumns(values),
          lastError: null,
          ...timing,
        })
        .where(eq(recurringSchedule.id, current.id));
      await replaceScheduleTags(
        context.db,
        context.organizationId,
        current.id,
        values.tagIds
      );
      await enqueueIfDue(
        context.db,
        current.id,
        timing.status,
        timing.nextOccurrenceDate,
        today
      );
      return findSchedule(context.db, context.organizationId, current.id);
    }),
};
