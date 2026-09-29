import { invitation, user } from "@masdan/db/schema/auth";
import { env } from "@masdan/env/server";
import { getSessionFor, getTestDb, signUpTestUser } from "@masdan/testing";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vite-plus/test";

import { auth } from "./index";

/** Through `auth.handler`, as the browser does, so `ctx.request` is set. */
const httpSignUp = (email: string, extra: Record<string, unknown> = {}) =>
  auth.handler(
    new Request(`${env.BETTER_AUTH_URL}/api/auth/sign-up/email`, {
      body: JSON.stringify({
        email,
        name: "Someone",
        password: "correct-horse-battery",
        ...extra,
      }),
      headers: { "content-type": "application/json", origin: env.CORS_ORIGIN },
      method: "POST",
    })
  );

const roleOf = async (email: string) => {
  const [row] = await getTestDb()
    .select({ role: user.role })
    .from(user)
    .where(eq(user.email, email));
  return row?.role;
};

const pendingInvitationFrom = async (headers: Headers) => {
  const session = await getSessionFor(headers);
  const organizationId = session?.session.activeOrganizationId;
  if (!organizationId) {
    throw new Error("inviter has no active household");
  }
  return auth.api.createInvitation({
    body: { email: "label@example.com", organizationId, role: "member" },
    headers,
  });
};

describe("sign-up gate", () => {
  it("lets the first account in over HTTP and makes it platform admin", async () => {
    const response = await httpSignUp("first@example.com");

    expect(response.status).toBe(200);
    expect(await roleOf("first@example.com")).toBe("admin");
  });

  it("closes HTTP sign-up once the instance has a user", async () => {
    await signUpTestUser();

    const response = await httpSignUp("late@example.com");

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      code: "SIGN_UP_INVITE_ONLY",
    });
    expect(await roleOf("late@example.com")).toBeUndefined();
  });

  it("admits a pending invite-link holder under any email, not as admin", async () => {
    const inviter = await signUpTestUser();
    const pending = await pendingInvitationFrom(inviter.headers);

    const response = await httpSignUp("invitee@example.com", {
      invitationId: pending.id,
    });

    expect(response.status).toBe(200);
    expect(await roleOf("invitee@example.com")).not.toBe("admin");
  });

  it.each(["canceled", "accepted"])(
    "rejects a %s invitation",
    async (status) => {
      const inviter = await signUpTestUser();
      const used = await pendingInvitationFrom(inviter.headers);
      await getTestDb()
        .update(invitation)
        .set({ status })
        .where(eq(invitation.id, used.id));

      const response = await httpSignUp("reuse@example.com", {
        invitationId: used.id,
      });

      expect(response.status).toBe(403);
    }
  );

  it("rejects an expired invitation and a malformed id", async () => {
    const inviter = await signUpTestUser();
    const expired = await pendingInvitationFrom(inviter.headers);
    await getTestDb()
      .update(invitation)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(invitation.id, expired.id));

    const withExpired = await httpSignUp("a@example.com", {
      invitationId: expired.id,
    });
    const withMalformed = await httpSignUp("b@example.com", {
      invitationId: "not-a-uuid",
    });

    expect(withExpired.status).toBe(403);
    expect(withMalformed.status).toBe(403);
  });

  it("leaves server-side sign-up (seeder, tests) open and non-admin", async () => {
    await signUpTestUser();
    const { user: second } = await signUpTestUser();

    expect(await roleOf(second.email)).not.toBe("admin");
  });

  it("blocks better-auth's email-matched invitation endpoints", async () => {
    const inviter = await signUpTestUser();
    const pending = await pendingInvitationFrom(inviter.headers);
    const namesake = await signUpTestUser({ email: "label@example.com" });

    await expect(
      auth.api.acceptInvitation({
        body: { invitationId: pending.id },
        headers: namesake.headers,
      })
    ).rejects.toMatchObject({ statusCode: 404 });
    await expect(
      auth.api.getInvitation({
        headers: namesake.headers,
        query: { id: pending.id },
      })
    ).rejects.toMatchObject({ statusCode: 404 });
    await expect(
      auth.api.listUserInvitations({ headers: namesake.headers, query: {} })
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
