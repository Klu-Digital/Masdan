import {
  category,
  financialTransaction,
  financialTransfer,
  member,
  session,
} from "@masdan/db/schema/index";
import { getSessionFor, getTestDb, signUpTestUser } from "@masdan/testing";
import { call, ORPCError } from "@orpc/server";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vite-plus/test";

import { accountsRouter } from "../accounts/accounts.router";
import type { Context } from "../context";
import { transactionsRouter } from "../transactions/transactions.router";
import { transfersRouter } from "./transfers.router";

const caught = async (promise: Promise<unknown>): Promise<unknown> => {
  try {
    return await promise;
  } catch (error) {
    return error;
  }
};

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

const setActiveOrganization = async (
  userId: string,
  organizationId: string
): Promise<void> => {
  await getTestDb()
    .update(session)
    .set({ activeOrganizationId: organizationId })
    .where(eq(session.userId, userId));
};

const codeOf = async (
  promise: Promise<unknown>
): Promise<string | undefined> => {
  const error = await caught(promise);
  return error instanceof ORPCError ? error.code : undefined;
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

describe("transfers", () => {
  it("keeps both account postings atomic and visible in account history", async () => {
    const user = await signUpTestUser();
    const context = { context: await contextFor(user.headers) };
    const destination = await call(
      accountsRouter.create,
      { ...accountInput, name: "Maya", openingBalance: "100" },
      context
    );
    const source = await call(accountsRouter.create, accountInput, context);

    const created = await call(
      transfersRouter.create,
      {
        destinationAccountId: destination.id,
        destinationAmount: "250",
        notes: "Monthly move",
        sourceAccountId: source.id,
        sourceAmount: "250",
        transactionDate: "2026-02-01",
      },
      context
    );

    expect(created).toMatchObject({
      destinationAccountId: destination.id,
      destinationAmount: "250.000000",
      notes: "Monthly move",
      sourceAccountId: source.id,
      sourceAmount: "250.000000",
    });
    expect(created.sourceAccount.name).toBe(source.name);
    expect(created.destinationAccount.name).toBe(destination.name);
    await expect(
      call(accountsRouter.get, { accountId: source.id }, context)
    ).resolves.toMatchObject({ balance: "750.000000" });
    await expect(
      call(accountsRouter.get, { accountId: destination.id }, context)
    ).resolves.toMatchObject({ balance: "350.000000" });

    const sourceHistory = await call(
      transactionsRouter.list,
      { accountIds: [source.id] },
      context
    );
    expect(sourceHistory).toMatchObject({
      items: [
        expect.objectContaining({
          accountId: source.id,
          categoryId: null,
          transfer: expect.objectContaining({ id: created.id }),
          transferSide: "source",
          type: null,
        }),
      ],
      total: 1,
    });

    const destinationHistory = await call(
      transactionsRouter.list,
      { accountIds: [destination.id] },
      context
    );
    expect(destinationHistory).toMatchObject({
      items: [expect.objectContaining({ transferSide: "destination" })],
      total: 1,
    });
  });

  it("updates both postings and deletes them together", async () => {
    const user = await signUpTestUser();
    const context = { context: await contextFor(user.headers) };
    const source = await call(accountsRouter.create, accountInput, context);
    const destination = await call(
      accountsRouter.create,
      { ...accountInput, name: "Maya", openingBalance: "100" },
      context
    );
    const created = await call(
      transfersRouter.create,
      {
        destinationAccountId: destination.id,
        destinationAmount: "200",
        sourceAccountId: source.id,
        sourceAmount: "200",
        transactionDate: "2026-02-01",
      },
      context
    );

    await call(
      transfersRouter.update,
      {
        destinationAccountId: destination.id,
        destinationAmount: "125",
        notes: "Corrected",
        sourceAccountId: source.id,
        sourceAmount: "125",
        transactionDate: "2026-02-02",
        transferId: created.id,
      },
      context
    );
    await expect(
      call(accountsRouter.get, { accountId: source.id }, context)
    ).resolves.toMatchObject({ balance: "875.000000" });
    await expect(
      call(accountsRouter.get, { accountId: destination.id }, context)
    ).resolves.toMatchObject({ balance: "225.000000" });

    await call(transfersRouter.delete, { transferId: created.id }, context);
    await expect(
      call(accountsRouter.get, { accountId: source.id }, context)
    ).resolves.toMatchObject({ balance: "1000.000000" });
    await expect(
      call(accountsRouter.get, { accountId: destination.id }, context)
    ).resolves.toMatchObject({ balance: "100.000000" });

    const postings = await getTestDb()
      .select({ id: financialTransaction.id })
      .from(financialTransaction)
      .where(eq(financialTransaction.transferId, created.id));
    expect(postings).toEqual([]);
    await expect(
      getTestDb()
        .select({ id: financialTransfer.id })
        .from(financialTransfer)
        .where(eq(financialTransfer.id, created.id))
    ).resolves.toEqual([]);
  });

  it("applies asset and liability transfer semantics and excludes transfers from type filters", async () => {
    const user = await signUpTestUser();
    const context = { context: await contextFor(user.headers) };
    const organizationId = await activeOrganizationId(user.headers);
    const source = await call(accountsRouter.create, accountInput, context);
    const card = await call(
      accountsRouter.create,
      {
        ...accountInput,
        accountClass: "liability" as const,
        accountType: "credit_card" as const,
        liquidity: null,
        name: "BPI Visa",
        openingBalance: "500",
      },
      context
    );
    const expenseCategoryId = await categoryIdFor(organizationId, "Groceries");

    await call(
      transactionsRouter.create,
      {
        accountId: source.id,
        amount: "10",
        categoryId: expenseCategoryId,
        paidStatus: "paid",
        tagIds: [],
        transactionDate: "2026-02-01",
      },
      context
    );
    const transfer = await call(
      transfersRouter.create,
      {
        destinationAccountId: card.id,
        destinationAmount: "100",
        sourceAccountId: source.id,
        sourceAmount: "100",
        transactionDate: "2026-02-02",
      },
      context
    );

    await expect(
      call(accountsRouter.get, { accountId: source.id }, context)
    ).resolves.toMatchObject({ balance: "890.000000" });
    await expect(
      call(accountsRouter.get, { accountId: card.id }, context)
    ).resolves.toMatchObject({ balance: "400.000000" });

    const expenseRows = await call(
      transactionsRouter.list,
      { types: ["expense"] },
      context
    );
    expect(expenseRows.items).toHaveLength(1);
    expect(expenseRows.items[0]?.transfer).toBeNull();
    expect(
      expenseRows.items.some(({ transferId }) => transferId === transfer.id)
    ).toBe(false);
  });

  it("rejects invalid and cross-household account references", async () => {
    const first = await signUpTestUser();
    const second = await signUpTestUser();
    const firstContext = { context: await contextFor(first.headers) };
    const secondContext = { context: await contextFor(second.headers) };
    const firstAccount = await call(
      accountsRouter.create,
      accountInput,
      firstContext
    );
    const secondAccount = await call(
      accountsRouter.create,
      accountInput,
      secondContext
    );
    const secondDestination = await call(
      accountsRouter.create,
      { ...accountInput, name: "Second Maya" },
      secondContext
    );

    expect(
      await codeOf(
        call(
          transfersRouter.create,
          {
            destinationAccountId: firstAccount.id,
            destinationAmount: "10",
            sourceAccountId: firstAccount.id,
            sourceAmount: "10",
            transactionDate: "2026-02-01",
          },
          firstContext
        )
      )
    ).toBe("BAD_REQUEST");
    expect(
      await codeOf(
        call(
          transfersRouter.create,
          {
            destinationAccountId: secondAccount.id,
            destinationAmount: "10",
            sourceAccountId: firstAccount.id,
            sourceAmount: "10",
            transactionDate: "2026-02-01",
          },
          firstContext
        )
      )
    ).toBe("NOT_FOUND");

    const created = await call(
      transfersRouter.create,
      {
        destinationAccountId: secondDestination.id,
        destinationAmount: "10",
        sourceAccountId: secondAccount.id,
        sourceAmount: "10",
        transactionDate: "2026-02-01",
      },
      secondContext
    );
    expect(
      await codeOf(
        call(transfersRouter.get, { transferId: created.id }, firstContext)
      )
    ).toBe("NOT_FOUND");
  });

  it("allows members to create transfers but keeps deletion restricted", async () => {
    const owner = await signUpTestUser();
    const memberUser = await signUpTestUser();
    const organizationId = await activeOrganizationId(owner.headers);
    await getTestDb().insert(member).values({
      organizationId,
      role: "member",
      userId: memberUser.user.id,
    });
    await setActiveOrganization(memberUser.user.id, organizationId);

    const ownerContext = { context: await contextFor(owner.headers) };
    const memberContext = { context: await contextFor(memberUser.headers) };
    const source = await call(
      accountsRouter.create,
      accountInput,
      ownerContext
    );
    const destination = await call(
      accountsRouter.create,
      { ...accountInput, name: "Maya" },
      ownerContext
    );
    const created = await call(
      transfersRouter.create,
      {
        destinationAccountId: destination.id,
        destinationAmount: "10",
        sourceAccountId: source.id,
        sourceAmount: "10",
        transactionDate: "2026-02-01",
      },
      memberContext
    );

    expect(
      await codeOf(
        call(transfersRouter.delete, { transferId: created.id }, memberContext)
      )
    ).toBe("FORBIDDEN");
  });
});
