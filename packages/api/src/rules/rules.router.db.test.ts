import {
  category,
  financialTransaction,
  member,
  session,
} from "@masdan/db/schema/index";
import { getSessionFor, getTestDb, signUpTestUser } from "@masdan/testing";
import { call, ORPCError } from "@orpc/server";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vite-plus/test";

import { accountsRouter } from "../accounts/accounts.router";
import { categoriesRouter } from "../categories/categories.router";
import type { Context } from "../context";
import { tagsRouter } from "../tags/tags.router";
import { transactionsRouter } from "../transactions/transactions.router";
import { transfersRouter } from "../transfers/transfers.router";
import { rulesRouter } from "./rules.router";

const caught = async (promise: Promise<unknown>): Promise<unknown> => {
  try {
    return await promise;
  } catch (error) {
    return error;
  }
};

const codeOf = async (
  promise: Promise<unknown>
): Promise<string | undefined> => {
  const error = await caught(promise);
  return error instanceof ORPCError ? error.code : undefined;
};

interface Household {
  context: { context: Context };
  organizationId: string;
  userId: string;
}

const contextFor = async (headers: Headers): Promise<{ context: Context }> => ({
  context: {
    auth: null,
    db: getTestDb(),
    log: undefined,
    session: await getSessionFor(headers),
  } as unknown as Context,
});

const signUpHousehold = async (): Promise<Household> => {
  const { headers, user } = await signUpTestUser();
  const current = await getSessionFor(headers);
  const organizationId = current?.session.activeOrganizationId;
  if (!organizationId) {
    throw new Error("Test user has no active household");
  }
  return {
    context: await contextFor(headers),
    organizationId,
    userId: user.id,
  };
};

/** A second user acting inside `household` with `role`. */
const joinAs = async (household: Household, role: string) => {
  const { headers, user } = await signUpTestUser();
  await getTestDb().insert(member).values({
    organizationId: household.organizationId,
    role,
    userId: user.id,
  });
  await getTestDb()
    .update(session)
    .set({ activeOrganizationId: household.organizationId })
    .where(eq(session.userId, user.id));
  return contextFor(headers);
};

const categoryId = async (household: Household, name: string) => {
  const [row] = await getTestDb()
    .select({ id: category.id })
    .from(category)
    .where(
      and(
        eq(category.organizationId, household.organizationId),
        eq(category.name, name)
      )
    );
  if (!row) {
    throw new Error(`Missing category ${name}`);
  }
  return row.id;
};

const createAccount = (household: Household, name = "BPI Savings") =>
  call(
    accountsRouter.create,
    {
      accountClass: "asset",
      accountType: "bank",
      liquidity: "liquid",
      name,
      openingBalance: "1000",
      openingBalanceDate: "2026-01-01",
      ownerMemberIds: [],
    },
    household.context
  );

const NO_CONDITIONS = {
  accountId: null,
  amountMax: null,
  amountMin: null,
  text: null,
  type: null,
};

const rideRule = async (household: Household, tagIds: string[] = []) => ({
  actions: {
    categoryId: await categoryId(household, "Transport"),
    tagIds,
  },
  conditions: {
    ...NO_CONDITIONS,
    text: { operator: "contains" as const, value: "grab" },
    type: "expense" as const,
  },
  name: "Grab rides",
});

