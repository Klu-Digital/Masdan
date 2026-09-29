import type { Database } from "@masdan/db";
import { invitation, user } from "@masdan/db/schema/auth";
import { and, eq, gt } from "drizzle-orm";

export interface SignUpGateInput {
  allowSignup: boolean;
  hasUsers: boolean;
  invitationPending: boolean;
}

/** Closed by default: only the instance's first account and invite-link holders. */
export const signUpAllowed = ({
  allowSignup,
  hasUsers,
  invitationPending,
}: SignUpGateInput): boolean => allowSignup || !hasUsers || invitationPending;

export const anyUserExists = async (db: Database): Promise<boolean> => {
  const [row] = await db.select({ id: user.id }).from(user).limit(1);
  return row !== undefined;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

export const isPendingInvitation = async (
  db: Database,
  invitationId: unknown
): Promise<boolean> => {
  // A malformed id would make Postgres throw on the uuid cast.
  if (typeof invitationId !== "string" || !UUID.test(invitationId)) {
    return false;
  }
  const [row] = await db
    .select({ id: invitation.id })
    .from(invitation)
    .where(
      and(
        eq(invitation.id, invitationId),
        eq(invitation.status, "pending"),
        gt(invitation.expiresAt, new Date())
      )
    )
    .limit(1);
  return row !== undefined;
};
