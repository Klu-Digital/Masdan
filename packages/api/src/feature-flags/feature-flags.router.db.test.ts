import { featureFlag } from "@k22i/db/schema/feature-flags";
import { FEATURE_FLAG_NAMES, featureFlagRegistry } from "@k22i/env/flags";
import { getSessionFor, getTestDb, signUpTestUser } from "@k22i/testing";
import { call, ORPCError } from "@orpc/server";
import { beforeEach, describe, expect, it } from "vite-plus/test";

import type { Context } from "../context";
import {
  protectedProcedure,
  publicProcedure,
  requireFlag,
} from "../procedures";
import { invalidateFeatureFlags } from "./feature-flags.cache";
import { featureFlagsRouter } from "./feature-flags.router";

const caught = async (p: Promise<unknown>): Promise<unknown> => {
  try {
    return await p;
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

const setFlagRow = async (name: string, enabled: boolean) => {
  await getTestDb()
    .insert(featureFlag)
    .values({ enabled, name })
    .onConflictDoUpdate({ set: { enabled }, target: featureFlag.name });
};

/**
 * The cache is module state, so it survives between tests here; every test
 * starts from a cold one.
 */
beforeEach(async () => {
  await getTestDb().delete(featureFlag);
  invalidateFeatureFlags();
});

describe("featureFlags.all", () => {
  it("throws ORPCError UNAUTHORIZED when there is no session", async () => {
    const error = await caught(
      call(featureFlagsRouter.all, undefined, { context: await contextFor() })
    );

    expect(error).toBeInstanceOf(ORPCError);
    if (error instanceof ORPCError) {
      expect(error.code).toBe("UNAUTHORIZED");
    }
  });

  it("returns every declared flag at its registry default when no rows exist", async () => {
    const { headers } = await signUpTestUser();

    const result = await call(featureFlagsRouter.all, undefined, {
      context: await contextFor(headers),
    });

    expect(Object.keys(result).toSorted()).toEqual(
      [...FEATURE_FLAG_NAMES].toSorted()
    );
    for (const name of FEATURE_FLAG_NAMES) {
      expect(result[name]).toBe(featureFlagRegistry[name].defaultEnabled);
    }
  });

  it("reflects a row that overrides the default", async () => {
    const { headers } = await signUpTestUser();
    await setFlagRow("FF__EXAMPLE", true);

    const result = await call(featureFlagsRouter.all, undefined, {
      context: await contextFor(headers),
    });

    expect(result.FF__EXAMPLE).toBe(true);
  });

  it("ignores rows for flags no longer declared in the registry", async () => {
    // Deleting a flag from code leaves its row behind. Reads walk the registry,
    // so the orphan is invisible rather than resurrected as an unknown key.
    const { headers } = await signUpTestUser();
    await setFlagRow("FF__DELETED_FROM_CODE", true);

    const result = await call(featureFlagsRouter.all, undefined, {
      context: await contextFor(headers),
    });

    expect(Object.keys(result)).toEqual([...FEATURE_FLAG_NAMES]);
  });

  it("serves the cached value until it is invalidated", async () => {
    // Proves the cache is load-bearing rather than incidental: a write that goes
    // around `admin.featureFlags.set` is invisible until something drops it.
    const { headers } = await signUpTestUser();
    const context = await contextFor(headers);

    await call(featureFlagsRouter.all, undefined, { context });
    await setFlagRow("FF__EXAMPLE", true);

    const stale = await call(featureFlagsRouter.all, undefined, { context });
    expect(stale.FF__EXAMPLE).toBe(false);

    invalidateFeatureFlags();

    const fresh = await call(featureFlagsRouter.all, undefined, { context });
    expect(fresh.FF__EXAMPLE).toBe(true);
  });
});

describe("requireFlag", () => {
  const gated = publicProcedure
    .use(requireFlag("FF__EXAMPLE"))
    .handler(() => "reached");

  it("throws NOT_FOUND when the flag is off", async () => {
    const error = await caught(
      call(gated, undefined, { context: await contextFor() })
    );

    expect(error).toBeInstanceOf(ORPCError);
    if (error instanceof ORPCError) {
      // NOT_FOUND, not FORBIDDEN — a FORBIDDEN would confirm the endpoint exists.
      expect(error.code).toBe("NOT_FOUND");
    }
  });

  it("runs the handler when the flag is on", async () => {
    await setFlagRow("FF__EXAMPLE", true);

    await expect(
      call(gated, undefined, { context: await contextFor() })
    ).resolves.toBe("reached");
  });

  it("composes onto protectedProcedure, which still rejects first when signed out", async () => {
    // Auth must fail before the flag check, or an anonymous probe can tell a
    // flagged-off procedure from a flagged-on one.
    const authed = protectedProcedure
      .use(requireFlag("FF__EXAMPLE"))
      .handler(() => "reached");
    await setFlagRow("FF__EXAMPLE", true);

    const error = await caught(
      call(authed, undefined, { context: await contextFor() })
    );

    expect(error).toBeInstanceOf(ORPCError);
    if (error instanceof ORPCError) {
      expect(error.code).toBe("UNAUTHORIZED");
    }
  });
});
