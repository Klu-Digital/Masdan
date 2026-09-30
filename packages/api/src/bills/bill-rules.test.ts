import { describe, expect, it } from "vite-plus/test";

import {
  billStatus,
  billTotals,
  cardBillDates,
  cardPaidAmount,
  cardPaidByTransfers,
  isScheduleOccurrence,
  scheduleBillDates,
  transferWindow,
} from "./bill-rules";
import type { BillStatement, ScheduleTiming } from "./bill-rules";

const monthly: ScheduleTiming = {
  frequency: "monthly",
  interval: 1,
  nextOccurrenceDate: "2026-10-31",
  startDate: "2026-01-31",
  status: "active",
};

describe("billStatus", () => {
  it("keeps the due day itself expected and only later days overdue", () => {
    expect(billStatus("2026-09-28", "2026-09-28", false)).toBe("expected");
    expect(billStatus("2026-09-27", "2026-09-28", false)).toBe("overdue");
    expect(billStatus("2026-09-27", "2026-09-28", true)).toBe("paid");
  });
});

describe("scheduleBillDates", () => {
  it("lists posted days as history and projects the rest while active", () => {
    expect(
      scheduleBillDates(monthly, ["2026-09-30"], "2026-09-01", "2026-11-30")
    ).toEqual(["2026-09-30", "2026-10-31", "2026-11-30"]);
  });

  it("clamps to the month's last day and returns to the anchor day", () => {
    expect(
      scheduleBillDates(
        { ...monthly, nextOccurrenceDate: "2027-02-28" },
        [],
        "2027-02-01",
        "2027-03-31"
      )
    ).toEqual(["2027-02-28", "2027-03-31"]);
  });

  it("does not project a paused or stopped schedule", () => {
    for (const status of ["paused", "stopped"] as const) {
      expect(
        scheduleBillDates(
          { ...monthly, status },
          ["2026-09-30"],
          "2026-09-01",
          "2026-12-31"
        )
      ).toEqual(["2026-09-30"]);
    }
  });

  it("shows the saved next posting even when it differs from the anchor day", () => {
    const schedule: ScheduleTiming = {
      frequency: "monthly",
      interval: 1,
      nextOccurrenceDate: "2026-10-05",
      startDate: "2025-10-01",
      status: "active",
    };
    expect(scheduleBillDates(schedule, [], "2026-10-01", "2026-11-30")).toEqual(
      ["2026-10-05", "2026-11-01"]
    );
    expect(scheduleBillDates(schedule, [], "2026-09-01", "2026-09-30")).toEqual(
      []
    );
  });

  it("does not invent days skipped before the next occurrence", () => {
    expect(
      scheduleBillDates(
        {
          frequency: "weekly",
          interval: 1,
          nextOccurrenceDate: "2026-09-21",
          startDate: "2026-08-03",
          status: "active",
        },
        ["2026-09-07"],
        "2026-09-01",
        "2026-09-30"
      )
    ).toEqual(["2026-09-07", "2026-09-21", "2026-09-28"]);
  });

  it("ignores posted days outside the range and bounds a daily expansion", () => {
    const daily: ScheduleTiming = {
      frequency: "daily",
      interval: 1,
      nextOccurrenceDate: "2026-01-01",
      startDate: "2026-01-01",
      status: "active",
    };
    expect(
      scheduleBillDates(daily, ["2025-12-31"], "2026-01-01", "2026-01-03")
    ).toEqual(["2026-01-01", "2026-01-02", "2026-01-03"]);
    expect(
      scheduleBillDates(daily, [], "2026-01-01", "2030-12-31")
    ).toHaveLength(500);
  });

  it("returns nothing for an empty month", () => {
    expect(
      scheduleBillDates(
        { ...monthly, nextOccurrenceDate: "2027-01-31" },
        [],
        "2026-12-01",
        "2026-12-30"
      )
    ).toEqual([]);
  });
});

describe("isScheduleOccurrence", () => {
  it("accepts days on the rhythm and nothing before the start", () => {
    expect(isScheduleOccurrence(monthly, "2026-02-28")).toBe(true);
    expect(isScheduleOccurrence(monthly, "2026-02-27")).toBe(false);
    expect(isScheduleOccurrence(monthly, "2025-12-31")).toBe(false);
  });
});

const statement = (
  overrides: Partial<BillStatement> & Pick<BillStatement, "statementDate">
): BillStatement => ({
  dueDate: null,
  id: `statement-${overrides.statementDate}`,
  minimumAmountDue: null,
  periodEnd: overrides.statementDate,
  statementBalance: "5000",
  ...overrides,
});

