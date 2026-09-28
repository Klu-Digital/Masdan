import { describe, expect, it } from "vite-plus/test";

import { reminderCopy, strongestTone } from "./presentation";
import type { Reminder } from "./queries";

const TODAY = "2026-03-05";

const reminder = (values: Partial<Reminder> = {}): Reminder => ({
  account: {
    cardLastFour: "4242",
    cardNetwork: "Visa",
    cardProductKey: null,
    color: null,
    currencyCode: "PHP",
    icon: null,
    id: "00000000-0000-4000-8000-000000000001",
    institution: "BPI",
    name: "BPI Visa",
  },
  balance: "12000.000000",
  daysLeft: 5,
  eventDate: "2026-03-10",
  id: "00000000-0000-4000-8000-000000000011",
  kind: "payment",
  minimumAmountDue: "500.000000",
  minimumPaid: false,
  paidAmount: "0",
  source: "statement",
  statementBalance: "12000.000000",
  ...values,
});

describe("reminderCopy", () => {
  it("states an upcoming statement payment calmly", () => {
    const copy = reminderCopy(reminder(), TODAY);
    expect(copy).toMatchObject({
      badge: null,
      title: "Payment due",
      tone: "default",
    });
    expect(copy.detail).toContain("statement balance");
    expect(copy.detail).toContain("in 5 days");
  });

  it("warns as the due date closes in", () => {
    expect(
      reminderCopy(reminder({ daysLeft: 2, eventDate: "2026-03-07" }), TODAY)
        .tone
    ).toBe("warning");
    expect(
      reminderCopy(reminder({ daysLeft: 0, eventDate: TODAY }), TODAY)
    ).toMatchObject({ title: "Payment due today", tone: "warning" });
  });

  it("flags an overdue payment", () => {
    expect(
      reminderCopy(reminder({ daysLeft: -3, eventDate: "2026-03-02" }), TODAY)
    ).toMatchObject({
      badge: "Overdue",
      title: "Payment overdue",
      tone: "danger",
    });
  });

  it("shows what is left once part of the statement is paid", () => {
    const copy = reminderCopy(
      reminder({ minimumPaid: true, paidAmount: "600.000000" }),
      TODAY
    );
    expect(copy.badge).toBe("Minimum paid");
    expect(copy.detail).toMatch(/11,400.*left of.*12,000/u);
  });

  it("swaps only the figures when privacy mode masks them", () => {
    const copy = reminderCopy(
      reminder({ minimumPaid: true, paidAmount: "600.000000" }),
      TODAY,
      () => "****"
    );
    expect(copy.detail).toBe("**** left of **** · due Mar 10 · in 5 days");
  });

  it("says a projected payment is an estimate from the due day", () => {
    const copy = reminderCopy(
      reminder({
        minimumAmountDue: null,
        paidAmount: "0",
        source: "card",
        statementBalance: null,
      }),
      TODAY
    );
    expect(copy.detail).toContain("About");
    expect(copy.detail).toContain("due day");
  });

  it("asks for a closed statement to be recorded", () => {
    const base = { kind: "statement" as const, paidAmount: null };
    expect(
      reminderCopy(reminder({ ...base, daysLeft: 3 }), TODAY)
    ).toMatchObject({
      badge: null,
      title: "Statement closing",
      tone: "default",
    });
    expect(
      reminderCopy(
        reminder({ ...base, daysLeft: -2, eventDate: "2026-03-03" }),
        TODAY
      )
    ).toMatchObject({
      badge: "Record statement",
      title: "Statement closed",
      tone: "warning",
    });
  });
});

describe("strongestTone", () => {
  it("picks the most urgent reminder's tone, or none", () => {
    expect(strongestTone([], TODAY)).toBeNull();
    expect(strongestTone([reminder()], TODAY)).toBe("default");
    expect(
      strongestTone(
        [reminder(), reminder({ daysLeft: -1, eventDate: "2026-03-04" })],
        TODAY
      )
    ).toBe("danger");
  });
});
