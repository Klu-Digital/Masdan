import { auth } from "@masdan/auth";
import { db } from "@masdan/db";
import type { EvlogVariables } from "@masdan/observability/hono";
import type { Context as HonoContext } from "hono";

export interface CreateContextOptions {
  context: HonoContext<EvlogVariables>;
  /** From `resolveClientIp` in `@masdan/auth/client-ip`. */
  ip?: string | undefined;
}

export const createContext = async ({ context, ip }: CreateContextOptions) => {
  const session = await auth.api.getSession({
    headers: context.req.raw.headers,
  });
  return {
    auth: null,
    db,
    ip,
    log: context.get("log"),
    session,
  };
};

export type Context = Awaited<ReturnType<typeof createContext>> & {
  afterCommit?: (task: () => Promise<unknown>) => void;
};
