import { auth } from "@masdan/auth";
import { db } from "@masdan/db";
import type { EvlogVariables } from "@masdan/observability/hono";
import type { Context as HonoContext } from "hono";

import { resolveClientIp } from "./client-ip";

export interface CreateContextOptions {
  context: HonoContext<EvlogVariables>;
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

export type Context = Awaited<ReturnType<typeof createContext>> & {
  afterCommit?: (task: () => Promise<unknown>) => void;
};
