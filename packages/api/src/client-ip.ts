import { env } from "@k22i/env/server";

/**
 * The caller's IP, for rate limiting and auditing. `undefined` when nothing is
 * available, which callers handle by falling back to the session id. Forwarding
 * headers are opt-in via `TRUST_PROXY_HEADERS`: without a proxy overwriting it,
 * any direct caller can forge a fresh rate-limit identity. `env` is read in the
 * body, not at module scope.
 */
export const resolveClientIp = (
  headers: Headers,
  remoteAddress?: string | undefined
): string | undefined => {
  if (!env.TRUST_PROXY_HEADERS) {
    return remoteAddress;
  }

  const forwardedFor = headers.get("x-forwarded-for");
  if (forwardedFor) {
    const firstHop = forwardedFor.split(",")[0]?.trim();
    if (firstHop) {
      return firstHop;
    }
  }

  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp) {
    return realIp;
  }

  const cfConnectingIp = headers.get("cf-connecting-ip")?.trim();
  if (cfConnectingIp) {
    return cfConnectingIp;
  }

  return remoteAddress;
};
