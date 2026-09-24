/**
 * Report periods are calendar days in the household's timezone. Everything
 * here is pure string/UTC arithmetic so the web client can import it too.
 */

export const REPORT_PRESETS = [
  "this_month",
  "last_month",
  "last_3_months",
  "last_6_months",
  "last_12_months",
  "year_to_date",
  "last_year",
  "all_time",
  "custom",
] as const;
export type ReportPreset = (typeof REPORT_PRESETS)[number];

export const HISTORY_GRANULARITIES = ["day", "week", "month"] as const;
export type HistoryGranularity = (typeof HISTORY_GRANULARITIES)[number];

export interface ReportPeriod {
  dateFrom: string;
  dateTo: string;
  preset: ReportPreset;
  /** The household's calendar day when the period was resolved. */
  today: string;
}

const DAY_MS = 86_400_000;

const utcDate = (iso: string): Date => {
  const [year = 1970, month = 1, day = 1] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
};

const isoOf = (date: Date): string => date.toISOString().slice(0, 10);

/** First day of the month `offset` months from `iso`'s month. */
export const monthStart = (iso: string, offset = 0): string => {
  const date = utcDate(iso);
  return isoOf(
    new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + offset, 1))
  );
};

/** Last day of the month `offset` months from `iso`'s month. */
export const monthEnd = (iso: string, offset = 0): string => {
  const date = utcDate(iso);
  return isoOf(
    new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + offset + 1, 0)
    )
  );
};

export const daysBetween = (from: string, to: string): number =>
  Math.round((utcDate(to).getTime() - utcDate(from).getTime()) / DAY_MS);

/** `YYYY-MM` for every month the range touches, oldest first. */
export const monthsIn = (dateFrom: string, dateTo: string): string[] => {
  const months: string[] = [];
  for (
    let month = monthStart(dateFrom);
    month <= dateTo;
    month = monthStart(month, 1)
  ) {
    months.push(month.slice(0, 7));
  }
  return months;
};

/** The calendar day it is in `timeZone` at `now`. */
export const householdToday = (timeZone: string, now: Date): string => {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(now);
  const part = (type: string) =>
    parts.find((value) => value.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
};

/**
 * Ranges that include this month end today, so a future-dated entry is not
 * reported as having happened. `earliest` only matters for `all_time`.
 */
export const presetRange = (
  preset: Exclude<ReportPreset, "custom">,
  today: string,
  earliest: string | null
): { dateFrom: string; dateTo: string } => {
  switch (preset) {
    case "this_month": {
      return { dateFrom: monthStart(today), dateTo: today };
    }
    case "last_month": {
      return { dateFrom: monthStart(today, -1), dateTo: monthEnd(today, -1) };
    }
    case "last_3_months": {
      return { dateFrom: monthStart(today, -2), dateTo: today };
    }
    case "last_6_months": {
      return { dateFrom: monthStart(today, -5), dateTo: today };
    }
    case "last_12_months": {
      return { dateFrom: monthStart(today, -11), dateTo: today };
    }
    case "year_to_date": {
      return { dateFrom: `${today.slice(0, 4)}-01-01`, dateTo: today };
    }
    case "last_year": {
      const year = Number(today.slice(0, 4)) - 1;
      return { dateFrom: `${year}-01-01`, dateTo: `${year}-12-31` };
    }
    case "all_time": {
      return {
        dateFrom: earliest !== null && earliest < today ? earliest : today,
        dateTo: today,
      };
    }
    default: {
      const unknown: never = preset;
      throw new Error(`Unknown report preset ${String(unknown)}`);
    }
  }
};

const AUTO_DAY_LIMIT = 62;
const AUTO_WEEK_LIMIT = 190;

/** Days for about two months, weeks for about six, month-ends beyond. */
export const autoGranularity = (
  dateFrom: string,
  dateTo: string
): HistoryGranularity => {
  const days = daysBetween(dateFrom, dateTo);
  if (days <= AUTO_DAY_LIMIT) {
    return "day";
  }
  if (days <= AUTO_WEEK_LIMIT) {
    return "week";
  }
  return "month";
};

/** Upper bound on how many points a history range produces. */
export const historyPointCount = (
  dateFrom: string,
  dateTo: string,
  granularity: HistoryGranularity
): number => {
  if (dateFrom > dateTo) {
    return 0;
  }
  if (granularity === "month") {
    return monthsIn(dateFrom, dateTo).length;
  }
  const days = daysBetween(dateFrom, dateTo) + 1;
  return granularity === "day" ? days : Math.ceil(days / 7) + 1;
};
