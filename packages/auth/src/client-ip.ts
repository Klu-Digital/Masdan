import { isIP } from "node:net";

import { env } from "@masdan/env/server";

/** Stamped by the server on every auth request; better-auth reads no other. */
export const CLIENT_IP_HEADER = "x-masdan-client-ip";

// Each proxy appends the address it saw, so only the last `hops` entries were
// written by a proxy we run; anything left of them is whatever the caller sent.
export const clientIpFrom = (
  forwardedFor: string | null,
  remoteAddress: string | undefined,
  hops: number
): string | undefined => {
  if (hops === 0) {
    return remoteAddress;
  }
  const chain = (forwardedFor ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  // A shorter chain was written by trusted proxies only, so its first entry is the client.
  const candidate = chain.at(-Math.min(hops, chain.length));
  // The proxy's address over an unreadable one: a shared bucket, never none.
  return candidate && isIP(candidate) ? candidate : remoteAddress;
};

export const resolveClientIp = (
  headers: Headers,
  remoteAddress: string | undefined
): string | undefined =>
  clientIpFrom(
    headers.get("x-forwarded-for"),
    remoteAddress,
    env.TRUSTED_PROXY_HOPS
  );

/** Overwrites any caller-sent copy of the header, so better-auth only sees ours. */
export const withClientIp = (request: Request, ip?: string): Request => {
  const headers = new Headers(request.headers);
  if (ip) {
    headers.set(CLIENT_IP_HEADER, ip);
  } else {
    headers.delete(CLIENT_IP_HEADER);
  }
  return new Request(request, { headers });
};
