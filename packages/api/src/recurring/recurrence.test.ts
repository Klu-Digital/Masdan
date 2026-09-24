import { describe, expect, it } from "vite-plus/test";

import {
  describeRecurrence,
  firstOccurrenceOnOrAfter,
  initialNextOccurrence,
  isOccurrenceDue,
  occurrenceAfter,
  occurrenceAt,
  resumedNextOccurrence,
  upcomingOccurrences,
} from "./recurrence";
import type { Recurrence } from "./recurrence";

const daily: Recurrence = {
  frequency: "daily",
  interval: 1,
  startDate: "2026-09-20",
};
const weekly: Recurrence = {
  frequency: "weekly",
  interval: 1,
  // A Monday.
  startDate: "2026-09-21",
};
const monthly: Recurrence = {
  frequency: "monthly",
  interval: 1,
  startDate: "2026-01-15",
};

describe("daily recurrence", () => {
  it("steps one day at a time from the start date", () => {
    expect(upcomingOccurrences(daily, "2026-09-20", 3)).toEqual([
      "2026-09-20",
      "2026-09-21",
      "2026-09-22",
    ]);
  });

  it("crosses month and year boundaries", () => {
    expect(
      upcomingOccurrences(
        { ...daily, startDate: "2026-12-30" },
        "2026-12-30",
        4
      )
    ).toEqual(["2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02"]);
  });

  it("supports a custom interval", () => {
    const everyThree = { ...daily, interval: 3 };
    expect(upcomingOccurrences(everyThree, "2026-09-21", 3)).toEqual([
      "2026-09-23",
      "2026-09-26",
      "2026-09-29",
    ]);
  });
});

describe("weekly recurrence", () => {
  it("keeps the start date's weekday", () => {
    expect(upcomingOccurrences(weekly, "2026-09-22", 3)).toEqual([
      "2026-09-28",
      "2026-10-05",
      "2026-10-12",
    ]);
  });

  it("counts fortnights from the start date, not from today", () => {
    const fortnightly = { ...weekly, interval: 2 };
    expect(firstOccurrenceOnOrAfter(fortnightly, "2026-09-29")).toBe(
      "2026-10-05"
    );
    expect(firstOccurrenceOnOrAfter(fortnightly, "2026-10-06")).toBe(
      "2026-10-19"
    );
  });

  it("returns the date itself when it is an occurrence", () => {
    expect(firstOccurrenceOnOrAfter(weekly, "2026-10-05")).toBe("2026-10-05");
  });
});

describe("monthly recurrence", () => {
  it("keeps the start date's day of month", () => {
    expect(upcomingOccurrences(monthly, "2026-01-16", 3)).toEqual([
      "2026-02-15",
      "2026-03-15",
      "2026-04-15",
    ]);
  });

  it("clamps the 31st to short months and returns to the 31st after", () => {
    const endOfMonth = { ...monthly, startDate: "2026-01-31" };
    expect(upcomingOccurrences(endOfMonth, "2026-01-31", 5)).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
      "2026-05-31",
    ]);
  });

  it("uses February 29 in a leap year", () => {
    const endOfMonth = { ...monthly, startDate: "2028-01-30" };
    expect(occurrenceAt(endOfMonth, 1)).toBe("2028-02-29");
    expect(occurrenceAt(endOfMonth, 2)).toBe("2028-03-30");
  });

  it("finds the clamped occurrence when searching from inside a short month", () => {
    const endOfMonth = { ...monthly, startDate: "2026-01-31" };
    expect(firstOccurrenceOnOrAfter(endOfMonth, "2026-02-27")).toBe(
      "2026-02-28"
    );
    expect(firstOccurrenceOnOrAfter(endOfMonth, "2026-03-01")).toBe(
      "2026-03-31"
    );
    expect(occurrenceAfter(endOfMonth, "2026-02-28")).toBe("2026-03-31");
  });

  it("supports every N months across a year boundary", () => {
    const quarterly = { ...monthly, interval: 3, startDate: "2026-11-30" };
    expect(upcomingOccurrences(quarterly, "2026-12-01", 3)).toEqual([
      "2027-02-28",
      "2027-05-30",
      "2027-08-30",
    ]);
  });

  it("supports a yearly rhythm as every 12 months", () => {
    const yearly = { ...monthly, interval: 12, startDate: "2024-02-29" };
    expect(upcomingOccurrences(yearly, "2024-03-01", 4)).toEqual([
      "2025-02-28",
      "2026-02-28",
      "2027-02-28",
      "2028-02-29",
    ]);
  });
});

