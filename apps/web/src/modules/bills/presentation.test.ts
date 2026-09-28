import { describe, expect, it } from "vite-plus/test";

import { calendarWeeks, daySummary, moveWithinMonth } from "./presentation";
import type { Bill } from "./queries";

describe("calendarWeeks", () => {
  it("pads the first and last weeks so every week has seven days", () => {
    // September 2026 starts on a Tuesday and ends on a Wednesday.
    const weeks = calendarWeeks("2026-09");
    expect(weeks).toHaveLength(5);
    expect(weeks[0]).toEqual([
      null,
      null,
      "2026-09-01",
      "2026-09-02",
      "2026-09-03",
      "2026-09-04",
      "2026-09-05",
    ]);
    expect(weeks.at(-1)).toEqual([
      "2026-09-27",
      "2026-09-28",
      "2026-09-29",
      "2026-09-30",
      null,
      null,
      null,
    ]);
  });

  it("handles a leap February", () => {
    expect(calendarWeeks("2028-02").flat().filter(Boolean)).toHaveLength(29);
  });
});

describe("moveWithinMonth", () => {
  it("moves by days and weeks and stays inside the month", () => {
    expect(moveWithinMonth("2026-09-10", "ArrowRight")).toBe("2026-09-11");
    expect(moveWithinMonth("2026-09-10", "ArrowUp")).toBe("2026-09-03");
    expect(moveWithinMonth("2026-09-03", "ArrowUp")).toBe("2026-09-01");
    expect(moveWithinMonth("2026-09-28", "ArrowDown")).toBe("2026-09-30");
  });

  it("jumps to the ends of the week and ignores other keys", () => {
    // 2026-09-10 is a Thursday.
    expect(moveWithinMonth("2026-09-10", "Home")).toBe("2026-09-06");
    expect(moveWithinMonth("2026-09-10", "End")).toBe("2026-09-12");
    expect(moveWithinMonth("2026-09-10", "Enter")).toBeNull();
  });
});

const bill = (status: Bill["status"]) => ({ status }) as Bill;

describe("daySummary", () => {
  it("names the count and the mix of states", () => {
    expect(daySummary([])).toBe("no bills");
    expect(daySummary([bill("paid")])).toBe("1 bill, all paid");
    expect(daySummary([bill("overdue"), bill("paid")])).toBe(
      "2 bills, 1 overdue, 1 paid"
    );
  });
});