describe("rules lifecycle", () => {
  it("creates, edits, disables, reorders and deletes household rules", async () => {
    const household = await signUpHousehold();
    const commute = await call(
      tagsRouter.create,
      { color: "sky", name: "Commute" },
      household.context
    );

    const first = await call(
      rulesRouter.create,
      await rideRule(household, [commute.id]),
      household.context
    );
    expect(first).toMatchObject({
      actions: { tagIds: [commute.id] },
      category: { name: "Transport" },
      conditions: { text: { operator: "contains", value: "grab" } },
      enabled: true,
      name: "Grab rides",
      position: 0,
      problem: null,
    });

    const second = await call(
      rulesRouter.create,
      {
        actions: { categoryId: null, tagIds: [commute.id] },
        conditions: { ...NO_CONDITIONS, amountMax: "50", amountMin: "10.5" },
        name: "Small fares",
      },
      household.context
    );
    expect(second.position).toBe(1);
    expect(second.conditions).toMatchObject({
      amountMax: "50",
      amountMin: "10.5",
    });

    const edited = await call(
      rulesRouter.update,
      {
        ...(await rideRule(household)),
        name: "Grab and Angkas",
        ruleId: first.id,
      },
      household.context
    );
    expect(edited).toMatchObject({
      actions: { tagIds: [] },
      name: "Grab and Angkas",
    });

    const disabled = await call(
      rulesRouter.setEnabled,
      { enabled: false, ruleId: first.id },
      household.context
    );
    expect(disabled.enabled).toBe(false);

    const reordered = await call(
      rulesRouter.reorder,
      { ruleIds: [second.id, first.id] },
      household.context
    );
    expect(reordered.map(({ id, position }) => [id, position])).toEqual([
      [second.id, 0],
      [first.id, 1],
    ]);
    expect(
      await codeOf(
        call(rulesRouter.reorder, { ruleIds: [second.id] }, household.context)
      )
    ).toBe("CONFLICT");

    await call(rulesRouter.delete, { ruleId: first.id }, household.context);
    await expect(
      call(rulesRouter.list, undefined, household.context)
    ).resolves.toMatchObject([{ id: second.id }]);
  });

  it("rejects rules without conditions or actions, and mismatched categories", async () => {
    const household = await signUpHousehold();
    const valid = await rideRule(household);

    expect(
      await codeOf(
        call(
          rulesRouter.create,
          { ...valid, conditions: NO_CONDITIONS },
          household.context
        )
      )
    ).toBe("BAD_REQUEST");
    expect(
      await codeOf(
        call(
          rulesRouter.create,
          { ...valid, actions: { categoryId: null, tagIds: [] } },
          household.context
        )
      )
    ).toBe("BAD_REQUEST");
    expect(
      await codeOf(
        call(
          rulesRouter.create,
          { ...valid, conditions: { ...valid.conditions, type: null } },
          household.context
        )
      )
    ).toBe("BAD_REQUEST");
    expect(
      await codeOf(
        call(
          rulesRouter.create,
          { ...valid, conditions: { ...valid.conditions, type: "income" } },
          household.context
        )
      )
    ).toBe("BAD_REQUEST");
    expect(
      await codeOf(
        call(
          rulesRouter.create,
          {
            ...valid,
            conditions: {
              ...valid.conditions,
              amountMax: "5",
              amountMin: "10",
            },
          },
          household.context
        )
      )
    ).toBe("BAD_REQUEST");
  });

  it("grades rule access by household role", async () => {
    const owner = await signUpHousehold();
    const memberContext = await joinAs(owner, "member");
    const viewerContext = await joinAs(owner, "viewer");

    const created = await call(
      rulesRouter.create,
      await rideRule(owner),
      memberContext
    );
    await expect(
      call(
        rulesRouter.setEnabled,
        { enabled: false, ruleId: created.id },
        memberContext
      )
    ).resolves.toMatchObject({ enabled: false });
    expect(
      await codeOf(
        call(rulesRouter.delete, { ruleId: created.id }, memberContext)
      )
    ).toBe("FORBIDDEN");

    await expect(
      call(rulesRouter.list, undefined, viewerContext)
    ).resolves.toHaveLength(1);
    expect(
      await codeOf(
        call(rulesRouter.create, await rideRule(owner), viewerContext)
      )
    ).toBe("FORBIDDEN");
    expect(
      await codeOf(
        call(
          rulesRouter.setEnabled,
          { enabled: true, ruleId: created.id },
          viewerContext
        )
      )
    ).toBe("FORBIDDEN");

    await call(rulesRouter.delete, { ruleId: created.id }, owner.context);
  });
});

