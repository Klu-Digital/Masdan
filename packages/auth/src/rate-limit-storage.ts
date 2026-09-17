import { log } from "@masdan/observability";
import { defineIncrementWithTtl, incrementWithTtl, redis } from "@masdan/redis";
import type { BetterAuthOptions } from "better-auth";

// Not re-exported from better-auth's root entry, so derive it rather than
// hand-typing a copy that drifts out from under a version bump.
type RateLimitStorage = NonNullable<
  NonNullable<BetterAuthOptions["rateLimit"]>["customStorage"]
>;

/**
 * Backs better-auth's `rateLimit.customStorage` with Redis, and only that. Do
 * not "simplify" this into `secondaryStorage`: better-auth then stops writing
 * the Postgres `session` row, which makes the `activeOrganizationId` repair in
 * `./index.ts` invisible to `findSession` and 403s every new user. `undefined`
 * when Redis is unconfigured, which is what keeps it optional. Never set
 * `rateLimit.storage`: "secondary-storage" throws at startup and anything else
 * is redundant.
 */
export const resolveRateLimitStorage = (): RateLimitStorage | undefined => {
  const client = redis.client();
  if (!client) {
    return undefined;
  }

  defineIncrementWithTtl(client);

  return {
    async consume(key, rule) {
      try {
        // Namespaced away from the oRPC middleware's `rl:` keys and the cache's
        // — all three share one Redis database.
        const count = await incrementWithTtl(
          client,
          `auth-rl:${key}`,
          rule.window
        );
        if (count <= rule.max) {
          return { allowed: true, retryAfter: null };
        }
        return { allowed: false, retryAfter: rule.window };
      } catch (error) {
        // Fail open: a limiter rejecting sign-ins because Redis is down is a
        // worse outage than the one it prevents.
        log.warn({
          action: "auth.ratelimit.failed",
          message: error instanceof Error ? error.message : String(error),
        });
        return { allowed: true, retryAfter: null };
      }
    },
  };
};
