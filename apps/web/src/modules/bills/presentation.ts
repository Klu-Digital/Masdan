import { addDays, endOfMonth, parseIsoDate } from "@/lib/dates";

import type { Bill } from "./types";

export type BillStatus = Bill["status"];

const DAYS_PER_WEEK = 7;

/** A month as Sunday-first weeks; days outside the month are null. */
export const calendarWeeks = (month: string): (string | null)[][] => {
  const first = `${month}-01`;
  const last = endOfMonth(first);
  const leading = parseIsoDate(first).getDay();
  const cells: (string | null)[] = Array.from<null>({ length: leading }).fill(
    null
  );
  for (let day = first; day <= last; day = addDays(day, 1)) {
    cells.push(day);
  }
  while (cells.length % DAYS_PER_WEEK !== 0) {
    cells.push(null);
  }
  const weeks: (string | null)[][] = [];
  for (let index = 0; index < cells.length; index += DAYS_PER_WEEK) {
    weeks.push(cells.slice(index, index + DAYS_PER_WEEK));
  }
  return weeks;
};

/**
 * Where a grid key moves focus, kept inside the month: arrows by a day or a
 * week, Home and End to the ends of the week. Null for any other key.
 */
export const moveWithinMonth = (day: string, key: string): string | null => {
  const weekday = parseIsoDate(day).getDay();
  const offsets: Record<string, number> = {
    ArrowDown: DAYS_PER_WEEK,
    ArrowLeft: -1,
    ArrowRight: 1,
    ArrowUp: -DAYS_PER_WEEK,
    End: DAYS_PER_WEEK - 1 - weekday,
    Home: -weekday,
  };
  const offset = offsets[key];
  if (offset === undefined) {
    return null;
  }
  const target = addDays(day, offset);
  const first = `${day.slice(0, 7)}-01`;
  const last = endOfMonth(first);
  if (target < first) {
    return first;
  }
  return target > last ? last : target;
};

export const STATUS_LABELS: Record<BillStatus, string> = {
  expected: "Upcoming",
  overdue: "Overdue",
  paid: "Paid",
};

export const statusBadgeVariant = (
  status: BillStatus
): "error" | "secondary" | "success" => {
  if (status === "overdue") {
    return "error";
  }
  return status === "paid" ? "success" : "secondary";
};

/** "2 bills, 1 overdue" for a day cell's accessible name. */
export const daySummary = (bills: readonly Bill[]): string => {
  if (bills.length === 0) {
    return "no bills";
  }
  const parts = [`${bills.length} ${bills.length === 1 ? "bill" : "bills"}`];
  for (const status of ["overdue", "expected", "paid"] as const) {
    const count = bills.filter((bill) => bill.status === status).length;
    if (count > 0 && count < bills.length) {
      parts.push(`${count} ${STATUS_LABELS[status].toLowerCase()}`);
    } else if (count === bills.length) {
      parts.push(`all ${STATUS_LABELS[status].toLowerCase()}`);
    }
  }
  return parts.join(", ");
};

/** Why a paid bill counts as paid, in the household's words. */
export const paidReason = (bill: Bill): string | null => {
  switch (bill.paidBy) {
    case "confirmation": {
      const who = bill.payment?.confirmedByName;
      return who ? `Marked paid by ${who}` : "Marked paid";
    }
    case "payment": {
      return "Paid with a linked payment";
    }
    case "transfers": {
      return "Paid by transfers into the card";
    }
    default: {
      return null;
    }
  }
};

export const billSourceLabel = (bill: Bill): string => {
  if (bill.source === "statement") {
    return "Statement due date";
  }
  if (bill.source === "projected") {
    return "Card due day · amount comes with the statement";
  }
  return bill.scheduleStatus === "active"
    ? "Recurring"
    : `Recurring · ${bill.scheduleStatus ?? "stopped"}`;
};
