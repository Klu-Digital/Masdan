import { env } from "@masdan/env/server";

// Forwarding headers only with `TRUST_PROXY_HEADERS`, or anyone can forge one.
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
