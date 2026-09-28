import {
  category,
  categoryBudget,
  organization,
} from "@masdan/db/schema/index";
import { getSessionFor, getTestDb, signUpTestUser } from "@masdan/testing";
import { call } from "@orpc/server";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vite-plus/test";

import { accountsRouter } from "../accounts/accounts.router";
import { budgetsRouter } from "../budgets/budgets.router";
import { categoriesRouter } from "../categories/categories.router";
import type { Context } from "../context";
import { transactionsRouter } from "../transactions/transactions.router";
import { transfersRouter } from "../transfers/transfers.router";
import { getBudgetPerformance } from "./budget-performance";
import { reportsRouter } from "./reports.router";

const range = {
  dateFrom: "2026-02-10",
  dateTo: "2026-04-10",
  preset: "custom" as const,
};

const household = async () => {
  const user = await signUpTestUser();
  const session = await getSessionFor(user.headers);
  const organizationId = session?.session.activeOrganizationId;
  if (!organizationId) {
    throw new Error("Test user has no active household");
  }
  const context = {
    context: {
      auth: null,
      db: getTestDb(),
      log: undefined,
      session,
    } as unknown as Context,
  };
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
        transactionDate: "2026-02-15",
      },
      context
    );
  const budget = (categoryId: string, month: string, amount: string) =>
    call(budgetsRouter.set, { amount, categoryId, month }, context);
  const report = () => call(reportsRouter.budgetPerformance, range, context);
  return {
    account,
    budget,
    categoryId: categoryIdFor,
    context,
    organizationId,
    record,
    report,
  };
};