describe("rules household isolation", () => {
  it("rejects another household's category, tags and account", async () => {
    const home = await signUpHousehold();
    const other = await signUpHousehold();
    const otherTag = await call(
      tagsRouter.create,
      { color: "red", name: "Theirs" },
      other.context
    );
    const otherAccount = await createAccount(other);
    const valid = await rideRule(home);

    expect(
      await codeOf(
        call(
          rulesRouter.create,
          {
            ...valid,
            actions: {
              categoryId: await categoryId(other, "Transport"),
              tagIds: [],
            },
          },
          home.context
        )
      )
    ).toBe("BAD_REQUEST");
    expect(
      await codeOf(
        call(
          rulesRouter.create,
          { ...valid, actions: { categoryId: null, tagIds: [otherTag.id] } },
          home.context
        )
      )
    ).toBe("BAD_REQUEST");
    expect(
      await codeOf(
        call(
          rulesRouter.create,
          {
            ...valid,
            conditions: { ...valid.conditions, accountId: otherAccount.id },
          },
          home.context
        )
      )
    ).toBe("NOT_FOUND");

    const created = await call(rulesRouter.create, valid, home.context);
    expect(
      await codeOf(
        call(
          rulesRouter.update,
          {
            ...valid,
            actions: { categoryId: null, tagIds: [otherTag.id] },
            ruleId: created.id,
          },
          home.context
        )
      )
    ).toBe("BAD_REQUEST");
  });

  it("hides one household's rules from another", async () => {
    const home = await signUpHousehold();
    const other = await signUpHousehold();
    const created = await call(
      rulesRouter.create,
      await rideRule(home),
      home.context
    );

    await expect(
      call(rulesRouter.list, undefined, other.context)
    ).resolves.toEqual([]);
    expect(
      await codeOf(
        call(
          rulesRouter.update,
          { ...(await rideRule(other)), ruleId: created.id },
          other.context
        )
      )
    ).toBe("NOT_FOUND");
    expect(
      await codeOf(
        call(
          rulesRouter.setEnabled,
          { enabled: false, ruleId: created.id },
          other.context
        )
      )
    ).toBe("NOT_FOUND");
    expect(
      await codeOf(
        call(rulesRouter.delete, { ruleId: created.id }, other.context)
      )
    ).toBe("NOT_FOUND");
    expect(
      await codeOf(
        call(rulesRouter.reorder, { ruleIds: [created.id] }, other.context)
      )
    ).toBe("CONFLICT");
    await expect(
      call(rulesRouter.list, undefined, home.context)
    ).resolves.toMatchObject([{ enabled: true, id: created.id }]);
  });

  it("never matches or applies rules to another household's transaction", async () => {
    const home = await signUpHousehold();
    const other = await signUpHousehold();
    const rule = await call(
      rulesRouter.create,
      await rideRule(home),
      home.context
    );
    const account = await createAccount(other);
    const theirs = await call(
      transactionsRouter.create,
      {
        accountId: account.id,
        amount: "200",
        categoryId: await categoryId(other, "Groceries"),
        notes: "Grab ride",
        paidStatus: "paid",
        transactionDate: "2026-02-01",
      },
      other.context
    );

    expect(
      await codeOf(
        call(
          rulesRouter.matchTransaction,
          { transactionId: theirs.id },
          home.context
        )
      )
    ).toBe("NOT_FOUND");
    expect(
      await codeOf(
        call(
          rulesRouter.applyToTransaction,
          { ruleId: rule.id, transactionId: theirs.id },
          home.context
        )
      )
    ).toBe("NOT_FOUND");
    await expect(
      call(
        rulesRouter.matchTransaction,
        { transactionId: theirs.id },
        other.context
      )
    ).resolves.toEqual({ eligibility: null, match: null });
  });
});

