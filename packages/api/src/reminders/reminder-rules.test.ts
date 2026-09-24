import { describe, expect, it } from "vite-plus/test";

import { householdToday } from "../reports/periods";
import {
  dayInMonth,
  dayOfMonthOnOrAfter,
  dayOfMonthOnOrBefore,
  reminderCandidates,
  reminderResolution,
} from "./reminder-rules";
import type {
  ReminderCard,
  ReminderFacts,
  ReminderStatement,
} from "./reminder-rules";

const card = (values: Partial<ReminderCard> = {}): ReminderCard => ({
  archived: false,
  balance: "12000.000000",
  paymentDueDay: null,
  statementClosingDay: null,
  ...values,
});

const statement = (
  values: Partial<ReminderStatement> = {}
): ReminderStatement => ({
  dueDate: "2026-03-10",
  id: "statement-feb",
  periodEnd: "2026-02-15",
  statementBalance: "12000.000000",
  statementDate: "2026-02-15",
  ...values,
});

const facts = (values: Partial<ReminderFacts> = {}): ReminderFacts => ({
  card: { archived: false, balance: "12000.000000" },
  latest: null,
  paidAmount: "0",
  statement: null,
  today: "2026-03-05",
  ...values,
});

describe("day-of-month dates", () => {
  it("clamps a 31st to the month's last day", () => {
    expect(dayInMonth("2026-02-10", 31)).toBe("2026-02-28");
    expect(dayInMonth("2028-02-10", 31)).toBe("2028-02-29");
    expect(dayInMonth("2026-04-10", 31)).toBe("2026-04-30");
  });

  it("crosses year boundaries in both directions", () => {
    expect(dayOfMonthOnOrAfter(5, "2026-12-20")).toBe("2027-01-05");
    expect(dayOfMonthOnOrBefore(25, "2026-01-10")).toBe("2025-12-25");
    expect(dayInMonth("2026-01-31", 31, -1)).toBe("2025-12-31");
  });

  it("counts today as both on-or-after and on-or-before", () => {
    expect(dayOfMonthOnOrAfter(15, "2026-03-15")).toBe("2026-03-15");
    expect(dayOfMonthOnOrBefore(15, "2026-03-15")).toBe("2026-03-15");
  });
});

describe("reminderCandidates", () => {
  it("reminds about a closing date within the week before it", () => {
    const closing = card({ statementClosingDay: 12 });
    expect(reminderCandidates(closing, null, "2026-03-04")).toEqual([]);
    expect(reminderCandidates(closing, null, "2026-03-05")).toEqual([
      {
        eventDate: "2026-03-12",
        kind: "statement",
        paymentsAfter: null,
        statementId: null,
      },
    ]);
  });

  it("keeps asking for a closed statement for ten days", () => {
    const closing = card({ statementClosingDay: 12 });
    expect(
      reminderCandidates(closing, null, "2026-03-22").map((c) => c.eventDate)
    ).toEqual(["2026-03-12"]);
    expect(reminderCandidates(closing, null, "2026-03-23")).toEqual([]);
  });

  it("uses a short month's last day for a 31st closing day", () => {
    const closing = card({ statementClosingDay: 31 });
    expect(
      reminderCandidates(closing, null, "2026-02-21").map((c) => c.eventDate)
    ).toEqual(["2026-02-28"]);
    expect(
      reminderCandidates(closing, null, "2026-03-05").map((c) => c.eventDate)
    ).toEqual(["2026-02-28"]);
  });

  it("derives the payment from the latest statement's due date", () => {
    const latest = statement();
    expect(reminderCandidates(card(), latest, "2026-03-03")).toEqual([
      {
        eventDate: "2026-03-10",
        kind: "payment",
        paymentsAfter: "2026-02-15",
        statementId: "statement-feb",
      },
    ]);
    expect(reminderCandidates(card(), latest, "2026-03-02")).toEqual([]);
  });

  it("skips a statement with nothing to pay or no due date", () => {
    expect(
      reminderCandidates(
        card(),
        statement({ statementBalance: "0" }),
        "2026-03-05"
      )
    ).toEqual([]);
    expect(
      reminderCandidates(card(), statement({ dueDate: null }), "2026-03-05")
    ).toEqual([]);
  });

  it("stops generating a payment a month after it fell due", () => {
    expect(reminderCandidates(card(), statement(), "2026-04-09")).toHaveLength(
      1
    );
    expect(reminderCandidates(card(), statement(), "2026-04-10")).toEqual([]);
  });

  it("projects a payment from the card's due day when no statement covers it", () => {
    expect(
      reminderCandidates(card({ paymentDueDay: 10 }), null, "2026-03-05")
    ).toEqual([
      {
        eventDate: "2026-03-10",
        kind: "payment",
        paymentsAfter: "2026-02-10",
        statementId: null,
      },
    ]);
  });

  it("does not project a payment when nothing is owed", () => {
    expect(
      reminderCandidates(
        card({ balance: "0.000000", paymentDueDay: 10 }),
        null,
        "2026-03-05"
      )
    ).toEqual([]);
  });

  it("lets a recorded statement's due date replace the projection", () => {
    const candidates = reminderCandidates(
      card({ paymentDueDay: 10 }),
      statement({ dueDate: "2026-03-12" }),
      "2026-03-05"
    );
    expect(candidates).toEqual([
      expect.objectContaining({
        eventDate: "2026-03-12",
        statementId: "statement-feb",
      }),
    ]);
  });

  it("generates nothing for an archived card", () => {
    expect(
      reminderCandidates(
        card({ archived: true, paymentDueDay: 10, statementClosingDay: 8 }),
        statement(),
        "2026-03-05"
      )
    ).toEqual([]);
  });

  it("decides 'upcoming' on the household's own calendar day", () => {
    // 17:30 UTC on Mar 14 is already Mar 15 in Manila but still Mar 14 in New York.
    const now = new Date("2026-03-14T17:30:00Z");
    const closing = card({ statementClosingDay: 22 });
    expect(
      reminderCandidates(closing, null, householdToday("Asia/Manila", now))
    ).toHaveLength(1);
    expect(
      reminderCandidates(closing, null, householdToday("America/New_York", now))
    ).toEqual([]);
  });
});

