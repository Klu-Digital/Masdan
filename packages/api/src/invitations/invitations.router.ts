import {
  invitation,
  member,
  organization,
  user,
} from "@masdan/db/schema/index";
import { ORPCError } from "@orpc/server";
import { and, eq, gt, sql } from "drizzle-orm";
import { z } from "zod";

import { mutationProcedure, protectedProcedure } from "../procedures";

const PENDING_INVITATION_STATUS = "pending";

const invitationInput = z.object({ invitationId: z.uuid() });

/**
 * The link is the credential: whoever holds the unguessable id may accept it,
 * whatever their email. Never match invitations by email; that is how an
 * attacker who registers the invitee's address used to join the household.
 */
const claimable = (invitationId: string) =>
  and(
    eq(invitation.id, invitationId),
    eq(invitation.status, PENDING_INVITATION_STATUS),
    gt(invitation.expiresAt, sql`now()`)
  );

export const invitationsRouter = {
  accept: mutationProcedure
    .input(invitationInput)
    .handler(async ({ context, input }) => {
      const userId = context.session.user.id;

      const [pending] = await context.db
        .select({ organizationId: invitation.organizationId })
        .from(invitation)
        .where(claimable(input.invitationId));
      if (!pending) {
        throw new ORPCError("NOT_FOUND");
      }

      // Checked before claiming so an existing member doesn't burn the link.
      const [existing] = await context.db
        .select({ id: member.id })
        .from(member)
        .where(
          and(
            eq(member.organizationId, pending.organizationId),
            eq(member.userId, userId)
          )
        );
      if (existing) {
        throw new ORPCError("CONFLICT", {
          message: "You are already a member of this household.",
        });
      }

      // Conditional on still pending, so two concurrent accepts cannot both win.
      const [claimed] = await context.db
        .update(invitation)
        .set({ status: "accepted" })
        .where(claimable(input.invitationId))
        .returning({
          organizationId: invitation.organizationId,
          role: invitation.role,
        });
      if (!claimed) {
        throw new ORPCError("NOT_FOUND");
      }

      await context.db.insert(member).values({
        organizationId: claimed.organizationId,
        role: claimed.role ?? "member",
        userId,
      });

      return { organizationId: claimed.organizationId };
    }),

  decline: mutationProcedure
    .input(invitationInput)
    .handler(async ({ context, input }) => {
      const [declined] = await context.db
        .update(invitation)
        .set({ status: "rejected" })
        .where(claimable(input.invitationId))
        .returning({ id: invitation.id });
      if (!declined) {
        throw new ORPCError("NOT_FOUND");
      }
    }),

  preview: protectedProcedure
    .input(invitationInput)
    .handler(async ({ context, input }) => {
      const [row] = await context.db
        .select({
          expiresAt: invitation.expiresAt,
          id: invitation.id,
          inviterName: user.name,
          organizationId: invitation.organizationId,
          organizationName: organization.name,
          role: invitation.role,
        })
        .from(invitation)
        .innerJoin(organization, eq(organization.id, invitation.organizationId))
        .innerJoin(user, eq(user.id, invitation.inviterId))
        .where(claimable(input.invitationId));
      if (!row) {
        throw new ORPCError("NOT_FOUND");
      }
      return row;
    }),
};
