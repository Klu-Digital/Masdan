import { relations } from "@masdan/db/relations";
import { category, member, session } from "@masdan/db/schema/index";
import {
  getSessionFor,
  getTestDb,
  getTestPool,
  signUpTestUser,
} from "@masdan/testing";
import { call, ORPCError } from "@orpc/server";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { describe, expect, it } from "vite-plus/test";

import { accountsRouter } from "../accounts/accounts.router";
import { categoriesRouter } from "../categories/categories.router";
import type { Context } from "../context";
import { tagsRouter } from "../tags/tags.router";
import { transfersRouter } from "../transfers/transfers.router";
import { transactionListValues } from "./schema";
import { listTransactions } from "./transactions.queries";
import { transactionsRouter } from "./transactions.router";

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

describe("transactions lifecycle", () => {
  it("derives balances through income, expense, edits, archive, and restore", async () => {
    const user = await signUpTestUser();
    const context = { context: await contextFor(user.headers) };
    const organizationId = await activeOrganizationId(user.headers);
    const account = await call(accountsRouter.create, accountInput, context);
    const expenseCategoryId = await categoryIdFor(organizationId, "Groceries");
    const incomeCategoryId = await categoryIdFor(organizationId, "Salary");
    const createdTag = await call(
      tagsRouter.create,
      { color: "green", name: "Tracked" },
      context
    );

    const expense = await call(
      transactionsRouter.create,
      {
        accountId: account.id,
        amount: "125.123456",
        categoryId: expenseCategoryId,
        notes: "Weekly groceries",
        paidStatus: "paid",
        tagIds: [createdTag.id],
        transactionDate: "2026-01-05",
      },
      context
    );
    expect(expense).toMatchObject({
      amount: "125.123456",
      currencyCode: "PHP",
      paidStatus: "paid",
    });
    expect(expense.tags).toHaveLength(1);

    await expect(
      call(accountsRouter.get, { accountId: account.id }, context)
    ).resolves.toMatchObject({ balance: "874.876544" });

    const updated = await call(
      transactionsRouter.update,
      {
        accountId: account.id,
        amount: "200",
        categoryId: incomeCategoryId,
        notes: null,
        paidStatus: "unpaid",
        tagIds: [],
        transactionDate: "2026-01-06",
        transactionId: expense.id,
      },
      context
    );
    expect(updated).toMatchObject({
      categoryId: incomeCategoryId,
      paidStatus: "unpaid",
    });
    await expect(
      call(accountsRouter.get, { accountId: account.id }, context)
    ).resolves.toMatchObject({ balance: "1200.000000" });

    await call(
      transactionsRouter.archive,
      { transactionId: expense.id },
      context
    );
    await expect(
      call(accountsRouter.get, { accountId: account.id }, context)
    ).resolves.toMatchObject({ balance: "1000.000000" });
    await expect(
      call(transactionsRouter.list, {}, context)
    ).resolves.toMatchObject({ items: [] });

    await call(
      transactionsRouter.restore,
      { transactionId: expense.id },
      context
    );
    await expect(
      call(accountsRouter.get, { accountId: account.id }, context)
    ).resolves.toMatchObject({ balance: "1200.000000" });
    await expect(
      call(transactionsRouter.get, { transactionId: expense.id }, context)
    ).resolves.toMatchObject({ amount: "200.000000", archivedAt: null });
  });

  it("applies liability sign semantics and derives type from category", async () => {
    const user = await signUpTestUser();
    const context = { context: await contextFor(user.headers) };
    const organizationId = await activeOrganizationId(user.headers);
    const account = await call(
      accountsRouter.create,
      {
        ...accountInput,
        accountClass: "liability" as const,
        accountType: "credit_card" as const,
        liquidity: null,
        name: "BPI Visa",
      },
      context
    );
    const expenseCategoryId = await categoryIdFor(organizationId, "Groceries");
    const incomeCategoryId = await categoryIdFor(organizationId, "Salary");

    const expense = await call(
      transactionsRouter.create,
      {
        accountId: account.id,
        amount: "50",
        categoryId: expenseCategoryId,
        paidStatus: "unpaid",
        tagIds: [],
        transactionDate: "2026-01-05",
      },
      context
    );
    expect(expense.currencyCode).toBe("PHP");
    await expect(
      call(accountsRouter.get, { accountId: account.id }, context)
    ).resolves.toMatchObject({ balance: "1050.000000" });

    await expect(
      call(
        transactionsRouter.create,
        {
          accountId: account.id,
          amount: "20",
          categoryId: incomeCategoryId,
          paidStatus: "paid",
          tagIds: [],
          transactionDate: "2026-01-06",
        },
        context
      )
    ).resolves.toMatchObject({ type: "income" });
  });
});

