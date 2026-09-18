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

describe("invitations.listForCurrentUser", () => {
  it("requires authentication", async () => {
    await expect(
      call(appRouter.invitations.listForCurrentUser, undefined, {
        context: await contextFor(),
      })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("returns pending invitations for the signed-in email across households", async () => {
    const owner = await signUpTestUser({ name: "Ada" });
    const recipient = await signUpTestUser({
      email: "recipient@example.com",
    });
    const stranger = await signUpTestUser({ email: "stranger@example.com" });
    const householdId = await activeHouseholdId(owner.headers);
    const secondHousehold = await auth.api.createOrganization({
      body: {
        keepCurrentActiveOrganization: true,
        name: "Second Household",
        slug: "second-household-for-invitations",
      },
      headers: owner.headers,
    });

    const first = await invite({
      email: recipient.user.email,
      headers: owner.headers,
      organizationId: householdId,
    });
    const second = await invite({
      email: recipient.user.email,
      headers: owner.headers,
      organizationId: secondHousehold.id,
    });
    await invite({
      email: stranger.user.email,
      headers: owner.headers,
      organizationId: householdId,
    });

    const rows = await call(
      appRouter.invitations.listForCurrentUser,
      undefined,
      {
        context: await contextFor(recipient.headers),
      }
    );

    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.id)).toEqual(
      expect.arrayContaining([first.id, second.id])
    );
    expect(rows.map((row) => row.organizationName)).toEqual(
      expect.arrayContaining(["Ada's Household", "Second Household"])
    );

    await expect(
      call(appRouter.invitations.listForCurrentUser, undefined, {
        context: await contextFor(stranger.headers),
      })
    ).resolves.toHaveLength(1);
  });

  it("includes expired pending invitations but excludes terminal statuses", async () => {
    const owner = await signUpTestUser({ name: "Status Owner" });
    const recipient = await signUpTestUser({
      email: "status-recipient@example.com",
      name: "Status Recipient",
    });
    const organizationId = await activeHouseholdId(owner.headers);
    const db = getTestDb();
    const expiresAt = new Date(Date.now() - 60_000);

    const [expired] = await db
      .insert(invitation)
      .values({
        email: recipient.user.email,
        expiresAt,
        inviterId: owner.user.id,
        organizationId,
        role: "member",
        status: "pending",
      })
      .returning({ id: invitation.id });

    await db.insert(invitation).values(
      ["canceled", "accepted", "rejected"].map((status) => ({
        email: recipient.user.email,
        expiresAt,
        inviterId: owner.user.id,
        organizationId,
        role: "member",
        status,
      }))
    );

    const rows = await call(
      appRouter.invitations.listForCurrentUser,
      undefined,
      {
        context: await contextFor(recipient.headers),
      }
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: expired?.id,
      organizationId,
      organizationName: "Status Owner's Household",
      status: "pending",
    });
    expect(rows[0]?.expiresAt).toEqual(expiresAt);
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

  it("rejects invitation actions from a different recipient", async () => {
    const owner = await signUpTestUser();
    const recipient = await signUpTestUser({
      email: "actual-recipient@example.com",
    });
    const stranger = await signUpTestUser({
      email: "wrong-recipient@example.com",
    });
    const householdId = await activeHouseholdId(owner.headers);
    const created = await invite({
      email: recipient.user.email,
      headers: owner.headers,
      organizationId: householdId,
    });

    await expect(
      auth.api.acceptInvitation({
        body: { invitationId: created.id },
        headers: stranger.headers,
      })
    ).rejects.toThrow();

    await expect(
      auth.api.rejectInvitation({
        body: { invitationId: created.id },
        headers: stranger.headers,
      })
    ).rejects.toThrow();
  });
});
