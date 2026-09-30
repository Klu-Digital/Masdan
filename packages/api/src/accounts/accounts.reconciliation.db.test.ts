import { auth } from "@masdan/auth";
import {
  category,
  financialTransaction,
  member,
} from "@masdan/db/schema/index";
import {
  getSessionFor,
  getTestDb,
  signUpTestUser,
  whileHolding,
} from "@masdan/testing";
import { call } from "@orpc/server";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vite-plus/test";

import { getMonthBudgets } from "../budgets/budgets.queries";
import type { Context } from "../context";
import { EXPORT_DATASETS } from "../exports/datasets";
import {
  getCashFlow,
  getCategoryTotals,
  getNetWorth,
  getNetWorthHistory,
} from "../reports/reports.queries";
import { transactionsRouter } from "../transactions/transactions.router";
import { transfersRouter } from "../transfers/transfers.router";
import { accountsRouter } from "./accounts.router";

const setup = async (accountClass: "asset" | "liability" = "asset") => {
  const user = await signUpTestUser();
  const context = {
    auth: null,
    db: getTestDb(),
    log: undefined,
    session: await getSessionFor(user.headers),
  } as unknown as Context;
  const own = { context };
  const input = {
    accountClass,
    accountType:
      accountClass === "asset" ? ("bank" as const) : ("credit_card" as const),
    name: "Reconciliation account",
    openingBalance: "1000",
    openingBalanceDate: "2026-01-01",
  };
  const account = await call(accountsRouter.create, input, own);
  const organizationId = context.session?.session.activeOrganizationId ?? "";
  const [expense] = await getTestDb()
    .select({ id: category.id })
    .from(category)
    .where(
      and(
        eq(category.organizationId, organizationId),
        eq(category.name, "Groceries")
      )
    )
    .limit(1);
  if (!expense) {
    throw new Error("Missing category");
  }
  const posting = {
    accountId: account.id,
    amount: "100",
    categoryId: expense.id,
    paidStatus: "paid" as const,
    tagIds: [],
    transactionDate: "2026-02-01",
  };
  const reconcile = {
    accountId: account.id,
    balance: "1100",
    effectiveDate: "2026-02-01",
    expectedBalance: "1000",
    notes: "Checked bank",
  };
  return { account, input, organizationId, own, posting, reconcile, user };
};

const currentBalance = async (home: Awaited<ReturnType<typeof setup>>) => {
  const account = await call(
    accountsRouter.get,
    { accountId: home.account.id },
    home.own
  );
  return account.balance;
};
const history = (home: Awaited<ReturnType<typeof setup>>) =>
  call(accountsRouter.listSnapshots, { accountId: home.account.id }, home.own);

