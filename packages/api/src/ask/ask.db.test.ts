import { category, featureFlag } from "@masdan/db/schema/index";
import { getSessionFor, getTestDb, signUpTestUser } from "@masdan/testing";
import { call, ORPCError } from "@orpc/server";
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { accountsRouter } from "../accounts/accounts.router";
import type * as GatewayModule from "../ai/gateway";
import type { Context } from "../context";
import { invalidateFeatureFlags } from "../feature-flags/feature-flags.cache";
import { reportsRouter } from "../reports/reports.router";
import { transactionsRouter } from "../transactions/transactions.router";
import { ai } from "./ask.golden";
import { askRouter } from "./ask.router";
import type { AskResult } from "./ask.router";

const completeJson = vi.hoisted(() => vi.fn());
const isAiConfigured = vi.hoisted(() => vi.fn());

// The gateway is the only thing faked: planning, scoping and queries are real.
vi.mock("../ai/gateway", async (importOriginal) => ({
  ...(await importOriginal<typeof GatewayModule>()),
  completeJson,
  isAiConfigured,
}));

const setFlag = async (enabled: boolean) => {
  await getTestDb()
    .insert(featureFlag)
    .values({ enabled, name: "FF__ASK_MASDAN" })
    .onConflictDoUpdate({ set: { enabled }, target: featureFlag.name });
  invalidateFeatureFlags();
};

const AUGUST = {
  dateFrom: "2026-08-01",
  dateTo: "2026-08-31",
  preset: "custom" as const,
};

/** A household with a bank, a card, and a month of August activity. */
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
  };
  const bank = await call(
    accountsRouter.create,
    {
      accountClass: "asset",
      accountType: "bank",
      liquidity: "liquid",
      name: "BPI Savings",
      openingBalance: "50000",
      openingBalanceDate: "2026-01-01",
      ownerMemberIds: [],
    },
    context
  );
  const card = await call(
    accountsRouter.create,
    {
      accountClass: "liability",
      accountType: "credit_card",
      cardLastFour: "4821",
      cardNetwork: "Mastercard",
      creditLimit: "100000",
      institution: "Metrobank",
      liquidity: null,
      name: "Metrobank Titanium",
      openingBalance: "0",
      openingBalanceDate: "2026-01-01",
      ownerMemberIds: [],
    },
    context
  );
  const record = (
    accountId: string,
    categoryId: string,
    amount: string,
    transactionDate: string,
    notes: string | null = null
  ) =>
    call(
      transactionsRouter.create,
      {
        accountId,
        amount,
        categoryId,
        notes,
        paidStatus: "paid",
        tagIds: [],
        transactionDate,
      },
      context
    );

  await record(bank.id, categories.salary, "80000", "2026-08-15");
  await record(card.id, categories.food, "400", "2026-08-03", "jollibee");
  await record(card.id, categories.food, "1250.50", "2026-08-10", "Jollibee");
  await record(
    card.id,
    categories.food,
    "3000",
    "2026-08-20",
    "wedding dinner"
  );
  await record(bank.id, categories.groceries, "5600", "2026-08-12");
  // Outside August: must never leak into an August answer.
  await record(bank.id, categories.groceries, "9999", "2026-07-31");

  return { bank, card, categories, context, organizationId };
};

const ask = async (
  home: Awaited<ReturnType<typeof household>>,
  question: string,
  extraction: ReturnType<typeof ai>
): Promise<AskResult> => {
  completeJson.mockResolvedValueOnce(extraction);
  return await call(askRouter.question, { question }, home.context);
};

const answered = (result: AskResult) => {
  if (result.status !== "answered") {
    throw new Error(`Expected an answer, got ${result.status}`);
  }
  return result.answer;
};

beforeEach(async () => {
  completeJson.mockReset();
  isAiConfigured.mockReset().mockReturnValue(true);
  await setFlag(true);
});

