import { getSessionFor, signUpTestUser } from "@masdan/testing";
import { describe, expect, it } from "vite-plus/test";

import { auth } from "./index";

const invite = async (role: string | string[]) => {
  const owner = await signUpTestUser();
  const session = await getSessionFor(owner.headers);
  const organizationId = session?.session.activeOrganizationId;
  if (!organizationId) {
    throw new Error("owner has no active household");
  }
  return auth.api.createInvitation({
    body: {
      email: "invitee@example.com",
      organizationId,
      role: role as "member",
    },
    headers: owner.headers,
  });
};

describe("invitation roles", () => {
  it("rejects a space-padded role, which better-auth would store as written", async () => {
    await expect(invite("member, owner")).rejects.toMatchObject({
      body: { code: "INVALID_ROLE" },
    });
    await expect(invite(["member", " owner"])).rejects.toMatchObject({
      body: { code: "INVALID_ROLE" },
    });
  });

  it("accepts a plain role and a comma-joined list", async () => {
    const plain = await invite("member");
    const list = await invite(["viewer", "member"]);

    expect(plain.role).toBe("member");
    expect(list.role).toBe("viewer,member");
  });
});
