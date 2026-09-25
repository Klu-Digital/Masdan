import { member, session } from "@masdan/db/schema/auth";
import { financialAccount } from "@masdan/db/schema/index";
import { getSessionFor, getTestDb, signUpTestUser } from "@masdan/testing";
import { call, ORPCError } from "@orpc/server";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vite-plus/test";

import type { Context } from "../context";
import { accountsRouter } from "./accounts.router";

const contextFor = async (headers: Headers): Promise<Context> =>
  ({
    auth: null,
    db: getTestDb(),
    log: undefined,
    session: await getSessionFor(headers),
  }) as unknown as Context;

const failureOf = async (
  promise: Promise<unknown>
): Promise<{ code?: string; message?: string }> => {
  try {
    await promise;
  } catch (error) {
    return error instanceof ORPCError
      ? { code: error.code, message: error.message }
      : {};
  }
  return {};
};

const codeOf = async (
  promise: Promise<unknown>
): Promise<string | undefined> => {
  const failure = await failureOf(promise);
  return failure.code;
};

const activeOrganizationId = async (headers: Headers): Promise<string> => {
  const currentSession = await getSessionFor(headers);
  const organizationId = currentSession?.session.activeOrganizationId;
  if (!organizationId) {
    throw new Error("Test user has no active household");
  }
  return organizationId;
};

const joinHousehold = async (
  userId: string,
  organizationId: string,
  role: "member" | "viewer"
): Promise<void> => {
  await getTestDb().insert(member).values({ organizationId, role, userId });
  await getTestDb()
    .update(session)
    .set({ activeOrganizationId: organizationId })
    .where(eq(session.userId, userId));
};

const cardInput = {
  accountClass: "liability" as const,
  accountType: "credit_card" as const,
  cardLastFour: "0042",
  cardNetwork: "Mastercard",
  creditLimit: "100000",
  institution: "BPI",
  liquidity: null,
  name: "BPI Gold",
  openingBalance: "25000",
  openingBalanceDate: "2026-01-01",
  ownerMemberIds: [],
  paymentDueDay: 15,
  statementClosingDay: 25,
};

const GOLD_REWARDS = "bpi-gold-rewards-mastercard";

const finance = (account: {
  accountClass: string;
  availableCredit: string | null;
  balance: string;
  creditLimit: string | null;
  includeInNetWorth: boolean;
  utilization: string | null;
}) => ({
  accountClass: account.accountClass,
  availableCredit: account.availableCredit,
  balance: account.balance,
  creditLimit: account.creditLimit,
  includeInNetWorth: account.includeInNetWorth,
  utilization: account.utilization,
});

