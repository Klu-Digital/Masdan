import { describe, expect, it } from "vite-plus/test";

import { householdToday } from "./household-date";

describe("householdToday", () => {
  it("uses the household date at the Manila midnight boundary", () => {
    const now = new Date("2026-09-18T16:30:00Z");
    expect(householdToday("Asia/Manila", now)).toBe("2026-09-19");
    expect(householdToday("America/New_York", now)).toBe("2026-09-18");
  });
});
