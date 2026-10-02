import {
  category,
  financialAccount,
  organization,
} from "@masdan/db/schema/index";
import { getSessionFor, getTestDb, signUpTestUser } from "@masdan/testing";
import { call } from "@orpc/server";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vite-plus/test";

import { accountsRouter } from "../accounts/accounts.router";
import type { Context } from "../context";
import { TAG_COLORS } from "../tags/constants";
import { tagsRouter } from "../tags/tags.router";
import { transactionsRouter } from "../transactions/transactions.router";
import { transfersRouter } from "../transfers/transfers.router";
import { getCashFlow, resolveReportPeriod } from "./reports.queries";
import { reportsRouter } from "./reports.router";

interface AccountInput {
  accountClass: "asset" | "liability";
  accountType:
    | "bank"
    | "cash"
    | "credit_card"
    | "e_wallet"
    | "personal_loan"
    | "property";
  currencyCode?: string;
  includeInNetWorth?: boolean;
  liquidity?: "liquid" | "semi_liquid" | "illiquid";
  name: string;
  openingBalance: string;
  openingBalanceDate: string;
}

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
  const categories = {
    food: await categoryIdFor("Food & Dining"),
    groceries: await categoryIdFor("Groceries"),
    salary: await categoryIdFor("Salary"),
    transport: await categoryIdFor("Transport"),
    utilities: await categoryIdFor("Utilities"),
  };
  const account = (input: AccountInput) =>
    call(accountsRouter.create, { ...input, ownerMemberIds: [] }, context);
  const record = (
    accountId: string,
    categoryId: string,
    amount: string,
    transactionDate: string,
    extra: {
      paidStatus?: "paid" | "unpaid";
      splits?: { amount: string; categoryId: string }[];
      tagIds?: string[];
    } = {}
  ) =>
    call(
      transactionsRouter.create,
      {
        accountId,
        amount,
        categoryId,
        paidStatus: extra.paidStatus ?? "paid",
        splits: extra.splits,
        tagIds: extra.tagIds ?? [],
        transactionDate,
      },
      context
    );
  const transfer = (
    sourceAccountId: string,
    destinationAccountId: string,
    amount: string,
    transactionDate: string
  ) =>
    call(
      transfersRouter.create,
      {
        destinationAccountId,
        destinationAmount: amount,
        sourceAccountId,
        sourceAmount: amount,
        transactionDate,
      },
      context
    );
  return { account, categories, context, organizationId, record, transfer };
};

type Household = Awaited<ReturnType<typeof household>>;

const OPENED = "2026-01-01";

/** A household with every ledger shape the reports have to get right. */
const ledger = async (home: Household) => {
  const { account, categories, record, transfer } = home;
  const savings = await account({
    accountClass: "asset",
    accountType: "bank",
    liquidity: "liquid",
    name: "Savings",
    openingBalance: "10000",
    openingBalanceDate: OPENED,
  });
  await account({
    accountClass: "asset",
    accountType: "e_wallet",
    liquidity: "liquid",
    name: "Wallet",
    openingBalance: "500",
    openingBalanceDate: OPENED,
  });
  await account({
    accountClass: "asset",
    accountType: "property",
    liquidity: "illiquid",
    name: "House",
    openingBalance: "1000000",
    openingBalanceDate: OPENED,
  });
  const card = await account({
    accountClass: "liability",
    accountType: "credit_card",
    name: "Visa",
    openingBalance: "0",
    openingBalanceDate: OPENED,
  });
  const loan = await account({
    accountClass: "liability",
    accountType: "personal_loan",
    includeInNetWorth: false,
    name: "Family loan",
    openingBalance: "5000",
    openingBalanceDate: OPENED,
  });
  const oldWallet = await account({
    accountClass: "asset",
    accountType: "cash",
    liquidity: "liquid",
    name: "Old wallet",
    openingBalance: "300",
    openingBalanceDate: OPENED,
  });
  const dollars = await account({
    accountClass: "asset",
    accountType: "bank",
    currencyCode: "USD",
    liquidity: "liquid",
    name: "Dollars",
    openingBalance: "100",
    openingBalanceDate: "2026-02-01",
  });

  // Before the opening date: inside the opening balance, still a real expense.
  await record(savings.id, categories.transport, "50", "2025-12-20");
  await record(savings.id, categories.salary, "5000", "2026-01-15");
  await record(savings.id, categories.groceries, "1200", "2026-01-20");
  await record(card.id, categories.groceries, "800", "2026-01-25");
  await record(oldWallet.id, categories.transport, "30", "2026-01-10");
  await transfer(savings.id, card.id, "500", "2026-02-05");
  await record(card.id, categories.groceries, "300", "2026-02-10", {
    splits: [
      { amount: "100", categoryId: categories.groceries },
      { amount: "200", categoryId: categories.food },
    ],
  });
  await record(savings.id, categories.utilities, "100", "2026-02-20", {
    paidStatus: "unpaid",
  });
  await record(dollars.id, categories.groceries, "25.5", "2026-02-15");
  await record(loan.id, categories.utilities, "40", "2026-02-12");
  const archived = await record(
    savings.id,
    categories.transport,
    "999",
    "2026-02-21"
  );
  await call(
    transactionsRouter.archive,
    { transactionId: archived.id },
    home.context
  );
  await record(savings.id, categories.utilities, "70", "2099-01-01");

  await call(accountsRouter.archive, { accountId: oldWallet.id }, home.context);
  // 00:30 on 1 March in Manila, still 28 February in UTC.
  await getTestDb()
    .update(financialAccount)
    .set({ archivedAt: new Date("2026-02-28T16:30:00Z") })
    .where(eq(financialAccount.id, oldWallet.id));

  return { card, dollars, loan, oldWallet, savings };
};

