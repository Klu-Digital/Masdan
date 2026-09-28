import {
  category,
  financialTransaction,
  member,
  session,
} from "@masdan/db/schema/index";
import { getSessionFor, getTestDb, signUpTestUser } from "@masdan/testing";
import { call, ORPCError } from "@orpc/server";
import { and, count, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { accountsRouter } from "../accounts/accounts.router";
import type * as GatewayModule from "../ai/gateway";
import { categoriesRouter } from "../categories/categories.router";
import type { Context } from "../context";
import { ai } from "./quick-entry.golden";
import { transactionsRouter } from "./transactions.router";

const completeJson = vi.hoisted(() => vi.fn());
const isAiConfigured = vi.hoisted(() => vi.fn());

// The gateway is the only thing faked: resolution, scoping and create are real.
vi.mock("../ai/gateway", async (importOriginal) => ({
  ...(await importOriginal<typeof GatewayModule>()),
  completeJson,
  isAiConfigured,
}));

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

const transactionCount = async (organizationId: string): Promise<number> => {
  const [row] = await getTestDb()
    .select({ total: count() })
    .from(financialTransaction)
    .where(eq(financialTransaction.organizationId, organizationId));
  return row?.total ?? 0;
};

const bankInput = {
  accountClass: "asset" as const,
  accountType: "bank" as const,
  liquidity: "liquid" as const,
  name: "BPI Savings",
  openingBalance: "10000",
  openingBalanceDate: "2026-01-01",
  ownerMemberIds: [],
};

const cardInput = {
  accountClass: "liability" as const,
  accountType: "credit_card" as const,
  cardLastFour: "4821",
  cardNetwork: "Mastercard",
  creditLimit: "100000",
  institution: "Metrobank",
  liquidity: null,
  name: "Metrobank Titanium",
  openingBalance: "0",
  openingBalanceDate: "2026-01-01",
  ownerMemberIds: [],
};

/** A signed-up household with a card and a bank account. */
const household = async () => {
  const user = await signUpTestUser();
  const context = { context: await contextFor(user.headers) };
  const organizationId = await activeOrganizationId(user.headers);
  const card = await call(accountsRouter.create, cardInput, context);
  const bank = await call(accountsRouter.create, bankInput, context);
  return { bank, card, context, organizationId, user };
};

const EXAMPLE = "mj date - dinner at jollibee - 400 - metrobank mc";

beforeEach(() => {
  completeJson.mockReset();
  isAiConfigured.mockReset().mockReturnValue(true);
});

describe("transactions.parseQuickEntry", () => {
  it("resolves the ticket's example to input the create procedure accepts", async () => {
    const home = await household();
    completeJson.mockResolvedValue(
      ai({
        account: "metrobank mc",
        amount: "400",
        category: "Food & Dining",
        kind: "expense",
      })
    );

    const parsed = await call(
      transactionsRouter.parseQuickEntry,
      { text: EXAMPLE },
      home.context
    );

    expect(parsed.ai).toBe("ok");
    expect(parsed.issues).toEqual([]);
    expect(parsed.input).toMatchObject({
      accountId: home.card.id,
      amount: "400",
      categoryId: await categoryIdFor(home.organizationId, "Food & Dining"),
      notes: "mj date - dinner at jollibee",
      paidStatus: "paid",
    });
    // Parsing is read-only; creating is the client's separate, validated call.
    expect(await transactionCount(home.organizationId)).toBe(0);

    const created = await call(
      transactionsRouter.create,
      parsed.input ?? {},
      home.context
    );
    expect(created).toMatchObject({
      accountId: home.card.id,
      amount: "400.000000",
      categoryName: "Food & Dining",
      currencyCode: "PHP",
    });
  });

  it("hands the model names only — never identifiers", async () => {
    const home = await household();
    completeJson.mockResolvedValue(ai({}));

    await call(
      transactionsRouter.parseQuickEntry,
      { text: EXAMPLE },
      home.context
    );

    const [request] = completeJson.mock.calls[0] ?? [];
    const prompt = JSON.stringify(request);
    expect(prompt).toContain("Metrobank Titanium");
    expect(prompt).not.toContain(home.card.id);
    expect(prompt).not.toContain(home.organizationId);
  });

  it("only matches the caller's own household", async () => {
    const home = await household();
    const other = await household();
    await call(
      accountsRouter.create,
      { ...bankInput, accountType: "e_wallet", name: "GCash" },
      other.context
    );
    completeJson.mockResolvedValue(
      ai({ account: "gcash", amount: "400", category: "Food & Dining" })
    );

    const parsed = await call(
      transactionsRouter.parseQuickEntry,
      { text: "dinner 400 gcash" },
      home.context
    );

    expect(parsed.input).toBeNull();
    expect(parsed.prefill.accountId).toBeNull();
    expect(parsed.issues).toContainEqual(
      expect.objectContaining({ field: "accountId", reason: "missing" })
    );
  });

  it("never matches archived accounts or categories", async () => {
    const home = await household();
    const groceries = await categoryIdFor(home.organizationId, "Groceries");
    await call(
      accountsRouter.archive,
      { accountId: home.bank.id },
      home.context
    );
    await call(
      categoriesRouter.archive,
      { categoryId: groceries },
      home.context
    );
    completeJson.mockResolvedValue(
      ai({ account: "bpi savings", amount: "500", category: "Groceries" })
    );

    const parsed = await call(
      transactionsRouter.parseQuickEntry,
      { text: "groceries 500 bpi savings" },
      home.context
    );

    expect(parsed.input).toBeNull();
    expect(parsed.prefill).toMatchObject({ categoryId: null });
    expect(parsed.prefill.accountId).not.toBe(home.bank.id);
  });

  it.each([
    ["an error", () => completeJson.mockRejectedValue(new Error("503"))],
    [
      "a timeout",
      () =>
        completeJson.mockRejectedValue(
          new DOMException("The operation timed out", "TimeoutError")
        ),
    ],
  ])("falls back to the prefilled form on %s", async (_, fail) => {
    const home = await household();
    fail();

    const parsed = await call(
      transactionsRouter.parseQuickEntry,
      { text: EXAMPLE },
      home.context
    );

    expect(parsed.ai).toBe("failed");
    expect(parsed.input).toBeNull();
    expect(parsed.prefill).toMatchObject({
      accountId: home.card.id,
      amount: "400",
    });
    expect(await transactionCount(home.organizationId)).toBe(0);
  });

  it("does not call out when the feature's model is unset", async () => {
    const home = await household();
    isAiConfigured.mockReturnValue(false);

    const parsed = await call(
      transactionsRouter.parseQuickEntry,
      { text: EXAMPLE },
      home.context
    );

    expect(parsed.ai).toBe("unavailable");
    expect(parsed.input).toBeNull();
    expect(completeJson).not.toHaveBeenCalled();
  });

  it("requires permission to create transactions", async () => {
    const owner = await household();
    const viewer = await signUpTestUser();
    await getTestDb().insert(member).values({
      organizationId: owner.organizationId,
      role: "viewer",
      userId: viewer.user.id,
    });
    await getTestDb()
      .update(session)
      .set({ activeOrganizationId: owner.organizationId })
      .where(eq(session.userId, viewer.user.id));

    expect(
      await codeOf(
        call(
          transactionsRouter.parseQuickEntry,
          { text: EXAMPLE },
          { context: await contextFor(viewer.headers) }
        )
      )
    ).toBe("FORBIDDEN");
    expect(completeJson).not.toHaveBeenCalled();
  });

  it("rejects empty and overlong text before any model call", async () => {
    const home = await household();

    for (const text of ["   ", "x".repeat(301)]) {
      expect(
        await codeOf(
          call(transactionsRouter.parseQuickEntry, { text }, home.context)
        )
      ).toBe("BAD_REQUEST");
    }
    expect(completeJson).not.toHaveBeenCalled();
  });
});

describe("a quick-entry payload tampered with before create", () => {
  it("cannot bypass create's schema, scoping or category rules", async () => {
    const home = await household();
    const other = await household();
    completeJson.mockResolvedValue(
      ai({
        account: "metrobank mc",
        amount: "400",
        category: "Food & Dining",
      })
    );
    const { input } = await call(
      transactionsRouter.parseQuickEntry,
      { text: EXAMPLE },
      home.context
    );
    if (!input) {
      throw new Error("Expected a complete parse");
    }
    const create = (payload: Record<string, unknown>) =>
      codeOf(call(transactionsRouter.create, payload as never, home.context));

    expect(await create({ ...input, accountId: other.card.id })).toBe(
      "NOT_FOUND"
    );
    expect(
      await create({
        ...input,
        categoryId: await categoryIdFor(other.organizationId, "Food & Dining"),
      })
    ).toBe("BAD_REQUEST");
    expect(
      await create({
        ...input,
        categoryId: await categoryIdFor(home.organizationId, "Salary"),
        splits: [
          {
            amount: "400",
            categoryId: await categoryIdFor(home.organizationId, "Groceries"),
          },
        ],
      })
    ).toBe("BAD_REQUEST");
    expect(await create({ ...input, amount: "-400" })).toBe("BAD_REQUEST");
    expect(await create({ ...input, amount: "4e2" })).toBe("BAD_REQUEST");
    expect(await create({ ...input, transactionDate: "yesterday" })).toBe(
      "BAD_REQUEST"
    );
    expect(await create({ ...input, currencyCode: "USD" })).toBe("BAD_REQUEST");
    expect(
      await create({ ...input, organizationId: other.organizationId })
    ).toBe("BAD_REQUEST");
    expect(await transactionCount(home.organizationId)).toBe(0);
    expect(await transactionCount(other.organizationId)).toBe(0);
  });
});
