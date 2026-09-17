import { auth } from "@k22i/auth";
import { db } from "@k22i/db";
import type { EvlogVariables } from "@k22i/observability/hono";
import type { Context as HonoContext } from "hono";

import { resolveClientIp } from "./client-ip";

export interface CreateContextOptions {
  context: HonoContext<EvlogVariables>;
  /**
   * Supplied by the caller: this package does not depend on
   * `@hono/node-server`. Last fallback only.
   */
  remoteAddress?: string | undefined;
}

export const createContext = async ({
  context,
  remoteAddress,
}: CreateContextOptions) => {
  const session = await auth.api.getSession({
    headers: context.req.raw.headers,
  });
  return {
    auth: null,
    db,
    ip: resolveClientIp(context.req.raw.headers, remoteAddress),
    log: context.get("log"),
    session,
  };
};

export type Context = Awaited<ReturnType<typeof createContext>>;
