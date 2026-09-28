import {
  category,
  financialTransaction,
  member,
  session,
  tag,
} from "@masdan/db/schema/index";
import { getSessionFor, getTestDb, signUpTestUser } from "@masdan/testing";
import { call, ORPCError } from "@orpc/server";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vite-plus/test";

import { accountsRouter } from "../accounts/accounts.router";
import type { Context } from "../context";
import { tagsRouter } from "../tags/tags.router";
import { transfersRouter } from "../transfers/transfers.router";
import { transactionsRouter } from "./transactions.router";

const fixture = async () => {
  const user = await signUpTestUser();
  const context = {
    context: {
      auth: null,
      db: getTestDb(),
      log: undefined,
      session: await getSessionFor(user.headers),
    } as unknown as Context,
  };
  const organizationId = context.context.session?.session.activeOrganizationId;
  if (!organizationId) {
    throw new Error("No household");
  }
  const account = await call(
    accountsRouter.create,
    {
      accountClass: "asset",
      accountType: "bank",
      liquidity: "liquid",
      name: "Bank",
      openingBalance: "1000",
      openingBalanceDate: "2026-01-01",
      ownerMemberIds: [],
    },
    context
  );
  const categories = await getTestDb()
    .select({ id: category.id, name: category.name })
    .from(category)
    .where(eq(category.organizationId, organizationId));
  const categoryId = (name: string) => {
    const id = categories.find((item) => item.name === name)?.id;
    if (!id) {
      throw new Error(`Missing ${name}`);
    }
    return id;
  };
  const create = (
    overrides: {
      tagIds?: string[];
      splits?: { amount: string; categoryId: string }[];
    } = {}
  ) =>
    call(
      transactionsRouter.create,
      {
        accountId: account.id,
        amount: "100",
        categoryId: categoryId("Groceries"),
        paidStatus: "paid",
        tagIds: [],
        transactionDate: "2026-01-05",
        ...overrides,
      },
      context
    );
  return { account, categoryId, context, create, organizationId, user };
};

const code = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    return error instanceof ORPCError ? error.code : error;
  }
};

