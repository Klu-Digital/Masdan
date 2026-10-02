import type { Database } from "@masdan/db";
import { invitation, user } from "@masdan/db/schema/auth";
import { and, eq, gt, isNull } from "drizzle-orm";

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

// A malformed id would make Postgres throw on the uuid cast.
const isUuid = (value: unknown): value is string =>
  typeof value === "string" && UUID.test(value);

// Pending and not yet spent on a sign-up: one link admits one new account.
const usableForSignUp = (invitationId: string) =>
  and(
    eq(invitation.id, invitationId),
    eq(invitation.status, "pending"),
    gt(invitation.expiresAt, new Date()),
    isNull(invitation.signedUpAt)
  );

export const isPendingInvitation = async (
  db: Database,
  invitationId: unknown
): Promise<boolean> => {
  if (!isUuid(invitationId)) {
    return false;
  }
  const [row] = await db
    .select({ id: invitation.id })
    .from(invitation)
    .where(usableForSignUp(invitationId))
    .limit(1);
  return row !== undefined;
};

/** Conditional on still unspent, so two concurrent sign-ups cannot both use one link. */
export const claimInvitationSignUp = async (
  db: Database,
  invitationId: unknown
): Promise<boolean> => {
  if (!isUuid(invitationId)) {
    return false;
  }
  const [claimed] = await db
    .update(invitation)
    .set({ signedUpAt: new Date() })
    .where(usableForSignUp(invitationId))
    .returning({ id: invitation.id });
  return claimed !== undefined;
};
