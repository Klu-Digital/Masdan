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

// Counts in-process when Redis is down rather than failing open.
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
