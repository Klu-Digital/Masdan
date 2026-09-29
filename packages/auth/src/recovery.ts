import { randomBytes } from "node:crypto";

import { env } from "@masdan/env/server";

import { auth } from "./index";
import { resetPasswordUrl } from "./reset-link";

/** Handed over out of band by an admin, so longer than better-auth's 1h. */
const ADMIN_RESET_LINK_TTL_MS = 24 * 60 * 60 * 1000;

export interface PasswordResetLink {
  expiresAt: Date;
  url: string;
}

/**
 * Mints the same `reset-password:<token>` verification better-auth's
 * `requestPasswordReset` does, so its `/reset-password` endpoint consumes it.
 */
export const issuePasswordResetLink = async (
  userId: string
): Promise<PasswordResetLink> => {
  const context = await auth.$context;
  const token = randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + ADMIN_RESET_LINK_TTL_MS);

  await context.internalAdapter.createVerificationValue({
    expiresAt,
    identifier: `reset-password:${token}`,
    value: userId,
  });

  return { expiresAt, url: resetPasswordUrl(env.CORS_ORIGIN, token) };
};

export type SetPasswordResult =
  | { status: "no-user" }
  | { status: "no-password-login" }
  | { status: "ok"; user: { email: string; id: string } };

/** Operator recovery: set the password directly and sign the user out everywhere. */
export const setPasswordByEmail = async (
  email: string,
  newPassword: string
): Promise<SetPasswordResult> => {
  const context = await auth.$context;
  const { minPasswordLength, maxPasswordLength } = context.password.config;
  if (
    newPassword.length < minPasswordLength ||
    newPassword.length > maxPasswordLength
  ) {
    throw new Error(
      `Password must be ${minPasswordLength}-${maxPasswordLength} characters.`
    );
  }

  // better-auth lowercases email on sign-up.
  const found = await context.internalAdapter.findUserByEmail(
    email.toLowerCase()
  );
  if (!found) {
    return { status: "no-user" };
  }
  const { user } = found;

  if (!(await context.internalAdapter.findCredentialAccount(user.id))) {
    return { status: "no-password-login" };
  }

  await context.internalAdapter.updatePassword(
    user.id,
    await context.password.hash(newPassword)
  );
  await context.internalAdapter.deleteUserSessions(user.id);

  return { status: "ok", user: { email: user.email, id: user.id } };
};
