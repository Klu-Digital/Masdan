import { countHit } from "@masdan/redis";
import type { BetterAuthOptions } from "better-auth";

// Not re-exported from better-auth's root entry, so derive it rather than
// hand-typing a copy that drifts out from under a version bump.
type RateLimitStorage = NonNullable<
  NonNullable<BetterAuthOptions["rateLimit"]>["customStorage"]
>;

/**
 * Backs better-auth's `rateLimit.customStorage` with `countHit`: Redis when it
 * answers, an in-process counter when it is unset or down, so a Redis outage
 * never lifts the sign-in limit. Do not "simplify" this into
 * `secondaryStorage`: better-auth then stops writing the Postgres `session`
 * row, which makes the `activeOrganizationId` repair in `./index.ts` invisible
 * to `findSession` and 403s every new user. Never set `rateLimit.storage`:
 * "secondary-storage" throws at startup and anything else is redundant.
 */
export const resolveRateLimitStorage = (): RateLimitStorage => ({
  async consume(key, rule) {
    // Namespaced away from the oRPC middleware's `rl:` keys and the cache's —
    // all three share one Redis database.
    const count = await countHit(`auth-rl:${key}`, rule.window);
    if (count <= rule.max) {
      return { allowed: true, retryAfter: null };
    }
    return { allowed: false, retryAfter: rule.window };
  },
});