// These literals follow the issue's displayed-balance convention, including amount owed.
describe("account reconciliation", () => {
  it.each([
    ["asset", "1100", "100.000000", "increase"],
    ["asset", "900", "-100.000000", "decrease"],
    ["liability", "1100", "100.000000", "increase"],
    ["liability", "900", "-100.000000", "decrease"],
    ["asset", "-0.123456", "-1000.123456", "decrease"],
    ["liability", "-0.123456", "-1000.123456", "decrease"],
  ] as const)(
    "reconciles %s to %s with exact signed delta",
    async (accountClass, balance, adjustment, direction) => {
      const home = await setup(accountClass);
      const result = await call(
        accountsRouter.reconcile,
        { ...home.reconcile, balance },
        home.own
      );
      expect(result.adjustment).toBe(adjustment);
      expect(await currentBalance(home)).toBe(
        balance.includes(".") ? balance : `${balance}.000000`
      );
      const snapshots = await history(home);
      expect(snapshots).toHaveLength(1);
      expect(snapshots[0]).toMatchObject({
        adjustment,
        notes: "Checked bank",
        source: "reconciliation",
      });
      const transactionId = snapshots[0]?.transactionId;
      if (!transactionId) {
        throw new Error("Missing adjustment");
      }
      const posting = await call(
        transactionsRouter.get,
        { transactionId },
        home.own
      );
      expect(posting).toMatchObject({
        adjustmentDirection: direction,
        categoryId: null,
        reconciliationSnapshotId: result.snapshot.id,
        transferId: null,
      });
    }
  );

  it.each(["asset", "liability"] as const)(
    "saves a zero-delta %s observation without a posting",
    async (accountClass) => {
      const home = await setup(accountClass);
      await call(
        accountsRouter.reconcile,
        { ...home.reconcile, balance: "1000" },
        home.own
      );
      expect(await history(home)).toMatchObject([
        { adjustment: "0.000000", transactionId: null },
      ]);
      expect(await currentBalance(home)).toBe("1000.000000");
    }
  );

  it.each(["asset", "liability"] as const)(
    "uses %s historical postings and transfer signs but not later activity",
    async (accountClass) => {
      const home = await setup(accountClass);
      const other = await call(
        accountsRouter.create,
        {
          ...home.input,
          accountClass: "asset",
          accountType: "bank",
          name: "Other",
        },
        home.own
      );
      await call(transactionsRouter.create, home.posting, home.own);
      await call(
        transfersRouter.create,
        {
          destinationAccountId: other.id,
          destinationAmount: "50",
          sourceAccountId: home.account.id,
          sourceAmount: "50",
          transactionDate: "2026-02-01",
        },
        home.own
      );
      await call(
        transactionsRouter.create,
        { ...home.posting, amount: "200", transactionDate: "2026-03-01" },
        home.own
      );
      const preview = await call(
        accountsRouter.previewReconciliation,
        { accountId: home.account.id, effectiveDate: "2026-02-01" },
        home.own
      );
      expect(preview.calculatedBalance).toBe(
        accountClass === "asset" ? "850.000000" : "1150.000000"
      );
      await call(
        accountsRouter.reconcile,
        {
          ...home.reconcile,
          balance: "1200",
          expectedBalance: preview.calculatedBalance,
        },
        home.own
      );
      expect(await currentBalance(home)).toBe(
        accountClass === "asset" ? "1000.000000" : "1400.000000"
      );
    }
  );

  it("rejects early dates and stale balances without saving observations", async () => {
    const home = await setup();
    await expect(
      call(
        accountsRouter.reconcile,
        { ...home.reconcile, effectiveDate: "2025-12-31" },
        home.own
      )
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await call(transactionsRouter.create, home.posting, home.own);
    await expect(
      call(accountsRouter.reconcile, home.reconcile, home.own)
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await history(home)).toEqual([]);
  });

  it("preserves the opening baseline and allows only archive/restore for adjustments", async () => {
    const home = await setup();
    await call(accountsRouter.reconcile, home.reconcile, home.own);
    await expect(
      call(
        accountsRouter.update,
        { ...home.input, accountId: home.account.id, openingBalance: "1500" },
        home.own
      )
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      call(
        accountsRouter.update,
        {
          ...home.input,
          accountId: home.account.id,
          openingBalanceDate: "2026-01-02",
        },
        home.own
      )
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const snapshots = await history(home);
    const transactionId = snapshots[0]?.transactionId ?? "";
    await expect(
      call(
        transactionsRouter.update,
        { ...home.posting, transactionId },
        home.own
      )
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const bulk = await call(
      transactionsRouter.bulkUpdate,
      { categoryId: home.posting.categoryId, transactionIds: [transactionId] },
      home.own
    );
    expect(bulk.updated).toEqual([]);
    await call(transactionsRouter.archive, { transactionId }, home.own);
    expect(await currentBalance(home)).toBe("1000.000000");
    const archivedSnapshots = await history(home);
    expect(archivedSnapshots[0]?.adjustmentArchivedAt).toBeInstanceOf(Date);
    await call(transactionsRouter.restore, { transactionId }, home.own);
    expect(await currentBalance(home)).toBe("1100.000000");
    const account = await call(
      accountsRouter.get,
      { accountId: home.account.id },
      home.own
    );
    expect(account.openingBalance).toBe("1000.000000");
  });

  it("changes net worth but not income, expenses, category spending or cash flow", async () => {
    const home = await setup();
    await call(transactionsRouter.create, home.posting, home.own);
    const range = { dateFrom: "2026-01-01", dateTo: "2026-03-31" };
    const before = await getCashFlow(getTestDb(), home.organizationId, range);
    const categories = await getCategoryTotals(
      getTestDb(),
      home.organizationId,
      range
    );
    const worth = await getNetWorth(getTestDb(), home.organizationId);
    const budgets = await getMonthBudgets(
      getTestDb(),
      home.organizationId,
      "2026-02",
      new Date("2026-04-01")
    );
    await call(
      accountsRouter.reconcile,
      { ...home.reconcile, balance: "1520", expectedBalance: "900" },
      home.own
    );
    expect(await getCashFlow(getTestDb(), home.organizationId, range)).toEqual(
      before
    );
    expect(
      await getCategoryTotals(getTestDb(), home.organizationId, range)
    ).toEqual(categories);
    expect(
      await getMonthBudgets(
        getTestDb(),
        home.organizationId,
        "2026-02",
        new Date("2026-04-01")
      )
    ).toEqual(budgets);
    const exported = await EXPORT_DATASETS.transactions.build(
      getTestDb(),
      home.organizationId
    );
    expect(exported.csv).toContain(
      "reconciliation_snapshot_id,adjustment_direction"
    );
    expect(exported.csv).toContain(",increase,");
    expect(await getNetWorth(getTestDb(), home.organizationId)).not.toEqual(
      worth
    );
    const totals = await call(transactionsRouter.totals, {}, home.own);
    expect(totals).toMatchObject({
      count: 2,
      currencies: [{ expense: "100.000000", income: "0" }],
    });
    const trend = await getNetWorthHistory(
      getTestDb(),
      home.organizationId,
      { ...range, timezone: "Asia/Manila", today: "2026-03-31" },
      "month"
    );
    expect(trend.points[0]?.positions[0]?.netWorth).toBe("1000.000000");
    expect(trend.points[1]?.positions[0]?.netWorth).toBe("1520.000000");
  });

  it("rejects other households and forged reconciliation observations", async () => {
    const home = await setup();
    const foreign = await setup();
    await expect(
      call(accountsRouter.reconcile, home.reconcile, foreign.own)
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      call(
        accountsRouter.saveSnapshot,
        {
          accountId: home.account.id,
          balance: "1100",
          effectiveDate: "2026-02-01",
          source: "reconciliation" as never,
        },
        home.own
      )
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await call(accountsRouter.reconcile, home.reconcile, home.own);
    const snapshots = await history(home);
    const snapshotId = snapshots[0]?.id ?? "";
    await expect(
      getTestDb().insert(financialTransaction).values({
        accountId: foreign.account.id,
        adjustmentDirection: "increase",
        amount: "1",
        currencyCode: "PHP",
        organizationId: foreign.organizationId,
        reconciliationSnapshotId: snapshotId,
        transactionDate: "2026-02-01",
      })
    ).rejects.toThrow();
  });

  it("rejects malformed adjustment rows and another account's snapshot", async () => {
    const home = await setup();
    await call(
      accountsRouter.reconcile,
      { ...home.reconcile, balance: "1000" },
      home.own
    );
    const snapshots = await history(home);
    const snapshotId = snapshots[0]?.id ?? "";
    const values = {
      accountId: home.account.id,
      amount: "1",
      currencyCode: "PHP",
      organizationId: home.organizationId,
      reconciliationSnapshotId: snapshotId,
      transactionDate: "2026-02-01",
    };
    await expect(
      getTestDb().insert(financialTransaction).values(values)
    ).rejects.toThrow();
    await expect(
      getTestDb()
        .insert(financialTransaction)
        .values({
          ...values,
          adjustmentDirection: "increase",
          categoryId: home.posting.categoryId,
        })
    ).rejects.toThrow();
    await expect(
      getTestDb()
        .insert(financialTransaction)
        .values({
          ...values,
          adjustmentDirection: "increase",
          importFingerprint: "forged",
        })
    ).rejects.toThrow();
    const other = await call(
      accountsRouter.create,
      { ...home.input, name: "Other" },
      home.own
    );
    await expect(
      getTestDb()
        .insert(financialTransaction)
        .values({
          ...values,
          accountId: other.id,
          adjustmentDirection: "increase",
        })
    ).rejects.toThrow();
  });

  it("requires both account update and transaction create permissions", async () => {
    const home = await setup();
    const viewer = await signUpTestUser();
    await auth.api.addMember({
      body: {
        organizationId: home.organizationId,
        role: "viewer",
        userId: viewer.user.id,
      },
    });
    await getTestDb()
      .update(member)
      .set({ role: "viewer" })
      .where(
        and(
          eq(member.organizationId, home.organizationId),
          eq(member.userId, viewer.user.id)
        )
      );
    await auth.api.setActiveOrganization({
      body: { organizationId: home.organizationId },
      headers: viewer.headers,
    });
    const context = {
      ...home.own.context,
      session: await getSessionFor(viewer.headers),
    };
    await expect(
      call(accountsRouter.reconcile, home.reconcile, { context })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("waits for an in-flight posting and refuses a stale confirmation", async () => {
    const home = await setup();
    await expect(
      whileHolding(
        getTestDb(),
        (tx) =>
          call(transactionsRouter.create, home.posting, {
            context: { ...home.own.context, db: tx },
          }),
        () => call(accountsRouter.reconcile, home.reconcile, home.own)
      )
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await history(home)).toEqual([]);
    expect(await currentBalance(home)).toBe("900.000000");
  });

  it("serializes two confirmations so the stale loser saves nothing", async () => {
    const home = await setup();
    await expect(
      whileHolding(
        getTestDb(),
        (tx) =>
          call(accountsRouter.reconcile, home.reconcile, {
            context: { ...home.own.context, db: tx },
          }),
        () =>
          call(
            accountsRouter.reconcile,
            { ...home.reconcile, balance: "1200" },
            home.own
          )
      )
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await history(home)).toHaveLength(1);
    expect(await currentBalance(home)).toBe("1100.000000");
  });

  it.each(["archive", "restore", "edit", "move"] as const)(
    "serializes reconciliation after a concurrent transaction %s",
    async (action) => {
      const home = await setup();
      const posting = await call(
        transactionsRouter.create,
        home.posting,
        home.own
      );
      const other = await call(
        accountsRouter.create,
        { ...home.input, name: "Other" },
        home.own
      );
      if (action === "restore") {
        await call(
          transactionsRouter.archive,
          { transactionId: posting.id },
          home.own
        );
      }
      const expectedBalance = action === "restore" ? "1000" : "900";
      await expect(
        whileHolding(
          getTestDb(),
          (tx) => {
            const own = { context: { ...home.own.context, db: tx } };
            if (action === "archive") {
              return call(
                transactionsRouter.archive,
                { transactionId: posting.id },
                own
              );
            }
            if (action === "restore") {
              return call(
                transactionsRouter.restore,
                { transactionId: posting.id },
                own
              );
            }
            return call(
              transactionsRouter.update,
              {
                ...home.posting,
                accountId: action === "move" ? other.id : home.account.id,
                amount: "200",
                transactionId: posting.id,
              },
              own
            );
          },
          () =>
            call(
              accountsRouter.reconcile,
              { ...home.reconcile, expectedBalance },
              home.own
            )
        )
      ).rejects.toMatchObject({ code: "CONFLICT" });
      expect(await history(home)).toEqual([]);
    }
  );

  it.each(["delete", "edit", "move"] as const)(
    "serializes reconciliation after a concurrent transfer %s",
    async (action) => {
      const home = await setup();
      const other = await call(
        accountsRouter.create,
        { ...home.input, name: "Other" },
        home.own
      );
      const third = await call(
        accountsRouter.create,
        { ...home.input, name: "Third" },
        home.own
      );
      const values = {
        destinationAccountId: other.id,
        destinationAmount: "100",
        sourceAccountId: home.account.id,
        sourceAmount: "100",
        transactionDate: "2026-02-01",
      };
      const transfer = await call(transfersRouter.create, values, home.own);
      await expect(
        whileHolding(
          getTestDb(),
          (tx) => {
            const own = { context: { ...home.own.context, db: tx } };
            return action === "delete"
              ? call(transfersRouter.delete, { transferId: transfer.id }, own)
              : call(
                  transfersRouter.update,
                  {
                    ...values,
                    destinationAmount: "200",
                    sourceAccountId:
                      action === "move" ? third.id : home.account.id,
                    sourceAmount: "200",
                    transferId: transfer.id,
                  },
                  own
                );
          },
          () =>
            call(
              accountsRouter.reconcile,
              { ...home.reconcile, expectedBalance: "900" },
              home.own
            )
        )
      ).rejects.toMatchObject({ code: "CONFLICT" });
      expect(await history(home)).toEqual([]);
    }
  );

  it("postings wait behind reconciliation and then apply normally", async () => {
    const home = await setup();
    await whileHolding(
      getTestDb(),
      (tx) =>
        call(accountsRouter.reconcile, home.reconcile, {
          context: { ...home.own.context, db: tx },
        }),
      () => call(transactionsRouter.create, home.posting, home.own)
    );
    expect(await currentBalance(home)).toBe("1000.000000");
  });
});
