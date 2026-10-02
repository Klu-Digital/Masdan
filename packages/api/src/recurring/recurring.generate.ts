import type { Database } from "@masdan/db";
import {
  organization,
  recurringSchedule,
  recurringScheduleTag,
} from "@masdan/db/schema/index";
import { log } from "@masdan/observability";
import { ORPCError } from "@orpc/server";
import { and, asc, eq, lte } from "drizzle-orm";

import { householdToday } from "../reports/periods";
import { createTransaction } from "../transactions/transactions.write";
import {
  addDays,
  isBeforeEnd,
  isOccurrenceDue,
  occurrenceAfter,
} from "./recurrence";

/**
 * Worker-side generation. No procedure ladder: apps/workers runs it. Every
 * occurrence goes through `createTransaction`, the same path as manual entry.
 */

/** Bounds one run's catch-up after downtime; the next sweep continues it. */
export const MAX_OCCURRENCES_PER_RUN = 62;

export interface GenerationResult {
  /** Occurrences that got a new transaction in this run. */
  created: number;
  /** Set when its end date left the schedule nothing more to post. */
  ended: boolean;
  /** Set when a validation failure paused the schedule. */
  pausedReason: string | null;
  /** Occurrences that already had their transaction — a retry or a race. */
  skipped: number;
}

const EMPTY_RESULT: GenerationResult = {
  created: 0,
  ended: false,
  pausedReason: null,
  skipped: 0,
};

/**
 * Posts every occurrence of one schedule that is due in its household's
 * timezone. The row lock serializes overlapping runs; the unique
 * (schedule, occurrence date) index is what makes a duplicate impossible even
 * without it.
 */
export const generateDueOccurrences = (
  db: Database,
  scheduleId: string,
  now: Date
): Promise<GenerationResult> =>
  db.transaction(async (tx) => {
    const [schedule] = await tx
      .select()
      .from(recurringSchedule)
      .where(eq(recurringSchedule.id, scheduleId))
      .for("update")
      .limit(1);
    if (schedule?.status !== "active" || !schedule.nextOccurrenceDate) {
      return EMPTY_RESULT;
    }
    const [household] = await tx
      .select({ timezone: organization.timezone })
      .from(organization)
      .where(eq(organization.id, schedule.organizationId))
      .limit(1);
    if (!household) {
      return EMPTY_RESULT;
    }

    const today = householdToday(household.timezone, now);
    const tagRows = await tx
      .select({ tagId: recurringScheduleTag.tagId })
      .from(recurringScheduleTag)
      .where(eq(recurringScheduleTag.scheduleId, schedule.id));
    const tagIds = tagRows.map(({ tagId }) => tagId);

    const result = { ...EMPTY_RESULT };
    let next: string = schedule.nextOccurrenceDate;
    while (
      next <= today &&
      isBeforeEnd(schedule, next) &&
      result.created + result.skipped < MAX_OCCURRENCES_PER_RUN
    ) {
      const occurrenceDate = next;
      try {
        // A savepoint, so a rejected occurrence leaves the lock and the
        // pause below intact.
        const created = await tx.transaction((savepoint) =>
          createTransaction(
            savepoint,
            schedule.organizationId,
            {
              accountId: schedule.accountId,
              amount: schedule.amount,
              categoryId: schedule.categoryId,
              notes: schedule.notes,
              paidStatus: "paid",
              splits: [],
              tagIds,
              transactionDate: occurrenceDate,
            },
            { occurrenceDate, scheduleId: schedule.id }
          )
        );
        if (created) {
          result.created += 1;
        } else {
          result.skipped += 1;
        }
      } catch (error) {
        // A validation failure (archived account, category or tag) repeats on
        // every retry, so park the schedule for the household to fix instead.
        if (!(error instanceof ORPCError)) {
          throw error;
        }
        await tx
          .update(recurringSchedule)
          .set({
            lastError: error.message,
            nextOccurrenceDate: occurrenceDate,
            pausedAt: now,
            status: "paused",
          })
          .where(eq(recurringSchedule.id, schedule.id));
        log.warn({
          action: "recurring.generate.paused",
          occurrenceDate,
          reason: error.message,
          scheduleId: schedule.id,
        });
        return { ...result, pausedReason: error.message };
      }
      next = occurrenceAfter(schedule, occurrenceDate);
    }

    if (!isBeforeEnd(schedule, next)) {
      await tx
        .update(recurringSchedule)
        .set({ nextOccurrenceDate: null, status: "stopped", stoppedAt: now })
        .where(eq(recurringSchedule.id, schedule.id));
      return { ...result, ended: true };
    }
    if (next !== schedule.nextOccurrenceDate) {
      await tx
        .update(recurringSchedule)
        .set({ nextOccurrenceDate: next })
        .where(eq(recurringSchedule.id, schedule.id));
    }
    return result;
  });

/**
 * Active schedules with an occurrence due in their own household's timezone.
 * No zone is more than a day ahead of UTC, so SQL narrows by date and the
 * zone check runs here, through the same `householdToday` as everything else.
 */
export const findDueSchedules = async (
  db: Database,
  now: Date,
  limit: number
): Promise<string[]> => {
  const candidates = await db
    .select({
      id: recurringSchedule.id,
      nextOccurrenceDate: recurringSchedule.nextOccurrenceDate,
      timezone: organization.timezone,
    })
    .from(recurringSchedule)
    .innerJoin(
      organization,
      eq(organization.id, recurringSchedule.organizationId)
    )
    .where(
      and(
        eq(recurringSchedule.status, "active"),
        lte(
          recurringSchedule.nextOccurrenceDate,
          addDays(householdToday("UTC", now), 1)
        )
      )
    )
    .orderBy(
      asc(recurringSchedule.nextOccurrenceDate),
      asc(recurringSchedule.id)
    )
    .limit(limit);

  return candidates
    .filter(
      (candidate) =>
        candidate.nextOccurrenceDate !== null &&
        isOccurrenceDue(candidate.nextOccurrenceDate, candidate.timezone, now)
    )
    .map(({ id }) => id);
};
