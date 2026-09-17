import { user } from "@masdan/db/schema/auth";
import { featureFlag } from "@masdan/db/schema/feature-flags";
import { featureFlagRegistry } from "@masdan/env/flags";
import { getSessionFor, getTestDb, signUpTestUser } from "@masdan/testing";
import { call, ORPCError } from "@orpc/server";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vite-plus/test";

import type { Context } from "../context";
import { getFeatureFlags, invalidateFeatureFlags } from "./feature-flags.cache";
import { featureFlagsPlatformRouter } from "./feature-flags.platform";

const codeOf = async (
  promise: Promise<unknown>
): Promise<string | undefined> => {
  try {
    await promise;
    return undefined;
  } catch (error) {
    return error instanceof ORPCError ? error.code : undefined;
  }
};

const contextFor = async (headers: Headers): Promise<Context> =>
  ({
    auth: null,
    db: getTestDb(),
    log: undefined,
    session: await getSessionFor(headers),
  }) as unknown as Context;

const adminContext = async (): Promise<Context> => {
  const { headers, user: signedUpUser } = await signUpTestUser();
  await getTestDb()
    .update(user)
    .set({ role: "admin" })
    .where(eq(user.id, signedUpUser.id));
  return await contextFor(headers);
};

beforeEach(async () => {
  await getTestDb().delete(featureFlag);
  invalidateFeatureFlags();
});

describe("admin.featureFlags.list", () => {
  it("lists every declared flag, marking whether it is overridden", async () => {
    const context = await adminContext();

    const before = await call(featureFlagsPlatformRouter.list, undefined, {
      context,
    });
    const example = before.find((flag) => flag.name === "FF__EXAMPLE");

    expect(example).toMatchObject({
      defaultEnabled: featureFlagRegistry.FF__EXAMPLE.defaultEnabled,
      enabled: featureFlagRegistry.FF__EXAMPLE.defaultEnabled,
      overridden: false,
      updatedAt: null,
    });

    await call(
      featureFlagsPlatformRouter.set,
      { enabled: true, name: "FF__EXAMPLE" },
      { context }
    );

    const after = await call(featureFlagsPlatformRouter.list, undefined, {
      context,
    });
    const overridden = after.find((flag) => flag.name === "FF__EXAMPLE");

    expect(overridden?.enabled).toBe(true);
    expect(overridden?.overridden).toBe(true);
    expect(overridden?.updatedAt).toBeInstanceOf(Date);
    expect(overridden?.updatedByEmail).toBe(context.session?.user.email);
  });
});

describe("admin.featureFlags.set", () => {
  it("inserts an override, then updates the same row on a second call", async () => {
    const context = await adminContext();

    await call(
      featureFlagsPlatformRouter.set,
      { enabled: true, name: "FF__EXAMPLE" },
      { context }
    );
    await call(
      featureFlagsPlatformRouter.set,
      { enabled: false, name: "FF__EXAMPLE" },
      { context }
    );

    const rows = await getTestDb().select().from(featureFlag);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.enabled).toBe(false);
  });

  it("is visible to readers straight away, without a manual invalidation", async () => {
    // The end-to-end proof that the `afterCommit` invalidation is wired: the
    // cache was warm and false, and nothing here drops it by hand.
    const context = await adminContext();
    const warm = await getFeatureFlags(getTestDb());
    expect(warm.FF__EXAMPLE).toBe(false);

    await call(
      featureFlagsPlatformRouter.set,
      { enabled: true, name: "FF__EXAMPLE" },
      { context }
    );

    const afterSet = await getFeatureFlags(getTestDb());
    expect(afterSet.FF__EXAMPLE).toBe(true);
  });

  it("rejects a flag name that is not in the registry", async () => {
    const context = await adminContext();

    expect(
      await codeOf(
        call(
          featureFlagsPlatformRouter.set,
          { enabled: true, name: "FF__NOT_DECLARED" } as never,
          { context }
        )
      )
    ).toBe("BAD_REQUEST");
    expect(await getTestDb().select().from(featureFlag)).toHaveLength(0);
  });

  it("rejects a non-admin with FORBIDDEN and writes nothing", async () => {
    const { headers } = await signUpTestUser();
    const context = await contextFor(headers);

    expect(
      await codeOf(
        call(
          featureFlagsPlatformRouter.set,
          { enabled: true, name: "FF__EXAMPLE" },
          { context }
        )
      )
    ).toBe("FORBIDDEN");
    expect(await getTestDb().select().from(featureFlag)).toHaveLength(0);
  });
});

describe("admin.featureFlags.reset", () => {
  it("drops the override so the flag falls back to its declared default", async () => {
    const context = await adminContext();
    await call(
      featureFlagsPlatformRouter.set,
      { enabled: true, name: "FF__EXAMPLE" },
      { context }
    );

    const result = await call(
      featureFlagsPlatformRouter.reset,
      { name: "FF__EXAMPLE" },
      { context }
    );

    expect(result.enabled).toBe(featureFlagRegistry.FF__EXAMPLE.defaultEnabled);
    expect(await getTestDb().select().from(featureFlag)).toHaveLength(0);

    const afterReset = await getFeatureFlags(getTestDb());
    expect(afterReset.FF__EXAMPLE).toBe(
      featureFlagRegistry.FF__EXAMPLE.defaultEnabled
    );
  });
});
