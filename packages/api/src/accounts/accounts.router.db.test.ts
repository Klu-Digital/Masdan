import { auth } from "@masdan/auth";
import { member, session } from "@masdan/db/schema/auth";
import { category, financialAccount } from "@masdan/db/schema/index";
import { getSessionFor, getTestDb, signUpTestUser } from "@masdan/testing";
import { call, ORPCError } from "@orpc/server";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vite-plus/test";

import type { Context } from "../context";
import { transactionsRouter } from "../transactions/transactions.router";
import { accountsRouter } from "./accounts.router";

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
  openingBalance: "120000.00",
  openingBalanceDate: "2024-01-01",
  ownerMemberIds: [],
};

describe("financial accounts", () => {
  it("creates household accounts with a derived opening balance", async () => {
    const user = await signUpTestUser();
    const context = { context: await contextFor(user.headers) };

    const created = await call(accountsRouter.create, accountInput, context);

    expect(created).toMatchObject({
      accountClass: "asset",
      accountType: "bank",
      currencyCode: "PHP",
      name: "BPI Savings",
      openingBalanceDate: "2024-01-01",
    });
    expect(created.balance).toBe(created.openingBalance);

    const listed = await call(accountsRouter.list, undefined, context);
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({
      balance: created.balance,
      id: created.id,
    });
  });

  it("counts only postings on or after the opening-balance date", async () => {
    const user = await signUpTestUser();
    const context = { context: await contextFor(user.headers) };
    const account = await call(accountsRouter.create, accountInput, context);
    const organizationId = await activeOrganizationId(user.headers);
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
      throw new Error("Missing test category");
    }
    for (const transactionDate of ["2023-12-31", "2024-01-01", "2024-01-02"]) {
      await call(
        transactionsRouter.create,
        {
          accountId: account.id,
          amount: "100",
          categoryId: expense.id,
          paidStatus: "paid",
          tagIds: [],
          transactionDate,
        },
        context
      );
    }
    const current = await call(
      accountsRouter.get,
      { accountId: account.id },
      context
    );
    expect(current.balance).toBe("119800.000000");
  });

  it("supports snapshots and archive/restore without deleting the account", async () => {
    const user = await signUpTestUser();
    const context = { context: await contextFor(user.headers) };
    const created = await call(
      accountsRouter.create,
      { ...accountInput, name: "Maya" },
      context
    );

    const snapshot = await call(
      accountsRouter.saveSnapshot,
      {
        accountId: created.id,
        balance: "125000.50",
        effectiveDate: "2024-02-01",
      },
      context
    );
    expect(snapshot).toMatchObject({
      accountId: created.id,
      balance: "125000.500000",
      effectiveDate: "2024-02-01",
      source: "manual",
    });

    await call(accountsRouter.archive, { accountId: created.id }, context);
    await expect(
      call(accountsRouter.list, undefined, context)
    ).resolves.toEqual([]);
    await expect(
      call(accountsRouter.list, { includeArchived: true }, context)
    ).resolves.toHaveLength(1);

    const restored = await call(
      accountsRouter.restore,
      { accountId: created.id },
      context
    );
    expect(restored.archivedAt).toBeNull();
    await expect(
      call(accountsRouter.listSnapshots, { accountId: created.id }, context)
    ).resolves.toHaveLength(1);
  });

  it("creates and updates credit-card metadata as a liability", async () => {
    const user = await signUpTestUser();
    const context = { context: await contextFor(user.headers) };
    const cardInput = {
      ...accountInput,
      accountClass: "liability" as const,
      accountType: "credit_card" as const,
      cardLastFour: "0042",
      cardNetwork: "Visa",
      creditLimit: "100000",
      institution: "BPI",
      liquidity: null,
      name: "BPI Visa",
      paymentDueDay: 15,
      statementClosingDay: 25,
    };

    const created = await call(accountsRouter.create, cardInput, context);

    expect(created).toMatchObject({
      accountClass: "liability",
      accountType: "credit_card",
      cardLastFour: "0042",
      cardNetwork: "Visa",
      creditLimit: "100000.000000",
      institution: "BPI",
      paymentDueDay: 15,
      statementClosingDay: 25,
    });

    const updated = await call(
      accountsRouter.update,
      { ...cardInput, accountId: created.id, cardNetwork: "Mastercard" },
      context
    );
    expect(updated).toMatchObject({
      cardNetwork: "Mastercard",
      openingBalance: created.openingBalance,
    });

    const converted = await call(
      accountsRouter.update,
      {
        ...accountInput,
        accountId: created.id,
        cardLastFour: null,
        cardNetwork: null,
        creditLimit: null,
        paymentDueDay: null,
        statementClosingDay: null,
      },
      context
    );
    expect(converted).toMatchObject({
      accountType: "bank",
      cardLastFour: null,
      cardNetwork: null,
      creditLimit: null,
      paymentDueDay: null,
      statementClosingDay: null,
    });
  });

  it("preserves account class and currency after transactions and card statements exist", async () => {
    const user = await signUpTestUser();
    const context = { context: await contextFor(user.headers) };
    const cardInput = {
      ...accountInput,
      accountClass: "liability" as const,
      accountType: "credit_card" as const,
      liquidity: null,
      name: "Posted card",
    };
    const card = await call(accountsRouter.create, cardInput, context);
    const statement = await call(
      accountsRouter.createStatement,
      {
        accountId: card.id,
        periodEnd: "2026-02-28",
        periodStart: "2026-02-01",
        statementBalance: "100",
        statementDate: "2026-02-28",
      },
      context
    );
    expect(
      await codeOf(
        call(
          accountsRouter.update,
          { ...accountInput, accountId: card.id },
          context
        )
      )
    ).toBe("BAD_REQUEST");
    expect(
      await call(accountsRouter.listStatements, { accountId: card.id }, context)
    ).toEqual([expect.objectContaining({ id: statement.id })]);

    const account = await call(accountsRouter.create, accountInput, context);
    const organizationId = await activeOrganizationId(user.headers);
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
      throw new Error("Missing test category");
    }
    await call(
      transactionsRouter.create,
      {
        accountId: account.id,
        amount: "100",
        categoryId: expense.id,
        paidStatus: "paid",
        tagIds: [],
        transactionDate: "2026-02-01",
      },
      context
    );
    expect(
      await codeOf(
        call(
          accountsRouter.update,
          { ...accountInput, accountId: account.id, currencyCode: "USD" },
          context
        )
      )
    ).toBe("BAD_REQUEST");
    const unchanged = await call(
      accountsRouter.get,
      { accountId: account.id },
      context
    );
    expect(unchanged.currencyCode).toBe("PHP");
  });

  it("validates account class, type, currency, and ownership", async () => {
    const user = await signUpTestUser();
    const context = { context: await contextFor(user.headers) };

    expect(
      await codeOf(
        call(
          accountsRouter.create,
          {
            ...accountInput,
            accountClass: "liability",
            accountType: "bank",
          },
          context
        )
      )
    ).toBe("BAD_REQUEST");

    const invalidCard = {
      ...accountInput,
      accountClass: "liability" as const,
      accountType: "credit_card" as const,
      cardLastFour: "123",
      creditLimit: "-1",
      liquidity: null,
      paymentDueDay: 32,
      statementClosingDay: 0,
    };
    expect(
      await codeOf(call(accountsRouter.create, invalidCard, context))
    ).toBe("BAD_REQUEST");
    expect(
      await codeOf(
        call(
          accountsRouter.create,
          {
            ...accountInput,
            cardLastFour: "0042",
          },
          context
        )
      )
    ).toBe("BAD_REQUEST");

    expect(
      await codeOf(
        call(
          accountsRouter.create,
          { ...accountInput, currencyCode: "ZZZ" },
          context
        )
      )
    ).toBe("BAD_REQUEST");

    const otherUser = await signUpTestUser();
    const otherMember = await getTestDb()
      .select({ id: member.id })
      .from(member)
      .where(eq(member.userId, otherUser.user.id));
    expect(otherMember[0]).toBeDefined();
    expect(
      await codeOf(
        call(
          accountsRouter.create,
          { ...accountInput, ownerMemberIds: [otherMember[0]?.id ?? ""] },
          context
        )
      )
    ).toBe("BAD_REQUEST");
  });
});

