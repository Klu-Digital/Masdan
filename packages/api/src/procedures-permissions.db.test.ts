import { member } from "@masdan/db/schema/auth";
import { getSessionFor, getTestDb, signUpTestUser } from "@masdan/testing";
import { call, ORPCError } from "@orpc/server";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vite-plus/test";

import type { Context } from "./context";
import { appRouter } from "./routers/index";

/**
 * The chain end to end. The role matrix itself is covered as pure data in
 * `permissions.test.ts`.
 */
const contextFor = async (headers: Headers): Promise<Context> =>
  ({
    auth: null,
    db: getTestDb(),
    log: undefined,
    session: await getSessionFor(headers),
  }) as unknown as Context;

/**
 * Writes the column directly — what `organization.updateMemberRole` does, minus
 * a second user.
 */
const setRole = async (context: Context, role: string) => {
  const { session } = context;
  if (!session?.session.activeOrganizationId) {
    throw new Error("test context is missing an authenticated session");
  }
  await getTestDb()
    .update(member)
    .set({ role })
    .where(
      and(
        eq(member.organizationId, session.session.activeOrganizationId),
        eq(member.userId, session.user.id)
      )
    );
};

const codeOf = async (
  promise: Promise<unknown>
): Promise<string | undefined> => {
  const caught: unknown = await promise
    .then(() => {})
    .catch((error: unknown) => error);
  return caught instanceof ORPCError ? caught.code : undefined;
};

describe("requirePermission", () => {
  it("lets an owner through — every user owns their personal organization", async () => {
    const { headers: contextHeaders } = await signUpTestUser();
    const context = await contextFor(contextHeaders);

    await expect(
      call(appRouter.files.listFiles, undefined, { context })
    ).resolves.toBeDefined();
  });

  it("rejects a viewer from a route that needs file:create", async () => {
    const { headers: contextHeaders } = await signUpTestUser();
    const context = await contextFor(contextHeaders);
    await setRole(context, "viewer");

    // Reads still work...
    await expect(
      call(appRouter.files.listFiles, undefined, { context })
    ).resolves.toBeDefined();

    // ...writes do not.
    expect(
      await codeOf(
        call(
          appRouter.files.createUpload,
          { contentType: "image/png", name: "photo.png", size: 1234 },
          { context }
        )
      )
    ).toBe("FORBIDDEN");
  });

  it("unions grants across a comma-separated member.role", async () => {
    const { headers: viewerHeaders } = await signUpTestUser();
    const viewer = await contextFor(viewerHeaders);
    await setRole(viewer, "viewer");

    const { headers: bothHeaders } = await signUpTestUser();
    const both = await contextFor(bothHeaders);
    await setRole(both, "viewer,member");

    const missingFile = { fileId: crypto.randomUUID() };

    // The two codes are the whole assertion: FORBIDDEN means the middleware
    // stopped the call, NOT_FOUND means it let it through to the lookup.
    expect(
      await codeOf(
        call(appRouter.files.deleteFile, missingFile, { context: viewer })
      )
    ).toBe("FORBIDDEN");
    expect(
      await codeOf(
        call(appRouter.files.deleteFile, missingFile, { context: both })
      )
    ).toBe("NOT_FOUND");
  });

  it("denies an unrecognised role instead of failing open", async () => {
    const { headers: contextHeaders } = await signUpTestUser();
    const context = await contextFor(contextHeaders);
    await setRole(context, "definitely-not-a-role");

    expect(
      await codeOf(call(appRouter.files.listFiles, undefined, { context }))
    ).toBe("FORBIDDEN");
  });
});
