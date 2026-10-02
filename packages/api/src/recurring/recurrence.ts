import type { RecurringFrequency } from "@masdan/db/schema/transactions";
import { ORPCError } from "@orpc/server";

import { householdToday } from "../reports/periods";

// Leaf module, shared with the web preview. No clock or server timezone.

export const RECURRING_FREQUENCIES = [
  "daily",
  "weekly",
  "monthly",
] as const satisfies readonly RecurringFrequency[];

export interface Recurrence {
  frequency: RecurringFrequency;
  /** Every `interval` days, weeks or months. */
  interval: number;
  /** The first occurrence; weekday and day of month are taken from it. */
  startDate: string;
  /** The last day an occurrence may fall on; absent or null never ends. */
  endDate?: string | null;
}

const DAY_MS = 86_400_000;
const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

const utcDate = (iso: string): Date => {
  const [year = 1970, month = 1, day = 1] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
};

const isoOf = (date: Date): string => date.toISOString().slice(0, 10);

export const addDays = (iso: string, days: number): string =>
  isoOf(new Date(utcDate(iso).getTime() + days * DAY_MS));

const daysBetween = (from: string, to: string): number =>
  Math.round((utcDate(to).getTime() - utcDate(from).getTime()) / DAY_MS);

const daysInMonth = (year: number, monthIndex: number): number =>
  new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();

const monthsBetween = (from: string, to: string): number => {
  const start = utcDate(from);
  const end = utcDate(to);
  return (
    (end.getUTCFullYear() - start.getUTCFullYear()) * 12 +
    end.getUTCMonth() -
    start.getUTCMonth()
  );
};

const stepDays = (recurrence: Recurrence): number =>
  recurrence.frequency === "weekly"
    ? recurrence.interval * 7
    : recurrence.interval;

// Counted from `startDate`, so the 31st lands on Feb 28 then back on the 31st.
export const occurrenceAt = (recurrence: Recurrence, index: number): string => {
  if (recurrence.frequency !== "monthly") {
    return addDays(recurrence.startDate, index * stepDays(recurrence));
  }
  const anchor = utcDate(recurrence.startDate);
  const target = new Date(
    Date.UTC(
      anchor.getUTCFullYear(),
      anchor.getUTCMonth() + index * recurrence.interval,
      1
    )
  );
  const day = Math.min(
    anchor.getUTCDate(),
    daysInMonth(target.getUTCFullYear(), target.getUTCMonth())
  );
  target.setUTCDate(day);
  return isoOf(target);
};

/** The first occurrence on or after `date` (never before `startDate`). */
export const firstOccurrenceOnOrAfter = (
  recurrence: Recurrence,
  date: string
): string => {
  if (date <= recurrence.startDate) {
    return recurrence.startDate;
  }
  if (recurrence.frequency !== "monthly") {
    const step = stepDays(recurrence);
    return occurrenceAt(
      recurrence,
      Math.ceil(daysBetween(recurrence.startDate, date) / step)
    );
  }
  // Clamping can pull an occurrence a few days earlier, never into the prior
  // step, so the estimate is at most one step short.
  let index = Math.floor(
    monthsBetween(recurrence.startDate, date) / recurrence.interval
  );
  let candidate = occurrenceAt(recurrence, index);
  while (candidate < date) {
    index += 1;
    candidate = occurrenceAt(recurrence, index);
  }
  return candidate;
};

/** The occurrence after `date`, whether or not `date` is itself one. */
export const occurrenceAfter = (recurrence: Recurrence, date: string): string =>
  firstOccurrenceOnOrAfter(recurrence, addDays(date, 1));

/** Whether `date` is on or before the schedule's end date, if it has one. */
export const isBeforeEnd = (recurrence: Recurrence, date: string): boolean =>
  !recurrence.endDate || date <= recurrence.endDate;

/** The next `count` occurrences from `from` on, for previews; fewer past an end date. */
export const upcomingOccurrences = (
  recurrence: Recurrence,
  from: string,
  count: number
): string[] => {
  const dates: string[] = [];
  let next = firstOccurrenceOnOrAfter(recurrence, from);
  while (dates.length < count && isBeforeEnd(recurrence, next)) {
    dates.push(next);
    next = occurrenceAfter(recurrence, next);
  }
  return dates;
};

export const initialNextOccurrence = (
  recurrence: Recurrence,
  today: string
): string => firstOccurrenceOnOrAfter(recurrence, today);

export const resumedNextOccurrence = (
  recurrence: Recurrence,
  pausedNext: string,
  today: string
): string =>
  firstOccurrenceOnOrAfter(recurrence, pausedNext > today ? pausedNext : today);

export const isOccurrenceDue = (
  occurrenceDate: string,
  timeZone: string,
  now: Date
): boolean => occurrenceDate <= householdToday(timeZone, now);

const ordinal = (day: number): string => {
  const tens = day % 100;
  if (tens >= 11 && tens <= 13) {
    return `${day}th`;
  }
  switch (day % 10) {
    case 1: {
      return `${day}st`;
    }
    case 2: {
      return `${day}nd`;
    }
    case 3: {
      return `${day}rd`;
    }
    default: {
      return `${day}th`;
    }
  }
};

const LONG_MONTH_DAY = 29;

/** "Every 2 weeks on Monday", "Monthly on the 31st (or the last day)". */
export const describeRecurrence = (recurrence: Recurrence): string => {
  const anchor = utcDate(recurrence.startDate);
  const { interval } = recurrence;
  switch (recurrence.frequency) {
    case "daily": {
      return interval === 1 ? "Daily" : `Every ${interval} days`;
    }
    case "weekly": {
      const weekday = WEEKDAYS[anchor.getUTCDay()] ?? "";
      return interval === 1
        ? `Weekly on ${weekday}`
        : `Every ${interval} weeks on ${weekday}`;
    }
    case "monthly": {
      const day = anchor.getUTCDate();
      const suffix = day >= LONG_MONTH_DAY ? " (or the last day)" : "";
      return interval === 1
        ? `Monthly on the ${ordinal(day)}${suffix}`
        : `Every ${interval} months on the ${ordinal(day)}${suffix}`;
    }
    default: {
      const unknown: never = recurrence.frequency;
      throw new ORPCError("INTERNAL_SERVER_ERROR", {
        message: `Unknown frequency ${String(unknown)}`,
      });
    }
  }
};
