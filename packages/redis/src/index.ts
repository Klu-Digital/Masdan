/**
 * The client singleton lives in `./client` rather than here so `./cache` can
 * import it without a cycle back through this file.
 */
export { createRedis, redis } from "./client";
export type { RedisHandle } from "./client";
export { isRedisConfigured, resolveRedisConfig } from "./config";
export type { RedisConfig } from "./config";
export { createCache } from "./cache";
export type { Cache } from "./cache";
export { defineIncrementWithTtl, incrementWithTtl } from "./increment";
export {
  countHit,
  createLocalCounter,
  resetLocalRateLimits,
} from "./rate-limit";
export type { LocalCounter } from "./rate-limit";