const custom = (dateFrom: string, dateTo: string) => ({
  dateFrom,
  dateTo,
  preset: "custom" as const,
});

describe("reports.netWorth", () => {
  it("nets included assets against liabilities per currency", async () => {
    const home = await household();
    await ledger(home);
    const other = await household();
    await other.account({
      accountClass: "asset",
      accountType: "bank",
      liquidity: "liquid",
      name: "Neighbour",
      openingBalance: "777",
      openingBalanceDate: OPENED,
    });

    const report = await call(reportsRouter.netWorth, undefined, home.context);

    expect(report.defaultCurrency).toBe("PHP");
    expect(report.positions).toEqual([
      {
        accountCount: 4,
        // Savings 13130 (future-dated and unpaid entries count), Wallet 500,
        // House 1,000,000; the archived wallet and the excluded loan do not.
        assets: "1013630.000000",
        currencyCode: "PHP",
        illiquidAssets: "1000000.000000",
        // 800 + 300 in card purchases, less the 500 payment.
        liabilities: "600.000000",
        liquidAssets: "13630.000000",
        liquidNetWorth: "13030.000000",
        netWorth: "1013030.000000",
        semiLiquidAssets: "0",
        unclassifiedAssets: "0",
      },
      {
        accountCount: 1,
        assets: "74.500000",
        currencyCode: "USD",
        illiquidAssets: "0",
        liabilities: "0",
        liquidAssets: "74.500000",
        liquidNetWorth: "74.500000",
        netWorth: "74.500000",
        semiLiquidAssets: "0",
        unclassifiedAssets: "0",
      },
    ]);
    expect(report.byType).toEqual([
      {
        accountClass: "asset",
        accountCount: 1,
        accountType: "property",
        currencyCode: "PHP",
        total: "1000000.000000",
      },
      {
        accountClass: "asset",
        accountCount: 1,
        accountType: "bank",
        currencyCode: "PHP",
        total: "13130.000000",
      },
      {
        accountClass: "asset",
        accountCount: 1,
        accountType: "e_wallet",
        currencyCode: "PHP",
        total: "500.000000",
      },
      {
        accountClass: "liability",
        accountCount: 1,
        accountType: "credit_card",
        currencyCode: "PHP",
        total: "600.000000",
      },
      {
        accountClass: "asset",
        accountCount: 1,
        accountType: "bank",
        currencyCode: "USD",
        total: "74.500000",
      },
    ]);

    const accounts = await call(accountsRouter.list, {}, home.context);
    const savings = accounts.find((row) => row.name === "Savings");
    expect(savings?.balance).toBe("13130.000000");

    await expect(
      call(reportsRouter.netWorth, undefined, other.context)
    ).resolves.toMatchObject({
      byType: [expect.objectContaining({ total: "777.000000" })],
      positions: [expect.objectContaining({ netWorth: "777.000000" })],
    });
  });

  it("puts the household currency first and reports nothing without accounts", async () => {
    const home = await household();
    await expect(
      call(reportsRouter.netWorth, undefined, home.context)
    ).resolves.toMatchObject({ byType: [], positions: [] });

    await home.account({
      accountClass: "asset",
      accountType: "bank",
      currencyCode: "EUR",
      liquidity: "liquid",
      name: "Euro",
      openingBalance: "1",
      openingBalanceDate: OPENED,
    });
    await home.account({
      accountClass: "liability",
      accountType: "credit_card",
      name: "Card",
      openingBalance: "250",
      openingBalanceDate: OPENED,
    });
    const report = await call(reportsRouter.netWorth, undefined, home.context);
    expect(
      report.positions.map(({ currencyCode, netWorth }) => [
        currencyCode,
        netWorth,
      ])
    ).toEqual([
      ["PHP", "-250.000000"],
      ["EUR", "1.000000"],
    ]);
  });
});