describe("reports.budgetPerformance", () => {
  it("returns no months or totals without budgets", async () => {
    const home = await household();
    await expect(home.report()).resolves.toMatchObject({
      months: [],
      totals: [],
      truncated: false,
    });
  });

  it("counts only budgeted lines, split spending once, excludes transfers, archived and other currencies", async () => {
    const home = await household();
    const other = await household();
    const food = await home.categoryId("Food & Dining");
    const groceries = await home.categoryId("Groceries");
    const php = await home.account("PHP");
    const usd = await home.account("USD", "USD");
    const wallet = await home.account("Wallet");
    await home.budget(food, "2026-02", "100");
    await home.budget(groceries, "2026-02", "20");
    await home.budget(food, "2026-04", "30");
    await other.budget(
      await other.categoryId("Food & Dining"),
      "2026-03",
      "999"
    );
    await home.record(php.id, food, "40");
    await home.record(php.id, food, "30", [
      { amount: "10", categoryId: food },
      { amount: "20", categoryId: groceries },
    ]);
    await home.record(usd.id, food, "90");
    const archived = await home.record(php.id, food, "500");
    await call(
      transactionsRouter.archive,
      { transactionId: archived.id },
      home.context
    );
    await call(
      transfersRouter.create,
      {
        destinationAccountId: wallet.id,
        destinationAmount: "200",
        sourceAccountId: php.id,
        sourceAmount: "200",
        transactionDate: "2026-02-15",
      },
      home.context
    );
    const neighbour = await other.account("Neighbour");
    await other.record(
      neighbour.id,
      await other.categoryId("Food & Dining"),
      "999"
    );

    const report = await home.report();
    expect(report.months.map(({ month }) => month)).toEqual([
      "2026-02",
      "2026-04",
    ]);
    expect(report.months[0]?.lines).toEqual([
      expect.objectContaining({
        archived: false,
        budgeted: "100.000000",
        categoryId: food,
        currencyCode: "PHP",
        percentUsed: 50,
        spent: "50.000000",
        status: "within",
        variance: "50.000000",
      }),
      expect.objectContaining({
        budgeted: "20.000000",
        categoryId: groceries,
        spent: "20.000000",
        variance: "0.000000",
      }),
    ]);
    expect(report.months[0]?.totals).toEqual([
      {
        budgeted: "120.000000",
        currencyCode: "PHP",
        spent: "70.000000",
        variance: "50.000000",
      },
    ]);
    expect(report.totals).toEqual([
      {
        budgeted: "150.000000",
        currencyCode: "PHP",
        spent: "70.000000",
        variance: "80.000000",
      },
    ]);
  });

  it("omits future budgeted months inside a custom range", async () => {
    const home = await household();
    const food = await home.categoryId("Food & Dining");
    await home.budget(food, "2026-02", "100");
    await home.budget(food, "2026-04", "200");
    const report = await getBudgetPerformance(
      getTestDb(),
      home.organizationId,
      { dateFrom: "2026-02-10", dateTo: "2026-04-10" },
      new Date("2026-02-15T04:00:00Z")
    );
    expect(report.months.map(({ month }) => month)).toEqual(["2026-02"]);
    expect(report.totals).toEqual([
      {
        budgeted: "100.000000",
        currencyCode: "PHP",
        spent: "0.000000",
        variance: "100.000000",
      },
    ]);
    expect(report.truncated).toBe(false);
  });

  it("keeps archived categories in their budgeted months", async () => {
    const home = await household();
    const food = await home.categoryId("Food & Dining");
    await home.budget(food, "2026-02", "100");
    await call(categoriesRouter.archive, { categoryId: food }, home.context);
    const report = await home.report();
    expect(report.months[0]?.lines).toEqual([
      expect.objectContaining({
        archived: true,
        categoryId: food,
        name: "Food & Dining",
      }),
    ]);
  });

  it("keeps only the most recent 36 budgeted months", async () => {
    const home = await household();
    const food = await home.categoryId("Food & Dining");
    await getTestDb()
      .insert(categoryBudget)
      .values(
        Array.from({ length: 37 }, (_, index) => ({
          amount: "1",
          categoryId: food,
          currencyCode: "PHP",
          month: new Date(Date.UTC(2023, index, 1)).toISOString().slice(0, 10),
          organizationId: home.organizationId,
        }))
      );
    const report = await call(
      reportsRouter.budgetPerformance,
      {
        dateFrom: "2023-01-01",
        dateTo: "2026-01-31",
        preset: "custom",
      },
      home.context
    );
    expect(report.truncated).toBe(true);
    expect(report.months).toHaveLength(36);
    expect(report.months[0]?.month).toBe("2023-02");
    expect(report.months.at(-1)?.month).toBe("2026-01");
    expect(report.totals).toEqual([
      {
        budgeted: "36.000000",
        currencyCode: "PHP",
        spent: "0.000000",
        variance: "36.000000",
      },
    ]);
  });

  it("keeps foreign-currency budgets separate and reports negative variance", async () => {
    const home = await household();
    const food = await home.categoryId("Food & Dining");
    const groceries = await home.categoryId("Groceries");
    const php = await home.account("PHP");
    const usd = await home.account("USD", "USD");
    await home.budget(food, "2026-02", "10");
    await home.budget(groceries, "2026-02", "40");
    await getTestDb()
      .update(categoryBudget)
      .set({ currencyCode: "USD" })
      .where(
        and(
          eq(categoryBudget.organizationId, home.organizationId),
          eq(categoryBudget.categoryId, groceries)
        )
      );
    await home.record(php.id, food, "20");
    await home.record(usd.id, groceries, "15");
    const report = await home.report();
    expect(report.months[0]?.lines).toEqual([
      expect.objectContaining({
        categoryId: food,
        status: "overspent",
        variance: "-10.000000",
      }),
      expect.objectContaining({
        categoryId: groceries,
        currencyCode: "USD",
        variance: "25.000000",
      }),
    ]);
    expect(report.months[0]?.totals).toEqual([
      {
        budgeted: "10.000000",
        currencyCode: "PHP",
        spent: "20.000000",
        variance: "-10.000000",
      },
      {
        budgeted: "40.000000",
        currencyCode: "USD",
        spent: "15.000000",
        variance: "25.000000",
      },
    ]);
    expect(report.totals).toEqual([
      {
        budgeted: "10.000000",
        currencyCode: "PHP",
        spent: "20.000000",
        variance: "-10.000000",
      },
      {
        budgeted: "40.000000",
        currencyCode: "USD",
        spent: "15.000000",
        variance: "25.000000",
      },
    ]);
    await getTestDb()
      .update(organization)
      .set({ defaultCurrency: "USD" })
      .where(eq(organization.id, home.organizationId));
    const reordered = await home.report();
    expect(reordered.totals.map(({ currencyCode }) => currencyCode)).toEqual([
      "USD",
      "PHP",
    ]);
  });
});
