import {
  category,
  categoryBudget,
  member,
  organization,
  session,
} from "@masdan/db/schema/index";
import { getSessionFor, getTestDb, signUpTestUser } from "@masdan/testing";
import { call, ORPCError } from "@orpc/server";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vite-plus/test";

import { accountsRouter } from "../accounts/accounts.router";
import { categoriesRouter } from "../categories/categories.router";
import type { Context } from "../context";
import { transactionsRouter } from "../transactions/transactions.router";
import { transfersRouter } from "../transfers/transfers.router";
import { getMonthBudgets } from "./budgets.queries";
import { budgetsRouter } from "./budgets.router";

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
    groceries: await categoryIdFor("Groceries"),
    salary: await categoryIdFor("Salary"),
    transport: await categoryIdFor("Transport"),
  };
  const account = (name: string, currencyCode?: string) =>
    call(
      accountsRouter.create,
      {
        accountClass: "asset",
        accountType: "bank",
        currencyCode,
        liquidity: "liquid",
        name,
        openingBalance: "50000",
        openingBalanceDate: "2025-01-01",
        ownerMemberIds: [],
      },
      context
    );
  const record = (
    accountId: string,
    categoryId: string,
    amount: string,
    transactionDate: string,
    splits?: { amount: string; categoryId: string }[]
  ) =>
    call(
      transactionsRouter.create,
      {
        accountId,
        amount,
        categoryId,
        paidStatus: "paid",
        splits,
        tagIds: [],
        transactionDate,
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
  return { account, categories, context, joinAs, organizationId, record };
};

const lineFor = (
  result: Awaited<ReturnType<typeof getMonthBudgets>>,
  categoryId: string
) => result.lines.find((line) => line.category.id === categoryId);

describe("budgets", () => {
  it("sets a monthly category budget and updates it in place", async () => {
    const home = await household();
    const first = await call(
      budgetsRouter.set,
      { amount: "8000", categoryId: home.categories.food, month: "2026-02" },
      home.context
    );
    expect(first).toMatchObject({
      amount: "8000.000000",
      currencyCode: "PHP",
      month: "2026-02-01",
    });

    const second = await call(
      budgetsRouter.set,
      { amount: "9500.5", categoryId: home.categories.food, month: "2026-02" },
      home.context
    );
    expect(second.id).toBe(first.id);
    expect(second.amount).toBe("9500.500000");

    const rows = await getTestDb()
      .select()
      .from(categoryBudget)
      .where(eq(categoryBudget.organizationId, home.organizationId));
    expect(rows).toHaveLength(1);

    const month = await call(
      budgetsRouter.month,
      { month: "2026-02" },
      home.context
    );
    expect(lineFor(month, home.categories.food)?.budget?.amount).toBe(
      "9500.500000"
    );
    // A different month is a separate budget.
    const march = await call(
      budgetsRouter.month,
      { month: "2026-03" },
      home.context
    );
    expect(lineFor(march, home.categories.food)?.budget).toBeNull();
  });

  it("sums qualifying expenses for the month and category, split-aware", async () => {
    const home = await household();
    const savings = await home.account("Savings");
    const { food, groceries, salary, transport } = home.categories;
    await home.record(savings.id, food, "1200", "2026-02-01");
    await home.record(savings.id, food, "300.25", "2026-02-28");
    await home.record(savings.id, groceries, "999", "2026-02-10", [
      { amount: "499", categoryId: groceries },
      { amount: "500", categoryId: food },
    ]);
    // Neighbouring months stay out.
    await home.record(savings.id, food, "70", "2026-01-31");
    await home.record(savings.id, food, "80", "2026-03-01");
    // Income never counts toward spending.
    await home.record(savings.id, salary, "40000", "2026-02-15");
    // Neither does an archived entry.
    const archived = await home.record(savings.id, food, "5000", "2026-02-05");
    await call(
      transactionsRouter.archive,
      { transactionId: archived.id },
      home.context
    );
    // A transfer moves money between the household's own accounts.
    const wallet = await home.account("Wallet");
    await call(
      transfersRouter.create,
      {
        destinationAccountId: wallet.id,
        destinationAmount: "20000",
        sourceAccountId: savings.id,
        sourceAmount: "20000",
        transactionDate: "2026-02-12",
      },
      home.context
    );

    await call(
      budgetsRouter.set,
      { amount: "3000", categoryId: food, month: "2026-02" },
      home.context
    );
    const result = await call(
      budgetsRouter.month,
      { month: "2026-02" },
      home.context
    );

    expect(result).toMatchObject({
      dateFrom: "2026-02-01",
      dateTo: "2026-02-28",
      defaultCurrency: "PHP",
      month: "2026-02",
    });
    expect(lineFor(result, food)).toMatchObject({
      count: 3,
      overBy: "0.000000",
      percentUsed: 66,
      remaining: "999.750000",
      spent: "2000.250000",
      status: "within",
    });
    expect(lineFor(result, groceries)).toMatchObject({
      budget: null,
      overBy: null,
      remaining: null,
      spent: "499.000000",
      status: "unbudgeted",
    });
    expect(lineFor(result, transport)).toMatchObject({
      spent: "0.000000",
      status: "unbudgeted",
    });
    expect(lineFor(result, salary)).toBeUndefined();
    expect(result.totals).toMatchObject({
      budgeted: "3000.000000",
      budgetedCount: 1,
      overspentCount: 0,
      remaining: "999.750000",
      spent: "2000.250000",
      unbudgetedSpent: "499.000000",
    });
  });

  it("flags overspending with the amount over budget", async () => {
    const home = await household();
    const savings = await home.account("Savings");
    const { food, groceries, transport } = home.categories;
    await home.record(savings.id, food, "8250.75", "2026-02-10");
    await home.record(savings.id, groceries, "1500", "2026-02-11");
    await home.record(savings.id, transport, "100", "2026-02-12");
    for (const [categoryId, amount] of [
      [food, "8000"],
      [groceries, "1500"],
      [transport, "600"],
    ] as const) {
      await call(
        budgetsRouter.set,
        { amount, categoryId, month: "2026-02" },
        home.context
      );
    }

    const result = await call(
      budgetsRouter.month,
      { month: "2026-02" },
      home.context
    );
    expect(lineFor(result, food)).toMatchObject({
      overBy: "250.750000",
      percentUsed: 103,
      remaining: "0.000000",
      status: "overspent",
    });
    // Spending exactly the budget is at the limit, not over it.
    expect(lineFor(result, groceries)).toMatchObject({
      overBy: "0.000000",
      remaining: "0.000000",
      status: "within",
    });
    expect(lineFor(result, transport)).toMatchObject({
      remaining: "500.000000",
      status: "within",
    });
    expect(result.totals).toMatchObject({
      budgeted: "10100.000000",
      overBy: "0.000000",
      overspentCount: 1,
      remaining: "249.250000",
      spent: "9850.750000",
    });
  });

  it("handles a month with no budgets and no spending", async () => {
    const home = await household();
    const result = await call(
      budgetsRouter.month,
      { month: "2026-02" },
      home.context
    );
    expect(result.lines.length).toBeGreaterThan(0);
    for (const line of result.lines) {
      expect(line).toMatchObject({
        budget: null,
        percentUsed: null,
        spent: "0.000000",
        status: "unbudgeted",
      });
    }
    expect(result.totals).toMatchObject({
      budgeted: "0.000000",
      budgetedCount: 0,
      remaining: "0.000000",
      spent: "0.000000",
    });
  });

  it("resolves month boundaries in the household's timezone", async () => {
    const home = await household();
    const savings = await home.account("Savings");
    const { food } = home.categories;
    await home.record(savings.id, food, "100", "2026-09-30");
    await home.record(savings.id, food, "200", "2026-10-01");
    // 2026-09-30T17:00Z is already October 1 in Manila (UTC+8).
    const instant = new Date("2026-09-30T17:00:00Z");

    const manila = await getMonthBudgets(
      getTestDb(),
      home.organizationId,
      undefined,
      instant
    );
    expect(manila).toMatchObject({
      currentMonth: "2026-10",
      dateFrom: "2026-10-01",
      dateTo: "2026-10-01",
      month: "2026-10",
      timezone: "Asia/Manila",
      today: "2026-10-01",
    });
    expect(lineFor(manila, food)?.spent).toBe("200.000000");

    await getTestDb()
      .update(organization)
      .set({ timezone: "America/Los_Angeles" })
      .where(eq(organization.id, home.organizationId));
    const losAngeles = await getMonthBudgets(
      getTestDb(),
      home.organizationId,
      undefined,
      instant
    );
    expect(losAngeles).toMatchObject({
      currentMonth: "2026-09",
      dateTo: "2026-09-30",
      month: "2026-09",
      today: "2026-09-30",
    });
    expect(lineFor(losAngeles, food)?.spent).toBe("100.000000");
  });

  it("counts the current month up to today and a future month not at all", async () => {
    const home = await household();
    const savings = await home.account("Savings");
    const { food } = home.categories;
    await home.record(savings.id, food, "100", "2026-09-10");
    await home.record(savings.id, food, "900", "2026-09-28");
    const now = new Date("2026-09-15T04:00:00Z");

    const current = await getMonthBudgets(
      getTestDb(),
      home.organizationId,
      "2026-09",
      now
    );
    expect(current.dateTo).toBe("2026-09-15");
    expect(lineFor(current, food)?.spent).toBe("100.000000");

    const future = await getMonthBudgets(
      getTestDb(),
      home.organizationId,
      "2026-10",
      now
    );
    expect(future.dateTo).toBeNull();
    expect(lineFor(future, food)?.spent).toBe("0.000000");
  });

  it("keeps other-currency spending beside the budget, never inside it", async () => {
    const home = await household();
    const dollars = await home.account("Dollars", "USD");
    const savings = await home.account("Savings");
    const { food } = home.categories;
    await home.record(dollars.id, food, "25.5", "2026-02-10");
    await home.record(savings.id, food, "400", "2026-02-10");
    await call(
      budgetsRouter.set,
      { amount: "500", categoryId: food, month: "2026-02" },
      home.context
    );

    const result = await call(
      budgetsRouter.month,
      { month: "2026-02" },
      home.context
    );
    expect(lineFor(result, food)).toMatchObject({
      currencyCode: "PHP",
      otherCurrencies: [{ count: 1, currencyCode: "USD", total: "25.500000" }],
      spent: "400.000000",
    });
  });

  it("keeps an archived category's budget readable but read-only", async () => {
    const home = await household();
    const savings = await home.account("Savings");
    const { food, transport } = home.categories;
    await home.record(savings.id, food, "650", "2026-02-10");
    await call(
      budgetsRouter.set,
      { amount: "500", categoryId: food, month: "2026-02" },
      home.context
    );
    await call(categoriesRouter.archive, { categoryId: food }, home.context);
    await call(
      categoriesRouter.archive,
      { categoryId: transport },
      home.context
    );

    const result = await call(
      budgetsRouter.month,
      { month: "2026-02" },
      home.context
    );
    const line = lineFor(result, food);
    expect(line?.category.archivedAt).toBeInstanceOf(Date);
    expect(line).toMatchObject({
      overBy: "150.000000",
      spent: "650.000000",
      status: "overspent",
    });
    // Archived with nothing to show for the month: left out.
    expect(lineFor(result, transport)).toBeUndefined();

    expect(
      await codeOf(
        call(
          budgetsRouter.set,
          { amount: "900", categoryId: food, month: "2026-02" },
          home.context
        )
      )
    ).toBe("BAD_REQUEST");
    expect(
      await codeOf(
        call(
          budgetsRouter.clear,
          { categoryId: food, month: "2026-02" },
          home.context
        )
      )
    ).toBe("BAD_REQUEST");
  });

  it("rejects budgets on income categories and blocks a type change once budgeted", async () => {
    const home = await household();
    expect(
      await codeOf(
        call(
          budgetsRouter.set,
          {
            amount: "100",
            categoryId: home.categories.salary,
            month: "2026-02",
          },
          home.context
        )
      )
    ).toBe("BAD_REQUEST");

    const unused = await call(
      categoriesRouter.create,
      { color: "blue", icon: "🧾", name: "Fees", type: "expense" },
      home.context
    );
    await call(
      budgetsRouter.set,
      { amount: "100", categoryId: unused.id, month: "2026-02" },
      home.context
    );
    expect(
      await codeOf(
        call(
          categoriesRouter.update,
          {
            categoryId: unused.id,
            color: "blue",
            icon: "🧾",
            name: "Fees",
            type: "income",
          },
          home.context
        )
      )
    ).toBe("BAD_REQUEST");
  });

  it("clears a budget, and says so when there was none", async () => {
    const home = await household();
    const { food } = home.categories;
    await call(
      budgetsRouter.set,
      { amount: "500", categoryId: food, month: "2026-02" },
      home.context
    );
    const removed = await call(
      budgetsRouter.clear,
      { categoryId: food, month: "2026-02" },
      home.context
    );
    expect(removed.amount).toBe("500.000000");
    expect(
      await codeOf(
        call(
          budgetsRouter.clear,
          { categoryId: food, month: "2026-02" },
          home.context
        )
      )
    ).toBe("NOT_FOUND");
  });

  it("validates the month", async () => {
    const home = await household();
    for (const month of ["2026-13", "2026-2", "0000-01", "2026-02-01"]) {
      expect(
        await codeOf(call(budgetsRouter.month, { month }, home.context))
      ).toBe("BAD_REQUEST");
    }
  });

  it("never crosses household boundaries", async () => {
    const home = await household();
    const other = await household();
    const otherSavings = await other.account("Other savings");
    await other.record(
      otherSavings.id,
      other.categories.food,
      "777",
      "2026-02-10"
    );
    await call(
      budgetsRouter.set,
      { amount: "1000", categoryId: other.categories.food, month: "2026-02" },
      other.context
    );

    expect(
      await codeOf(
        call(
          budgetsRouter.set,
          {
            amount: "5",
            categoryId: other.categories.food,
            month: "2026-02",
          },
          home.context
        )
      )
    ).toBe("NOT_FOUND");
    expect(
      await codeOf(
        call(
          budgetsRouter.clear,
          { categoryId: other.categories.food, month: "2026-02" },
          home.context
        )
      )
    ).toBe("NOT_FOUND");

    const mine = await call(
      budgetsRouter.month,
      { month: "2026-02" },
      home.context
    );
    expect(lineFor(mine, other.categories.food)).toBeUndefined();
    expect(mine.totals.budgeted).toBe("0.000000");
    expect(
      mine.lines.every((line) => line.spent === "0.000000" && !line.budget)
    ).toBe(true);

    const theirs = await call(
      budgetsRouter.month,
      { month: "2026-02" },
      other.context
    );
    expect(lineFor(theirs, other.categories.food)).toMatchObject({
      budget: { amount: "1000.000000" },
      spent: "777.000000",
    });
  });

  it("grades budget access by household role", async () => {
    const home = await household();
    const { food } = home.categories;
    const viewer = await home.joinAs("viewer");
    const memberContext = await home.joinAs("member");

    expect(
      await codeOf(call(budgetsRouter.month, { month: "2026-02" }, viewer))
    ).toBeNull();
    expect(
      await codeOf(
        call(
          budgetsRouter.set,
          { amount: "5", categoryId: food, month: "2026-02" },
          viewer
        )
      )
    ).toBe("FORBIDDEN");

    await call(
      budgetsRouter.set,
      { amount: "5", categoryId: food, month: "2026-02" },
      memberContext
    );
    expect(
      await codeOf(
        call(
          budgetsRouter.clear,
          { categoryId: food, month: "2026-02" },
          memberContext
        )
      )
    ).toBe("FORBIDDEN");
    await call(
      budgetsRouter.clear,
      { categoryId: food, month: "2026-02" },
      home.context
    );
  });

  it("goes when the household goes", async () => {
    const home = await household();
    await call(
      budgetsRouter.set,
      { amount: "500", categoryId: home.categories.food, month: "2026-02" },
      home.context
    );
    await getTestDb()
      .delete(organization)
      .where(eq(organization.id, home.organizationId));
    const rows = await getTestDb()
      .select()
      .from(categoryBudget)
      .where(eq(categoryBudget.organizationId, home.organizationId));
    expect(rows).toHaveLength(0);
  });
});
