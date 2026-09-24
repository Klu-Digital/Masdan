import { category } from "@masdan/db/schema/index";
import { getSessionFor, getTestDb, signUpTestUser } from "@masdan/testing";
import { call } from "@orpc/server";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vite-plus/test";

import { accountsRouter } from "../accounts/accounts.router";
import type { Context } from "../context";
import { transfersRouter } from "../transfers/transfers.router";
import { transactionsRouter } from "./transactions.router";

const contextFor = async (headers: Headers): Promise<Context> =>
  ({
    auth: null,
    db: getTestDb(),
    log: undefined,
    session: await getSessionFor(headers),
  }) as unknown as Context;

const activeOrganizationId = async (headers: Headers): Promise<string> => {
  const currentSession = await getSessionFor(headers);
  const organizationId = currentSession?.session.activeOrganizationId;
  if (!organizationId) {
    throw new Error("Test user has no active household");
  }
  return organizationId;
};

const accountInput = {
  accountClass: "asset" as const,
  accountType: "bank" as const,
  liquidity: "liquid" as const,
  name: "BPI Savings",
  openingBalance: "1000",
  openingBalanceDate: "2026-01-01",
  ownerMemberIds: [],
};

const categoryIdFor = async (
  organizationId: string,
  name: string
): Promise<string> => {
  const [row] = await getTestDb()
    .select({ id: category.id })
    .from(category)
    .where(
      and(eq(category.organizationId, organizationId), eq(category.name, name))
    )
    .limit(1);
  if (!row) {
    throw new Error(`Missing test category: ${name}`);
  }
  return row.id;
};

const household = async () => {
  const user = await signUpTestUser();
  const context = { context: await contextFor(user.headers) };
  const organizationId = await activeOrganizationId(user.headers);
  const [groceries, food, transport, salary] = await Promise.all(
    ["Groceries", "Food & Dining", "Transport", "Salary"].map((name) =>
      categoryIdFor(organizationId, name)
    )
  );
  if (!(groceries && food && transport && salary)) {
    throw new Error("Missing default categories");
  }
  const createAccount = (name: string, currencyCode?: string) =>
    call(
      accountsRouter.create,
      { ...accountInput, currencyCode, name },
      context
    );
  const record = (
    accountId: string,
    categoryId: string,
    amount: string,
    transactionDate: string,
    extra: {
      notes?: string;
      splits?: { amount: string; categoryId: string }[];
    } = {}
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
        ...extra,
      },
      context
    );

  return {
    categories: { food, groceries, salary, transport },
    context,
    createAccount,
    record,
  };
};

describe("transactions summary", () => {
  it("groups monthly cash flow and split-aware category totals", async () => {
    const { categories, context, createAccount, record } = await household();
    const savings = await createAccount("Savings");
    const wallet = await createAccount("Wallet");

    await record(savings.id, categories.salary, "5000", "2026-01-15");
    await record(savings.id, categories.groceries, "120.5", "2026-01-20");
    await record(wallet.id, categories.groceries, "80", "2026-02-03");
    await record(savings.id, categories.groceries, "300", "2026-02-10", {
      splits: [
        { amount: "100.25", categoryId: categories.groceries },
        { amount: "199.75", categoryId: categories.food },
      ],
    });
    await record(savings.id, categories.salary, "5000", "2026-02-15");

    const archived = await record(
      savings.id,
      categories.transport,
      "999",
      "2026-02-20"
    );
    await call(
      transactionsRouter.archive,
      { transactionId: archived.id },
      context
    );
    await call(
      transfersRouter.create,
      {
        destinationAccountId: wallet.id,
        destinationAmount: "400",
        sourceAccountId: savings.id,
        sourceAmount: "400",
        transactionDate: "2026-02-05",
      },
      context
    );
    await record(savings.id, categories.transport, "42", "2026-03-01");

    const other = await household();
    const otherAccount = await other.createAccount("Other");
    await other.record(
      otherAccount.id,
      other.categories.salary,
      "7",
      "2026-01-10"
    );

    const summary = await call(
      transactionsRouter.summary,
      { dateFrom: "2026-01-01", dateTo: "2026-02-28" },
      context
    );

    expect(summary.cashFlow).toEqual([
      {
        currencyCode: "PHP",
        expense: "120.500000",
        income: "5000.000000",
        month: "2026-01",
        net: "4879.500000",
      },
      {
        currencyCode: "PHP",
        expense: "380.000000",
        income: "5000.000000",
        month: "2026-02",
        net: "4620.000000",
      },
    ]);
    expect(
      summary.categories.map(({ count, currencyCode, name, total, type }) => ({
        count,
        currencyCode,
        name,
        total,
        type,
      }))
    ).toEqual([
      {
        count: 2,
        currencyCode: "PHP",
        name: "Salary",
        total: "10000.000000",
        type: "income",
      },
      {
        count: 3,
        currencyCode: "PHP",
        name: "Groceries",
        total: "300.750000",
        type: "expense",
      },
      {
        count: 1,
        currencyCode: "PHP",
        name: "Food & Dining",
        total: "199.750000",
        type: "expense",
      },
    ]);
    expect(summary.categories[0]).toMatchObject({
      categoryId: categories.salary,
      color: expect.any(String),
      icon: expect.any(String),
    });

    const walletOnly = await call(
      transactionsRouter.summary,
      { accountIds: [wallet.id], dateFrom: "2026-01-01", dateTo: "2026-12-31" },
      context
    );
    expect(walletOnly).toEqual({
      cashFlow: [
        {
          currencyCode: "PHP",
          expense: "80.000000",
          income: "0",
          month: "2026-02",
          net: "-80.000000",
        },
      ],
      categories: [
        expect.objectContaining({
          count: 1,
          name: "Groceries",
          total: "80.000000",
        }),
      ],
    });

    await expect(
      call(
        transactionsRouter.summary,
        { dateFrom: "2026-05-01", dateTo: "2026-05-31" },
        context
      )
    ).resolves.toEqual({ cashFlow: [], categories: [] });
    await expect(
      call(
        transactionsRouter.summary,
        { dateFrom: "2026-02-01", dateTo: "2026-01-01" },
        context
      )
    ).rejects.toThrow();
  });

  it("separates currencies in cash flow and categories", async () => {
    const { categories, context, createAccount, record } = await household();
    const peso = await createAccount("Peso");
    const dollar = await createAccount("Dollar", "USD");

    await record(peso.id, categories.groceries, "100", "2026-01-05");
    await record(dollar.id, categories.groceries, "25.5", "2026-01-06");
    await record(dollar.id, categories.salary, "1000", "2026-01-07");

    const summary = await call(
      transactionsRouter.summary,
      { dateFrom: "2026-01-01", dateTo: "2026-01-31" },
      context
    );

    expect(summary.cashFlow).toEqual([
      {
        currencyCode: "PHP",
        expense: "100.000000",
        income: "0",
        month: "2026-01",
        net: "-100.000000",
      },
      {
        currencyCode: "USD",
        expense: "25.500000",
        income: "1000.000000",
        month: "2026-01",
        net: "974.500000",
      },
    ]);
    expect(
      summary.categories.map(({ currencyCode, name, total }) => ({
        currencyCode,
        name,
        total,
      }))
    ).toEqual([
      { currencyCode: "USD", name: "Salary", total: "1000.000000" },
      { currencyCode: "PHP", name: "Groceries", total: "100.000000" },
      { currencyCode: "USD", name: "Groceries", total: "25.500000" },
    ]);
  });
});