describe("split transactions", () => {
  it("reconciles allocations without changing the parent account posting", async () => {
    const user = await signUpTestUser();
    const context = { context: await contextFor(user.headers) };
    const organizationId = await activeOrganizationId(user.headers);
    const account = await call(accountsRouter.create, accountInput, context);
    const groceriesId = await categoryIdFor(organizationId, "Groceries");
    const foodId = await categoryIdFor(organizationId, "Food & Dining");

    const created = await call(
      transactionsRouter.create,
      {
        accountId: account.id,
        amount: "125.123456",
        categoryId: groceriesId,
        paidStatus: "paid",
        splits: [
          { amount: "100.123456", categoryId: groceriesId },
          { amount: "25", categoryId: foodId },
        ],
        tagIds: [],
        transactionDate: "2026-01-01",
      },
      context
    );

    expect(created.splits).toMatchObject([
      { amount: "100.123456", categoryId: groceriesId, sortOrder: 0 },
      { amount: "25.000000", categoryId: foodId, sortOrder: 1 },
    ]);
    await expect(
      call(accountsRouter.get, { accountId: account.id }, context)
    ).resolves.toMatchObject({ balance: "874.876544" });
    await expect(
      call(transactionsRouter.list, {}, context)
    ).resolves.toMatchObject({
      items: [
        expect.objectContaining({ id: created.id, splits: expect.any(Array) }),
      ],
    });

    expect(
      await codeOf(
        call(
          categoriesRouter.update,
          {
            categoryId: foodId,
            color: "rose",
            icon: "🍽️",
            name: "Food & Dining",
            type: "income",
          },
          context
        )
      )
    ).toBe("BAD_REQUEST");

    for (const filter of [
      { categoryIds: [foodId] },
      { search: "Food & Dining" },
    ]) {
      const matching = await call(transactionsRouter.list, filter, context);
      expect(matching).toMatchObject({ total: 1 });
      expect(matching.items[0]?.id).toBe(created.id);
    }

    const updated = await call(
      transactionsRouter.update,
      {
        accountId: account.id,
        amount: "125.123456",
        categoryId: groceriesId,
        paidStatus: "paid",
        splits: [
          { amount: "75.123456", categoryId: groceriesId },
          { amount: "50", categoryId: foodId },
        ],
        tagIds: [],
        transactionDate: "2026-01-01",
        transactionId: created.id,
      },
      context
    );

    expect(updated.splits).toHaveLength(2);
    await expect(
      call(accountsRouter.get, { accountId: account.id }, context)
    ).resolves.toMatchObject({ balance: "874.876544" });

    const normalized = await call(
      transactionsRouter.update,
      {
        accountId: account.id,
        amount: "125.123456",
        categoryId: groceriesId,
        paidStatus: "paid",
        splits: [{ amount: "125.123456", categoryId: foodId }],
        tagIds: [],
        transactionDate: "2026-01-01",
        transactionId: created.id,
      },
      context
    );

    expect(normalized).toMatchObject({ categoryId: foodId, splits: [] });
    await expect(
      call(accountsRouter.get, { accountId: account.id }, context)
    ).resolves.toMatchObject({ balance: "874.876544" });
  });

  it("rejects unreconciled and mixed-type allocations atomically", async () => {
    const user = await signUpTestUser();
    const context = { context: await contextFor(user.headers) };
    const organizationId = await activeOrganizationId(user.headers);
    const account = await call(accountsRouter.create, accountInput, context);
    const expenseCategoryId = await categoryIdFor(organizationId, "Groceries");
    const secondExpenseCategoryId = await categoryIdFor(
      organizationId,
      "Food & Dining"
    );
    const incomeCategoryId = await categoryIdFor(organizationId, "Salary");

    expect(
      await codeOf(
        call(
          transactionsRouter.create,
          {
            accountId: account.id,
            amount: "100",
            categoryId: expenseCategoryId,
            paidStatus: "paid",
            splits: [
              { amount: "60", categoryId: expenseCategoryId },
              { amount: "39", categoryId: secondExpenseCategoryId },
            ],
            tagIds: [],
            transactionDate: "2026-01-01",
          },
          context
        )
      )
    ).toBe("BAD_REQUEST");

    expect(
      await codeOf(
        call(
          transactionsRouter.create,
          {
            accountId: account.id,
            amount: "100",
            categoryId: expenseCategoryId,
            paidStatus: "paid",
            splits: [
              { amount: "50", categoryId: expenseCategoryId },
              { amount: "50", categoryId: incomeCategoryId },
            ],
            tagIds: [],
            transactionDate: "2026-01-01",
          },
          context
        )
      )
    ).toBe("BAD_REQUEST");

    const created = await call(
      transactionsRouter.create,
      {
        accountId: account.id,
        amount: "100",
        categoryId: expenseCategoryId,
        paidStatus: "paid",
        splits: [
          { amount: "50", categoryId: expenseCategoryId },
          { amount: "50", categoryId: secondExpenseCategoryId },
        ],
        tagIds: [],
        transactionDate: "2026-01-01",
      },
      context
    );

    expect(
      await codeOf(
        call(
          transactionsRouter.update,
          {
            accountId: account.id,
            amount: "100",
            categoryId: expenseCategoryId,
            paidStatus: "paid",
            splits: [
              { amount: "50", categoryId: expenseCategoryId },
              { amount: "49", categoryId: secondExpenseCategoryId },
            ],
            tagIds: [],
            transactionDate: "2026-01-01",
            transactionId: created.id,
          },
          context
        )
      )
    ).toBe("BAD_REQUEST");

    await expect(
      call(transactionsRouter.get, { transactionId: created.id }, context)
    ).resolves.toMatchObject({
      amount: "100.000000",
      splits: [
        expect.objectContaining({ amount: "50.000000" }),
        expect.objectContaining({ amount: "50.000000" }),
      ],
    });
    await expect(
      call(accountsRouter.get, { accountId: account.id }, context)
    ).resolves.toMatchObject({ balance: "900.000000" });
  });

  it("keeps split rows household-scoped", async () => {
    const first = await signUpTestUser();
    const second = await signUpTestUser();
    const firstContext = { context: await contextFor(first.headers) };
    const secondContext = { context: await contextFor(second.headers) };
    const firstOrganizationId = await activeOrganizationId(first.headers);
    const secondOrganizationId = await activeOrganizationId(second.headers);
    const firstAccount = await call(
      accountsRouter.create,
      accountInput,
      firstContext
    );
    const firstCategoryId = await categoryIdFor(
      firstOrganizationId,
      "Groceries"
    );
    const secondCategoryId = await categoryIdFor(
      secondOrganizationId,
      "Groceries"
    );

    expect(
      await codeOf(
        call(
          transactionsRouter.create,
          {
            accountId: firstAccount.id,
            amount: "100",
            categoryId: firstCategoryId,
            paidStatus: "paid",
            splits: [
              { amount: "50", categoryId: firstCategoryId },
              { amount: "50", categoryId: secondCategoryId },
            ],
            tagIds: [],
            transactionDate: "2026-01-01",
          },
          firstContext
        )
      )
    ).toBe("BAD_REQUEST");

    await expect(
      call(transactionsRouter.list, {}, secondContext)
    ).resolves.toMatchObject({ items: [], total: 0 });
  });
});

