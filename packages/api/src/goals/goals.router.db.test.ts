import {
  category,
  member,
  organization,
  savingsGoal,
  session,
} from "@masdan/db/schema/index";
import { getSessionFor, getTestDb, signUpTestUser } from "@masdan/testing";
import { call, ORPCError } from "@orpc/server";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vite-plus/test";

import { accountsRouter } from "../accounts/accounts.router";
import { getAccountBalance } from "../accounts/balances";
import type { Context } from "../context";
import { transactionsRouter } from "../transactions/transactions.router";
import { transfersRouter } from "../transfers/transfers.router";
import { goalsRouter } from "./goals.router";

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

const household = async () => {
  const { headers } = await signUpTestUser();
  const current = await getSessionFor(headers);
  const organizationId = current?.session.activeOrganizationId;
  if (!organizationId) {
    throw new Error("Test user has no active household");
  }
  const context = await contextFor(headers);
  const categoryIdFor = async (name: string) => {
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
  const categories = {
    food: await categoryIdFor("Food & Dining"),
    salary: await categoryIdFor("Salary"),
  };
  const account = (
    name: string,
    openingBalance: string,
    extra: { accountClass?: "asset" | "liability"; currencyCode?: string } = {}
  ) =>
    call(
      accountsRouter.create,
      extra.accountClass === "liability"
        ? {
            accountClass: "liability",
            accountType: "credit_card",
            name,
            openingBalance,
            openingBalanceDate: "2026-01-01",
            ownerMemberIds: [],
          }
        : {
            accountClass: "asset",
            accountType: "bank",
            currencyCode: extra.currencyCode,
            liquidity: "liquid",
            name,
            openingBalance,
            openingBalanceDate: "2026-01-01",
            ownerMemberIds: [],
          },
      context
    );
  const record = (
    accountId: string,
    categoryId: string,
    amount: string,
    transactionDate: string
  ) =>
    call(
      transactionsRouter.create,
      {
        accountId,
        amount,
        categoryId,
        paidStatus: "paid",
        tagIds: [],
        transactionDate,
      },
      context
    );
  const goal = (
    accountId: string,
    values: Partial<{
      name: string;
      targetAmount: string;
      targetDate: string | null;
    }> = {}
  ) =>
    call(
      goalsRouter.create,
      {
        accountId,
        name: values.name ?? "Emergency fund",
        targetAmount: values.targetAmount ?? "100000",
        targetDate: values.targetDate === undefined ? null : values.targetDate,
      },
      context
    );
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
  return {
    account,
    categories,
    context,
    goal,
    joinAs,
    organizationId,
    record,
  };
};

describe("savings goals", () => {
  it("creates and edits a goal in the tracking account's currency", async () => {
    const home = await household();
    const savings = await home.account("BPI Savings", "12000");
    const created = await home.goal(savings.id, {
      name: "  Emergency fund ",
      targetAmount: "100000.50",
      targetDate: "2026-12-31",
    });
    expect(created).toMatchObject({
      accountId: savings.id,
      accountName: "BPI Savings",
      completedAt: null,
      currencyCode: "PHP",
      measuredOn: null,
      name: "Emergency fund",
      percent: 11,
      reached: false,
      remaining: "88000.500000",
      saved: "12000.000000",
      status: "active",
      targetAmount: "100000.500000",
      targetDate: "2026-12-31",
    });

    const dollars = await home.account("Dollars", "300", {
      currencyCode: "USD",
    });
    const edited = await call(
      goalsRouter.update,
      {
        accountId: dollars.id,
        goalId: created.id,
        name: "Japan trip",
        targetAmount: "1500",
        targetDate: null,
      },
      home.context
    );
    expect(edited).toMatchObject({
      accountName: "Dollars",
      currencyCode: "USD",
      name: "Japan trip",
      percent: 20,
      remaining: "1200.000000",
      targetDate: null,
    });
    expect(
      await call(goalsRouter.get, { goalId: created.id }, home.context)
    ).toMatchObject({ name: "Japan trip" });
  });

  it("measures progress with the account's canonical ledger balance", async () => {
    const home = await household();
    const savings = await home.account("Savings", "10000");
    const checking = await home.account("Checking", "50000");
    await home.record(savings.id, home.categories.salary, "5000", "2026-02-15");
    await home.record(
      savings.id,
      home.categories.food,
      "1250.25",
      "2026-02-20"
    );
    const archived = await home.record(
      savings.id,
      home.categories.salary,
      "999999",
      "2026-02-21"
    );
    await call(
      transactionsRouter.archive,
      { transactionId: archived.id },
      home.context
    );
    await call(
      transfersRouter.create,
      {
        destinationAccountId: savings.id,
        destinationAmount: "20000",
        sourceAccountId: checking.id,
        sourceAmount: "20000",
        transactionDate: "2026-03-01",
      },
      home.context
    );

    const goal = await home.goal(savings.id, { targetAmount: "50000" });
    const balance = await getAccountBalance(getTestDb(), savings.id);
    expect(goal.saved).toBe("33749.750000");
    expect(Number(goal.saved)).toBe(Number(balance));
    expect(goal).toMatchObject({
      percent: 67,
      reached: false,
      remaining: "16250.250000",
    });
  });

  it("bounds progress at zero and at the target", async () => {
    const home = await household();
    const exact = await home.account("Exact", "5000");
    const almost = await home.account("Almost", "4999.999999");
    const beyond = await home.account("Beyond", "7500");
    const overdrawn = await home.account("Overdrawn", "0");
    await home.record(
      overdrawn.id,
      home.categories.food,
      "300.5",
      "2026-02-01"
    );

    expect(await home.goal(exact.id, { targetAmount: "5000" })).toMatchObject({
      percent: 100,
      reached: true,
      remaining: "0.000000",
    });
    expect(await home.goal(almost.id, { targetAmount: "5000" })).toMatchObject({
      percent: 99,
      reached: false,
      remaining: "0.000001",
    });
    expect(await home.goal(beyond.id, { targetAmount: "5000" })).toMatchObject({
      percent: 100,
      reached: true,
      remaining: "0.000000",
      saved: "7500.000000",
    });
    expect(
      await home.goal(overdrawn.id, { targetAmount: "5000" })
    ).toMatchObject({
      percent: 0,
      reached: false,
      remaining: "5300.500000",
      saved: "-300.500000",
    });
  });

  it("completes a goal and freezes its progress at the household-local day", async () => {
    const home = await household();
    const savings = await home.account("Savings", "40000");
    const goal = await home.goal(savings.id, { targetAmount: "50000" });
    await home.record(
      savings.id,
      home.categories.salary,
      "10000",
      "2026-04-01"
    );
    await home.record(savings.id, home.categories.food, "30000", "2026-04-02");

    const completed = await call(
      goalsRouter.complete,
      { goalId: goal.id },
      home.context
    );
    expect(completed.status).toBe("completed");
    expect(completed.completedAt).toBeInstanceOf(Date);

    // 2026-03-31T17:00Z is already April 1 in Manila (UTC+8).
    await getTestDb()
      .update(savingsGoal)
      .set({ completedAt: new Date("2026-03-31T17:00:00Z") })
      .where(eq(savingsGoal.id, goal.id));
    const frozen = await call(
      goalsRouter.get,
      { goalId: goal.id },
      home.context
    );
    expect(frozen).toMatchObject({
      measuredOn: "2026-04-01",
      percent: 100,
      reached: true,
      saved: "50000.000000",
      status: "completed",
    });

    await getTestDb()
      .update(organization)
      .set({ timezone: "America/Los_Angeles" })
      .where(eq(organization.id, home.organizationId));
    const westward = await call(
      goalsRouter.get,
      { goalId: goal.id },
      home.context
    );
    expect(westward).toMatchObject({
      measuredOn: "2026-03-31",
      saved: "40000.000000",
    });

    expect(
      await codeOf(
        call(
          goalsRouter.update,
          {
            accountId: savings.id,
            goalId: goal.id,
            name: "Edited",
            targetAmount: "1",
            targetDate: null,
          },
          home.context
        )
      )
    ).toBe("BAD_REQUEST");
    expect(
      await codeOf(
        call(goalsRouter.complete, { goalId: goal.id }, home.context)
      )
    ).toBe("BAD_REQUEST");

    const reopened = await call(
      goalsRouter.reopen,
      { goalId: goal.id },
      home.context
    );
    expect(reopened).toMatchObject({
      completedAt: null,
      measuredOn: null,
      saved: "20000.000000",
      status: "active",
    });
  });

  it("archives goals and keeps completed and archived ones in the history", async () => {
    const home = await household();
    const savings = await home.account("Savings", "1000");
    const active = await home.goal(savings.id, {
      name: "Laptop",
      targetDate: "2027-01-31",
    });
    const done = await home.goal(savings.id, { name: "Phone" });
    const dropped = await home.goal(savings.id, { name: "Boat" });
    await call(goalsRouter.complete, { goalId: done.id }, home.context);
    await call(goalsRouter.complete, { goalId: dropped.id }, home.context);
    const archived = await call(
      goalsRouter.archive,
      { goalId: dropped.id },
      home.context
    );
    expect(archived).toMatchObject({ status: "archived" });
    expect(archived.completedAt).toBeInstanceOf(Date);

    const list = await call(goalsRouter.list, undefined, home.context);
    expect(list.map(({ name, status }) => [name, status])).toEqual([
      ["Laptop", "active"],
      ["Phone", "completed"],
      ["Boat", "archived"],
    ]);
    expect(
      await getTestDb()
        .select({ id: savingsGoal.id })
        .from(savingsGoal)
        .where(eq(savingsGoal.organizationId, home.organizationId))
    ).toHaveLength(3);

    expect(
      await codeOf(
        call(goalsRouter.archive, { goalId: dropped.id }, home.context)
      )
    ).toBe("BAD_REQUEST");
    expect(
      await codeOf(
        call(goalsRouter.reopen, { goalId: dropped.id }, home.context)
      )
    ).toBe("BAD_REQUEST");
    expect(
      await codeOf(
        call(goalsRouter.restore, { goalId: active.id }, home.context)
      )
    ).toBe("BAD_REQUEST");

    const restored = await call(
      goalsRouter.restore,
      { goalId: dropped.id },
      home.context
    );
    expect(restored).toMatchObject({ archivedAt: null, status: "completed" });
  });

  it("tracks asset accounts only, and archived ones only where already linked", async () => {
    const home = await household();
    const card = await home.account("Visa", "0", { accountClass: "liability" });
    expect(await codeOf(home.goal(card.id))).toBe("BAD_REQUEST");

    const savings = await home.account("Savings", "500");
    const goal = await home.goal(savings.id);
    await call(accountsRouter.archive, { accountId: savings.id }, home.context);
    expect(await codeOf(home.goal(savings.id))).toBe("BAD_REQUEST");

    const kept = await call(
      goalsRouter.update,
      {
        accountId: savings.id,
        goalId: goal.id,
        name: "Still tracking",
        targetAmount: "1000",
        targetDate: null,
      },
      home.context
    );
    expect(kept).toMatchObject({
      name: "Still tracking",
      percent: 50,
      saved: "500.000000",
    });
    expect(kept.accountArchivedAt).toBeInstanceOf(Date);
  });

  it("never crosses household boundaries", async () => {
    const home = await household();
    const other = await household();
    const theirs = await other.account("Their savings", "9000");
    const theirGoal = await other.goal(theirs.id, { name: "Theirs" });
    const mine = await home.account("My savings", "100");

    expect(await codeOf(home.goal(theirs.id))).toBe("NOT_FOUND");
    const myGoal = await home.goal(mine.id);
    expect(
      await codeOf(
        call(
          goalsRouter.update,
          {
            accountId: theirs.id,
            goalId: myGoal.id,
            name: "Hijack",
            targetAmount: "1",
            targetDate: null,
          },
          home.context
        )
      )
    ).toBe("NOT_FOUND");

    for (const procedure of [
      goalsRouter.get,
      goalsRouter.complete,
      goalsRouter.archive,
      goalsRouter.restore,
      goalsRouter.reopen,
    ]) {
      expect(
        await codeOf(call(procedure, { goalId: theirGoal.id }, home.context))
      ).toBe("NOT_FOUND");
    }
    expect(
      await codeOf(
        call(
          goalsRouter.update,
          {
            accountId: mine.id,
            goalId: theirGoal.id,
            name: "Hijack",
            targetAmount: "1",
            targetDate: null,
          },
          home.context
        )
      )
    ).toBe("NOT_FOUND");

    const list = await call(goalsRouter.list, undefined, home.context);
    expect(list.map(({ id }) => id)).toEqual([myGoal.id]);
    expect(
      await call(goalsRouter.get, { goalId: theirGoal.id }, other.context)
    ).toMatchObject({ name: "Theirs", saved: "9000.000000" });
  });

  it("grades goal access by household role", async () => {
    const home = await household();
    const savings = await home.account("Savings", "100");
    const goal = await home.goal(savings.id);
    const viewer = await home.joinAs("viewer");
    const memberContext = await home.joinAs("member");

    expect(await codeOf(call(goalsRouter.list, undefined, viewer))).toBeNull();
    expect(
      await codeOf(call(goalsRouter.complete, { goalId: goal.id }, viewer))
    ).toBe("FORBIDDEN");
    expect(
      await codeOf(
        call(
          goalsRouter.create,
          {
            accountId: savings.id,
            name: "Nope",
            targetAmount: "1",
            targetDate: null,
          },
          viewer
        )
      )
    ).toBe("FORBIDDEN");

    await call(goalsRouter.complete, { goalId: goal.id }, memberContext);
    expect(
      await codeOf(
        call(goalsRouter.archive, { goalId: goal.id }, memberContext)
      )
    ).toBe("FORBIDDEN");
    await call(goalsRouter.archive, { goalId: goal.id }, home.context);
    expect(
      await codeOf(
        call(goalsRouter.restore, { goalId: goal.id }, memberContext)
      )
    ).toBe("FORBIDDEN");
  });

  it("goes when the household goes", async () => {
    const home = await household();
    const savings = await home.account("Savings", "100");
    await home.goal(savings.id);
    await getTestDb()
      .delete(organization)
      .where(eq(organization.id, home.organizationId));
    expect(
      await getTestDb()
        .select({ id: savingsGoal.id })
        .from(savingsGoal)
        .where(eq(savingsGoal.organizationId, home.organizationId))
    ).toHaveLength(0);
  });
});
