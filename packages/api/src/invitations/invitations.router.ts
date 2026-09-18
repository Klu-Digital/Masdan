import { invitation, organization } from "@masdan/db/schema/index";
import { and, desc, eq } from "drizzle-orm";

import { protectedProcedure } from "../procedures";

const PENDING_INVITATION_STATUS = "pending";

export const invitationsRouter = {
  listForCurrentUser: protectedProcedure.handler(({ context }) => {
    // Derive the address from the session so callers cannot enumerate another user's invitations.
    const email = context.session.user.email.toLowerCase();

    return context.db
      .select({
        createdAt: invitation.createdAt,
        expiresAt: invitation.expiresAt,
        id: invitation.id,
        organizationId: invitation.organizationId,
        organizationName: organization.name,
        role: invitation.role,
        status: invitation.status,
      })
      .from(invitation)
      .innerJoin(organization, eq(organization.id, invitation.organizationId))
      .where(
        and(
          eq(invitation.email, email),
          eq(invitation.status, PENDING_INVITATION_STATUS)
        )
      )
      .orderBy(desc(invitation.createdAt));
  }),
};
