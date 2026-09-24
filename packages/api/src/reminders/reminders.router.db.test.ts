import {
  creditCardReminder,
  member,
  organization,
  session,
} from "@masdan/db/schema/index";
import { getSessionFor, getTestDb, signUpTestUser } from "@masdan/testing";
import { call, ORPCError } from "@orpc/server";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vite-plus/test";

import { accountsRouter } from "../accounts/accounts.router";
import type { Context } from "../context";
import { addDays } from "../recurring/recurrence";
import { householdToday } from "../reports/periods";
import { transfersRouter } from "../transfers/transfers.router";
import { refreshHouseholdReminders } from "./reminders.generate";
import { remindersRouter } from "./reminders.router";

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

const DAY_MS = 86_400_000;

/** Test households keep the default Asia/Manila timezone. */
const today = () => householdToday("Asia/Manila", new Date());

const household = async () => {
  const { headers } = await signUpTestUser();
  const current = await getSessionFor(headers);
  const organizationId = current?.session.activeOrganizationId;
  if (!organizationId) {
    throw new Error("Test user has no active household");
  }
  const context = await contextFor(headers);

  const card = (
    values: { paymentDueDay?: number; statementClosingDay?: number } = {}
  ) =>
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
        ...values,
      },
      context
    );
  const bank = () =>
    call(
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
  /** A statement that closed 20 days ago and falls due in `dueIn` days. */
  const statement = (accountId: string, dueIn: number) =>
    call(
      accountsRouter.createStatement,
      {
        accountId,
        dueDate: addDays(today(), dueIn),
        minimumAmountDue: "500",
        periodEnd: addDays(today(), -20),
        periodStart: addDays(today(), -50),
        statementBalance: "12000",
        statementDate: addDays(today(), -20),
      },
      context
    );
  const pay = (fromId: string, cardId: string, amount: string) =>
    call(
      transfersRouter.create,
      {
        destinationAccountId: cardId,
        destinationAmount: amount,
        sourceAccountId: fromId,
        sourceAmount: amount,
        transactionDate: today(),
      },
      context
    );
  const refresh = (now = new Date()) =>
    refreshHouseholdReminders(getTestDb(), organizationId, now);
  const list = () => call(remindersRouter.list, undefined, context);
  const items = async () => {
    const listed = await list();
    return listed.items;
  };
  const joinAs = async (role: string) => {
    const joined = await signUpTestUser();
    await getTestDb()
      .insert(member)
      .values({ organizationId, role, userId: joined.user.id });
    await getTestDb()
      .update(session)
      .set({ activeOrganizationId: organizationId })
      .where(eq(session.userId, joined.user.id));
    return contextFor(joined.headers);
  };
  const rows = () =>
    getTestDb()
      .select()
      .from(creditCardReminder)
      .where(eq(creditCardReminder.organizationId, organizationId));

  return {
    bank,
    card,
    context,
    items,
    joinAs,
    list,
    organizationId,
    pay,
    refresh,
    rows,
    statement,
  };
};