describe("next occurrence", () => {
  it("never returns a date before the start date", () => {
    expect(firstOccurrenceOnOrAfter(monthly, "2025-06-01")).toBe("2026-01-15");
    expect(initialNextOccurrence(monthly, "2025-06-01")).toBe("2026-01-15");
  });

  it("does not backfill a start date in the past", () => {
    expect(initialNextOccurrence(monthly, "2026-09-24")).toBe("2026-10-15");
    expect(initialNextOccurrence(monthly, "2026-09-15")).toBe("2026-09-15");
  });

  it("recomputes deterministically after a timing edit", () => {
    const edited: Recurrence = {
      frequency: "weekly",
      interval: 2,
      startDate: "2026-09-04",
    };
    expect(initialNextOccurrence(edited, "2026-09-24")).toBe("2026-10-02");
    expect(initialNextOccurrence(edited, "2026-09-24")).toBe(
      initialNextOccurrence(edited, "2026-09-24")
    );
  });

  it("skips occurrences that fell due while paused", () => {
    // Paused with the 15th of July next; resumed on September 24.
    expect(resumedNextOccurrence(monthly, "2026-07-15", "2026-09-24")).toBe(
      "2026-10-15"
    );
  });

  it("posts today's occurrence when resumed on its day", () => {
    expect(resumedNextOccurrence(monthly, "2026-07-15", "2026-09-15")).toBe(
      "2026-09-15"
    );
  });

  it("keeps an occurrence still ahead of the resume date", () => {
    expect(resumedNextOccurrence(monthly, "2026-10-15", "2026-09-24")).toBe(
      "2026-10-15"
    );
  });
});

describe("isOccurrenceDue", () => {
  it("is due from midnight in the household timezone, not UTC", () => {
    // 2026-09-30T16:00Z is 00:00 on October 1 in Manila (UTC+8).
    const manilaMidnight = new Date("2026-09-30T16:00:00Z");
    expect(isOccurrenceDue("2026-10-01", "Asia/Manila", manilaMidnight)).toBe(
      true
    );
    expect(isOccurrenceDue("2026-10-01", "UTC", manilaMidnight)).toBe(false);
  });

  it("is not due one minute before local midnight", () => {
    const beforeMidnight = new Date("2026-09-30T15:59:00Z");
    expect(isOccurrenceDue("2026-10-01", "Asia/Manila", beforeMidnight)).toBe(
      false
    );
  });

  it("follows a timezone behind UTC", () => {
    // 03:00Z on October 1 is still September 30 in New York.
    const earlyUtc = new Date("2026-10-01T03:00:00Z");
    expect(isOccurrenceDue("2026-10-01", "America/New_York", earlyUtc)).toBe(
      false
    );
    expect(isOccurrenceDue("2026-09-30", "America/New_York", earlyUtc)).toBe(
      true
    );
  });

  it("treats overdue occurrences as due", () => {
    expect(
      isOccurrenceDue(
        "2026-09-01",
        "Asia/Manila",
        new Date("2026-09-24T00:00:00Z")
      )
    ).toBe(true);
  });
});

describe("describeRecurrence", () => {
  it("names the rhythm", () => {
    expect(describeRecurrence(daily)).toBe("Daily");
    expect(describeRecurrence({ ...daily, interval: 3 })).toBe("Every 3 days");
    expect(describeRecurrence(weekly)).toBe("Weekly on Monday");
    expect(describeRecurrence({ ...weekly, interval: 2 })).toBe(
      "Every 2 weeks on Monday"
    );
    expect(describeRecurrence(monthly)).toBe("Monthly on the 15th");
    expect(
      describeRecurrence({ ...monthly, interval: 3, startDate: "2026-01-31" })
    ).toBe("Every 3 months on the 31st (or the last day)");
    expect(describeRecurrence({ ...monthly, startDate: "2026-01-02" })).toBe(
      "Monthly on the 2nd"
    );
    expect(describeRecurrence({ ...monthly, startDate: "2026-01-11" })).toBe(
      "Monthly on the 11th"
    );
  });
});