describe("transaction list", () => {
  it("combines filters and returns paginated metadata", async () => {
    const user = await signUpTestUser();
    const context = { context: await contextFor(user.headers) };
    const organizationId = await activeOrganizationId(user.headers);
    const account = await call(accountsRouter.create, accountInput, context);
    const expenseCategoryId = await categoryIdFor(organizationId, "Groceries");
    const incomeCategoryId = await categoryIdFor(organizationId, "Salary");
    const tagA = await call(
      tagsRouter.create,
      { color: "green", name: "List target" },
      context
    );
    const tagB = await call(
      tagsRouter.create,
      { color: "blue", name: "List other" },
      context
    );

    const matching = await call(
      transactionsRouter.create,
      {
        accountId: account.id,
        amount: "125.50",
        categoryId: expenseCategoryId,
        notes: "Target groceries",
        paidStatus: "unpaid",
        tagIds: [tagA.id],
        transactionDate: "2026-02-15",
      },
      context
    );
    await call(
      transactionsRouter.create,
      {
        accountId: account.id,
        amount: "300",
        categoryId: expenseCategoryId,
        notes: "Different note",
        paidStatus: "paid",
        tagIds: [tagB.id],
        transactionDate: "2026-02-15",
      },
      context
    );
    await call(
      transactionsRouter.create,
      {
        accountId: account.id,
        amount: "50",
        categoryId: incomeCategoryId,
        notes: "Target income",
        paidStatus: "unpaid",
        tagIds: [tagA.id],
        transactionDate: "2026-02-15",
      },
      context
    );

    const result = await call(
      transactionsRouter.list,
      {
        accountIds: [account.id],
        categoryIds: [expenseCategoryId],
        dateFrom: "2026-02-01",
        dateTo: "2026-02-28",
        page: 1,
        pageSize: 1,
        paidStatuses: ["unpaid"],
        search: "target",
        tagIds: [tagA.id],
        types: ["expense"],
      },
      context
    );

    expect(result).toMatchObject({
      page: 1,
      pageSize: 1,
      total: 1,
      totalPages: 1,
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      id: matching.id,
      notes: "Target groceries",
    });
  });

  it("keeps amount-sorted pages deterministic", async () => {
    const user = await signUpTestUser();
    const context = { context: await contextFor(user.headers) };
    const organizationId = await activeOrganizationId(user.headers);
    const account = await call(accountsRouter.create, accountInput, context);
    const categoryId = await categoryIdFor(organizationId, "Groceries");

    for (const note of ["First", "Second", "Third"]) {
      await call(
        transactionsRouter.create,
        {
          accountId: account.id,
          amount: "100",
          categoryId,
          notes: note,
          paidStatus: "paid",
          tagIds: [],
          transactionDate: "2026-03-01",
        },
        context
      );
    }

    const input = {
      accountIds: [account.id],
      page: 1,
      pageSize: 2,
      sortBy: "amount" as const,
      sortDirection: "desc" as const,
    };
    const firstPage = await call(transactionsRouter.list, input, context);
    const repeatedFirstPage = await call(
      transactionsRouter.list,
      input,
      context
    );
    const secondPage = await call(
      transactionsRouter.list,
      { ...input, page: 2 },
      context
    );

    expect(firstPage.items.map(({ id }) => id)).toEqual(
      repeatedFirstPage.items.map(({ id }) => id)
    );
    expect(firstPage.items).toHaveLength(2);
    expect(secondPage.items).toHaveLength(1);
    expect(
      new Set([
        ...firstPage.items.map(({ id }) => id),
        ...secondPage.items.map(({ id }) => id),
      ]).size
    ).toBe(3);
  });

  it("loads a page's tags, splits and transfers in a fixed number of queries", async () => {
    const user = await signUpTestUser();
    const context = { context: await contextFor(user.headers) };
    const organizationId = await activeOrganizationId(user.headers);
    const account = await call(accountsRouter.create, accountInput, context);
    const wallet = await call(
      accountsRouter.create,
      { ...accountInput, name: "Wallet" },
      context
    );
    const groceriesId = await categoryIdFor(organizationId, "Groceries");
    const foodId = await categoryIdFor(organizationId, "Food & Dining");
    const tracked = await call(
      tagsRouter.create,
      { color: "green", name: "Tracked" },
      context
    );

    for (const day of ["01", "02", "03"]) {
      await call(
        transactionsRouter.create,
        {
          accountId: account.id,
          amount: "30",
          categoryId: groceriesId,
          paidStatus: "paid",
          splits: [
            { amount: "20", categoryId: groceriesId },
            { amount: "10", categoryId: foodId },
          ],
          tagIds: [tracked.id],
          transactionDate: `2026-03-${day}`,
        },
        context
      );
    }
    const transfer = await call(
      transfersRouter.create,
      {
        destinationAccountId: wallet.id,
        destinationAmount: "50",
        sourceAccountId: account.id,
        sourceAmount: "50",
        transactionDate: "2026-03-04",
      },
      context
    );

    let queries = 0;
    const countingDb = drizzle({
      client: getTestPool(),
      logger: {
        logQuery: () => {
          queries += 1;
        },
      },
      relations,
    });
    const listed = async (pageSize: number) => {
      queries = 0;
      const page = await listTransactions(
        countingDb,
        organizationId,
        transactionListValues.parse({ pageSize })
      );
      return { page, queries };
    };

    const one = await listed(1);
    const all = await listed(100);
    // Rows and count, then one query each for tags, splits and transfers.
    expect(one.queries).toBe(5);
    expect(all.queries).toBe(5);

    expect(all.page.items).toHaveLength(4);
    const [transferRow, ...entries] = all.page.items;
    expect(transferRow).toMatchObject({
      splits: [],
      tags: [],
      transfer: {
        destinationAccount: { id: wallet.id, name: "Wallet" },
        id: transfer.id,
        sourceAccount: { id: account.id, name: "BPI Savings" },
      },
    });
    for (const entry of entries) {
      expect(entry.transfer).toBeNull();
      expect(entry.tags).toEqual([
        { archivedAt: null, color: "green", id: tracked.id, name: "Tracked" },
      ]);
      expect(entry.splits).toMatchObject([
        { amount: "20.000000", categoryId: groceriesId, sortOrder: 0 },
        { amount: "10.000000", categoryId: foodId, sortOrder: 1 },
      ]);
    }
  });
});

