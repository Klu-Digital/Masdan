import { log } from "@masdan/observability";
import Redis from "ioredis";

import { resolveRedisConfig } from "./config";
import type { RedisConfig } from "./config";

export const createRedis = () => {
  // Lazy so importing this package never dials out.
  let client: Redis | undefined;

  const getClient = (): Redis | null => {
    const config: RedisConfig | null = resolveRedisConfig();
    if (!config) {
      return null;
    }

    if (!client) {
      client = new Redis(config.url, {
        lazyConnect: true,
        ...(config.keyPrefix ? { keyPrefix: config.keyPrefix } : {}),
        // Do NOT set `enableOfflineQueue: false`: with `lazyConnect` the first command
        // throws "Stream isn't writeable".
        commandTimeout: 1000,
        maxRetriesPerRequest: 1,
        // ioredis 6 defaults to RESP3, which needs Redis 6+; self-hosters may run older.
        protocol: 2,
        retryStrategy: (times) => Math.min(times * 200, 5000),
      });

      // Never remove: without it ECONNREFUSED crashes the process.
      client.on("error", (error: Error) => {
        log.warn({ action: "redis.error", message: error.message });
      });
    }

    return client;
  };

  const quit = async (): Promise<void> => {
    if (!client) {
      return;
    }
    const instance = client;
    client = undefined;
    try {
      await instance.quit();
    } catch {
      // `quit()` rejects with "Connection is closed." on a client that never
      // dialled. Either way the socket is gone — force it down so the loop drains.
      instance.disconnect();
    }
  };

  return {
    /** `null` when unconfigured, never a throw. */
    client: getClient,

    isConfigured(): boolean {
      return resolveRedisConfig() !== null;
    },

    quit,
  };
};

export type RedisHandle = ReturnType<typeof createRedis>;

export const redis: RedisHandle = createRedis();
