import { auth } from "@masdan/auth";
import { member, organization, session } from "@masdan/db/schema/auth";
import { currency } from "@masdan/db/schema/finance";
import { getSessionFor, getTestDb, signUpTestUser } from "@masdan/testing";
import { call, ORPCError } from "@orpc/server";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vite-plus/test";

import type { Context } from "../context";
import { householdsRouter } from "./households.router";

const caught = async (promise: Promise<unknown>): Promise<unknown> => {
  try {
    return await promise;
  } catch (error) {
    return error;
  }
};

const contextFor = async (headers?: Headers): Promise<Context> =>
  ({
    auth: null,
    db: getTestDb(),
    log: undefined,
    session: headers ? await getSessionFor(headers) : null,
  }) as unknown as Context;

/** The seeded reference row, as `households.profile` joins it. */
const PHP = {
  code: "PHP",
  minorUnits: 2,
  name: "Philippine Peso",
  symbol: "₱",
  symbolNative: "₱",
};

const setActiveHousehold = async (userId: string, organizationId: string) => {
  await getTestDb()
    .update(session)
    .set({ activeOrganizationId: organizationId })
    .where(eq(session.userId, userId));
};

const activeHouseholdId = async (headers: Headers): Promise<string> => {
  const currentSession = await getSessionFor(headers);
  const activeOrganizationId = currentSession?.session.activeOrganizationId;
  if (!activeOrganizationId) {
    throw new Error("Test user has no active household");
  }
  return activeOrganizationId;
};

describe("households.profile", () => {
  it("requires authentication", async () => {
    const error = await caught(
      call(householdsRouter.profile, undefined, {
        context: await contextFor(),
      })
    );

    expect(error).toBeInstanceOf(ORPCError);
    expect((error as ORPCError).code).toBe("UNAUTHORIZED");
  });

  it("returns defaults for the active household and follows active-household changes", async () => {
    const { headers } = await signUpTestUser();
    const personalHouseholdId = await activeHouseholdId(headers);

    await expect(
      call(householdsRouter.profile, undefined, {
        context: await contextFor(headers),
      })
    ).resolves.toEqual({ defaultCurrency: PHP, timezone: "Asia/Manila" });

    const additionalHousehold = await auth.api.createOrganization({
      body: { name: "Second Household", slug: "second-household" },
      headers,
    });

    await expect(
      call(householdsRouter.profile, undefined, {
        context: await contextFor(headers),
      })
    ).resolves.toEqual({ defaultCurrency: PHP, timezone: "Asia/Manila" });

    await call(
      householdsRouter.updateProfile,
      { defaultCurrency: "usd", timezone: "America/New_York" },
      { context: await contextFor(headers) }
    );

    const [personalHousehold] = await getTestDb()
      .select({
        defaultCurrency: organization.defaultCurrency,
        timezone: organization.timezone,
      })
      .from(organization)
      .where(eq(organization.id, personalHouseholdId));

    expect(additionalHousehold.id).not.toBe(personalHouseholdId);
    expect(personalHousehold).toEqual({
      defaultCurrency: "PHP",
      timezone: "Asia/Manila",
    });
  });
});

describe("households.updateProfile", () => {
  it("allows organization owners and admins to update the active household", async () => {
    const owner = await signUpTestUser();
    const householdId = await activeHouseholdId(owner.headers);
    const admin = await signUpTestUser();

    await getTestDb().insert(member).values({
      organizationId: householdId,
      role: "admin",
      userId: admin.user.id,
    });
    await setActiveHousehold(admin.user.id, householdId);

    await expect(
      call(
        householdsRouter.updateProfile,
        { defaultCurrency: "jpy", timezone: "Asia/Tokyo" },
        { context: await contextFor(owner.headers) }
      )
    ).resolves.toEqual({
      defaultCurrency: {
        code: "JPY",
        minorUnits: 0,
        name: "Japanese Yen",
        symbol: "¥",
        symbolNative: "￥",
      },
      timezone: "Asia/Tokyo",
    });

    await expect(
      call(
        householdsRouter.updateProfile,
        { defaultCurrency: "usd", timezone: "America/New_York" },
        { context: await contextFor(admin.headers) }
      )
    ).resolves.toEqual({
      defaultCurrency: {
        code: "USD",
        minorUnits: 2,
        name: "US Dollar",
        symbol: "$",
        symbolNative: "$",
      },
      timezone: "America/New_York",
    });
  });

  it.each(["member", "viewer"])("rejects %s updates", async (role) => {
    const owner = await signUpTestUser();
    const householdId = await activeHouseholdId(owner.headers);
    const otherMember = await signUpTestUser();

    await getTestDb().insert(member).values({
      organizationId: householdId,
      role,
      userId: otherMember.user.id,
    });
    await setActiveHousehold(otherMember.user.id, householdId);

    await expect(
      call(householdsRouter.profile, undefined, {
        context: await contextFor(otherMember.headers),
      })
    ).resolves.toEqual({ defaultCurrency: PHP, timezone: "Asia/Manila" });

    const error = await caught(
      call(
        householdsRouter.updateProfile,
        { defaultCurrency: "USD", timezone: "America/New_York" },
        { context: await contextFor(otherMember.headers) }
      )
    );

    expect(error).toBeInstanceOf(ORPCError);
    expect((error as ORPCError).code).toBe("FORBIDDEN");
  });

  it("rejects invalid finance settings", async () => {
    const { headers } = await signUpTestUser();

    for (const input of [
      { defaultCurrency: "not-a-currency", timezone: "Asia/Manila" },
      // Well-formed but not a row in `currency`: the handler answers this
      // rather than letting the foreign key surface as a 500.
      { defaultCurrency: "QQQ", timezone: "Asia/Manila" },
      { defaultCurrency: "PHP", timezone: "Not/A_Timezone" },
    ]) {
      const error = await caught(
        call(householdsRouter.updateProfile, input, {
          context: await contextFor(headers),
        })
      );

      expect(error).toBeInstanceOf(ORPCError);
      expect((error as ORPCError).code).toBe("BAD_REQUEST");
    }
  });

  it("rejects a currency that is disabled for pickers", async () => {
    const { headers } = await signUpTestUser();
    await getTestDb()
      .update(currency)
      .set({ enabled: false })
      .where(eq(currency.code, "USD"));

    try {
      const error = await caught(
        call(
          householdsRouter.updateProfile,
          { defaultCurrency: "USD", timezone: "Asia/Manila" },
          { context: await contextFor(headers) }
        )
      );

      expect(error).toBeInstanceOf(ORPCError);
      expect((error as ORPCError).code).toBe("BAD_REQUEST");
    } finally {
      // `currency` is held back from the per-test truncation, so put it back.
      await getTestDb()
        .update(currency)
        .set({ enabled: true })
        .where(eq(currency.code, "USD"));
    }
  });
});

describe("organization.default_currency", () => {
  it("is a foreign key, so a bad code cannot be written around the API", async () => {
    const { headers } = await signUpTestUser();
    const householdId = await activeHouseholdId(headers);

    await expect(
      getTestDb()
        .update(organization)
        .set({ defaultCurrency: "QQQ" })
        .where(eq(organization.id, householdId))
    ).rejects.toThrow();
  });
});
