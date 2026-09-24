import {
  describeRecurrence,
  upcomingOccurrences,
} from "@masdan/api/recurring/recurrence";
import type { Recurrence } from "@masdan/api/recurring/recurrence";

import { formatLongDate } from "@/lib/dates";

export const FREQUENCY_UNITS = {
  daily: ["day", "days"],
  monthly: ["month", "months"],
  weekly: ["week", "weeks"],
} as const;

export const FREQUENCY_LABELS = {
  daily: "Daily",
  monthly: "Monthly",
  weekly: "Weekly",
} as const;

export const STATUS_LABELS = {
  active: "Active",
  paused: "Paused",
  stopped: "Stopped",
} as const;

/** "Monthly on the 15th · next Oct 15, 2026", or why it isn't posting. */
export const scheduleTiming = (
  schedule: Recurrence & {
    nextOccurrenceDate: string | null;
    status: keyof typeof STATUS_LABELS;
  }
): string => {
  const rhythm = describeRecurrence(schedule);
  if (schedule.status === "stopped" || schedule.nextOccurrenceDate === null) {
    return `${rhythm} · stopped`;
  }
  if (schedule.status === "paused") {
    return `${rhythm} · paused`;
  }
  return `${rhythm} · next ${formatLongDate(schedule.nextOccurrenceDate)}`;
};

/**
 * The next dates a schedule would post from `from`, for the form preview.
 * Null while the recurrence is incomplete.
 */
export const previewOccurrences = (
  recurrence: Partial<Recurrence>,
  from: string,
  count = 3
): string[] | null => {
  const { frequency, interval, startDate } = recurrence;
  if (
    !frequency ||
    !startDate ||
    !/^\d{4}-\d{2}-\d{2}$/u.test(startDate) ||
    interval === undefined ||
    !Number.isInteger(interval) ||
    interval < 1
  ) {
    return null;
  }
  return upcomingOccurrences({ frequency, interval, startDate }, from, count);
};
