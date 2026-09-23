import { describe, expect, it } from "vite-plus/test";

import { nextPaymentDue, utilizationTone } from "./credit";
import { groupTotal, netWorthByCurrency, primaryPosition } from "./net-worth";

const account = (overrides: Record<string, unknown>) => ({
  accountClass: "asset",
  accountType: "bank",
  archivedAt: null,
  balance: "0",
  currencyCode: "PHP",
  includeInNetWorth: true,
  ...overrides,
});

describe("net worth", () => {
  it("subtracts liabilities and never mixes currencies", () => {
    const positions = netWorthByCurrency([
      account({ balance: "10000" }),
      account({
        accountClass: "liability",
        accountType: "credit_card",
        balance: "2500",
      }),
      account({ balance: "300", currencyCode: "USD" }),
      account({ balance: "999", includeInNetWorth: false }),
      account({ archivedAt: new Date(), balance: "5000" }),
    ]);
    const { others, primary } = primaryPosition(positions, "PHP");
    expect(primary).toEqual({
      assets: 10_000,
      currencyCode: "PHP",
      liabilities: 2500,
      net: 7500,
    });
    expect(others).toEqual([
      { assets: 300, currencyCode: "USD", liabilities: 0, net: 300 },
    ]);
  });

  it("totals a group only when it shares one currency", () => {
    expect(
      groupTotal([account({ balance: "1" }), account({ balance: "2" })])
    ).toEqual({
      currencyCode: "PHP",
      total: 3,
    });
    expect(
      groupTotal([account({}), account({ currencyCode: "USD" })])
    ).toBeNull();
  });
});

describe("credit cards", () => {
  it("grades utilization at 30% and 70%", () => {
    expect(utilizationTone(12)).toBe("positive");
    expect(utilizationTone(45)).toBe("warning");
    expect(utilizationTone(88)).toBe("danger");
  });

  it("prefers an issued statement's due date", () => {
    const due = nextPaymentDue(
      { balance: "5000", paymentDueDay: 20 },
      [
        {
          dueDate: "2026-10-06",
          minimumAmountDue: "500",
          periodEnd: "2026-09-18",
          periodStart: "2026-08-19",
          statementBalance: "4200",
          statementDate: "2026-09-18",
        },
      ],
      "2026-09-24"
    );
    expect(due).toMatchObject({
      daysLeft: 12,
      dueDate: "2026-10-06",
      source: "statement",
    });
  });

  it("projects from the due day when nothing was issued, and only if money is owed", () => {
    expect(
      nextPaymentDue({ balance: "5000", paymentDueDay: 6 }, [], "2026-09-24")
    ).toMatchObject({
      dueDate: "2026-10-06",
      source: "schedule",
    });
    expect(
      nextPaymentDue({ balance: "0", paymentDueDay: 6 }, [], "2026-09-24")
    ).toBeNull();
  });
});
