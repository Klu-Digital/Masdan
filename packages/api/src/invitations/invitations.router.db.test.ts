import { auth } from "@masdan/auth";
import { invitation, member, session } from "@masdan/db/schema/auth";
import { getSessionFor, getTestDb, signUpTestUser } from "@masdan/testing";
import { call } from "@orpc/server";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vite-plus/test";

import type { Context } from "../context";
import { appRouter } from "../routers/index";

const contextFor = async (headers?: Headers): Promise<Context> =>
  ({
    auth: null,
    db: getTestDb(),
    log: undefined,
    session: headers ? await getSessionFor(headers) : null,
  }) as unknown as Context;

const activeHouseholdId = async (headers: Headers): Promise<string> => {
  const currentSession = await getSessionFor(headers);
  const organizationId = currentSession?.session.activeOrganizationId;
  if (!organizationId) {
    throw new Error("Test user has no active household");
  }
  return organizationId;
};

const setActiveHousehold = async (
  userId: string,
  organizationId: string
): Promise<void> => {
  await getTestDb()
    .update(session)
    .set({ activeOrganizationId: organizationId })
    .where(eq(session.userId, userId));
};

const invite = (input: {
  email: string;
  headers: Headers;
  organizationId: string;
}) =>
  auth.api.createInvitation({
    body: {
      email: input.email,
      organizationId: input.organizationId,
      role: "member",
    },
    headers: input.headers,
  });

const statusOf = async (id: string) => {
  const [row] = await getTestDb()
    .select({ status: invitation.status })
    .from(invitation)
    .where(eq(invitation.id, id));
  return row?.status;
};

const membershipsOf = (userId: string) =>
  getTestDb()
    .select({ organizationId: member.organizationId, role: member.role })
    .from(member)
    .where(eq(member.userId, userId));