describe("reminderResolution", () => {
  const closingReminder = {
    eventDate: "2026-03-12",
    kind: "statement" as const,
    statementId: null,
  };
  const statementPayment = {
    eventDate: "2026-03-10",
    kind: "payment" as const,
    statementId: "statement-feb",
  };
  const projectedPayment = {
    eventDate: "2026-03-10",
    kind: "payment" as const,
    statementId: null,
  };

  it("resolves a closing reminder once that cycle's statement is recorded", () => {
    const march = statement({
      id: "statement-mar",
      statementDate: "2026-03-11",
    });
    expect(reminderResolution(closingReminder, facts({ latest: march }))).toBe(
      "recorded"
    );
    // Last month's statement does not count for this closing.
    expect(
      reminderResolution(closingReminder, facts({ latest: statement() }))
    ).toBeNull();
  });

  it("expires an unrecorded closing reminder after ten days", () => {
    expect(
      reminderResolution(closingReminder, facts({ today: "2026-03-22" }))
    ).toBeNull();
    expect(
      reminderResolution(closingReminder, facts({ today: "2026-03-23" }))
    ).toBe("expired");
  });

  it("keeps a partly paid statement actionable and resolves it once paid in full", () => {
    const feb = statement();
    const base = { latest: feb, statement: feb };
    expect(
      reminderResolution(
        statementPayment,
        facts({ ...base, paidAmount: "11999.990000" })
      )
    ).toBeNull();
    expect(
      reminderResolution(
        statementPayment,
        facts({ ...base, paidAmount: "12000.000000" })
      )
    ).toBe("paid");
  });

  it("treats a cleared card balance as paid", () => {
    const feb = statement();
    expect(
      reminderResolution(
        statementPayment,
        facts({
          card: { archived: false, balance: "0.000000" },
          latest: feb,
          statement: feb,
        })
      )
    ).toBe("paid");
  });

  it("supersedes a statement payment when a newer statement arrives", () => {
    expect(
      reminderResolution(
        statementPayment,
        facts({
          latest: statement({
            id: "statement-mar",
            statementDate: "2026-03-15",
          }),
          statement: statement(),
        })
      )
    ).toBe("superseded");
  });

  it("stops an unpaid payment reminder thirty days after it fell due", () => {
    const feb = statement();
    const base = { latest: feb, statement: feb };
    expect(
      reminderResolution(
        statementPayment,
        facts({ ...base, today: "2026-04-09" })
      )
    ).toBeNull();
    expect(
      reminderResolution(
        statementPayment,
        facts({ ...base, today: "2026-04-10" })
      )
    ).toBe("expired");
  });

  it("settles a projected payment with any payment this cycle", () => {
    expect(reminderResolution(projectedPayment, facts())).toBeNull();
    expect(
      reminderResolution(projectedPayment, facts({ paidAmount: "500.000000" }))
    ).toBe("paid");
  });

  it("hands a projected payment over to a recorded statement for the same cycle", () => {
    expect(
      reminderResolution(
        projectedPayment,
        facts({ latest: statement({ dueDate: "2026-03-12" }) })
      )
    ).toBe("superseded");
  });

  it("resolves everything on an archived card", () => {
    const archived = facts({ card: { archived: true, balance: "100" } });
    expect(reminderResolution(closingReminder, archived)).toBe(
      "account_archived"
    );
    expect(reminderResolution(projectedPayment, archived)).toBe(
      "account_archived"
    );
  });
});
