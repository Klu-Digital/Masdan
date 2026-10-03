import { isDefinedError } from "@orpc/client";
import { beforeEach, describe, expect, it } from "vite-plus/test";

import { client } from "./client";
import { today } from "./flows";
import { resetDemo } from "./store";
import { scaled, text } from "./util";

const accountNamed = async (prefix: string) => {
  const accounts = await client.accounts.list();
  const account = accounts.find((row) => row.name.startsWith(prefix));
  if (!account) {
    throw new Error(`No seeded account ${prefix}`);
  }
  return account;
};

const categoryNamed = async (name: string) => {
  const categories = await client.categories.list();
  const category = categories.find((row) => row.name === name);
  if (!category) {
    throw new Error(`No seeded category ${name}`);
  }
  return category;
};

beforeEach(() => {
  resetDemo();
});

describe("demo backend", () => {
  it("seeds a household whose net worth adds up", async () => {
    const [accounts, report] = await Promise.all([
      client.accounts.list(),
      client.reports.netWorth(),
    ]);
    const [position] = report.positions;
    let net = 0n;
    for (const account of accounts) {
      net +=
        account.accountClass === "asset"
          ? scaled(account.balance)
          : -scaled(account.balance);
    }
    expect(accounts.length).toBeGreaterThan(5);
    expect(position?.netWorth).toBe(text(net));
  });

  it("derives balances from new transactions and undoes them on archive", async () => {
    const checking = await accountNamed("BDO");
    const groceries = await categoryNamed("Groceries");
    const created = await client.transactions.create({
      accountId: checking.id,
      amount: "1500",
      categoryId: groceries.id,
      notes: "SM Supermarket — demo test",
      paidStatus: "paid",
      transactionDate: today(),
    });

    const after = await client.accounts.get({ accountId: checking.id });
    expect(scaled(after.balance)).toBe(
      scaled(checking.balance) - 1_500_000_000n
    );
    const { items } = await client.transactions.list({ search: "demo test" });
    expect(items.map((row) => row.id)).toEqual([created.id]);

    const match = await client.rules.matchTransaction({
      transactionId: created.id,
    });
    expect(match.match?.rule.name).toBe("Supermarket groceries");

    await client.transactions.archive({ transactionId: created.id });
    const restored = await client.accounts.get({ accountId: checking.id });
    expect(restored.balance).toBe(checking.balance);
  });

  it("moves money with a transfer that lists once", async () => {
    const checking = await accountNamed("BDO");
    const wallet = await accountNamed("GCash");
    const transfer = await client.transfers.create({
      destinationAccountId: wallet.id,
      destinationAmount: "250",
      notes: "demo transfer",
      sourceAccountId: checking.id,
      sourceAmount: "250",
      transactionDate: today(),
    });

    const listed = await client.transactions.list({ search: "demo transfer" });
    expect(listed.total).toBe(1);
    const moved = await client.accounts.get({ accountId: wallet.id });
    expect(scaled(moved.balance)).toBe(scaled(wallet.balance) + 250_000_000n);

    await client.transfers.delete({ transferId: transfer.id });
    const back = await client.accounts.get({ accountId: wallet.id });
    expect(back.balance).toBe(wallet.balance);
  });

  it("posts a schedule that starts today straight away", async () => {
    const checking = await accountNamed("BDO");
    const pets = await categoryNamed("Pets");
    const schedule = await client.recurringSchedules.create({
      accountId: checking.id,
      amount: "999",
      categoryId: pets.id,
      endDate: null,
      frequency: "monthly",
      interval: 1,
      name: "Pet insurance",
      notes: null,
      paidStatus: "paid",
      startDate: today(),
      tagIds: [],
    });
    expect(schedule.postedCount).toBe(1);
    expect((schedule.nextOccurrenceDate ?? "") > today()).toBe(true);
  });

  it("keeps budgets, bills and reports consistent with the ledger", async () => {
    const pets = await categoryNamed("Pets");
    const month = today().slice(0, 7);
    await client.categoryBudgets.set({
      amount: "1234",
      categoryId: pets.id,
      month,
    });
    const budgets = await client.categoryBudgets.month({ month });
    const line = budgets.lines.find((row) => row.category.id === pets.id);
    expect(line?.budget?.amount).toBe("1234.000000");

    const bills = await client.bills.month({});
    expect(bills.bills.some((bill) => bill.kind === "card")).toBe(true);
    expect(bills.bills.some((bill) => bill.kind === "recurring")).toBe(true);

    const [history, netWorth] = await Promise.all([
      client.reports.netWorthHistory({ preset: "last_3_months" }),
      client.reports.netWorth(),
    ]);
    expect(history.points.at(-1)?.positions[0]?.netWorth).toBe(
      netWorth.positions[0]?.netWorth
    );
  });

  it("parses quick entry without AI", async () => {
    const parsed = await client.transactions.parseQuickEntry({
      text: "Jollibee lunch 250 gcash",
    });
    expect(parsed.ai).toBe("unavailable");
    expect(JSON.stringify(parsed)).toContain("Jollibee");
  });

  it("refuses server-only procedures with a message people can read", async () => {
    const refusal = await client.imports
      .create({} as never)
      .catch((error: unknown) => error);
    expect(isDefinedError(refusal)).toBe(true);
  });
});