describe("reports.netWorthHistory", () => {
  it("replays the shared balance formula at each month end", async () => {
    const home = await household();
    await ledger(home);
    const other = await household();
    const neighbour = await other.account({
      accountClass: "asset",
      accountType: "bank",
      liquidity: "liquid",
      name: "Neighbour",
      openingBalance: "777",
      openingBalanceDate: "2025-06-01",
    });
    await other.record(
      neighbour.id,
      other.categories.salary,
      "5",
      "2026-01-05"
    );

    const history = await call(
      reportsRouter.netWorthHistory,
      { ...custom("2025-10-01", "2026-03-31"), granularity: "month" },
      home.context
    );

    expect(history).toMatchObject({
      dateFrom: OPENED,
      dateTo: "2026-03-31",
      defaultCurrency: "PHP",
      granularity: "month",
      period: { dateFrom: "2025-10-01", dateTo: "2026-03-31" },
    });
    expect(history.points).toEqual([
      {
        date: "2026-01-31",
        positions: [
          {
            // Savings 13800, Wallet 500, House 1,000,000, Old wallet 270.
            assets: "1014570.000000",
            currencyCode: "PHP",
            liabilities: "800.000000",
            liquidAssets: "14570.000000",
            netWorth: "1013770.000000",
          },
        ],
      },
      {
        date: "2026-02-28",
        positions: [
          {
            // Archived 1 March household time: still counted on 28 Feb.
            assets: "1013970.000000",
            currencyCode: "PHP",
            liabilities: "600.000000",
            liquidAssets: "13970.000000",
            netWorth: "1013370.000000",
          },
          {
            assets: "74.500000",
            currencyCode: "USD",
            liabilities: "0",
            liquidAssets: "74.500000",
            netWorth: "74.500000",
          },
        ],
      },
      {
        date: "2026-03-31",
        positions: [
          {
            // Future-dated 2099 entry not yet applied; old wallet gone.
            assets: "1013700.000000",
            currencyCode: "PHP",
            liabilities: "600.000000",
            liquidAssets: "13700.000000",
            netWorth: "1013100.000000",
          },
          {
            assets: "74.500000",
            currencyCode: "USD",
            liabilities: "0",
            liquidAssets: "74.500000",
            netWorth: "74.500000",
          },
        ],
      },
    ]);
  });

  it("uses daily points with first and last day of the range", async () => {
    const home = await household();
    await ledger(home);

    const history = await call(
      reportsRouter.netWorthHistory,
      custom("2026-01-14", "2026-01-16"),
      home.context
    );
    expect(history.granularity).toBe("day");
    expect(
      history.points.map(({ date, positions }) => [
        date,
        positions[0]?.netWorth,
      ])
    ).toEqual([
      ["2026-01-14", "1010770.000000"],
      ["2026-01-15", "1015770.000000"],
      ["2026-01-16", "1015770.000000"],
    ]);
  });

  it("is empty before any account opens and rejects oversized ranges", async () => {
    const home = await household();
    await ledger(home);

    await expect(
      call(
        reportsRouter.netWorthHistory,
        custom("2025-01-01", "2025-12-31"),
        home.context
      )
    ).resolves.toMatchObject({ dateFrom: null, dateTo: null, points: [] });
    await expect(
      call(
        reportsRouter.netWorthHistory,
        { ...custom("2026-01-01", "2026-12-31"), granularity: "day" },
        home.context
      )
    ).resolves.toMatchObject({ granularity: "day" });
    await expect(
      call(
        reportsRouter.netWorthHistory,
        { ...custom("1900-01-01", "2026-01-31"), granularity: "day" },
        home.context
      )
    ).resolves.toMatchObject({ dateFrom: OPENED });

    await home.account({
      accountClass: "asset",
      accountType: "cash",
      liquidity: "liquid",
      name: "Coin jar",
      openingBalance: "1",
      openingBalanceDate: "2020-01-01",
    });
    await expect(
      call(
        reportsRouter.netWorthHistory,
        { ...custom("1900-01-01", "2026-01-31"), granularity: "day" },
        home.context
      )
    ).rejects.toThrow(/too many points/u);
    await expect(
      call(
        reportsRouter.netWorthHistory,
        { dateFrom: "2026-02-01", dateTo: "2026-01-01", preset: "custom" },
        home.context
      )
    ).rejects.toThrow();
  });
});