describe("financial account permissions and isolation", () => {
  it("allows members to maintain accounts but restricts archive and restore", async () => {
    const owner = await signUpTestUser();
    const memberUser = await signUpTestUser();
    const organizationId = await activeOrganizationId(owner.headers);

    await getTestDb().insert(member).values({
      organizationId,
      role: "member",
      userId: memberUser.user.id,
    });
    await setActiveOrganization(memberUser.user.id, organizationId);

    const memberContext = { context: await contextFor(memberUser.headers) };
    const created = await call(
      accountsRouter.create,
      { ...accountInput, name: "Shared Account" },
      memberContext
    );
    await expect(
      call(
        accountsRouter.update,
        { ...accountInput, accountId: created.id, name: "Updated Account" },
        memberContext
      )
    ).resolves.toMatchObject({ name: "Updated Account" });
    expect(
      await codeOf(
        call(accountsRouter.archive, { accountId: created.id }, memberContext)
      )
    ).toBe("FORBIDDEN");
  });

  it("does not expose another household's accounts", async () => {
    const first = await signUpTestUser();
    const second = await signUpTestUser();
    const firstContext = { context: await contextFor(first.headers) };
    const secondContext = { context: await contextFor(second.headers) };
    const created = await call(
      accountsRouter.create,
      accountInput,
      firstContext
    );

    await expect(
      call(accountsRouter.list, undefined, secondContext)
    ).resolves.toEqual([]);
    expect(
      await codeOf(
        call(accountsRouter.get, { accountId: created.id }, secondContext)
      )
    ).toBe("NOT_FOUND");
    expect(
      await codeOf(
        call(accountsRouter.archive, { accountId: created.id }, secondContext)
      )
    ).toBe("NOT_FOUND");
  });

  it("keeps accounts scoped when switching to another household", async () => {
    const user = await signUpTestUser();
    const context = { context: await contextFor(user.headers) };
    const firstAccount = await call(
      accountsRouter.create,
      accountInput,
      context
    );
    const second = await auth.api.createOrganization({
      body: { name: "Second Household", slug: `second-${crypto.randomUUID()}` },
      headers: user.headers,
    });

    await setActiveOrganization(user.user.id, second.id);
    await expect(
      call(accountsRouter.list, undefined, {
        context: await contextFor(user.headers),
      })
    ).resolves.toEqual([]);

    const firstRows = await getTestDb()
      .select({ id: financialAccount.id })
      .from(financialAccount)
      .where(eq(financialAccount.id, firstAccount.id));
    expect(firstRows).toHaveLength(1);
  });
});
