import { describe, expect, it } from "vite-plus/test";

import {
  autoGranularity,
  historyPointCount,
  householdToday,
  monthEnd,
  monthStart,
  monthsIn,
  presetRange,
} from "./periods";

describe("householdToday", () => {
  it("uses the household's calendar day around midnight", () => {
    const now = new Date("2026-02-28T16:30:00Z");
    expect(householdToday("Asia/Manila", now)).toBe("2026-03-01");
    expect(householdToday("UTC", now)).toBe("2026-02-28");
    expect(householdToday("America/New_York", now)).toBe("2026-02-28");
  });
});

describe("month arithmetic", () => {
  it("handles leap years, year boundaries and short months", () => {
    expect(monthStart("2026-03-31", -1)).toBe("2026-02-01");
    expect(monthEnd("2024-03-15", -1)).toBe("2024-02-29");
    expect(monthEnd("2026-01-31", -1)).toBe("2025-12-31");
    expect(monthStart("2026-01-10", -11)).toBe("2025-02-01");
    expect(monthsIn("2025-11-15", "2026-02-01")).toEqual([
      "2025-11",
      "2025-12",
      "2026-01",
      "2026-02",
    ]);
  });
});

describe("presetRange", () => {
  const today = "2026-03-01";

  it("ends ranges that include this month on today", () => {
    expect(presetRange("this_month", today, null)).toEqual({
      dateFrom: "2026-03-01",
      dateTo: "2026-03-01",
    });
    expect(presetRange("last_3_months", today, null)).toEqual({
      dateFrom: "2026-01-01",
      dateTo: "2026-03-01",
    });
    expect(presetRange("last_6_months", today, null)).toEqual({
      dateFrom: "2025-10-01",
      dateTo: "2026-03-01",
    });
    expect(presetRange("last_12_months", today, null)).toEqual({
      dateFrom: "2025-04-01",
      dateTo: "2026-03-01",
    });
    expect(presetRange("year_to_date", today, null)).toEqual({
      dateFrom: "2026-01-01",
      dateTo: "2026-03-01",
    });
  });

  it("covers whole calendar periods in the past", () => {
    expect(presetRange("last_month", today, null)).toEqual({
      dateFrom: "2026-02-01",
      dateTo: "2026-02-28",
    });
    expect(presetRange("last_year", today, null)).toEqual({
      dateFrom: "2025-01-01",
      dateTo: "2025-12-31",
    });
  });

  it("starts all time at the first ledger date, or today without one", () => {
    expect(presetRange("all_time", today, "2019-06-15")).toEqual({
      dateFrom: "2019-06-15",
      dateTo: today,
    });
    expect(presetRange("all_time", today, null)).toEqual({
      dateFrom: today,
      dateTo: today,
    });
    expect(presetRange("all_time", today, "2027-01-01")).toEqual({
      dateFrom: today,
      dateTo: today,
    });
  });
});

describe("history granularity", () => {
  it("picks days, then weeks, then month-ends as the range grows", () => {
    expect(autoGranularity("2026-01-01", "2026-03-01")).toBe("day");
    expect(autoGranularity("2026-01-01", "2026-06-30")).toBe("week");
    expect(autoGranularity("2025-01-01", "2026-06-30")).toBe("month");
  });

  it("bounds the number of points", () => {
    expect(historyPointCount("2026-01-01", "2026-01-31", "day")).toBe(31);
    expect(historyPointCount("2025-01-15", "2025-12-01", "month")).toBe(12);
    expect(historyPointCount("2026-02-01", "2026-01-01", "day")).toBe(0);
  });
});
