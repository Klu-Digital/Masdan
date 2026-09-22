import { category } from "@masdan/db/schema/index";
import { getSessionFor, getTestDb, signUpTestUser } from "@masdan/testing";
import { call, ORPCError } from "@orpc/server";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vite-plus/test";

import type { Context } from "../context";
import { transactionsRouter } from "../transactions/transactions.router";
import { transfersRouter } from "../transfers/transfers.router";
import { accountsRouter } from "./accounts.router";

const contextFor = async (headers: Headers): Promise<Context> =>
  ({
    auth: null,
    db: getTestDb(),
    log: undefined,
    session: await getSessionFor(headers),
  }) as unknown as Context;

const codeOf = async (
  promise: Promise<unknown>
): Promise<string | undefined> => {
  try {
    await promise;
  } catch (error) {
    return error instanceof ORPCError ? error.code : undefined;
  }
  return undefined;
};

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
  openingBalance: "100000",
  openingBalanceDate: "2026-01-01",
  ownerMemberIds: [],
};

const cardInput = {
  ...accountInput,
  accountClass: "liability" as const,
  accountType: "credit_card" as const,
  creditLimit: "100000",
  liquidity: null,
  name: "BPI Visa",
  openingBalance: "10000",
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

describe("credit card statements", () => {
  it("records statement history and calculates current card utilization", async () => {
    const user = await signUpTestUser();
    const context = { context: await contextFor(user.headers) };
    const organizationId = await activeOrganizationId(user.headers);
    const card = await call(accountsRouter.create, cardInput, context);
    const expenseCategoryId = await categoryIdFor(organizationId, "Groceries");

    await call(
      transactionsRouter.create,
      {
        accountId: card.id,
        amount: "13000",
        categoryId: expenseCategoryId,
        paidStatus: "paid",
        tagIds: [],
        transactionDate: "2026-01-20",
      },
      context
    );

    await expect(
      call(accountsRouter.get, { accountId: card.id }, context)
    ).resolves.toMatchObject({
      availableCredit: "77000.000000",
      balance: "23000.000000",
      utilization: "23.00",
    });

    const statement = await call(
      accountsRouter.createStatement,
      {
        accountId: card.id,
        dueDate: "2026-02-15",
        minimumAmountDue: "1000",
        periodEnd: "2026-01-25",
        periodStart: "2025-12-26",
        statementBalance: "23000",
        statementDate: "2026-01-25",
      },
      context
    );

    expect(statement).toMatchObject({
      accountId: card.id,
      dueDate: "2026-02-15",
      minimumAmountDue: "1000.000000",
      periodEnd: "2026-01-25",
      periodStart: "2025-12-26",
      statementBalance: "23000.000000",
      statementDate: "2026-01-25",
    });
    await call(
      accountsRouter.update,
      { ...cardInput, accountId: card.id, creditLimit: "200000" },
      context
    );
    await expect(
      call(accountsRouter.listStatements, { accountId: card.id }, context)
    ).resolves.toEqual([statement]);
  });

  it("keeps card payments out of spending while reducing both balances", async () => {
    const user = await signUpTestUser();
    const context = { context: await contextFor(user.headers) };
    const organizationId = await activeOrganizationId(user.headers);
    const source = await call(accountsRouter.create, accountInput, context);
    const card = await call(accountsRouter.create, cardInput, context);
    const expenseCategoryId = await categoryIdFor(organizationId, "Groceries");

    await call(
      transactionsRouter.create,
      {
        accountId: card.id,
        amount: "13000",
        categoryId: expenseCategoryId,
        paidStatus: "paid",
        tagIds: [],
        transactionDate: "2026-01-20",
      },
      context
    );
    await call(
      transfersRouter.create,
      {
        destinationAccountId: card.id,
        destinationAmount: "3000",
        sourceAccountId: source.id,
        sourceAmount: "3000",
        transactionDate: "2026-02-01",
      },
      context
    );

    await expect(
      call(accountsRouter.get, { accountId: source.id }, context)
    ).resolves.toMatchObject({ balance: "97000.000000" });
    await expect(
      call(accountsRouter.get, { accountId: card.id }, context)
    ).resolves.toMatchObject({
      availableCredit: "80000.000000",
      balance: "20000.000000",
      utilization: "20.00",
    });
    const expenses = await call(
      transactionsRouter.list,
      { types: ["expense"] },
      context
    );
    expect(expenses.items).toHaveLength(1);
    expect(expenses.items[0]?.amount).toBe("13000.000000");
  });

  it("handles missing and zero credit limits safely", async () => {
    const user = await signUpTestUser();
    const context = { context: await contextFor(user.headers) };
    const zeroLimit = await call(
      accountsRouter.create,
      { ...cardInput, creditLimit: "0", name: "Zero Limit" },
      context
    );
    const missingLimit = await call(
      accountsRouter.create,
      { ...cardInput, creditLimit: null, name: "Missing Limit" },
      context
    );

    await expect(
      call(accountsRouter.get, { accountId: zeroLimit.id }, context)
    ).resolves.toMatchObject({
      availableCredit: "-10000.000000",
      utilization: null,
    });
    await expect(
      call(accountsRouter.get, { accountId: missingLimit.id }, context)
    ).resolves.toMatchObject({
      availableCredit: null,
      utilization: null,
    });
  });

  it("keeps statement data inside its household", async () => {
    const first = await signUpTestUser();
    const second = await signUpTestUser();
    const firstContext = { context: await contextFor(first.headers) };
    const secondContext = { context: await contextFor(second.headers) };
    const card = await call(accountsRouter.create, cardInput, firstContext);

    expect(
      await codeOf(
        call(
          accountsRouter.createStatement,
          {
            accountId: card.id,
            periodEnd: "2026-01-25",
            periodStart: "2025-12-26",
            statementBalance: "23000",
            statementDate: "2026-01-25",
          },
          secondContext
        )
      )
    ).toBe("NOT_FOUND");
    expect(
      await codeOf(
        call(
          accountsRouter.listStatements,
          { accountId: card.id },
          secondContext
        )
      )
    ).toBe("NOT_FOUND");
  });
});