describe("credit card product identity", () => {
  it("stores an optional product key and reads it back through get and list", async () => {
    const user = await signUpTestUser();
    const context = { context: await contextFor(user.headers) };

    const created = await call(
      accountsRouter.create,
      { ...cardInput, cardProductKey: GOLD_REWARDS },
      context
    );
    expect(created.cardProductKey).toBe(GOLD_REWARDS);

    await expect(
      call(accountsRouter.get, { accountId: created.id }, context)
    ).resolves.toMatchObject({ cardProductKey: GOLD_REWARDS });
    const [listed] = await call(accountsRouter.list, undefined, context);
    expect(listed?.cardProductKey).toBe(GOLD_REWARDS);
  });

  it("leaves balance, liability and utilization exactly as a generic card's", async () => {
    const user = await signUpTestUser();
    const context = { context: await contextFor(user.headers) };

    const generic = await call(accountsRouter.create, cardInput, context);
    const product = await call(
      accountsRouter.create,
      { ...cardInput, cardProductKey: GOLD_REWARDS },
      context
    );

    expect(finance(product)).toEqual(finance(generic));
    expect(finance(product)).toEqual({
      accountClass: "liability",
      availableCredit: "75000.000000",
      balance: "25000.000000",
      creditLimit: "100000.000000",
      includeInNetWorth: true,
      utilization: "25.00",
    });
  });

  it("creates and edits cards without a product, as before", async () => {
    const user = await signUpTestUser();
    const context = { context: await contextFor(user.headers) };

    const created = await call(accountsRouter.create, cardInput, context);
    expect(created.cardProductKey).toBeNull();

    const updated = await call(
      accountsRouter.update,
      { ...cardInput, accountId: created.id, name: "Renamed" },
      context
    );
    expect(updated).toMatchObject({ cardProductKey: null, name: "Renamed" });
  });

  it("changes, keeps and clears a product across updates", async () => {
    const user = await signUpTestUser();
    const context = { context: await contextFor(user.headers) };
    const created = await call(
      accountsRouter.create,
      { ...cardInput, cardProductKey: GOLD_REWARDS },
      context
    );
    const update = (values: Record<string, unknown>) =>
      call(
        accountsRouter.update,
        { ...cardInput, accountId: created.id, ...values },
        context
      );

    await expect(
      update({ cardProductKey: "bpi-platinum-rewards-mastercard" })
    ).resolves.toMatchObject({
      cardProductKey: "bpi-platinum-rewards-mastercard",
    });
    // A client that never sends the field doesn't wipe it.
    await expect(update({ name: "Still platinum" })).resolves.toMatchObject({
      cardProductKey: "bpi-platinum-rewards-mastercard",
    });
    await expect(update({ cardProductKey: null })).resolves.toMatchObject({
      cardProductKey: null,
    });
  });

  it("drops the product when the account stops being a credit card", async () => {
    const user = await signUpTestUser();
    const context = { context: await contextFor(user.headers) };
    const created = await call(
      accountsRouter.create,
      { ...cardInput, cardProductKey: GOLD_REWARDS },
      context
    );

    const converted = await call(
      accountsRouter.update,
      {
        accountClass: "asset",
        accountId: created.id,
        accountType: "bank",
        liquidity: "liquid",
        name: "BPI Savings",
        openingBalance: "0",
        ownerMemberIds: [],
      },
      context
    );
    expect(converted.cardProductKey).toBeNull();
  });

  it("rejects a product that contradicts the card's issuer or network", async () => {
    const user = await signUpTestUser();
    const context = { context: await contextFor(user.headers) };

    expect(
      await failureOf(
        call(
          accountsRouter.create,
          { ...cardInput, cardProductKey: GOLD_REWARDS, institution: "BDO" },
          context
        )
      )
    ).toEqual({
      code: "BAD_REQUEST",
      message: "BPI Gold Rewards is issued by Bank of the Philippine Islands",
    });
    expect(
      await failureOf(
        call(
          accountsRouter.create,
          { ...cardInput, cardNetwork: "Visa", cardProductKey: GOLD_REWARDS },
          context
        )
      )
    ).toEqual({
      code: "BAD_REQUEST",
      message: "BPI Gold Rewards is a Mastercard card",
    });
    expect(
      await failureOf(
        call(
          accountsRouter.create,
          { ...cardInput, cardProductKey: GOLD_REWARDS, institution: null },
          context
        )
      )
    ).toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      call(accountsRouter.list, undefined, context)
    ).resolves.toEqual([]);
  });

  it("rejects unknown, malformed and non-card product keys", async () => {
    const user = await signUpTestUser();
    const context = { context: await contextFor(user.headers) };

    expect(
      await failureOf(
        call(
          accountsRouter.create,
          { ...cardInput, cardProductKey: "bpi-not-a-real-card" },
          context
        )
      )
    ).toEqual({ code: "BAD_REQUEST", message: "Choose a card from the list" });
    expect(
      await codeOf(
        call(
          accountsRouter.create,
          { ...cardInput, cardProductKey: "BPI Gold Rewards" },
          context
        )
      )
    ).toBe("BAD_REQUEST");
    expect(
      await codeOf(
        call(
          accountsRouter.create,
          {
            accountClass: "asset",
            accountType: "bank",
            cardProductKey: GOLD_REWARDS,
            institution: "BPI",
            liquidity: "liquid",
            name: "BPI Savings",
            ownerMemberIds: [],
          },
          context
        )
      )
    ).toBe("BAD_REQUEST");
  });

  it("requires a deliberate choice when an issuer change invalidates the product", async () => {
    const user = await signUpTestUser();
    const context = { context: await contextFor(user.headers) };
    const created = await call(
      accountsRouter.create,
      { ...cardInput, cardProductKey: GOLD_REWARDS },
      context
    );

    expect(
      await codeOf(
        call(
          accountsRouter.update,
          { ...cardInput, accountId: created.id, institution: "Metrobank" },
          context
        )
      )
    ).toBe("BAD_REQUEST");
    await expect(
      call(
        accountsRouter.update,
        {
          ...cardInput,
          accountId: created.id,
          cardProductKey: "metrobank-titanium-mastercard",
          institution: "Metrobank",
        },
        context
      )
    ).resolves.toMatchObject({
      cardProductKey: "metrobank-titanium-mastercard",
      institution: "Metrobank",
    });
  });

  it("still loads and edits a card whose saved product was retired", async () => {
    const user = await signUpTestUser();
    const context = { context: await contextFor(user.headers) };
    const created = await call(accountsRouter.create, cardInput, context);
    await getTestDb()
      .update(financialAccount)
      .set({ cardProductKey: "bpi-retired-in-2030" })
      .where(eq(financialAccount.id, created.id));

    await expect(
      call(accountsRouter.get, { accountId: created.id }, context)
    ).resolves.toMatchObject({
      balance: "25000.000000",
      cardProductKey: "bpi-retired-in-2030",
    });
    await expect(
      call(
        accountsRouter.update,
        {
          ...cardInput,
          accountId: created.id,
          cardProductKey: "bpi-retired-in-2030",
          name: "Old BPI card",
        },
        context
      )
    ).resolves.toMatchObject({
      cardProductKey: "bpi-retired-in-2030",
      name: "Old BPI card",
    });
    expect(
      await codeOf(
        call(
          accountsRouter.update,
          {
            ...cardInput,
            accountId: created.id,
            cardProductKey: "bpi-also-retired",
          },
          context
        )
      )
    ).toBe("BAD_REQUEST");
  });
});

