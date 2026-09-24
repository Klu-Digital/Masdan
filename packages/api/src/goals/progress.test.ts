import { describe, expect, it } from "vite-plus/test";

import { goalProgress, goalStatus } from "./progress";

describe("goalProgress", () => {
  it("measures a goal part of the way there", () => {
    expect(goalProgress("25000.500000", "100000.000000")).toEqual({
      percent: 25,
      reached: false,
      remaining: "74999.500000",
      saved: "25000.500000",
    });
  });

  it("never rounds a nearly-done goal up to 100%", () => {
    expect(goalProgress("99999.999999", "100000")).toMatchObject({
      percent: 99,
      reached: false,
      remaining: "0.000001",
    });
  });

  it("reaches 100% exactly at the target", () => {
    expect(goalProgress("100000.000000", "100000")).toEqual({
      percent: 100,
      reached: true,
      remaining: "0.000000",
      saved: "100000.000000",
    });
  });

  it("caps the bar past the target and keeps the real balance", () => {
    expect(goalProgress("150000", "100000")).toEqual({
      percent: 100,
      reached: true,
      remaining: "0.000000",
      saved: "150000.000000",
    });
  });

  it("holds the bar at zero for an empty or overdrawn account", () => {
    expect(goalProgress("0", "5000")).toMatchObject({
      percent: 0,
      remaining: "5000.000000",
    });
    expect(goalProgress("0.000001", "5000").percent).toBe(0);
    expect(goalProgress("-1200.5", "5000")).toEqual({
      percent: 0,
      reached: false,
      remaining: "6200.500000",
      saved: "-1200.500000",
    });
  });

  it("keeps six-place precision where floats drift", () => {
    expect(goalProgress("0.1", "0.3")).toMatchObject({
      percent: 33,
      remaining: "0.200000",
    });
  });
});

describe("goalStatus", () => {
  it("derives the lifecycle from its timestamps, archive first", () => {
    const at = new Date("2026-09-01T00:00:00Z");
    expect(goalStatus({ archivedAt: null, completedAt: null })).toBe("active");
    expect(goalStatus({ archivedAt: null, completedAt: at })).toBe("completed");
    expect(goalStatus({ archivedAt: at, completedAt: at })).toBe("archived");
  });
});
