import {
  category,
  member,
  organization,
  recurringSchedule,
  session,
} from "@masdan/db/schema/index";
import { getSessionFor, getTestDb, signUpTestUser } from "@masdan/testing";
import { call, ORPCError } from "@orpc/server";
import { and, eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { accountsRouter } from "../accounts/accounts.router";
import type { Context } from "../context";
import { addDays } from "../recurring/recurrence";
import { generateDueOccurrences } from "../recurring/recurring.generate";
import { recurringRouter } from "../recurring/recurring.router";
import { householdToday } from "../reports/periods";
import { transactionsRouter } from "../transactions/transactions.router";
import { transfersRouter } from "../transfers/transfers.router";
import { renderBillFeed } from "./bills.feed";
import { billsRouter } from "./bills.router";

const codeOf = async (promise: Promise<unknown>): Promise<string | null> => {
  try {
    await promise;
    return null;
  } catch (error) {
    return error instanceof ORPCError ? error.code : "UNKNOWN";
  }
};

interface CallOptions {
  context: Context;
}

const contextFor = async (headers: Headers): Promise<CallOptions> => ({
  context: {
    auth: null,
    db: getTestDb(),
    log: undefined,
    session: await getSessionFor(headers),
  } as unknown as Context,
});

/** Test households keep the default Asia/Manila timezone. */
const today = () => householdToday("Asia/Manila", new Date());

/** "Now" for the worker: noon on `date` in Manila. */
const manilaNoon = (date: string) => new Date(`${date}T04:00:00Z`);

const tokenOf = (path: string): string =>
  path.slice("/feeds/bills/".length, -".ics".length);

/** Posts `date` as the schedule would have, so history has a posting. */
const postOccurrence = async (scheduleId: string, date: string) => {
  await getTestDb()
    .update(recurringSchedule)
    .set({ nextOccurrenceDate: date })
    .where(eq(recurringSchedule.id, scheduleId));
  await generateDueOccurrences(getTestDb(), scheduleId, manilaNoon(date));
};

const household = async () => {
  const { headers, user } = await signUpTestUser();
  const current = await getSessionFor(headers);
  const organizationId = current?.session.activeOrganizationId;
  if (!organizationId) {
    throw new Error("Test user has no active household");
  }
  const context = await contextFor(headers);

  const categoryId = async (name: string) => {
    const [row] = await getTestDb()
      .select({ id: category.id })
      .from(category)
      .where(
        and(
          eq(category.organizationId, organizationId),
          eq(category.name, name)
        )
      );
    if (!row) {
      throw new Error(`Missing category ${name}`);
    }
    return row.id;
  };

  const bank = await call(
    accountsRouter.create,
    {
      accountClass: "asset",
      accountType: "bank",
      liquidity: "liquid",
      name: "BPI Savings",
      openingBalance: "100000",
      openingBalanceDate: "2026-01-01",
      ownerMemberIds: [],
    },
    context
  );

  const schedule = async (
    name: string,
    startDate: string,
    categoryName = "Housing"
  ) =>
    call(
      recurringRouter.create,
      {
        accountId: bank.id,
        amount: "18000",
        categoryId: await categoryId(categoryName),
        endDate: null,
        frequency: "monthly",
        interval: 1,
        name,
        notes: null,
        paidStatus: "paid",
        startDate,
        tagIds: [],
      },
      context
    );

  const card = () =>
    call(
      accountsRouter.create,
      {
        accountClass: "liability",
        accountType: "credit_card",
        creditLimit: "100000",
        name: "BPI Visa",
        openingBalance: "12000",
        openingBalanceDate: "2026-01-01",
        ownerMemberIds: [],
      },
      context
    );

  const month = (value: string) =>
    call(billsRouter.month, { month: value }, context);
  const billsIn = async (value: string) => {
    const result = await month(value);
    return result.bills;
  };
  const firstBill = async (value: string) => {
    const [bill] = await billsIn(value);
    return bill;
  };

  return {
    bank,
    billsIn,
    card,
    categoryId,
    context,
    firstBill,
    month,
    organizationId,
    postOccurrence,
    schedule,
    user,
  };
};

type Household = Awaited<ReturnType<typeof household>>;

const joinAs = async (home: Household, role: string) => {
  const { headers, user } = await signUpTestUser();
  await getTestDb()
    .insert(member)
    .values({ organizationId: home.organizationId, role, userId: user.id });
  await getTestDb()
    .update(session)
    .set({ activeOrganizationId: home.organizationId })
    .where(eq(session.userId, user.id));
  return { ...(await contextFor(headers)), userId: user.id };
};

const PAST_MONTH = "2026-02";
const PAST_DUE = "2026-02-15";

describe("bill calendar month", () => {
  it("lists recurring income, expenses and card due dates", async () => {
    const home = await household();
    const due = addDays(today(), 3);
    await home.schedule("Rent", due);
    await home.schedule("Payday", due, "Salary");
    const visa = await home.card();
    await call(
      accountsRouter.createStatement,
      {
        accountId: visa.id,
        dueDate: due,
        minimumAmountDue: "500",
        periodEnd: addDays(today(), -20),
        periodStart: addDays(today(), -50),
        statementBalance: "12000",
        statementDate: addDays(today(), -20),
      },
      home.context
    );

    const result = await home.month(due.slice(0, 7));

    expect(result.today).toBe(today());
    expect(
      result.bills.map((bill) => [
        bill.name,
        bill.kind,
        bill.dueDate,
        bill.status,
      ])
    ).toEqual([
      ["BPI Visa", "card", due, "expected"],
      ["Payday", "recurring", due, "expected"],
      ["Rent", "recurring", due, "expected"],
    ]);
    expect(result.bills[0]).toMatchObject({
      amount: "12000.000000",
      minimumAmountDue: "500.000000",
      source: "statement",
    });
    expect(result.totals).toEqual([
      {
        currencyCode: "PHP",
        due: "30000.000000",
        expected: "30000.000000",
        overdue: "0.000000",
        paid: "0.000000",
        unknownAmountCount: 0,
      },
    ]);
  });

  it("includes automatically posted income without treating it as money owed", async () => {
    const home = await household();
    const salary = await home.schedule("Payday", "2026-01-15", "Salary");
    await home.postOccurrence(salary.id, PAST_DUE);
    const result = await home.month(PAST_MONTH);
    expect(result.bills).toEqual([
      expect.objectContaining({
        name: "Payday",
        paidBy: "posting",
        payment: null,
        status: "paid",
        transactionType: "income",
      }),
    ]);
    expect(result.totals).toEqual([]);
  });

  it("returns an empty month with no totals", async () => {
    const home = await household();
    const result = await home.month("2030-01");
    expect(result.bills).toEqual([]);
    expect(result.totals).toEqual([]);
  });

  it("settles a recurring expense automatically when its transaction posts", async () => {
    const home = await household();
    const rent = await home.schedule("Rent", "2026-01-15");
    await home.postOccurrence(rent.id, PAST_DUE);

    const bill = await home.firstBill(PAST_MONTH);

    expect(bill).toMatchObject({
      dueDate: PAST_DUE,
      paidBy: "posting",
      payment: null,
      status: "paid",
      transactionType: "expense",
    });
    expect(bill?.postedTransactionId).toEqual(expect.any(String));
  });

  it("keeps a recurring posting settled after a legacy payment is unlinked", async () => {
    const home = await household();
    const rent = await home.schedule("Rent", "2026-01-15");
    await home.postOccurrence(rent.id, PAST_DUE);
    const occurrence = {
      dueDate: PAST_DUE,
      kind: "recurring" as const,
      sourceId: rent.id,
    };

    const candidates = await call(
      billsRouter.candidates,
      occurrence,
      home.context
    );
    expect(candidates[0]).toMatchObject({ isPosting: true });
    const posting = candidates[0]?.id ?? null;

    const payment = await call(
      billsRouter.confirm,
      { ...occurrence, transactionId: posting },
      home.context
    );
    expect(await home.firstBill(PAST_MONTH)).toMatchObject({
      paidBy: "posting",
      payment: { transaction: { id: posting } },
      status: "paid",
    });
    expect(
      await call(billsRouter.candidates, occurrence, home.context)
    ).toEqual([]);

    await call(billsRouter.unconfirm, { paymentId: payment.id }, home.context);
    expect(await home.firstBill(PAST_MONTH)).toMatchObject({
      paidBy: "posting",
      status: "paid",
    });
  });

  it("stops counting a linked payment once it is archived", async () => {
    const home = await household();
    const rent = await home.schedule("Rent", "2026-01-15");
    const expense = await call(
      transactionsRouter.create,
      {
        accountId: home.bank.id,
        amount: "18000",
        categoryId: await home.categoryId("Housing"),
        paidStatus: "paid",
        transactionDate: "2026-02-14",
      },
      home.context
    );
    await call(
      billsRouter.confirm,
      {
        dueDate: PAST_DUE,
        kind: "recurring",
        sourceId: rent.id,
        transactionId: expense.id,
      },
      home.context
    );
    await call(
      transactionsRouter.archive,
      { transactionId: expense.id },
      home.context
    );

    expect(await home.billsIn(PAST_MONTH)).toEqual([
      expect.objectContaining({ dueDate: PAST_DUE, status: "expected" }),
    ]);
  });

  it("takes a member's explicit confirmation, once", async () => {
    const home = await household();
    const rent = await home.schedule("Rent", "2026-01-15");
    await home.postOccurrence(rent.id, PAST_DUE);
    const confirm = () =>
      call(
        billsRouter.confirm,
        {
          dueDate: PAST_DUE,
          kind: "recurring",
          sourceId: rent.id,
          transactionId: null,
        },
        home.context
      );

    await confirm();

    expect(await home.firstBill(PAST_MONTH)).toMatchObject({
      paidBy: "posting",
      payment: { confirmedByName: home.user.name, transaction: null },
      status: "paid",
    });
    expect(await codeOf(confirm())).toBe("CONFLICT");
  });

  it("rejects a day the schedule never lands on", async () => {
    const home = await household();
    const rent = await home.schedule("Rent", "2026-01-15");
    expect(
      await codeOf(
        call(
          billsRouter.confirm,
          {
            dueDate: "2026-02-16",
            kind: "recurring",
            sourceId: rent.id,
            transactionId: null,
          },
          home.context
        )
      )
    ).toBe("NOT_FOUND");
  });

  it("marks a card statement paid once transfers after the period cover it", async () => {
    const home = await household();
    const visa = await home.card();
    const due = addDays(today(), 3);
    await call(
      accountsRouter.createStatement,
      {
        accountId: visa.id,
        dueDate: due,
        periodEnd: addDays(today(), -20),
        periodStart: addDays(today(), -50),
        statementBalance: "12000",
        statementDate: addDays(today(), -20),
      },
      home.context
    );
    const pay = (amount: string) =>
      call(
        transfersRouter.create,
        {
          destinationAccountId: visa.id,
          destinationAmount: amount,
          sourceAccountId: home.bank.id,
          sourceAmount: amount,
          transactionDate: today(),
        },
        home.context
      );
    const cardBill = async () => {
      const bills = await home.billsIn(due.slice(0, 7));
      return bills.find((bill) => bill.kind === "card" && bill.dueDate === due);
    };

    await pay("5000");
    expect(await cardBill()).toMatchObject({
      paidAmount: "5000.000000",
      paidBy: null,
      status: "expected",
    });

    await pay("7000");
    expect(await cardBill()).toMatchObject({
      paidAmount: "12000.000000",
      paidBy: "transfers",
      status: "paid",
    });
  });
});

describe("bill calendar isolation", () => {
  it("never shows or settles another household's bills", async () => {
    const home = await household();
    const other = await household();
    const rent = await home.schedule("Rent", "2026-01-15");
    await home.postOccurrence(rent.id, PAST_DUE);
    const theirs = await other.schedule("Their rent", "2026-01-15");
    const theirExpense = await call(
      transactionsRouter.create,
      {
        accountId: other.bank.id,
        amount: "18000",
        categoryId: await other.categoryId("Housing"),
        paidStatus: "paid",
        transactionDate: PAST_DUE,
      },
      other.context
    );
    const payment = await call(
      billsRouter.confirm,
      {
        dueDate: PAST_DUE,
        kind: "recurring",
        sourceId: rent.id,
        transactionId: null,
      },
      home.context
    );

    expect(await other.billsIn(PAST_MONTH)).toEqual([]);
    // Their schedule, from here: not found, not "forbidden".
    expect(
      await codeOf(
        call(
          billsRouter.confirm,
          {
            dueDate: PAST_DUE,
            kind: "recurring",
            sourceId: theirs.id,
            transactionId: null,
          },
          home.context
        )
      )
    ).toBe("NOT_FOUND");
    expect(
      await codeOf(
        call(
          billsRouter.candidates,
          { dueDate: PAST_DUE, kind: "recurring", sourceId: rent.id },
          other.context
        )
      )
    ).toBe("NOT_FOUND");
    // Their payment cannot settle our bill.
    await call(billsRouter.unconfirm, { paymentId: payment.id }, home.context);
    expect(
      await codeOf(
        call(
          billsRouter.confirm,
          {
            dueDate: PAST_DUE,
            kind: "recurring",
            sourceId: rent.id,
            transactionId: theirExpense.id,
          },
          home.context
        )
      )
    ).toBe("BAD_REQUEST");
    const again = await call(
      billsRouter.confirm,
      {
        dueDate: PAST_DUE,
        kind: "recurring",
        sourceId: rent.id,
        transactionId: null,
      },
      home.context
    );
    expect(
      await codeOf(
        call(billsRouter.unconfirm, { paymentId: again.id }, other.context)
      )
    ).toBe("NOT_FOUND");
  });

  it("lets a viewer read bills but not confirm them", async () => {
    const home = await household();
    const rent = await home.schedule("Rent", "2026-01-15");
    await home.postOccurrence(rent.id, PAST_DUE);
    const viewer = await joinAs(home, "viewer");

    const seen = await call(billsRouter.month, { month: PAST_MONTH }, viewer);
    expect(seen.bills).toHaveLength(1);
    expect(
      await codeOf(
        call(
          billsRouter.confirm,
          {
            dueDate: PAST_DUE,
            kind: "recurring",
            sourceId: rent.id,
            transactionId: null,
          },
          viewer
        )
      )
    ).toBe("FORBIDDEN");
  });
});

describe("bill calendar timezones", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("judges overdue by the household's day, not the server's", async () => {
    const home = await household();
    const visa = await home.card();
    await call(
      accountsRouter.createStatement,
      {
        accountId: visa.id,
        dueDate: PAST_DUE,
        periodEnd: "2026-01-31",
        periodStart: "2026-01-01",
        statementBalance: "12000",
        statementDate: "2026-02-01",
      },
      home.context
    );
    vi.useFakeTimers({
      now: new Date("2026-02-15T20:00:00Z"),
      toFake: ["Date"],
    });

    const manila = await home.month(PAST_MONTH);
    expect(manila.today).toBe("2026-02-16");
    expect(manila.bills[0]?.status).toBe("overdue");

    await getTestDb()
      .update(organization)
      .set({ timezone: "America/Los_Angeles" })
      .where(eq(organization.id, home.organizationId));
    const losAngeles = await home.month(PAST_MONTH);
    expect(losAngeles.today).toBe(PAST_DUE);
    expect(losAngeles.bills[0]?.status).toBe("expected");
  });
});