describe("reports.cashFlow", () => {
  it("totals income and expenses without transfers, per currency", async () => {
    const home = await household();
    const { card } = await ledger(home);
    const other = await household();
    const neighbour = await other.account({
      accountClass: "asset",
      accountType: "bank",
      liquidity: "liquid",
      name: "Neighbour",
      openingBalance: "0",
      openingBalanceDate: OPENED,
    });
    await other.record(
      neighbour.id,
      other.categories.salary,
      "9999",
      "2026-01-15"
    );

    const report = await call(
      reportsRouter.cashFlow,
      custom("2025-12-01", "2026-02-28"),
      home.context
    );

    expect(report.months).toEqual(["2025-12", "2026-01", "2026-02"]);
    expect(report.totals).toEqual([
      {
        currencyCode: "PHP",
        // 50 + 1200 + 800 + 30 + 300 + 100 + 40; the 500 card payment is a
        // transfer and the archived 999 is gone.
        expense: "2520.000000",
        income: "5000.000000",
        net: "2480.000000",
        savingsRate: 49.6,
      },
      {
        currencyCode: "USD",
        expense: "25.500000",
        income: "0",
        net: "-25.500000",
        savingsRate: null,
      },
    ]);
    expect(report.monthly).toEqual([
      {
        currencyCode: "PHP",
        expense: "50.000000",
        income: "0",
        month: "2025-12",
        net: "-50.000000",
        savingsRate: null,
      },
      {
        currencyCode: "PHP",
        expense: "2030.000000",
        income: "5000.000000",
        month: "2026-01",
        net: "2970.000000",
        savingsRate: 59.4,
      },
      {
        currencyCode: "PHP",
        expense: "440.000000",
        income: "0",
        month: "2026-02",
        net: "-440.000000",
        savingsRate: null,
      },
      {
        currencyCode: "USD",
        expense: "25.500000",
        income: "0",
        month: "2026-02",
        net: "-25.500000",
        savingsRate: null,
      },
    ]);

    const firstAndLastDay = await call(
      reportsRouter.cashFlow,
      custom("2026-01-15", "2026-01-20"),
      home.context
    );
    expect(firstAndLastDay.totals).toEqual([
      {
        currencyCode: "PHP",
        expense: "1200.000000",
        income: "5000.000000",
        net: "3800.000000",
        savingsRate: 76,
      },
    ]);

    const cardOnly = await call(
      reportsRouter.cashFlow,
      { ...custom("2026-01-01", "2026-02-28"), accountIds: [card.id] },
      home.context
    );
    expect(cardOnly.totals).toEqual([
      {
        currencyCode: "PHP",
        expense: "1100.000000",
        income: "0",
        net: "-1100.000000",
        savingsRate: null,
      },
    ]);

    const foreignAccount = await call(
      reportsRouter.cashFlow,
      { ...custom("2026-01-01", "2026-02-28"), accountIds: [neighbour.id] },
      home.context
    );
    expect(foreignAccount).toMatchObject({ monthly: [], totals: [] });

    const theirs = await call(
      reportsRouter.cashFlow,
      custom("2025-01-01", "2026-12-31"),
      other.context
    );
    expect(theirs.totals).toEqual([
      {
        currencyCode: "PHP",
        expense: "0",
        income: "9999.000000",
        net: "9999.000000",
        savingsRate: 100,
      },
    ]);
  });
});