describe("credit card reminders", () => {
  it("surfaces a recorded statement's due date with its amounts", async () => {
    const home = await household();
    const visa = await home.card();
    await home.statement(visa.id, 3);

    expect(await home.refresh()).toEqual({ created: 1, resolved: 0 });
    const { items, today: listedToday } = await home.list();

    expect(listedToday).toBe(today());
    expect(items).toEqual([
      expect.objectContaining({
        account: expect.objectContaining({ id: visa.id, name: "BPI Visa" }),
        daysLeft: 3,
        eventDate: addDays(today(), 3),
        kind: "payment",
        minimumAmountDue: "500.000000",
        minimumPaid: false,
        paidAmount: "0",
        source: "statement",
        statementBalance: "12000.000000",
      }),
    ]);
  });

  it("does not generate a statement's due date more than a week out", async () => {
    const home = await household();
    const visa = await home.card();
    await home.statement(visa.id, 8);

    expect(await home.refresh()).toEqual({ created: 0, resolved: 0 });
    expect(await home.items()).toEqual([]);
  });

  it("reminds about the card's closing date from its closing day", async () => {
    const home = await household();
    const closing = addDays(today(), 2);
    await home.card({ statementClosingDay: Number(closing.slice(8)) });

    await home.refresh();
    const { items } = await home.list();
    expect(items).toEqual([
      expect.objectContaining({
        daysLeft: 2,
        eventDate: closing,
        kind: "statement",
        paidAmount: null,
        source: "card",
      }),
    ]);
  });

  it("projects a payment from the due day when no statement is recorded", async () => {
    const home = await household();
    const due = addDays(today(), 4);
    await home.card({ paymentDueDay: Number(due.slice(8)) });

    await home.refresh();
    expect(await home.items()).toEqual([
      expect.objectContaining({
        eventDate: due,
        kind: "payment",
        source: "card",
        statementBalance: null,
      }),
    ]);
  });

  it("generates each reminder once however often the worker runs", async () => {
    const home = await household();
    const visa = await home.card();
    await home.statement(visa.id, 3);

    await home.refresh();
    expect(await home.refresh()).toEqual({ created: 0, resolved: 0 });
    await Promise.all([home.refresh(), home.refresh()]);

    expect(await home.rows()).toHaveLength(1);
  });

  it("keeps a partly paid statement, then drops it once paid in full", async () => {
    const home = await household();
    const visa = await home.card();
    const savings = await home.bank();
    await home.statement(visa.id, 3);
    await home.refresh();

    await home.pay(savings.id, visa.id, "600");
    expect(await home.items()).toEqual([
      expect.objectContaining({
        minimumPaid: true,
        paidAmount: "600.000000",
      }),
    ]);

    await home.pay(savings.id, visa.id, "11400");
    // Hidden at once, before any worker run.
    expect(await home.items()).toEqual([]);

    expect(await home.refresh()).toEqual({ created: 0, resolved: 1 });
    const [row] = await home.rows();
    expect(row).toMatchObject({ resolution: "paid", status: "resolved" });
    // The resolved row blocks the same due date from coming back.
    expect(await home.refresh()).toEqual({ created: 0, resolved: 0 });
  });

  it("ignores payments made before the statement period closed", async () => {
    const home = await household();
    const visa = await home.card();
    const savings = await home.bank();
    await call(
      transfersRouter.create,
      {
        destinationAccountId: visa.id,
        destinationAmount: "5000",
        sourceAccountId: savings.id,
        sourceAmount: "5000",
        transactionDate: addDays(today(), -25),
      },
      home.context
    );
    await home.statement(visa.id, 3);
    await home.refresh();

    expect(await home.items()).toEqual([
      expect.objectContaining({ paidAmount: "0" }),
    ]);
  });

  it("stops reminding about an unpaid due date after thirty days", async () => {
    const home = await household();
    const visa = await home.card();
    await home.statement(visa.id, 3);
    await home.refresh();

    await home.refresh(new Date(Date.now() + 34 * DAY_MS));
    const [row] = await home.rows();
    expect(row).toMatchObject({ resolution: "expired", status: "resolved" });
    expect(await home.items()).toEqual([]);
  });

  it("resolves a closing reminder once the statement is recorded", async () => {
    const home = await household();
    const closing = addDays(today(), 1);
    const visa = await home.card({
      statementClosingDay: Number(closing.slice(8)),
    });
    await home.refresh();
    expect(await home.items()).toHaveLength(1);

    await call(
      accountsRouter.createStatement,
      {
        accountId: visa.id,
        periodEnd: today(),
        periodStart: addDays(today(), -30),
        statementBalance: "12000",
        statementDate: today(),
      },
      home.context
    );
    expect(await home.items()).toEqual([]);
    await home.refresh();
    expect(await home.rows()).toEqual([
      expect.objectContaining({ resolution: "recorded", status: "resolved" }),
    ]);
  });

  it("drops reminders for an archived card", async () => {
    const home = await household();
    const visa = await home.card();
    await home.statement(visa.id, 3);
    await home.refresh();

    await call(accountsRouter.archive, { accountId: visa.id }, home.context);
    expect(await home.items()).toEqual([]);
    await home.refresh();
    expect(await home.rows()).toEqual([
      expect.objectContaining({ resolution: "account_archived" }),
    ]);
  });

  it("dismisses for the whole household, never regenerates, and can be undone", async () => {
    const home = await household();
    const visa = await home.card();
    await home.statement(visa.id, 3);
    await home.refresh();
    const [reminder] = await home.items();
    const partner = await home.joinAs("member");

    await expect(
      call(remindersRouter.dismiss, { reminderId: reminder?.id ?? "" }, partner)
    ).resolves.toEqual({ id: reminder?.id, status: "dismissed" });
    expect(await home.items()).toEqual([]);
    await home.refresh();
    expect(await home.rows()).toEqual([
      expect.objectContaining({ status: "dismissed" }),
    ]);
    // Dismissing again is a no-op, not an error.
    await expect(
      call(
        remindersRouter.dismiss,
        { reminderId: reminder?.id ?? "" },
        home.context
      )
    ).resolves.toMatchObject({ status: "dismissed" });

    await call(
      remindersRouter.restore,
      { reminderId: reminder?.id ?? "" },
      home.context
    );
    expect(await home.items()).toHaveLength(1);
  });

  it("lets a viewer read reminders but not dismiss them", async () => {
    const home = await household();
    const visa = await home.card();
    await home.statement(visa.id, 3);
    await home.refresh();
    const viewer = await home.joinAs("viewer");

    const { items } = await call(remindersRouter.list, undefined, viewer);
    expect(items).toHaveLength(1);
    expect(
      await codeOf(
        call(
          remindersRouter.dismiss,
          { reminderId: items[0]?.id ?? "" },
          viewer
        )
      )
    ).toBe("FORBIDDEN");
  });

  it("never shows or touches another household's reminders", async () => {
    const home = await household();
    const visa = await home.card();
    await home.statement(visa.id, 3);
    await home.refresh();
    const [reminder] = await home.items();

    const other = await household();
    await other.refresh();
    expect(await other.items()).toEqual([]);
    expect(await other.rows()).toEqual([]);
    for (const procedure of [
      remindersRouter.dismiss,
      remindersRouter.restore,
    ]) {
      expect(
        await codeOf(
          call(procedure, { reminderId: reminder?.id ?? "" }, other.context)
        )
      ).toBe("NOT_FOUND");
    }
    expect(await home.rows()).toEqual([
      expect.objectContaining({ status: "active" }),
    ]);
  });

  it("decides what is upcoming on the household's own calendar day", async () => {
    // Noon UTC on Mar 14: already Mar 15 in Kiritimati, still Mar 14 in Pago Pago.
    const now = new Date("2026-03-14T12:00:00Z");
    const ahead = await household();
    const behind = await household();
    for (const [home, timezone] of [
      [ahead, "Pacific/Kiritimati"],
      [behind, "Pacific/Pago_Pago"],
    ] as const) {
      await getTestDb()
        .update(organization)
        .set({ timezone })
        .where(eq(organization.id, home.organizationId));
      await home.card({ statementClosingDay: 22 });
      await home.refresh(now);
    }

    expect(await ahead.rows()).toEqual([
      expect.objectContaining({ eventDate: "2026-03-22", kind: "statement" }),
    ]);
    expect(await behind.rows()).toEqual([]);
  });
});