const feedFor = (path: string) =>
  renderBillFeed(getTestDb(), tokenOf(path), new Date());

describe("bill calendar feed", () => {
  it("serves names and due dates, never amounts", async () => {
    const home = await household();
    await home.schedule("Rent", addDays(today(), 3));

    const { path } = await call(
      billsRouter.feed.create,
      undefined,
      home.context
    );
    const text = await feedFor(path);

    expect(path).toMatch(/^\/feeds\/bills\/[\w-]{43}\.ics$/u);
    expect(text).toContain("SUMMARY:Rent (expense\\, scheduled)");
    expect(text).not.toContain("18000");
    expect(text).not.toContain("BPI Savings");
    expect(
      await call(billsRouter.feed.status, undefined, home.context)
    ).toMatchObject({ feed: { lastUsedAt: expect.any(Date) } });
  });

  it("keeps each household's feed to its own bills", async () => {
    const home = await household();
    const other = await household();
    await home.schedule("Rent", addDays(today(), 3));
    await other.schedule("Their rent", addDays(today(), 3));

    const mine = await call(billsRouter.feed.create, undefined, home.context);
    const theirs = await call(
      billsRouter.feed.create,
      undefined,
      other.context
    );

    const mineText = await feedFor(mine.path);
    const theirText = await feedFor(theirs.path);
    expect(mineText).toContain("SUMMARY:Rent (expense\\, scheduled)");
    expect(mineText).not.toContain("Their rent");
    expect(theirText).toContain("SUMMARY:Their rent (expense\\, scheduled)");
    expect(theirText).not.toContain("SUMMARY:Rent (");
  });

  it("stops serving a replaced or revoked link", async () => {
    const home = await household();
    const first = await call(billsRouter.feed.create, undefined, home.context);
    const second = await call(billsRouter.feed.create, undefined, home.context);

    expect(await feedFor(first.path)).toBeNull();
    expect(await feedFor(second.path)).toContain("BEGIN:VCALENDAR");

    expect(
      await call(billsRouter.feed.revoke, undefined, home.context)
    ).toEqual({ revoked: true });
    expect(await feedFor(second.path)).toBeNull();
    expect(
      await call(billsRouter.feed.status, undefined, home.context)
    ).toEqual({ feed: null });
  });

  it("stops serving a member's feed once they leave the household", async () => {
    const home = await household();
    const partner = await joinAs(home, "member");
    const { path } = await call(billsRouter.feed.create, undefined, partner);
    expect(await feedFor(path)).toContain("BEGIN:VCALENDAR");

    await getTestDb()
      .delete(member)
      .where(
        and(
          eq(member.userId, partner.userId),
          eq(member.organizationId, home.organizationId)
        )
      );

    expect(await feedFor(path)).toBeNull();
  });

  it("answers null for a malformed or unknown token", async () => {
    expect(await renderBillFeed(getTestDb(), "short", new Date())).toBeNull();
    expect(
      await renderBillFeed(getTestDb(), "a".repeat(43), new Date())
    ).toBeNull();
  });
});
