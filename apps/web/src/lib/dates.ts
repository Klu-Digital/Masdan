/**
 * Ledger dates are calendar days (`YYYY-MM-DD`) in the household's timezone,
 * never instants — so they are parsed as local dates and compared as strings.
 */

export const parseIsoDate = (value: string): Date => {
  const [year = 1970, month = 1, day = 1] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
};

export const toIsoDate = (date: Date): string =>
  [
    String(date.getFullYear()),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");

export const addDays = (iso: string, days: number): string => {
  const date = parseIsoDate(iso);
  date.setDate(date.getDate() + days);
  return toIsoDate(date);
};

export const addMonths = (iso: string, months: number): string => {
  const date = parseIsoDate(iso);
  date.setDate(1);
  date.setMonth(date.getMonth() + months);
  return toIsoDate(date);
};

export const startOfMonth = (iso: string): string => `${iso.slice(0, 7)}-01`;

export const endOfMonth = (iso: string): string => {
  const date = parseIsoDate(startOfMonth(iso));
  date.setMonth(date.getMonth() + 1);
  date.setDate(0);
  return toIsoDate(date);
};

export const daysBetween = (from: string, to: string): number =>
  Math.round(
    (parseIsoDate(to).getTime() - parseIsoDate(from).getTime()) / 86_400_000
  );

const dayFormat = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
  weekday: "short",
});
const dayYearFormat = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
  year: "numeric",
});
const shortFormat = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
});
const monthFormat = new Intl.DateTimeFormat(undefined, { month: "short" });
const monthNameFormat = new Intl.DateTimeFormat(undefined, { month: "long" });
const monthYearFormat = new Intl.DateTimeFormat(undefined, {
  month: "long",
  year: "numeric",
});
const longFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "long" });

/** "Today", "Yesterday", "Mon, Sep 21", or "Sep 21, 2025" outside this year. */
export const formatDay = (iso: string, today: string): string => {
  const delta = daysBetween(iso, today);
  if (delta === 0) {
    return "Today";
  }
  if (delta === 1) {
    return "Yesterday";
  }
  if (delta === -1) {
    return "Tomorrow";
  }
  return iso.slice(0, 4) === today.slice(0, 4)
    ? dayFormat.format(parseIsoDate(iso))
    : dayYearFormat.format(parseIsoDate(iso));
};

/** "Sep 21", or "Sep 21, 2025" outside this year. */
export const formatShortDate = (iso: string, today: string): string =>
  iso.slice(0, 4) === today.slice(0, 4)
    ? shortFormat.format(parseIsoDate(iso))
    : dayYearFormat.format(parseIsoDate(iso));

export const formatLongDate = (iso: string): string =>
  longFormat.format(parseIsoDate(iso));

export const formatMonth = (isoMonth: string): string =>
  monthFormat.format(parseIsoDate(`${isoMonth.slice(0, 7)}-01`));

export const formatMonthName = (isoMonth: string): string =>
  monthNameFormat.format(parseIsoDate(`${isoMonth.slice(0, 7)}-01`));

export const formatMonthYear = (isoMonth: string): string =>
  monthYearFormat.format(parseIsoDate(`${isoMonth.slice(0, 7)}-01`));

/** "in 3 days", "tomorrow", "today", "2 days ago". */
export const formatRelativeDays = (iso: string, today: string): string => {
  const delta = daysBetween(today, iso);
  if (delta === 0) {
    return "today";
  }
  if (delta === 1) {
    return "tomorrow";
  }
  if (delta === -1) {
    return "yesterday";
  }
  return delta > 0 ? `in ${delta} days` : `${-delta} days ago`;
};

/**
 * The next calendar date carrying `day` on or after `today`, clamped to the
 * month's length so a 31st lands on the 30th in short months.
 */
export const nextDayOfMonth = (day: number, today: string): string => {
  const base = parseIsoDate(today);
  for (let offset = 0; offset < 2; offset += 1) {
    const year = base.getFullYear();
    const month = base.getMonth() + offset;
    const lastDay = new Date(year, month + 1, 0).getDate();
    const candidate = toIsoDate(new Date(year, month, Math.min(day, lastDay)));
    if (candidate >= today) {
      return candidate;
    }
  }
  return today;
};

/** The latest date carrying `day` on or before `today`, clamped per month. */
export const previousDayOfMonth = (day: number, today: string): string => {
  const base = parseIsoDate(today);
  for (let offset = 0; offset < 2; offset += 1) {
    const year = base.getFullYear();
    const month = base.getMonth() - offset;
    const lastDay = new Date(year, month + 1, 0).getDate();
    const candidate = toIsoDate(new Date(year, month, Math.min(day, lastDay)));
    if (candidate <= today) {
      return candidate;
    }
  }
  return today;
};
