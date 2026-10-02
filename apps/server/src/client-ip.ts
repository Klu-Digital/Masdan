import { getConnInfo } from "@hono/node-server/conninfo";
import { resolveClientIp } from "@masdan/auth/client-ip";
import type { Context } from "hono";

// `getConnInfo` throws without a Node socket, as in tests.
const remoteAddressOf = (c: Context): string | undefined => {
  try {
    return getConnInfo(c).remote.address;
  } catch {
    // No socket to read (tests); the caller treats the address as unknown.
    return undefined;
  }
};

/** The socket is only reachable from `@hono/node-server`, so resolve it here. */
export const clientIpOf = (c: Context): string | undefined =>
  resolveClientIp(c.req.raw.headers, remoteAddressOf(c));
