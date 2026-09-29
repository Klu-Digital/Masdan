import { user } from "@masdan/db/schema/index";
import { getSessionFor, getTestDb, signUpTestUser } from "@masdan/testing";
import { call, ORPCError } from "@orpc/server";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vite-plus/test";

import type { Context } from "./context";
import { appRouter } from "./routers/index";

const contextFor = async (headers: Headers): Promise<Context> =>
  ({
    auth: null,
    db: getTestDb(),
    log: undefined,
    session: await getSessionFor(headers),
  }) as unknown as Context;

/** Sets the *global* `user.role` — not `member.role`, which `requirePermission`
 * reads. This is the column `adminProcedure` gates on. */
const grantPlatformAdmin = async (userId: string) => {
  await getTestDb()
    .update(user)
    .set({ role: "admin" })
    .where(eq(user.id, userId));
};

const codeOf = async (
  promise: Promise<unknown>
): Promise<string | undefined> => {
  const caught: unknown = await promise
    .then(() => {})
    .catch((error: unknown) => error);
  return caught instanceof ORPCError ? caught.code : undefined;
};

/**
 * One representative procedure per admin router, proving the `adminProcedure`
 * gate is wired on all of them.
 */
describe("admin router access", () => {
  it("rejects an ordinary authenticated user with FORBIDDEN", async () => {
    const { headers } = await signUpTestUser();
    const context = await contextFor(headers);

    expect(
      await codeOf(call(appRouter.admin.overview.stats, undefined, { context }))
    ).toBe("FORBIDDEN");
    expect(
      await codeOf(
        call(
          appRouter.admin.users.detail,
          { userId: crypto.randomUUID() },
          { context }
        )
      )
    ).toBe("FORBIDDEN");
    expect(
      await codeOf(call(appRouter.admin.organizations.list, {}, { context }))
    ).toBe("FORBIDDEN");
    expect(
      await codeOf(call(appRouter.admin.sessions.list, {}, { context }))
    ).toBe("FORBIDDEN");
    expect(
      await codeOf(call(appRouter.admin.files.list, {}, { context }))
    ).toBe("FORBIDDEN");
    expect(
      await codeOf(call(appRouter.admin.jobs.registry, undefined, { context }))
    ).toBe("FORBIDDEN");
    expect(
      await codeOf(call(appRouter.admin.system.health, undefined, { context }))
    ).toBe("FORBIDDEN");
    expect(
      await codeOf(
        call(appRouter.admin.featureFlags.list, undefined, { context })
      )
    ).toBe("FORBIDDEN");
    expect(
      await codeOf(call(appRouter.admin.ai.tokenCaps, undefined, { context }))
    ).toBe("FORBIDDEN");
  });

  it("lets a platform admin through to the same procedures", async () => {
    const { headers, user: signedUpUser } = await signUpTestUser();
    await grantPlatformAdmin(signedUpUser.id);
    const context = await contextFor(headers);

    await expect(
      call(appRouter.admin.overview.stats, undefined, { context })
    ).resolves.toBeDefined();
    await expect(
      call(appRouter.admin.system.health, undefined, { context })
    ).resolves.toBeDefined();
    await expect(
      call(appRouter.admin.jobs.registry, undefined, { context })
    ).resolves.toBeDefined();
    await expect(
      call(appRouter.admin.featureFlags.list, undefined, { context })
    ).resolves.toBeDefined();
    await expect(
      call(appRouter.admin.ai.tokenCaps, undefined, { context })
    ).resolves.toBeDefined();
  });

  it("rejects an unauthenticated caller with UNAUTHORIZED before the admin check", async () => {
    const context = {
      auth: null,
      db: getTestDb(),
      log: undefined,
      session: null,
    } as unknown as Context;

    expect(
      await codeOf(call(appRouter.admin.overview.stats, undefined, { context }))
    ).toBe("UNAUTHORIZED");
  });
});