describe("applying rules to a transaction", () => {
  const setUp = async () => {
    const household = await signUpHousehold();
    const account = await createAccount(household);
    const trip = await call(
      tagsRouter.create,
      { color: "amber", name: "Trip" },
      household.context
    );
    const commute = await call(
      tagsRouter.create,
      { color: "sky", name: "Commute" },
      household.context
    );
    const transaction = await call(
      transactionsRouter.create,
      {
        accountId: account.id,
        amount: "245.5",
        categoryId: await categoryId(household, "Groceries"),
        notes: "GRAB*RIDE Makati",
        paidStatus: "unpaid",
        tagIds: [trip.id],
        transactionDate: "2026-02-03",
      },
      household.context
    );
    return { account, commute, household, transaction, trip };
  };

  it("previews why the first rule matched and applies only what it configures", async () => {
    const { account, commute, household, transaction, trip } = await setUp();
    await call(
      rulesRouter.create,
      {
        actions: { categoryId: null, tagIds: [trip.id] },
        conditions: { ...NO_CONDITIONS, type: "expense" },
        name: "Every expense",
      },
      household.context
    );
    const grab = await call(
      rulesRouter.create,
      await rideRule(household, [commute.id]),
      household.context
    );
    const [everyExpense] = await call(
      rulesRouter.list,
      undefined,
      household.context
    );
    await call(
      rulesRouter.reorder,
      { ruleIds: [grab.id, everyExpense?.id ?? ""] },
      household.context
    );

    const preview = await call(
      rulesRouter.matchTransaction,
      { transactionId: transaction.id },
      household.context
    );
    expect(preview).toMatchObject({
      eligibility: null,
      match: {
        addedTagIds: [commute.id],
        categoryChanges: true,
        checks: [
          { field: "description", matched: true },
          { field: "type", matched: true },
        ],
        rule: { id: grab.id, name: "Grab rides" },
      },
    });

    const applied = await call(
      rulesRouter.applyToTransaction,
      { ruleId: grab.id, transactionId: transaction.id },
      household.context
    );
    expect(applied).toMatchObject({
      accountId: account.id,
      amount: "245.500000",
      categoryId: await categoryId(household, "Transport"),
      categoryName: "Transport",
      notes: "GRAB*RIDE Makati",
      paidStatus: "unpaid",
      ruleApplication: {
        categoryId: await categoryId(household, "Transport"),
        conditions: {
          text: { operator: "contains", value: "grab" },
          type: "expense",
        },
        ruleId: grab.id,
        ruleName: "Grab rides",
        tagIds: [commute.id],
      },
      transactionDate: "2026-02-03",
    });
    expect(applied.tags.map(({ name }) => name)).toEqual(["Commute", "Trip"]);

    // Provenance outlives the rule: deleting it keeps the explanation.
    await call(rulesRouter.delete, { ruleId: grab.id }, household.context);
    await expect(
      call(
        transactionsRouter.get,
        { transactionId: transaction.id },
        household.context
      )
    ).resolves.toMatchObject({ ruleApplication: { ruleName: "Grab rides" } });
  });

  it("keeps provenance through unrelated edits and drops it once a manual edit overrides the rule", async () => {
    const { account, commute, household, transaction } = await setUp();
    const grab = await call(
      rulesRouter.create,
      await rideRule(household, [commute.id]),
      household.context
    );
    const applied = await call(
      rulesRouter.applyToTransaction,
      { ruleId: grab.id, transactionId: transaction.id },
      household.context
    );
    const edit = {
      accountId: account.id,
      amount: "300",
      categoryId: applied.categoryId ?? "",
      notes: applied.notes,
      paidStatus: "paid" as const,
      tagIds: applied.tags.map(({ id }) => id),
      transactionDate: applied.transactionDate,
      transactionId: transaction.id,
    };

    const amountOnly = await call(
      transactionsRouter.update,
      edit,
      household.context
    );
    expect(amountOnly.ruleApplication?.ruleId).toBe(grab.id);

    const recategorized = await call(
      transactionsRouter.update,
      { ...edit, categoryId: await categoryId(household, "Shopping") },
      household.context
    );
    expect(recategorized.ruleApplication).toBeNull();
  });

  it("never applies a disabled rule, or one whose category was archived", async () => {
    const { household, transaction } = await setUp();
    const grab = await call(
      rulesRouter.create,
      await rideRule(household),
      household.context
    );
    await call(
      rulesRouter.setEnabled,
      { enabled: false, ruleId: grab.id },
      household.context
    );
    await expect(
      call(
        rulesRouter.matchTransaction,
        { transactionId: transaction.id },
        household.context
      )
    ).resolves.toEqual({ eligibility: null, match: null });
    expect(
      await codeOf(
        call(
          rulesRouter.applyToTransaction,
          { ruleId: grab.id, transactionId: transaction.id },
          household.context
        )
      )
    ).toBe("CONFLICT");

    await call(
      rulesRouter.setEnabled,
      { enabled: true, ruleId: grab.id },
      household.context
    );
    await call(
      categoriesRouter.archive,
      { categoryId: await categoryId(household, "Transport") },
      household.context
    );
    const [listed] = await call(rulesRouter.list, undefined, household.context);
    expect(listed?.problem).toBe("Its category “Transport” is archived");
    await expect(
      call(
        rulesRouter.matchTransaction,
        { transactionId: transaction.id },
        household.context
      )
    ).resolves.toEqual({ eligibility: null, match: null });

    const [unchanged] = await getTestDb()
      .select({ ruleApplication: financialTransaction.ruleApplication })
      .from(financialTransaction)
      .where(eq(financialTransaction.id, transaction.id));
    expect(unchanged?.ruleApplication).toBeNull();
  });

  it("leaves transfers and split transactions alone", async () => {
    const { account, household } = await setUp();
    const wallet = await createAccount(household, "GCash");
    await call(
      rulesRouter.create,
      await rideRule(household),
      household.context
    );

    const transfer = await call(
      transfersRouter.create,
      {
        destinationAccountId: wallet.id,
        destinationAmount: "100",
        notes: "Grab top-up",
        sourceAccountId: account.id,
        sourceAmount: "100",
        transactionDate: "2026-02-04",
      },
      household.context
    );
    const [posting] = await getTestDb()
      .select({ id: financialTransaction.id })
      .from(financialTransaction)
      .where(eq(financialTransaction.transferId, transfer.id));
    await expect(
      call(
        rulesRouter.matchTransaction,
        { transactionId: posting?.id ?? "" },
        household.context
      )
    ).resolves.toMatchObject({
      eligibility: "Rules don’t apply to transfers.",
      match: null,
    });

    const split = await call(
      transactionsRouter.create,
      {
        accountId: account.id,
        amount: "300",
        categoryId: await categoryId(household, "Groceries"),
        notes: "Grab mart and ride",
        paidStatus: "paid",
        splits: [
          {
            amount: "200",
            categoryId: await categoryId(household, "Groceries"),
          },
          {
            amount: "100",
            categoryId: await categoryId(household, "Transport"),
          },
        ],
        transactionDate: "2026-02-04",
      },
      household.context
    );
    await expect(
      call(
        rulesRouter.matchTransaction,
        { transactionId: split.id },
        household.context
      )
    ).resolves.toMatchObject({
      eligibility: "Split transactions keep the categories on their splits.",
    });
  });
});