describe("reports.cashFlow savings rates", () => {
  it("calculates period and monthly rates independently for each currency", async () => {
    const home = await household();
    const php = await home.account({
      accountClass: "asset",
      accountType: "bank",
      name: "Pesos",
      openingBalance: "0",
      openingBalanceDate: OPENED,
    });
    const usd = await home.account({
      accountClass: "asset",
      accountType: "bank",
      currencyCode: "USD",
      name: "Dollars",
      openingBalance: "0",
      openingBalanceDate: OPENED,
    });
    await home.record(php.id, home.categories.salary, "100", "2026-01-15");
    await home.record(php.id, home.categories.groceries, "25", "2026-01-16");
    await home.record(php.id, home.categories.groceries, "10", "2026-02-15");
    await home.record(usd.id, home.categories.salary, "30", "2026-01-15");
    await home.record(usd.id, home.categories.groceries, "20", "2026-01-16");
    const report = await call(
      reportsRouter.cashFlow,
      custom("2026-01-01", "2026-02-28"),
      home.context
    );
    expect(
      report.monthly.map(({ month, currencyCode, savingsRate }) => ({
        currencyCode,
        month,
        savingsRate,
      }))
    ).toEqual([
      { currencyCode: "PHP", month: "2026-01", savingsRate: 75 },
      { currencyCode: "USD", month: "2026-01", savingsRate: 33.3 },
      { currencyCode: "PHP", month: "2026-02", savingsRate: null },
    ]);
    expect(
      report.totals.map(({ currencyCode, savingsRate }) => ({
        currencyCode,
        savingsRate,
      }))
    ).toEqual([
      { currencyCode: "PHP", savingsRate: 65 },
      { currencyCode: "USD", savingsRate: 33.3 },
    ]);
  });
});

describe("reports.spendingByCategory", () => {
  it("attributes split lines to their own categories", async () => {
    const home = await household();
    await ledger(home);
    const other = await household();
    const neighbour = await other.account({
      accountClass: "asset",
      accountType: "bank",
      liquidity: "liquid",
      name: "Neighbour",
      openingBalance: "0",
      openingBalanceDate: OPENED,
    });
    await other.record(
      neighbour.id,
      other.categories.groceries,
      "12345",
      "2026-01-15"
    );

    const report = await call(
      reportsRouter.spendingByCategory,
      custom("2026-01-01", "2026-02-28"),
      home.context
    );

    expect(
      report.categories.map(({ count, currencyCode, name, total, type }) => ({
        count,
        currencyCode,
        name,
        total,
        type,
      }))
    ).toEqual([
      {
        count: 3,
        currencyCode: "PHP",
        name: "Groceries",
        total: "2100.000000",
        type: "expense",
      },
      {
        count: 1,
        currencyCode: "PHP",
        name: "Food & Dining",
        total: "200.000000",
        type: "expense",
      },
      {
        count: 2,
        currencyCode: "PHP",
        name: "Utilities",
        total: "140.000000",
        type: "expense",
      },
      {
        count: 1,
        currencyCode: "PHP",
        name: "Transport",
        total: "30.000000",
        type: "expense",
      },
      {
        count: 1,
        currencyCode: "USD",
        name: "Groceries",
        total: "25.500000",
        type: "expense",
      },
    ]);
    expect(report.totals).toEqual([
      { currencyCode: "PHP", total: "2470.000000" },
      { currencyCode: "USD", total: "25.500000" },
    ]);
    expect(report.categories[0]).toMatchObject({
      categoryId: home.categories.groceries,
      color: expect.any(String),
      icon: expect.any(String),
    });

    await expect(
      call(
        reportsRouter.spendingByCategory,
        { preset: "last_year" },
        other.context
      )
    ).resolves.toMatchObject({ categories: [], totals: [] });
  });
});