describe("transaction validation and isolation", () => {
  it("rejects cross-household relations and keeps archived rows readable", async () => {
    const first = await signUpTestUser();
    const second = await signUpTestUser();
    const firstContext = { context: await contextFor(first.headers) };
    const secondContext = { context: await contextFor(second.headers) };
    const firstOrganizationId = await activeOrganizationId(first.headers);
    const firstAccount = await call(
      accountsRouter.create,
      accountInput,
      firstContext
    );
    const secondAccount = await call(
      accountsRouter.create,
      { ...accountInput, name: "Other Bank" },
      secondContext
    );
    const firstCategoryId = await categoryIdFor(
      firstOrganizationId,
      "Groceries"
    );
    const secondTag = await call(
      tagsRouter.create,
      { color: "blue", name: "Private" },
      secondContext
    );

    expect(
      await codeOf(
        call(
          transactionsRouter.create,
          {
            accountId: firstAccount.id,
            amount: "10",
            categoryId: firstCategoryId,
            paidStatus: "paid",
            tagIds: [secondTag.id],
            transactionDate: "2026-01-01",
          },
          firstContext
        )
      )
    ).toBe("BAD_REQUEST");
    expect(
      await codeOf(
        call(
          transactionsRouter.create,
          {
            accountId: secondAccount.id,
            amount: "10",
            categoryId: firstCategoryId,
            paidStatus: "paid",
            tagIds: [],
            transactionDate: "2026-01-01",
          },
          firstContext
        )
      )
    ).toBe("NOT_FOUND");

    const created = await call(
      transactionsRouter.create,
      {
        accountId: firstAccount.id,
        amount: "10",
        categoryId: firstCategoryId,
        paidStatus: "paid",
        tagIds: [],
        transactionDate: "2026-01-01",
      },
      firstContext
    );
    await call(
      transactionsRouter.archive,
      { transactionId: created.id },
      firstContext
    );
    await expect(
      call(transactionsRouter.list, { includeArchived: true }, firstContext)
    ).resolves.toMatchObject({
      items: [expect.objectContaining({ id: created.id })],
      total: 1,
    });
    await expect(
      call(transactionsRouter.list, { includeArchived: true }, secondContext)
    ).resolves.toMatchObject({ items: [], total: 0 });
    expect(
      await codeOf(
        call(
          transactionsRouter.get,
          { transactionId: created.id },
          secondContext
        )
      )
    ).toBe("NOT_FOUND");
  });

  it("allows members to create and update but restricts archive and restore", async () => {
    const owner = await signUpTestUser();
    const memberUser = await signUpTestUser();
    const organizationId = await activeOrganizationId(owner.headers);
    await getTestDb().insert(member).values({
      organizationId,
      role: "member",
      userId: memberUser.user.id,
    });
    await setActiveOrganization(memberUser.user.id, organizationId);

    const context = { context: await contextFor(memberUser.headers) };
    const account = await call(accountsRouter.create, accountInput, context);
    const categoryId = await categoryIdFor(organizationId, "Groceries");
    const created = await call(
      transactionsRouter.create,
      {
        accountId: account.id,
        amount: "10",
        categoryId,
        paidStatus: "paid",
        tagIds: [],
        transactionDate: "2026-01-01",
      },
      context
    );

    expect(
      await codeOf(
        call(transactionsRouter.archive, { transactionId: created.id }, context)
      )
    ).toBe("FORBIDDEN");
  });
});