describe("transactions totals", () => {
  it("counts exactly what list returns and sums non-transfer rows", async () => {
    const { categories, context, createAccount, record } = await household();
    const peso = await createAccount("Peso");
    const wallet = await createAccount("Wallet");
    const dollar = await createAccount("Dollar", "USD");

    await record(peso.id, categories.salary, "5000", "2026-01-15");
    await record(peso.id, categories.groceries, "150", "2026-01-16", {
      notes: "Weekly market run",
    });
    await record(wallet.id, categories.groceries, "50.25", "2026-01-17");
    await record(dollar.id, categories.groceries, "20", "2026-01-18", {
      notes: "Market snacks",
    });
    await record(dollar.id, categories.salary, "300", "2026-01-19");
    const archived = await record(
      peso.id,
      categories.transport,
      "75",
      "2026-01-20"
    );
    await call(
      transactionsRouter.archive,
      { transactionId: archived.id },
      context
    );
    await call(
      transfersRouter.create,
      {
        destinationAccountId: wallet.id,
        destinationAmount: "400",
        sourceAccountId: peso.id,
        sourceAmount: "400",
        transactionDate: "2026-01-21",
      },
      context
    );

    const other = await household();
    const otherAccount = await other.createAccount("Other");
    await other.record(
      otherAccount.id,
      other.categories.groceries,
      "9",
      "2026-01-16"
    );

    const all = await call(transactionsRouter.totals, {}, context);
    const allList = await call(transactionsRouter.list, {}, context);
    expect(all).toEqual({
      count: allList.total,
      currencies: [
        { currencyCode: "PHP", expense: "200.250000", income: "5000.000000" },
        { currencyCode: "USD", expense: "20.000000", income: "300.000000" },
      ],
    });
    expect(all.count).toBe(6);

    const filters = [
      { types: ["expense" as const] },
      { search: "market" },
      { search: "market", types: ["expense" as const] },
      { includeArchived: true },
      { accountIds: [peso.id, wallet.id] },
      { accountIds: [wallet.id] },
      { dateFrom: "2026-01-17", dateTo: "2026-01-19" },
    ];
    for (const filter of filters) {
      const [totals, list] = await Promise.all([
        call(transactionsRouter.totals, filter, context),
        call(transactionsRouter.list, { ...filter, pageSize: 1 }, context),
      ]);
      expect(totals.count, JSON.stringify(filter)).toBe(list.total);
    }

    await expect(
      call(transactionsRouter.totals, { types: ["expense"] }, context)
    ).resolves.toEqual({
      count: 3,
      currencies: [
        { currencyCode: "PHP", expense: "200.250000", income: "0" },
        { currencyCode: "USD", expense: "20.000000", income: "0" },
      ],
    });
    await expect(
      call(transactionsRouter.totals, { search: "market" }, context)
    ).resolves.toEqual({
      count: 2,
      currencies: [
        { currencyCode: "PHP", expense: "150.000000", income: "0" },
        { currencyCode: "USD", expense: "20.000000", income: "0" },
      ],
    });
    await expect(
      call(transactionsRouter.totals, { includeArchived: true }, context)
    ).resolves.toMatchObject({
      count: 7,
      currencies: [
        { currencyCode: "PHP", expense: "275.250000" },
        { currencyCode: "USD", expense: "20.000000" },
      ],
    });
    await expect(
      call(transactionsRouter.totals, { accountIds: [wallet.id] }, context)
    ).resolves.toEqual({
      count: 2,
      currencies: [{ currencyCode: "PHP", expense: "50.250000", income: "0" }],
    });
  });
});
