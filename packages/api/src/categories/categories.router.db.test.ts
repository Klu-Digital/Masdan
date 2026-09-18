import { auth } from "@masdan/auth";
import { member, session } from "@masdan/db/schema/auth";
import { category } from "@masdan/db/schema/categories";
import { getSessionFor, getTestDb, signUpTestUser } from "@masdan/testing";
import { call, ORPCError } from "@orpc/server";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vite-plus/test";

import type { Context } from "../context";
import { categoriesRouter } from "./categories.router";

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

describe("categories.list", () => {
  it("seeds the PRD defaults and scopes them to the active household", async () => {
    const first = await signUpTestUser();
    const second = await signUpTestUser();

    const firstOrganizationId = await activeOrganizationId(first.headers);
    const firstCategories = await call(categoriesRouter.list, undefined, {
      context: await contextFor(first.headers),
    });
    const secondCategories = await call(categoriesRouter.list, undefined, {
      context: await contextFor(second.headers),
    });

    expect(firstCategories).toHaveLength(12);
    expect(firstCategories.map(({ name }) => name)).toEqual([
      "Food & Dining",
      "Groceries",
      "Transport",
      "Shopping",
      "Utilities",
      "Housing",
      "Health",
      "Entertainment",
      "Travel",
      "Salary",
      "Freelance",
      "Interest Income",
    ]);
    expect(
      firstCategories.every(
        ({ organizationId }) => organizationId === firstOrganizationId
      )
    ).toBe(true);
    expect(firstCategories.map(({ id }) => id)).not.toEqual(
      secondCategories.map(({ id }) => id)
    );
  });
});

describe("categories mutations", () => {
  it("creates, updates, rejects duplicates, and archives/restores", async () => {
    const owner = await signUpTestUser();
    const ownerContext = { context: await contextFor(owner.headers) };

    const created = await call(
      categoriesRouter.create,
      {
        color: "rose",
        icon: "🎮",
        name: "Games",
        type: "expense",
      },
      ownerContext
    );
    expect(created.name).toBe("Games");

    await expect(
      call(
        categoriesRouter.create,
        { color: "rose", icon: "🎮", name: "Games", type: "expense" },
        ownerContext
      )
    ).rejects.toBeInstanceOf(ORPCError);

    const updated = await call(
      categoriesRouter.update,
      {
        categoryId: created.id,
        color: "purple",
        icon: "🕹️",
        name: "Gaming",
        type: "expense",
      },
      ownerContext
    );
    expect(updated).toMatchObject({
      color: "purple",
      icon: "🕹️",
      name: "Gaming",
    });

    const archived = await call(
      categoriesRouter.archive,
      { categoryId: created.id },
      ownerContext
    );
    expect(archived.archivedAt).toBeInstanceOf(Date);
    const activeCategories = await call(
      categoriesRouter.list,
      undefined,
      ownerContext
    );
    expect(activeCategories.some(({ id }) => id === created.id)).toBe(false);

    const withArchived = await call(
      categoriesRouter.list,
      { includeArchived: true },
      ownerContext
    );
    expect(withArchived.some(({ id }) => id === created.id)).toBe(true);

    const restored = await call(
      categoriesRouter.restore,
      { categoryId: created.id },
      ownerContext
    );
    expect(restored.archivedAt).toBeNull();
  });

  it("normalizes names for uniqueness and validates category values", async () => {
    const owner = await signUpTestUser();
    const context = { context: await contextFor(owner.headers) };

    await call(
      categoriesRouter.create,
      { color: "blue", icon: "🎵", name: "  Music  ", type: "expense" },
      context
    );

    expect(
      await codeOf(
        call(
          categoriesRouter.create,
          { color: "red", icon: "🎶", name: "music", type: "expense" },
          context
        )
      )
    ).toBe("CONFLICT");

    expect(
      await codeOf(
        call(
          categoriesRouter.create,
          { color: "not-a-color", icon: "🎵", name: "Bad", type: "expense" },
          context
        )
      )
    ).toBe("BAD_REQUEST");
  });
});

describe("categories permissions and isolation", () => {
  it("lets members maintain categories but restricts archive and restore", async () => {
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
      categoriesRouter.create,
      { color: "teal", icon: "🧩", name: "Member Category", type: "expense" },
      memberContext
    );
    expect(created.organizationId).toBe(organizationId);

    expect(
      await codeOf(
        call(
          categoriesRouter.archive,
          { categoryId: created.id },
          memberContext
        )
      )
    ).toBe("FORBIDDEN");
  });

  it("does not expose a category from another household", async () => {
    const first = await signUpTestUser();
    const second = await signUpTestUser();
    const secondContext = { context: await contextFor(second.headers) };
    const [otherCategory] = await getTestDb()
      .select({ id: category.id })
      .from(category)
      .where(
        and(
          eq(
            category.organizationId,
            await activeOrganizationId(first.headers)
          ),
          eq(category.name, "Food & Dining")
        )
      )
      .limit(1);

    expect(otherCategory).toBeDefined();
    expect(
      await codeOf(
        call(
          categoriesRouter.archive,
          { categoryId: otherCategory?.id ?? crypto.randomUUID() },
          secondContext
        )
      )
    ).toBe("NOT_FOUND");
  });

  it("seeds additional households created through Better Auth", async () => {
    const user = await signUpTestUser();
    const additional = await auth.api.createOrganization({
      body: { name: "Second Household", slug: `second-${crypto.randomUUID()}` },
      headers: user.headers,
    });

    await setActiveOrganization(user.user.id, additional.id);
    await expect(
      call(categoriesRouter.list, undefined, {
        context: await contextFor(user.headers),
      })
    ).resolves.toHaveLength(12);
  });
});
