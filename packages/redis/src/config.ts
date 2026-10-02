import { env } from "@masdan/env/shared-server";

export interface RedisConfig {
  url: string;
  keyPrefix: string | undefined;
}

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
