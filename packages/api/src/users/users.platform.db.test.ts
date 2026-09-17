import { user } from "@masdan/db/schema/index";
import { getSessionFor, getTestDb, signUpTestUser } from "@masdan/testing";
import { call } from "@orpc/server";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vite-plus/test";

import type { Context } from "../context";
import { appRouter } from "../routers/index";

const contextFor = async (headers: Headers): Promise<Context> =>
  ({
    auth: null,
    db: getTestDb(),
    log: undefined,
    session: await getSessionFor(headers),
  }) as unknown as Context;

const grantPlatformAdmin = async (userId: string) => {
  await getTestDb()
    .update(user)
    .set({ role: "admin" })
    .where(eq(user.id, userId));
};

describe("admin.users.detail", () => {
  it("returns the target's memberships, sessions and file usage — never a session token", async () => {
    const admin = await signUpTestUser();
    await grantPlatformAdmin(admin.user.id);
    const adminContext = await contextFor(admin.headers);

    const target = await signUpTestUser();

    const result = await call(
      appRouter.admin.users.detail,
      { userId: target.user.id },
      { context: adminContext }
    );

    expect(result.user?.id).toBe(target.user.id);
    // Sign-up creates a personal organization, so the new user is already an
    // `owner` of exactly one — see `user.create.after` in `@masdan/auth`.
    expect(result.memberships).toHaveLength(1);
    expect(result.memberships[0]?.role).toBe("owner");
    expect(result.sessions.length).toBeGreaterThanOrEqual(1);
    expect(result.fileUsage).toEqual({ count: 0, totalBytes: 0 });

    for (const session of result.sessions) {
      expect(session).not.toHaveProperty("token");
    }
  });

  it("answers null for a user id that does not exist, rather than throwing", async () => {
    const admin = await signUpTestUser();
    await grantPlatformAdmin(admin.user.id);
    const adminContext = await contextFor(admin.headers);

    const result = await call(
      appRouter.admin.users.detail,
      { userId: crypto.randomUUID() },
      { context: adminContext }
    );

    expect(result.user).toBeNull();
    expect(result.memberships).toEqual([]);
    expect(result.sessions).toEqual([]);
  });
});