describe("cardBillDates", () => {
  const card = { archived: false, balance: "8000", paymentDueDay: 10 };
  const august = statement({
    dueDate: "2026-09-10",
    minimumAmountDue: "500",
    statementDate: "2026-08-20",
  });
  const september = statement({
    dueDate: "2026-10-10",
    statementBalance: "3000",
    statementDate: "2026-09-20",
  });

  it("bills each recorded statement on its due date, bounded by the next cycle", () => {
    expect(
      cardBillDates(
        card,
        [september, august],
        "2026-09-01",
        "2026-09-30",
        "2026-09-05"
      )
    ).toEqual([
      {
        amount: "5000",
        dueDate: "2026-09-10",
        minimumAmountDue: "500",
        paymentsAfter: "2026-08-20",
        paymentsThrough: "2026-09-20",
        source: "statement",
        statementId: august.id,
      },
    ]);
  });

  it("projects the due day only where no statement covers it", () => {
    const bills = cardBillDates(
      card,
      [august],
      "2026-09-01",
      "2026-11-30",
      "2026-09-05"
    );
    expect(bills.map((bill) => [bill.dueDate, bill.source])).toEqual([
      ["2026-09-10", "statement"],
      ["2026-10-10", "projected"],
      ["2026-11-10", "projected"],
    ]);
    expect(bills[1]).toMatchObject({
      amount: null,
      paymentsAfter: "2026-09-10",
      paymentsThrough: "2026-10-10",
    });
  });

  it("does not project deep into the past, for a paid-off card or an archived one", () => {
    expect(
      cardBillDates(card, [], "2026-01-01", "2026-01-31", "2026-09-05")
    ).toEqual([]);
    expect(
      cardBillDates(
        { ...card, balance: "0" },
        [],
        "2026-09-01",
        "2026-09-30",
        "2026-09-05"
      )
    ).toEqual([]);
    expect(
      cardBillDates(
        { ...card, archived: true },
        [],
        "2026-09-01",
        "2026-09-30",
        "2026-09-05"
      )
    ).toEqual([]);
  });

  it("skips statements with nothing owed or no due date", () => {
    expect(
      cardBillDates(
        { ...card, paymentDueDay: null },
        [
          statement({
            dueDate: "2026-09-10",
            statementBalance: "0",
            statementDate: "2026-08-20",
          }),
          statement({ statementDate: "2026-08-21" }),
        ],
        "2026-09-01",
        "2026-09-30",
        "2026-09-05"
      )
    ).toEqual([]);
  });
});

describe("card payments", () => {
  const transfers = [
    { amount: "2000", transactionDate: "2026-08-20" },
    { amount: "3000", transactionDate: "2026-09-01" },
    { amount: "2500", transactionDate: "2026-09-09" },
    { amount: "999", transactionDate: "2026-09-21" },
  ];

  it("sums transfers after the period closed and through the next one", () => {
    const paid = cardPaidAmount(
      { paymentsAfter: "2026-08-20", paymentsThrough: "2026-09-20" },
      transfers
    );
    expect(paid).toBe("5500.000000");
    expect(cardPaidByTransfers({ amount: "5000" }, paid)).toBe(true);
    expect(cardPaidByTransfers({ amount: "6000" }, paid)).toBe(false);
  });

  it("counts any payment in the cycle for a projection", () => {
    expect(cardPaidByTransfers({ amount: null }, "0.000000")).toBe(false);
    expect(cardPaidByTransfers({ amount: null }, "1.000000")).toBe(true);
  });

  it("reads one window wide enough for every bill", () => {
    expect(
      transferWindow(
        [
          { paymentsAfter: "2026-08-20", paymentsThrough: "2026-09-20" },
          { paymentsAfter: "2026-09-10", paymentsThrough: "2026-10-10" },
        ],
        "2026-09-30"
      )
    ).toEqual({ from: "2026-08-21", to: "2026-10-10" });
    expect(
      transferWindow(
        [{ paymentsAfter: "2026-08-20", paymentsThrough: null }],
        "2026-09-30"
      )
    ).toEqual({ from: "2026-08-21", to: "9999-12-31" });
    expect(transferWindow([], "2026-09-30")).toBeNull();
  });
});

describe("billTotals", () => {
  it("totals each currency on its own and leaves unknown amounts out", () => {
    expect(
      billTotals([
        { amount: "100", currencyCode: "PHP", status: "paid" },
        { amount: "50.5", currencyCode: "PHP", status: "overdue" },
        { amount: "25", currencyCode: "PHP", status: "expected" },
        { amount: null, currencyCode: "PHP", status: "expected" },
        { amount: "10", currencyCode: "USD", status: "expected" },
      ])
    ).toEqual([
      {
        currencyCode: "PHP",
        due: "175.500000",
        expected: "25.000000",
        overdue: "50.500000",
        paid: "100.000000",
        unknownAmountCount: 1,
      },
      {
        currencyCode: "USD",
        due: "10.000000",
        expected: "10.000000",
        overdue: "0.000000",
        paid: "0.000000",
        unknownAmountCount: 0,
      },
    ]);
  });

  it("returns no totals for an empty month", () => {
    expect(billTotals([])).toEqual([]);
  });
});
