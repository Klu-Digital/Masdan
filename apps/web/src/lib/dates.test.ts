import { describe, expect, it } from "vite-plus/test";

import {
  addMonths,
  daysBetween,
  endOfMonth,
  formatDay,
  formatRelativeDays,
  nextDayOfMonth,
  previousDayOfMonth,
  startOfMonth,
} from "./dates";

describe("calendar arithmetic", () => {
  it("moves by whole months from the first of the month", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-01");
    expect(addMonths("2026-03-15", -3)).toBe("2025-12-01");
  });

  it("finds month bounds, including leap February", () => {
    expect(startOfMonth("2028-02-17")).toBe("2028-02-01");
    expect(endOfMonth("2028-02-17")).toBe("2028-02-29");
  });

  it("counts days between calendar dates", () => {
    expect(daysBetween("2026-09-24", "2026-10-06")).toBe(12);
    expect(daysBetween("2026-09-24", "2026-09-20")).toBe(-4);
  });
});

describe("day-of-month schedules", () => {
  it("projects the next due day, clamping to short months", () => {
    expect(nextDayOfMonth(6, "2026-09-24")).toBe("2026-10-06");
    expect(nextDayOfMonth(24, "2026-09-24")).toBe("2026-09-24");
    expect(nextDayOfMonth(31, "2026-09-24")).toBe("2026-09-30");
  });

  it("finds the latest closing day on or before today", () => {
    expect(previousDayOfMonth(18, "2026-09-24")).toBe("2026-09-18");
    expect(previousDayOfMonth(28, "2026-09-24")).toBe("2026-08-28");
  });
});

describe("relative labels", () => {
  it("names nearby days in words", () => {
    expect(formatDay("2026-09-24", "2026-09-24")).toBe("Today");
    expect(formatDay("2026-09-23", "2026-09-24")).toBe("Yesterday");
    expect(formatRelativeDays("2026-09-27", "2026-09-24")).toBe("in 3 days");
    expect(formatRelativeDays("2026-09-22", "2026-09-24")).toBe("2 days ago");
  });
});
