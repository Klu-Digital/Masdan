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
  const next = `${rhythm} · next ${formatLongDate(schedule.nextOccurrenceDate)}`;
  return schedule.endDate
    ? `${next} · until ${formatLongDate(schedule.endDate)}`
    : next;
};

export const previewOccurrences = (
  recurrence: Partial<Recurrence>,
  from: string,
  count = 3
): string[] | null => {
  const { endDate, frequency, interval, startDate } = recurrence;
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
  return upcomingOccurrences(
    { endDate, frequency, interval, startDate },
    from,
    count
  );
};
