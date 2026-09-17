import { log } from "@masdan/observability";
import Redis from "ioredis";

import { resolveRedisConfig } from "./config";
import type { RedisConfig } from "./config";

export const createRedis = () => {
  // Built on first use: `redis` below is a module-scope singleton, so eager
  // construction would make merely importing this package dial out in an
  // unconfigured environment.
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
        // Do NOT set `enableOfflineQueue: false`: with `lazyConnect`, ioredis
        // needs the offline queue to hold the first command while it dials, and
        // disabling it makes that command throw "Stream isn't writeable".
        // `commandTimeout` bounds the wait instead.
        commandTimeout: 1000,
        maxRetriesPerRequest: 1,
        retryStrategy: (times) => Math.min(times * 200, 5000),
      });

      // Never remove: without an `error` listener ioredis re-emits connection
      // errors as an unhandled Node `'error'` and crashes the process on
      // ECONNREFUSED.
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
    /**
     * `null` when unconfigured, never a throw — every caller handles `null`.
     */
    client: getClient,

    isConfigured(): boolean {
      return resolveRedisConfig() !== null;
    },

    quit,
  };
};

export type RedisHandle = ReturnType<typeof createRedis>;

export const redis: RedisHandle = createRedis();
