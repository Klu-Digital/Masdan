import { z } from "zod";

import { optionalSearchString } from "./search";

/** Where an authenticated user belongs when nothing more specific is known. */
export const DEFAULT_AUTHENTICATED_PATH = "/dashboard";

// An auth entry point would loop, and `/` only forwards on.
const AUTH_ENTRY_PATHS = new Set([
  "/",
  "/forgot-password",
  "/login",
  "/reset-password",
  "/signup",
]);

// `startsWith("/")` is not enough: `//evil.com` and `/\evil.com` are
// protocol-relative.
export const safeRedirect = (
  raw: string | undefined,
  origin: string
): string => {
  if (!raw?.startsWith("/")) {
    return DEFAULT_AUTHENTICATED_PATH;
  }
  if (raw.startsWith("//") || raw.startsWith("/\\")) {
    return DEFAULT_AUTHENTICATED_PATH;
  }

  let url: URL;
  try {
    url = new URL(raw, origin);
  } catch {
    return DEFAULT_AUTHENTICATED_PATH;
  }

  if (url.origin !== origin || AUTH_ENTRY_PATHS.has(url.pathname)) {
    return DEFAULT_AUTHENTICATED_PATH;
  }

  return `${url.pathname}${url.search}${url.hash}`;
};

export const redirectSearch = z.object({
  redirect: optionalSearchString,
});

// With sign-up closed, a pending invitation is what lets the account in.
export const invitationFromRedirect = (
  redirectTo: string,
  origin: string
): string | undefined => {
  const url = new URL(redirectTo, origin);
  return url.pathname === "/accept-invite"
    ? (url.searchParams.get("invitation") ?? undefined)
    : undefined;
};