describe("ask.question", () => {
  it("is unreachable while the flag is off", async () => {
    const home = await household();
    await setFlag(false);

    const failure = await call(
      askRouter.question,
      { question: "what's my net worth" },
      home.context
    ).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ORPCError);
    expect((failure as ORPCError<string, unknown>).code).toBe("NOT_FOUND");
    expect(completeJson).not.toHaveBeenCalled();
  });

  it("answers spending from the same totals the Reports screen shows", async () => {
    const home = await household();

    const answer = answered(
      await ask(home, "how much did we spend in August?", {
        ...ai({ intent: "spending" }),
        ...AUGUST,
      })
    );
    const report = await call(
      reportsRouter.spendingByCategory,
      AUGUST,
      home.context
    );

    expect(answer.figures[0]?.amounts).toEqual([
      { amount: report.totals[0]?.total, currencyCode: "PHP" },
    ]);
    expect(answer.figures[0]?.amounts[0]?.amount).toBe("10250.500000");
    expect(answer.rows.map((row) => row.label)).toEqual([
      "Groceries",
      "Food & Dining",
    ]);
    expect(answer.headline).toBe(
      "You spent ₱10,250.50 from Aug 1, 2026 to Aug 31, 2026."
    );
    expect(answer.context.period).toEqual({
      dateFrom: "2026-08-01",
      dateTo: "2026-08-31",
      preset: "custom",
    });
    expect(answer.link).toMatchObject({
      search: {
        dateFrom: "2026-08-01",
        dateTo: "2026-08-31",
        types: ["expense"],
      },
      to: "/transactions",
    });
  });

  it("answers a merchant filter from the Transactions screen's totals", async () => {
    const home = await household();

    const answer = answered(
      await ask(home, "how much at jollibee in august", {
        ...ai({ intent: "spending", search: "jollibee" }),
        ...AUGUST,
      })
    );
    const totals = await call(
      transactionsRouter.totals,
      { ...AUGUST, search: "jollibee", types: ["expense"] },
      home.context
    );

    expect(answer.figures[0]?.amounts).toEqual([
      { amount: totals.currencies[0]?.expense, currencyCode: "PHP" },
    ]);
    expect(answer.figures[0]?.amounts[0]?.amount).toBe("1650.500000");
    expect(answer.context.search).toBe("jollibee");
    expect(answer.headline).toContain("across 2 transactions");
  });

  it("answers cash flow from the Reports cash flow totals", async () => {
    const home = await household();

    const answer = answered(
      await ask(home, "cash flow in august", {
        ...ai({ intent: "cash_flow" }),
        ...AUGUST,
      })
    );
    const report = await call(reportsRouter.cashFlow, AUGUST, home.context);

    expect(answer.figures.map((figure) => figure.amounts[0]?.amount)).toEqual([
      report.totals[0]?.income,
      report.totals[0]?.expense,
      report.totals[0]?.net,
    ]);
  });

  it("answers net worth from the Reports net worth", async () => {
    const home = await household();

    const answer = answered(
      await ask(home, "what's my net worth", ai({ intent: "net_worth" }))
    );
    const report = await call(reportsRouter.netWorth, undefined, home.context);

    expect(answer.figures[0]?.amounts).toEqual([
      { amount: report.positions[0]?.netWorth, currencyCode: "PHP" },
    ]);
    expect(answer.link).toEqual({ to: "/reports" });
  });

  it("lists the largest transactions, resolving the card by alias", async () => {
    const home = await household();

    const answer = answered(
      await ask(home, "top 2 charges on my metrobank mc in august", {
        ...ai({
          account: "metrobank mc",
          intent: "largest_transactions",
          limit: 2,
        }),
        ...AUGUST,
      })
    );

    expect(answer.context.account).toBe("Metrobank Titanium");
    expect(answer.rows.map((row) => [row.label, row.amount])).toEqual([
      ["wedding dinner", "3000.000000"],
      ["Jollibee", "1250.500000"],
    ]);
  });

  it("answers one account's balance", async () => {
    const home = await household();

    const answer = answered(
      await ask(
        home,
        "how much is in bpi savings",
        ai({ account: "bpi savings", intent: "account_balances" })
      )
    );

    // 50,000 opening + 80,000 salary − 5,600 − 9,999 groceries.
    expect(answer.headline).toBe("BPI Savings has ₱114,401.00.");
    expect(answer.link).toEqual({
      accountId: home.bank.id,
      to: "/accounts/$accountId",
    });
  });

  it("never reads another household, whatever the model names", async () => {
    const home = await household();
    const other = await household();
    await call(
      accountsRouter.create,
      {
        accountClass: "asset",
        accountType: "e_wallet",
        liquidity: "liquid",
        name: "GCash",
        openingBalance: "999999",
        openingBalanceDate: "2026-01-01",
        ownerMemberIds: [],
      },
      other.context
    );

    const byName = await ask(
      home,
      "balance of gcash",
      ai({ account: "gcash", intent: "account_balances" })
    );
    expect(byName.status).toBe("clarify");

    const byId = await ask(
      home,
      `balance of ${other.bank.id}`,
      ai({ account: other.bank.id, intent: "account_balances" })
    );
    expect(byId.status).toBe("clarify");

    // Two households with identical activity: each sees only its own.
    const answer = answered(
      await ask(home, "spending in august", {
        ...ai({ intent: "spending" }),
        ...AUGUST,
      })
    );
    expect(answer.figures[0]?.amounts[0]?.amount).toBe("10250.500000");

    const balances = answered(
      await ask(home, "all balances", ai({ intent: "account_balances" }))
    );
    expect(balances.rows.map((row) => row.id).toSorted()).toEqual(
      [home.bank.id, home.card.id].toSorted()
    );
  });

  it("fails safe when the model is unavailable, errors or refuses", async () => {
    const home = await household();

    isAiConfigured.mockReturnValueOnce(false);
    const unconfigured = await call(
      askRouter.question,
      { question: "spending this month" },
      home.context
    );
    expect(unconfigured.status).toBe("unavailable");

    completeJson.mockRejectedValueOnce(new Error("timeout"));
    const failed = await call(
      askRouter.question,
      { question: "spending this month" },
      home.context
    );
    expect(failed.status).toBe("unavailable");

    const refused = await ask(
      home,
      "should I buy bitcoin",
      ai({ intent: "unsupported" })
    );
    expect(refused.status).toBe("unsupported");
    expect(refused).not.toHaveProperty("answer");
  });
});
