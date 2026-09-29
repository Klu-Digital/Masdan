import { countHit } from "@masdan/redis";
import { ORPCError, os } from "@orpc/server";

import type { Context } from "./context";

// A fresh binding rather than importing `o` from `./index`, which re-exports
// `rateLimit` and would close a cycle.
const o = os.$context<Context>();

export interface RateLimitOptions {
  /** Requests permitted per window. */
  limit: number;
  /** Window length in seconds. Fixed window, not sliding. */
  window: number;
  /** Defaults to the session user, then the client IP. */
  key?: (context: Context) => string | undefined;
}

/**
 * Buckets by procedure path, and prefers the session id over `context.ip` — the
 * latter is only as trustworthy as `TRUST_PROXY_HEADERS` allows. Every limit
 * here guards security or AI spend, so with Redis absent or failing it counts
 * in-process (`countHit`) rather than failing open. Only an unattributable
 * caller passes uncounted.
 */
export const rateLimit = ({ limit, window, key }: RateLimitOptions) =>
  o.middleware(async ({ context, next, path }) => {
    const identity =
      key?.(context) ??
      (context.session?.user.id
        ? `user:${context.session.user.id}`
        : undefined) ??
      (context.ip ? `ip:${context.ip}` : undefined);
    if (!identity) {
      // unattributable caller — nothing to bucket
      return next();
    }

    const count = await countHit(`rl:${path.join(".")}:${identity}`, window);
    if (count > limit) {
      throw new ORPCError("TOO_MANY_REQUESTS", {
        data: { retryAfter: window },
      });
    }

    return next();
  });