describe("invitations.preview", () => {
  it("requires authentication", async () => {
    await expect(
      call(
        appRouter.invitations.preview,
        { invitationId: crypto.randomUUID() },
        { context: await contextFor() }
      )
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("shows the household to any link holder, but only while claimable", async () => {
    const owner = await signUpTestUser({ name: "Ada" });
    const holder = await signUpTestUser();
    const created = await invite({
      email: "someone-else@example.com",
      headers: owner.headers,
      organizationId: await activeHouseholdId(owner.headers),
    });

    await expect(
      call(
        appRouter.invitations.preview,
        { invitationId: created.id },
        { context: await contextFor(holder.headers) }
      )
    ).resolves.toMatchObject({
      inviterName: "Ada",
      organizationName: "Ada's Household",
      role: "member",
    });

    await getTestDb()
      .update(invitation)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(invitation.id, created.id));
    await expect(
      call(
        appRouter.invitations.preview,
        { invitationId: created.id },
        { context: await contextFor(holder.headers) }
      )
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("invitations.accept", () => {
  it("joins the link holder under any email with the invited role, once", async () => {
    const owner = await signUpTestUser();
    const householdId = await activeHouseholdId(owner.headers);
    const holder = await signUpTestUser({ email: "not-the-label@example.com" });
    const second = await signUpTestUser();
    const created = await auth.api.createInvitation({
      body: {
        email: "label@example.com",
        organizationId: householdId,
        role: "viewer",
      },
      headers: owner.headers,
    });

    await expect(
      call(
        appRouter.invitations.accept,
        { invitationId: created.id },
        { context: await contextFor(holder.headers) }
      )
    ).resolves.toEqual({ organizationId: householdId });

    expect(await membershipsOf(holder.user.id)).toContainEqual({
      organizationId: householdId,
      role: "viewer",
    });
    expect(await statusOf(created.id)).toBe("accepted");
    await expect(
      call(
        appRouter.invitations.accept,
        { invitationId: created.id },
        { context: await contextFor(second.headers) }
      )
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it.each([
    ["expired", { expiresAt: new Date(Date.now() - 60_000) }],
    ["canceled", { status: "canceled" }],
    ["rejected", { status: "rejected" }],
  ])("refuses a %s invitation", async (_label, patch) => {
    const owner = await signUpTestUser();
    const holder = await signUpTestUser();
    const householdId = await activeHouseholdId(owner.headers);
    const created = await invite({
      email: "x@example.com",
      headers: owner.headers,
      organizationId: householdId,
    });
    await getTestDb()
      .update(invitation)
      .set(patch)
      .where(eq(invitation.id, created.id));

    await expect(
      call(
        appRouter.invitations.accept,
        { invitationId: created.id },
        { context: await contextFor(holder.headers) }
      )
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await membershipsOf(holder.user.id)).not.toContainEqual(
      expect.objectContaining({ organizationId: householdId })
    );
  });

  it("answers CONFLICT for an existing member and leaves the link usable", async () => {
    const owner = await signUpTestUser();
    const householdId = await activeHouseholdId(owner.headers);
    const created = await invite({
      email: "x@example.com",
      headers: owner.headers,
      organizationId: householdId,
    });

    await expect(
      call(
        appRouter.invitations.accept,
        { invitationId: created.id },
        { context: await contextFor(owner.headers) }
      )
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await statusOf(created.id)).toBe("pending");
  });

  it("gives an email namesake without the link no way in", async () => {
    const owner = await signUpTestUser();
    const namesake = await signUpTestUser({ email: "invitee@example.com" });
    await invite({
      email: "invitee@example.com",
      headers: owner.headers,
      organizationId: await activeHouseholdId(owner.headers),
    });

    expect(appRouter.invitations).not.toHaveProperty("listForCurrentUser");
    await expect(
      auth.api.listUserInvitations({ headers: namesake.headers, query: {} })
    ).rejects.toThrow();
    expect(await membershipsOf(namesake.user.id)).toHaveLength(1);
  });
});

describe("invitations.decline", () => {
  it("marks a pending invitation rejected, and only once", async () => {
    const owner = await signUpTestUser();
    const holder = await signUpTestUser();
    const created = await invite({
      email: "x@example.com",
      headers: owner.headers,
      organizationId: await activeHouseholdId(owner.headers),
    });
    const context = await contextFor(holder.headers);

    await call(
      appRouter.invitations.decline,
      { invitationId: created.id },
      { context }
    );

    expect(await statusOf(created.id)).toBe("rejected");
    await expect(
      call(
        appRouter.invitations.decline,
        { invitationId: created.id },
        { context }
      )
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("Better Auth invitation authorization", () => {
  it("allows an admin to invite and cancel, but denies a member", async () => {
    const owner = await signUpTestUser();
    const memberUser = await signUpTestUser();
    const adminUser = await signUpTestUser();
    const householdId = await activeHouseholdId(owner.headers);

    await getTestDb()
      .insert(member)
      .values([
        {
          organizationId: householdId,
          role: "member",
          userId: memberUser.user.id,
        },
        {
          organizationId: householdId,
          role: "admin",
          userId: adminUser.user.id,
        },
      ]);
    await setActiveHousehold(memberUser.user.id, householdId);
    await setActiveHousehold(adminUser.user.id, householdId);

    await expect(
      invite({
        email: "blocked@example.com",
        headers: memberUser.headers,
        organizationId: householdId,
      })
    ).rejects.toThrow();

    const created = await invite({
      email: "admin-invite@example.com",
      headers: adminUser.headers,
      organizationId: householdId,
    });

    await expect(
      auth.api.cancelInvitation({
        body: { invitationId: created.id },
        headers: memberUser.headers,
      })
    ).rejects.toThrow();

    const [stillPending] = await getTestDb()
      .select({ status: invitation.status })
      .from(invitation)
      .where(
        and(
          eq(invitation.id, created.id),
          eq(invitation.organizationId, householdId)
        )
      );
    expect(stillPending?.status).toBe("pending");

    await expect(
      auth.api.cancelInvitation({
        body: { invitationId: created.id },
        headers: adminUser.headers,
      })
    ).resolves.toBeDefined();

    const [canceled] = await getTestDb()
      .select({ status: invitation.status })
      .from(invitation)
      .where(eq(invitation.id, created.id));
    expect(canceled?.status).toBe("canceled");
  });
});