describe("transactions.bulkUpdate", () => {
  it("changes selected categories and merges add/remove tags, leaving other rows alone", async () => {
    const f = await fixture();
    const a = await call(
      tagsRouter.create,
      { color: "green", name: "Old" },
      f.context
    );
    const b = await call(
      tagsRouter.create,
      { color: "blue", name: "New" },
      f.context
    );
    const first = await f.create({ tagIds: [a.id] });
    const second = await f.create({ tagIds: [a.id] });
    const untouched = await f.create();
    const result = await call(
      transactionsRouter.bulkUpdate,
      {
        addTagIds: [b.id],
        categoryId: f.categoryId("Food & Dining"),
        removeTagIds: [a.id],
        transactionIds: [first.id, second.id],
      },
      f.context
    );
    expect(result).toEqual({
      categoryKept: [],
      skipped: [],
      updated: [first.id, second.id],
    });
    for (const id of result.updated) {
      const row = await call(
        transactionsRouter.get,
        { transactionId: id },
        f.context
      );
      expect(row.categoryId).toBe(f.categoryId("Food & Dining"));
      expect(row.tags.map((item) => item.id)).toEqual([b.id]);
    }
    const unchanged = await call(
      transactionsRouter.get,
      { transactionId: untouched.id },
      f.context
    );
    expect(unchanged.categoryId).toBe(f.categoryId("Groceries"));
  });

  it("skips archived and foreign rows without writing to another household", async () => {
    const f = await fixture();
    const other = await fixture();
    const archived = await f.create();
    const foreign = await other.create();
    await call(
      transactionsRouter.archive,
      { transactionId: archived.id },
      f.context
    );
    expect(
      await call(
        transactionsRouter.bulkUpdate,
        {
          categoryId: f.categoryId("Food & Dining"),
          transactionIds: [archived.id, foreign.id],
        },
        f.context
      )
    ).toEqual({
      categoryKept: [],
      skipped: [
        { reason: "archived", transactionId: archived.id },
        { reason: "not_found", transactionId: foreign.id },
      ],
      updated: [],
    });
    const otherRow = await call(
      transactionsRouter.get,
      { transactionId: foreign.id },
      other.context
    );
    expect(otherRow.categoryId).toBe(other.categoryId("Groceries"));
  });

  it("preserves split categories on tag edits and skips category-only edits", async () => {
    const f = await fixture();
    const addedTag = await call(
      tagsRouter.create,
      { color: "blue", name: "New" },
      f.context
    );
    const split = await f.create({
      splits: [
        { amount: "60", categoryId: f.categoryId("Groceries") },
        { amount: "40", categoryId: f.categoryId("Food & Dining") },
      ],
    });
    const categoryId = f.categoryId("Food & Dining");
    const skipped = await call(
      transactionsRouter.bulkUpdate,
      { categoryId, transactionIds: [split.id] },
      f.context
    );
    expect(skipped.skipped).toEqual([
      { reason: "split", transactionId: split.id },
    ]);
    const updated = await call(
      transactionsRouter.bulkUpdate,
      { addTagIds: [addedTag.id], categoryId, transactionIds: [split.id] },
      f.context
    );
    expect(updated).toEqual({
      categoryKept: [split.id],
      skipped: [],
      updated: [split.id],
    });
    const result = await call(
      transactionsRouter.get,
      { transactionId: split.id },
      f.context
    );
    expect(result.categoryId).toBe(f.categoryId("Groceries"));
    expect(result.splits.map((item) => item.categoryId)).toEqual([
      f.categoryId("Groceries"),
      categoryId,
    ]);
    expect(result.tags.map((item) => item.id)).toEqual([addedTag.id]);
  });

  it("rejects invalid inputs and inactive relations before writing", async () => {
    const f = await fixture();
    const row = await f.create();
    const archivedTag = await call(
      tagsRouter.create,
      { color: "green", name: "Old" },
      f.context
    );
    await getTestDb()
      .update(tag)
      .set({ archivedAt: new Date() })
      .where(eq(tag.id, archivedTag.id));
    for (const input of [
      { categoryId: f.categoryId("Food & Dining"), transactionIds: [] },
      { transactionIds: [row.id] },
      {
        addTagIds: [archivedTag.id],
        removeTagIds: [archivedTag.id],
        transactionIds: [row.id],
      },
      { addTagIds: [archivedTag.id], transactionIds: [row.id] },
    ]) {
      expect(
        await code(call(transactionsRouter.bulkUpdate, input, f.context))
      ).toBe("BAD_REQUEST");
    }
    await getTestDb()
      .update(category)
      .set({ archivedAt: new Date() })
      .where(
        and(
          eq(category.id, f.categoryId("Food & Dining")),
          eq(category.organizationId, f.organizationId)
        )
      );
    expect(
      await code(
        call(
          transactionsRouter.bulkUpdate,
          {
            categoryId: f.categoryId("Food & Dining"),
            transactionIds: [row.id],
          },
          f.context
        )
      )
    ).toBe("BAD_REQUEST");
    const unchanged = await call(
      transactionsRouter.get,
      { transactionId: row.id },
      f.context
    );
    expect(unchanged.categoryId).toBe(f.categoryId("Groceries"));
  });

  it("skips one invalid row without rolling back other rows", async () => {
    const f = await fixture();
    const invalid = await f.create();
    const secondAccount = await call(
      accountsRouter.create,
      {
        accountClass: "asset",
        accountType: "bank",
        liquidity: "liquid",
        name: "Second bank",
        openingBalance: "0",
        openingBalanceDate: "2026-01-01",
        ownerMemberIds: [],
      },
      f.context
    );
    const valid = await call(
      transactionsRouter.create,
      {
        accountId: secondAccount.id,
        amount: "100",
        categoryId: f.categoryId("Groceries"),
        paidStatus: "paid",
        tagIds: [],
        transactionDate: "2026-01-05",
      },
      f.context
    );
    await call(accountsRouter.archive, { accountId: f.account.id }, f.context);
    const result = await call(
      transactionsRouter.bulkUpdate,
      {
        categoryId: f.categoryId("Food & Dining"),
        transactionIds: [invalid.id, valid.id],
      },
      f.context
    );
    expect(result.updated).toEqual([valid.id]);
    expect(result.skipped).toEqual([
      expect.objectContaining({ reason: "invalid", transactionId: invalid.id }),
    ]);
    const changed = await call(
      transactionsRouter.get,
      { transactionId: valid.id },
      f.context
    );
    expect(changed.categoryId).toBe(f.categoryId("Food & Dining"));
  });

  it("skips transfer postings", async () => {
    const f = await fixture();
    const destination = await call(
      accountsRouter.create,
      {
        accountClass: "asset",
        accountType: "bank",
        liquidity: "liquid",
        name: "Second bank",
        openingBalance: "0",
        openingBalanceDate: "2026-01-01",
        ownerMemberIds: [],
      },
      f.context
    );
    const transfer = await call(
      transfersRouter.create,
      {
        destinationAccountId: destination.id,
        destinationAmount: "20",
        sourceAccountId: f.account.id,
        sourceAmount: "20",
        transactionDate: "2026-01-05",
      },
      f.context
    );
    const [posting] = await getTestDb()
      .select({ id: financialTransaction.id })
      .from(financialTransaction)
      .where(eq(financialTransaction.transferId, transfer.id));
    if (!posting) {
      throw new Error("Missing transfer posting");
    }
    const result = await call(
      transactionsRouter.bulkUpdate,
      { categoryId: f.categoryId("Groceries"), transactionIds: [posting.id] },
      f.context
    );
    expect(result.skipped).toEqual([
      { reason: "transfer", transactionId: posting.id },
    ]);
  });

  it("keeps matching rule provenance for tag adds and drops it for recategorization", async () => {
    const f = await fixture();
    const row = await f.create();
    await getTestDb()
      .update(financialTransaction)
      .set({
        ruleApplication: {
          categoryId: f.categoryId("Groceries"),
          conditions: {
            accountId: null,
            amountMax: null,
            amountMin: null,
            text: null,
            type: null,
          },
          ruleId: row.id,
          ruleName: "Groceries rule",
          tagIds: [],
        },
      })
      .where(eq(financialTransaction.id, row.id));
    const newTag = await call(
      tagsRouter.create,
      { color: "blue", name: "New" },
      f.context
    );
    await call(
      transactionsRouter.bulkUpdate,
      { addTagIds: [newTag.id], transactionIds: [row.id] },
      f.context
    );
    const tagged = await call(
      transactionsRouter.get,
      { transactionId: row.id },
      f.context
    );
    expect(tagged.ruleApplication?.ruleName).toBe("Groceries rule");
    await call(
      transactionsRouter.bulkUpdate,
      { categoryId: f.categoryId("Food & Dining"), transactionIds: [row.id] },
      f.context
    );
    const changed = await call(
      transactionsRouter.get,
      { transactionId: row.id },
      f.context
    );
    expect(changed.ruleApplication).toBeNull();
  });

  it("forbids viewer updates", async () => {
    const f = await fixture();
    const viewer = await signUpTestUser();
    await getTestDb().insert(member).values({
      organizationId: f.organizationId,
      role: "viewer",
      userId: viewer.user.id,
    });
    await getTestDb()
      .update(session)
      .set({ activeOrganizationId: f.organizationId })
      .where(eq(session.userId, viewer.user.id));
    const viewerContext = {
      context: {
        auth: null,
        db: getTestDb(),
        log: undefined,
        session: await getSessionFor(viewer.headers),
      } as unknown as Context,
    };
    const row = await f.create();
    expect(
      await code(
        call(
          transactionsRouter.bulkUpdate,
          {
            categoryId: f.categoryId("Food & Dining"),
            transactionIds: [row.id],
          },
          viewerContext
        )
      )
    ).toBe("FORBIDDEN");
  });
});