describe("credit card product authorization", () => {
  it("lets members set a product and viewers only read it", async () => {
    const owner = await signUpTestUser();
    const memberUser = await signUpTestUser();
    const viewer = await signUpTestUser();
    const organizationId = await activeOrganizationId(owner.headers);
    await joinHousehold(memberUser.user.id, organizationId, "member");
    await joinHousehold(viewer.user.id, organizationId, "viewer");
    const memberContext = { context: await contextFor(memberUser.headers) };
    const viewerContext = { context: await contextFor(viewer.headers) };

    const created = await call(accountsRouter.create, cardInput, memberContext);
    await expect(
      call(
        accountsRouter.update,
        { ...cardInput, accountId: created.id, cardProductKey: GOLD_REWARDS },
        memberContext
      )
    ).resolves.toMatchObject({ cardProductKey: GOLD_REWARDS });

    await expect(
      call(accountsRouter.get, { accountId: created.id }, viewerContext)
    ).resolves.toMatchObject({ cardProductKey: GOLD_REWARDS });
    expect(
      await codeOf(
        call(
          accountsRouter.update,
          { ...cardInput, accountId: created.id, cardProductKey: null },
          viewerContext
        )
      )
    ).toBe("FORBIDDEN");
  });

  it("does not let another household read or change a card's product", async () => {
    const first = await signUpTestUser();
    const second = await signUpTestUser();
    const firstContext = { context: await contextFor(first.headers) };
    const secondContext = { context: await contextFor(second.headers) };
    const created = await call(
      accountsRouter.create,
      { ...cardInput, cardProductKey: GOLD_REWARDS },
      firstContext
    );

    expect(
      await codeOf(
        call(accountsRouter.get, { accountId: created.id }, secondContext)
      )
    ).toBe("NOT_FOUND");
    expect(
      await codeOf(
        call(
          accountsRouter.update,
          {
            ...cardInput,
            accountId: created.id,
            cardProductKey: "bpi-platinum-rewards-mastercard",
          },
          secondContext
        )
      )
    ).toBe("NOT_FOUND");
    await expect(
      call(accountsRouter.get, { accountId: created.id }, firstContext)
    ).resolves.toMatchObject({ cardProductKey: GOLD_REWARDS });
  });
});
