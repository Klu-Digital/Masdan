import { member, organization } from "@k22i/db/schema/auth";
import { getSessionFor, getTestDb, signUpTestUser } from "@k22i/testing";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vite-plus/test";

/** Fetches the org created by the `user.create.after` databaseHook for `userId`. */
const personalOrgFor = async (userId: string) => {
  const db = getTestDb();
  const [row] = await db
    .select({ organization })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .where(eq(member.userId, userId));
  return row?.organization;
};

describe("personal organization creation on sign-up", () => {
  it("creates a personal org named after the user, tagged personal in metadata", async () => {
    const { user } = await signUpTestUser({ name: "Ada Lovelace" });

    const org = await personalOrgFor(user.id);

    expect(org?.name).toBe("Ada Lovelace's Workspace");
    // `organization.metadata` is a JSON-encoded text column, and the hook reads
    // it back through `JSON.parse`.
    expect(JSON.parse(org?.metadata ?? "null")).toMatchObject({
      personal: true,
    });
  });

  it("gives the second same-named signup a different slug than the first", async () => {
    const first = await signUpTestUser({ name: "Grace Hopper" });
    const second = await signUpTestUser({ name: "Grace Hopper" });

    const firstOrg = await personalOrgFor(first.user.id);
    const secondOrg = await personalOrgFor(second.user.id);

    // The base slug is free for the first signup and taken by the second, which
    // falls through to `${base}-2`.
    expect(firstOrg?.slug).toBe("grace-hopper");
    expect(secondOrg?.slug).toBe("grace-hopper-2");
    expect(secondOrg?.slug).not.toBe(firstOrg?.slug);
  });

  it("sets the new session's activeOrganizationId to the personal org", async () => {
    const { user, headers } = await signUpTestUser();

    const org = await personalOrgFor(user.id);
    const session = await getSessionFor(headers);

    expect(session?.session.activeOrganizationId).toBe(org?.id);
  });
});
