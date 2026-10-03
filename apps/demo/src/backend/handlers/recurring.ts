import {
  addDays,
  firstOccurrenceOnOrAfter,
  initialNextOccurrence,
  isBeforeEnd,
  resumedNextOccurrence,
} from "@masdan/api/recurring/recurrence";

import type { RouterInputs, RouterOutputs } from "@/utils/orpc";

import { today } from "../flows";
import { accountOf, categoryOf } from "../ledger";
import type { Section } from "../router";
import { db } from "../store";
import type { Schedule } from "../store";
import { badRequest, find, newId, scaled, text } from "../util";
import { insertTransaction } from "./transactions";

type ScheduleView = RouterOutputs["recurringSchedules"]["list"][number];
type ScheduleValues = RouterInputs["recurringSchedules"]["create"];

const STATUS_ORDER = { active: 0, paused: 1, stopped: 2 } as const;

const scheduleView = (schedule: Schedule): ScheduleView => {
  const { tagIds, ...row } = schedule;
  const account = find(db().accounts, schedule.accountId, "Financial account");
  const category = find(db().categories, schedule.categoryId, "Category");
  const posted = db().transactions.filter(
    (posting) => posting.recurringScheduleId === schedule.id
  );
  return {
    ...row,
    accountName: account.name,
    categoryColor: category.color,
    categoryIcon: category.icon,
    categoryName: category.name,
    currencyCode: account.currencyCode,
    lastOccurrenceDate:
      posted
        .map((posting) => posting.recurringOccurrenceDate ?? "")
        .toSorted()
        .at(-1) ?? null,
    postedCount: posted.length,
    tags: db()
      .tags.filter((tag) => tagIds.includes(tag.id))
      .toSorted((a, b) => a.name.localeCompare(b.name))
      .map(({ archivedAt, color, id, name }) => ({
        archivedAt,
        color,
        id,
        name,
      })),
    type: category.type,
  };
};

/** What apps/workers does on its next sweep, done at once. */
const postDue = (schedule: Schedule): void => {
  const day = today();
  while (
    schedule.status === "active" &&
    schedule.nextOccurrenceDate !== null &&
    schedule.nextOccurrenceDate <= day &&
    isBeforeEnd(schedule, schedule.nextOccurrenceDate)
  ) {
    const date = schedule.nextOccurrenceDate;
    insertTransaction(
      {
        accountId: schedule.accountId,
        amount: schedule.amount,
        categoryId: schedule.categoryId,
        notes: schedule.notes,
        paidStatus: schedule.paidStatus,
        tagIds: schedule.tagIds,
        transactionDate: date,
      },
      { recurringOccurrenceDate: date, recurringScheduleId: schedule.id }
    );
    const next = firstOccurrenceOnOrAfter(schedule, addDays(date, 1));
    schedule.nextOccurrenceDate = isBeforeEnd(schedule, next) ? next : null;
  }
};

const templateValues = (input: ScheduleValues) => {
  if (!accountOf(input.accountId)) {
    throw badRequest("Choose an active account");
  }
  if (!categoryOf(input.categoryId)) {
    throw badRequest("Choose an active category");
  }
  if (input.endDate !== null && input.endDate < input.startDate) {
    throw badRequest("The end date must be on or after the start date");
  }
  return {
    accountId: input.accountId,
    amount: text(scaled(input.amount)),
    categoryId: input.categoryId,
    endDate: input.endDate,
    frequency: input.frequency,
    interval: input.interval,
    name: input.name,
    notes: input.notes,
    paidStatus: input.paidStatus,
    startDate: input.startDate,
    tagIds: input.tagIds,
  };
};

const change = (
  scheduleId: string,
  update: (schedule: Schedule) => Partial<Schedule>
): ScheduleView => {
  const schedule = find(db().schedules, scheduleId, "Schedule");
  Object.assign(schedule, update(schedule), { updatedAt: new Date() });
  postDue(schedule);
  return scheduleView(schedule);
};

export const recurringSchedules: Section<"recurringSchedules"> = {
  create: (input) => {
    const values = templateValues(input);
    const nextOccurrenceDate = initialNextOccurrence(values, today());
    if (!isBeforeEnd(values, nextOccurrenceDate)) {
      throw badRequest(
        "Nothing would post: the end date is before the first occurrence from today."
      );
    }
    const now = new Date();
    const schedule: Schedule = {
      ...values,
      createdAt: now,
      id: newId(),
      lastError: null,
      nextOccurrenceDate,
      pausedAt: null,
      status: "active",
      stoppedAt: null,
      updatedAt: now,
    };
    db().schedules.push(schedule);
    postDue(schedule);
    return scheduleView(schedule);
  },

  list: () =>
    db()
      .schedules.toSorted(
        (a, b) =>
          STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
          (a.nextOccurrenceDate ?? "9999").localeCompare(
            b.nextOccurrenceDate ?? "9999"
          ) ||
          a.name.localeCompare(b.name)
      )
      .map(scheduleView),

  pause: ({ scheduleId }) =>
    change(scheduleId, () => ({ pausedAt: new Date(), status: "paused" })),

  postings: ({ scheduleId }) => {
    find(db().schedules, scheduleId, "Schedule");
    return db()
      .transactions.filter((row) => row.recurringScheduleId === scheduleId)
      .toSorted((a, b) => b.transactionDate.localeCompare(a.transactionDate))
      .map((row) => ({
        amount: row.amount,
        archivedAt: row.archivedAt,
        currencyCode: row.currencyCode,
        id: row.id,
        occurrenceDate: row.recurringOccurrenceDate,
        transactionDate: row.transactionDate,
      }));
  },

  resume: ({ scheduleId }) =>
    change(scheduleId, (current) => {
      const next = resumedNextOccurrence(
        current,
        current.nextOccurrenceDate ?? today(),
        today()
      );
      return isBeforeEnd(current, next)
        ? { nextOccurrenceDate: next, pausedAt: null, status: "active" }
        : {
            nextOccurrenceDate: null,
            pausedAt: null,
            status: "stopped",
            stoppedAt: new Date(),
          };
    }),

  stop: ({ scheduleId }) =>
    change(scheduleId, () => ({
      nextOccurrenceDate: null,
      status: "stopped",
      stoppedAt: new Date(),
    })),

  update: ({ scheduleId, ...input }) =>
    change(scheduleId, (current) => {
      const values = templateValues(input);
      const retimed =
        current.frequency !== values.frequency ||
        current.interval !== values.interval ||
        current.startDate !== values.startDate;
      const next = retimed
        ? initialNextOccurrence(values, today())
        : current.nextOccurrenceDate;
      return {
        ...values,
        ...(next !== null && isBeforeEnd(values, next)
          ? { nextOccurrenceDate: next }
          : {
              nextOccurrenceDate: null,
              status: "stopped",
              stoppedAt: new Date(),
            }),
      };
    }),
};