describe("reports.spendingByTag", () => {
  it("counts expense lines once per tag and keeps all spending as the total", async () => {
    const home = await household();
    const { account, categories, context, record } = home;
    const tag = (name: string) =>
      call(tagsRouter.create, { color: TAG_COLORS[0], name }, context);
    const trip = await tag("Trip");
    const kids = await tag("Kids");
    await tag("Unused");
    const wallet = await account({
      accountClass: "asset",
      accountType: "bank",
      liquidity: "liquid",
      name: "Wallet",
      openingBalance: "0",
      openingBalanceDate: OPENED,
    });
    await record(wallet.id, categories.food, "300", "2026-01-10", {
      tagIds: [trip.id, kids.id],
    });
    await record(wallet.id, categories.groceries, "500", "2026-01-11", {
      splits: [
        { amount: "100", categoryId: categories.food },
        { amount: "400", categoryId: categories.groceries },
      ],
      tagIds: [trip.id],
    });
    await record(wallet.id, categories.salary, "1000", "2026-01-12", {
      tagIds: [trip.id],
    });
    await record(wallet.id, categories.transport, "50", "2026-01-13");
    await record(wallet.id, categories.transport, "70", "2026-03-01", {
      tagIds: [kids.id],
    });

    const report = await call(
      reportsRouter.spendingByTag,
      custom("2026-01-01", "2026-01-31"),
      context
    );

    expect(
      report.tags.map(({ archived, count, name, tagId, total }) => ({
        archived,
        count,
        name,
        tagId,
        total,
      }))
    ).toEqual([
      {
        archived: false,
        count: 2,
        name: "Trip",
        tagId: trip.id,
        total: "800.000000",
      },
      {
        archived: false,
        count: 1,
        name: "Kids",
        tagId: kids.id,
        total: "300.000000",
      },
    ]);
    expect(report.totals).toEqual([
      { currencyCode: "PHP", total: "850.000000" },
    ]);
  });
});

describe("report periods", () => {
  it("resolves presets in the household timezone around midnight", async () => {
    const home = await household();
    const { savings } = await ledger(home);
    const db = getTestDb();
    const now = new Date("2026-02-28T16:30:00Z");

    await expect(
      resolveReportPeriod(
        db,
        home.organizationId,
        { preset: "this_month" },
        now
      )
    ).resolves.toMatchObject({
      dateFrom: "2026-03-01",
      dateTo: "2026-03-01",
      timezone: "Asia/Manila",
      today: "2026-03-01",
    });
    await expect(
      resolveReportPeriod(
        db,
        home.organizationId,
        { preset: "last_month" },
        now
      )
    ).resolves.toMatchObject({ dateFrom: "2026-02-01", dateTo: "2026-02-28" });
    await expect(
      resolveReportPeriod(db, home.organizationId, { preset: "all_time" }, now)
    ).resolves.toMatchObject({ dateFrom: "2025-12-20", dateTo: "2026-03-01" });

    await home.record(savings.id, home.categories.food, "11", "2026-02-28");
    await home.record(savings.id, home.categories.food, "22", "2026-03-01");
    const manilaMonth = await resolveReportPeriod(
      db,
      home.organizationId,
      { preset: "this_month" },
      now
    );
    const manila = await getCashFlow(db, home.organizationId, manilaMonth);
    expect(manila.totals).toEqual([
      {
        currencyCode: "PHP",
        expense: "22.000000",
        income: "0",
        net: "-22.000000",
        savingsRate: null,
      },
    ]);

    await db
      .update(organization)
      .set({ timezone: "UTC" })
      .where(eq(organization.id, home.organizationId));
    const utcMonth = await resolveReportPeriod(
      db,
      home.organizationId,
      { preset: "this_month" },
      now
    );
    expect(utcMonth).toMatchObject({
      dateFrom: "2026-02-01",
      dateTo: "2026-02-28",
      today: "2026-02-28",
    });
    const utc = await getCashFlow(db, home.organizationId, utcMonth);
    expect(utc.totals[0]).toMatchObject({ expense: "451.000000" });

    await expect(
      call(reportsRouter.period, { preset: "year_to_date" }, home.context)
    ).resolves.toMatchObject({
      dateTo: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/u),
      defaultCurrency: "PHP",
      preset: "year_to_date",
      timezone: "UTC",
    });
    await expect(
      call(reportsRouter.period, { preset: "custom" }, home.context)
    ).rejects.toThrow();
  });
});
