import { describe, expect, it } from "vite-plus/test";

import { nextPaymentDue, utilizationTone } from "./credit";
import { groupTotal } from "./net-worth";

const account = (overrides: Record<string, unknown>) => ({
  balance: "0",
  currencyCode: "PHP",
  ...overrides,
});

describe("account groups", () => {
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
