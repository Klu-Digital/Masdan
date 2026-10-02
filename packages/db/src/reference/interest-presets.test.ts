import { expect, it } from "vite-plus/test";

import { PRODUCT_PRESETS } from "./interest-presets";

it("offers Maya at 5.5% without changing the legacy 6% preset", () => {
  const current = PRODUCT_PRESETS.find(
    ({ key }) => key === "ph-maya-time-deposit-plus-5-5"
  );
  const legacy = PRODUCT_PRESETS.find(
    ({ key }) => key === "ph-maya-time-deposit-plus"
  );

  expect(current?.schedules).toHaveLength(3);
  expect(current?.schedules.map(({ term }) => term?.count).toSorted()).toEqual([
    12, 3, 6,
  ]);
  for (const schedule of current?.schedules ?? []) {
    expect(schedule.tiers).toEqual([{ annualRate: "5.50", minBalance: "0" }]);
    expect(schedule.effectiveFrom).toBe("2026-10-01");
    expect(schedule.creditFrequency).toBe("monthly");
    expect(schedule.interestCapBalance).toBe("1000000");
  }
  expect(
    legacy?.schedules.find(({ term }) => term?.count === 6)?.tiers
  ).toEqual([{ annualRate: "6.00", minBalance: "0" }]);
});
