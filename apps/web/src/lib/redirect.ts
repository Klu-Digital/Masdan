import type { SearchSchemaInput } from "@tanstack/react-router";

/** Where an authenticated user belongs when nothing more specific is known. */
export const DEFAULT_AUTHENTICATED_PATH = "/dashboard";

/**
 * Never a post-login destination: an auth entry point loops, and `/` only
 * forwards on.
 */
const AUTH_ENTRY_PATHS = new Set([
  "/",
  "/forgot-password",
  "/login",
  "/reset-password",
  "/signup",
  "/verify-email",
]);

/**
 * Narrows an attacker-controlled `?redirect=` to a same-origin path.
 * `startsWith("/")` is not enough: `//evil.com` is protocol-relative, and
 * browsers normalise `/\evil.com` to the same thing. Both are rejected before
 * parsing.
 */
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

/**
 * A repeated key arrives as an array; coercing here means a mangled link
 * renders the route's empty state instead of a router parse error.
 */
export const asOptionalString = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

/**
 * `SearchSchemaInput` takes the parameter type as the caller's contract, so
 * every `<Link to="/login">` need not pass a `search` prop.
 */
export const redirectSearch = (
  search: { redirect?: string } & SearchSchemaInput
) => ({
  redirect: asOptionalString(search.redirect),
});
