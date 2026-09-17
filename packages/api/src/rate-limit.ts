import { incrementWithTtl, redis } from "@k22i/redis";
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
 * latter is only as trustworthy as `TRUST_PROXY_HEADERS` allows. Fails open on
 * every path: no Redis, no attributable caller, or a throwing increment all
 * fall through to `next()`. So "no 429s in the logs" is not evidence it works —
 * alert on `redis.error`.
 */
export const rateLimit = ({ limit, window, key }: RateLimitOptions) =>
  o.middleware(async ({ context, next, path }) => {
    const client = redis.client();
    if (!client) {
      // no Redis configured — fail open, nothing to count against
      return next();
    }

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

    const bucket = `rl:${path.join(".")}:${identity}`;

    let count: number;
    try {
      count = await incrementWithTtl(client, bucket, window);
    } catch (error) {
      // The path is logged, never the bucket: the bucket embeds the caller's
      // identity, which for an unauthenticated caller is their raw IP.
      context.log?.warn(
        error instanceof Error ? error.message : String(error),
        {
          action: "ratelimit.failed",
          path: path.join("."),
        }
      );
      // Redis reachable but the command failed — fail open, same as no Redis
      return next();
    }

    if (count > limit) {
      throw new ORPCError("TOO_MANY_REQUESTS", {
        data: { retryAfter: window },
      });
    }

    return next();
  });
