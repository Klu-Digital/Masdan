import { member, session } from "@masdan/db/schema/auth";
import { getSessionFor, getTestDb, signUpTestUser } from "@masdan/testing";
import { call, ORPCError } from "@orpc/server";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vite-plus/test";

import type { Context } from "../context";
import { tagsRouter } from "./tags.router";

const caught = async (promise: Promise<unknown>): Promise<unknown> => {
  try {
    return await promise;
  } catch (error) {
    return error;
  }
};

const contextFor = async (headers: Headers): Promise<Context> =>
  ({
    auth: null,
    db: getTestDb(),
    log: undefined,
    session: await getSessionFor(headers),
  }) as unknown as Context;

const activeOrganizationId = async (headers: Headers): Promise<string> => {
  const currentSession = await getSessionFor(headers);
  const organizationId = currentSession?.session.activeOrganizationId;
  if (!organizationId) {
    throw new Error("Test user has no active household");
  }
  return organizationId;
};

const setActiveOrganization = async (
  userId: string,
  organizationId: string
): Promise<void> => {
  await getTestDb()
    .update(session)
    .set({ activeOrganizationId: organizationId })
    .where(eq(session.userId, userId));
};

const codeOf = async (
  promise: Promise<unknown>
): Promise<string | undefined> => {
  const error = await caught(promise);
  return error instanceof ORPCError ? error.code : undefined;
};

describe("tags", () => {
  it("creates, updates, lists, archives, and restores household tags", async () => {
    const user = await signUpTestUser();
    const context = { context: await contextFor(user.headers) };

    const created = await call(
      tagsRouter.create,
      { color: "rose", name: "  Vacation  " },
      context
    );
    expect(created).toMatchObject({ color: "rose", name: "Vacation" });

    const updated = await call(
      tagsRouter.update,
      { color: "blue", name: "Travel", tagId: created.id },
      context
    );
    expect(updated).toMatchObject({ color: "blue", name: "Travel" });

    const archived = await call(
      tagsRouter.archive,
      { tagId: created.id },
      context
    );
    expect(archived.archivedAt).toBeInstanceOf(Date);
    await expect(call(tagsRouter.list, undefined, context)).resolves.toEqual(
      []
    );
    await expect(
      call(tagsRouter.list, { includeArchived: true }, context)
    ).resolves.toHaveLength(1);

    const restored = await call(
      tagsRouter.restore,
      { tagId: created.id },
      context
    );
    expect(restored.archivedAt).toBeNull();
  });

  it("validates colors and rejects duplicate names case-insensitively", async () => {
    const user = await signUpTestUser();
    const context = { context: await contextFor(user.headers) };

    await call(tagsRouter.create, { color: "blue", name: "Travel" }, context);
    expect(
      await codeOf(
        call(tagsRouter.create, { color: "red", name: " travel " }, context)
      )
    ).toBe("CONFLICT");
    expect(
      await codeOf(
        call(
          tagsRouter.create,
          // @ts-expect-error deliberately outside the palette
          { color: "not-a-color", name: "Invalid" },
          context
        )
      )
    ).toBe("BAD_REQUEST");
  });

  it("lets members create and update tags but restricts archive and restore", async () => {
    const owner = await signUpTestUser();
    const memberUser = await signUpTestUser();
    const organizationId = await activeOrganizationId(owner.headers);

    await getTestDb().insert(member).values({
      organizationId,
      role: "member",
      userId: memberUser.user.id,
    });
    await setActiveOrganization(memberUser.user.id, organizationId);

    const memberContext = { context: await contextFor(memberUser.headers) };
    const created = await call(
      tagsRouter.create,
      { color: "teal", name: "Member Tag" },
      memberContext
    );
    expect(created.organizationId).toBe(organizationId);
    await expect(
      call(
        tagsRouter.update,
        {
          color: "cyan",
          name: "Updated Tag",
          tagId: created.id,
        },
        memberContext
      )
    ).resolves.toMatchObject({ name: "Updated Tag" });

    expect(
      await codeOf(
        call(tagsRouter.archive, { tagId: created.id }, memberContext)
      )
    ).toBe("FORBIDDEN");
    expect(
      await codeOf(
        call(tagsRouter.restore, { tagId: created.id }, memberContext)
      )
    ).toBe("FORBIDDEN");
  });

  it("does not expose tags from another household", async () => {
    const first = await signUpTestUser();
    const second = await signUpTestUser();
    const firstContext = { context: await contextFor(first.headers) };
    const secondContext = { context: await contextFor(second.headers) };
    const created = await call(
      tagsRouter.create,
      { color: "green", name: "Private Tag" },
      firstContext
    );

    await expect(
      call(tagsRouter.list, undefined, secondContext)
    ).resolves.toEqual([]);
    expect(
      await codeOf(
        call(tagsRouter.archive, { tagId: created.id }, secondContext)
      )
    ).toBe("NOT_FOUND");

    const otherOrganizationId = await activeOrganizationId(second.headers);
    expect(otherOrganizationId).not.toBe(created.organizationId);
  });
});
