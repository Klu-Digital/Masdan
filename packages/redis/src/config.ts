import { env } from "@masdan/env/shared-server";

export interface RedisConfig {
  url: string;
  keyPrefix: string | undefined;
}

/**
 * Reads Redis settings at call time, so an unconfigured deployment boots
 * normally and only degrades once something reaches for the client. Returns
 * `null` when `REDIS_URL` is unset.
 */
export const resolveRedisConfig = (): RedisConfig | null => {
  const url = env.REDIS_URL;
  if (!url) {
    return null;
  }

  return {
    keyPrefix: env.REDIS_KEY_PREFIX,
    url,
  };
};

export const isRedisConfigured = (): boolean => resolveRedisConfig() !== null;
