/** UTC arithmetic on `YYYY-MM-DD` household dates; no time zones involved. */

const DAY_MS = 86_400_000;

const utc = (iso: string): Date => {
  const [year = 1970, month = 1, day = 1] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
};

const isoOf = (date: Date): string => date.toISOString().slice(0, 10);

export const addDays = (iso: string, days: number): string =>
  isoOf(new Date(utc(iso).getTime() + days * DAY_MS));

/** Jan 31 plus a month is Feb 28 (or 29), never Mar 3. */
export const addMonths = (iso: string, months: number): string => {
  const date = utc(iso);
  const target = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1)
  );
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)
  ).getUTCDate();
  target.setUTCDate(Math.min(date.getUTCDate(), lastDay));
  return isoOf(target);
};

export const isLastDayOfMonth = (iso: string): boolean =>
  addDays(iso, 1).slice(8) === "01";

export const lastDayOfMonth = (iso: string): string =>
  addDays(addMonths(`${iso.slice(0, 7)}-01`, 1), -1);

export const isLeapYear = (year: number): boolean =>
  (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

/** The first monthly anniversary of `anchor` after `date`. */
export const nextAnniversary = (anchor: string, date: string): string => {
  let months = Math.max(
    1,
    (Number(date.slice(0, 4)) - Number(anchor.slice(0, 4))) * 12 +
      Number(date.slice(5, 7)) -
      Number(anchor.slice(5, 7))
  );
  while (addMonths(anchor, months) <= date) {
    months += 1;
  }
  while (months > 1 && addMonths(anchor, months - 1) > date) {
    months -= 1;
  }
  return addMonths(anchor, months);
};
