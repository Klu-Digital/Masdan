import type { Database } from "@masdan/db";
import {
  category,
  financialAccount,
  financialTransaction,
  financialTransactionTag,
  tag,
} from "@masdan/db/schema/index";
import {
  getSessionFor,
  getTestDb,
  signUpTestUser,
  whileHolding,
} from "@masdan/testing";
import { call, ORPCError } from "@orpc/server";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vite-plus/test";

import { accountsRouter } from "../accounts/accounts.router";
import type { Context } from "../context";
import { transactionsRouter } from "../transactions/transactions.router";
import { transfersRouter } from "../transfers/transfers.router";

/**
 * Two transactions racing on one ledger row: the first holds its locks open
 * while the second runs, which is the interleaving the row locks exist for.
 */

interface Household {
  accountId: string;
  expenseCategoryId: string;
  headers: Headers;
  organizationId: string;
}

const contextOn = async (household: Household, db: Database) => ({
  context: {
    auth: null,
    db,
    log: undefined,
    session: await getSessionFor(household.headers),
  } as unknown as Context,
});

const signUpHousehold = async (): Promise<Household> => {
  const { headers } = await signUpTestUser();
  const current = await getSessionFor(headers);
  const organizationId = current?.session.activeOrganizationId ?? "";
  const [account] = await getTestDb()
    .insert(financialAccount)
    .values({
      accountClass: "asset",
      accountType: "bank",
      currencyCode: "PHP",
      name: "BPI Savings",
      openingBalance: "1000",
      openingBalanceDate: "2026-01-01",
      organizationId,
    })
    .returning({ id: financialAccount.id });
  const [groceries] = await getTestDb()
    .select({ id: category.id })
    .from(category)
    .where(
      and(
        eq(category.organizationId, organizationId),
        eq(category.name, "Groceries")
      )
    );
  return {
    accountId: account?.id ?? "",
    expenseCategoryId: groceries?.id ?? "",
    headers,
    organizationId,
  };
};

const expense = (household: Household) => ({
  accountId: household.accountId,
  amount: "250",
  categoryId: household.expenseCategoryId,
  paidStatus: "paid" as const,
  tagIds: [],
  transactionDate: "2026-02-01",
});

const createTag = async (household: Household, name: string) => {
  const [row] = await getTestDb()
    .insert(tag)
    .values({ color: "sky", name, organizationId: household.organizationId })
    .returning({ id: tag.id });
  return row?.id ?? "";
};

const accountUpdate = (household: Household, currencyCode: string) => ({
  accountClass: "asset" as const,
  accountId: household.accountId,
  accountType: "bank" as const,
  currencyCode,
  name: "BPI Savings",
  openingBalance: "1000",
  openingBalanceDate: "2026-01-01",
});

const caught = async (promise: Promise<unknown>): Promise<unknown> => {
  try {
    return await promise;
  } catch (error) {
    return error;
  }
};

const postedCurrencies = (accountId: string) =>
  getTestDb()
    .select({ currencyCode: financialTransaction.currencyCode })
    .from(financialTransaction)
    .where(eq(financialTransaction.accountId, accountId));

describe("transaction edits under concurrency", () => {
  it("an edit waits for a concurrent archive and then refuses it", async () => {
    const household = await signUpHousehold();
    const own = await contextOn(household, getTestDb());
    const created = await call(
      transactionsRouter.create,
      expense(household),
      own
    );

    const error = await caught(
      whileHolding(
        getTestDb(),
        async (tx) =>
          call(
            transactionsRouter.archive,
            { transactionId: created.id },
            await contextOn(household, tx)
          ),
        () =>
          call(
            transactionsRouter.update,
            { ...expense(household), amount: "300", transactionId: created.id },
            own
          )
      )
    );

    expect(error).toBeInstanceOf(ORPCError);
    expect((error as ORPCError<string, unknown>).message).toBe(
      "Restore the transaction before editing it"
    );
  });

  it("two bulk tag edits on one transaction keep both tags", async () => {
    const household = await signUpHousehold();
    const own = await contextOn(household, getTestDb());
    const created = await call(
      transactionsRouter.create,
      expense(household),
      own
    );
    const first = await createTag(household, "Shared");
    const second = await createTag(household, "Reimbursable");

    await whileHolding(
      getTestDb(),
      async (tx) =>
        call(
          transactionsRouter.bulkUpdate,
          { addTagIds: [first], transactionIds: [created.id] },
          await contextOn(household, tx)
        ),
      () =>
        call(
          transactionsRouter.bulkUpdate,
          { addTagIds: [second], transactionIds: [created.id] },
          own
        )
    );

    const tags = await getTestDb()
      .select({ tagId: financialTransactionTag.tagId })
      .from(financialTransactionTag)
      .where(eq(financialTransactionTag.transactionId, created.id));
    expect(tags.map(({ tagId }) => tagId).toSorted()).toEqual(
      [first, second].toSorted()
    );
  });
});

describe("account currency changes under concurrency", () => {
  it("a currency change waits for an in-flight posting and then refuses", async () => {
    const household = await signUpHousehold();
    const own = await contextOn(household, getTestDb());

    const error = await caught(
      whileHolding(
        getTestDb(),
        async (tx) =>
          call(
            transactionsRouter.create,
            expense(household),
            await contextOn(household, tx)
          ),
        () => call(accountsRouter.update, accountUpdate(household, "USD"), own)
      )
    );

    expect(error).toBeInstanceOf(ORPCError);
    expect((error as ORPCError<string, unknown>).code).toBe("BAD_REQUEST");
    expect(await postedCurrencies(household.accountId)).toEqual([
      { currencyCode: "PHP" },
    ]);
  });

  it("a posting waits for an in-flight currency change and takes the new currency", async () => {
    const household = await signUpHousehold();
    const own = await contextOn(household, getTestDb());

    await whileHolding(
      getTestDb(),
      async (tx) =>
        call(
          accountsRouter.update,
          accountUpdate(household, "USD"),
          await contextOn(household, tx)
        ),
      () => call(transactionsRouter.create, expense(household), own)
    );

    expect(await postedCurrencies(household.accountId)).toEqual([
      { currencyCode: "USD" },
    ]);
  });

  it("a transfer waits for an in-flight currency change and takes the new currency", async () => {
    const household = await signUpHousehold();
    const own = await contextOn(household, getTestDb());
    const destination = await call(
      accountsRouter.create,
      {
        accountClass: "asset",
        accountType: "cash",
        currencyCode: "USD",
        name: "Wallet",
        openingBalanceDate: "2026-01-01",
      },
      own
    );

    await whileHolding(
      getTestDb(),
      async (tx) =>
        call(
          accountsRouter.update,
          accountUpdate(household, "USD"),
          await contextOn(household, tx)
        ),
      () =>
        call(
          transfersRouter.create,
          {
            destinationAccountId: destination.id,
            destinationAmount: "100",
            sourceAccountId: household.accountId,
            sourceAmount: "100",
            transactionDate: "2026-02-01",
          },
          own
        )
    );

    expect(await postedCurrencies(household.accountId)).toEqual([
      { currencyCode: "USD" },
    ]);
  });
});
