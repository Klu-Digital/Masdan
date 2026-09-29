import { auth } from "@masdan/auth";
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

describe("admin.users.issuePasswordReset", () => {
  it("returns a one-time web link that resets the target's password", async () => {
    const admin = await signUpTestUser();
    await grantPlatformAdmin(admin.user.id);
    const target = await signUpTestUser();

    const { url, expiresAt } = await call(
      appRouter.admin.users.issuePasswordReset,
      { userId: target.user.id },
      { context: await contextFor(admin.headers) }
    );

    const token = new URL(url).searchParams.get("token") ?? "";
    expect(new URL(url).pathname).toBe("/reset-password");
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
    await auth.api.resetPassword({
      body: { newPassword: "handed-over-pw-1", token },
    });
    expect(await getSessionFor(target.headers)).toBeNull();
    await expect(
      auth.api.signInEmail({
        body: { email: target.user.email, password: "handed-over-pw-1" },
      })
    ).resolves.toMatchObject({ user: { id: target.user.id } });
  });

  it("is forbidden to a non-admin and NOT_FOUND for an unknown user", async () => {
    const ordinary = await signUpTestUser();
    const target = await signUpTestUser();
    const admin = await signUpTestUser();
    await grantPlatformAdmin(admin.user.id);

    await expect(
      call(
        appRouter.admin.users.issuePasswordReset,
        { userId: target.user.id },
        { context: await contextFor(ordinary.headers) }
      )
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      call(
        appRouter.admin.users.issuePasswordReset,
        { userId: crypto.randomUUID() },
        { context: await contextFor(admin.headers) }
      )
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
