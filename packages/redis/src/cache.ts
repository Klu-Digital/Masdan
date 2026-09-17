import { log } from "@masdan/observability";

import { redis } from "./client";

/**
 * A best-effort JSON cache over the shared Redis client. Every method swallows
 * Redis failures, degrading to a cache miss and logging `cache.<op>.failed`. No
 * stampede protection: N concurrent callers missing the same key all call `fn`.
 */
export interface Cache {
  get: <T>(key: string) => Promise<T | undefined>;
  set: <T>(key: string, value: T, ttlSeconds: number) => Promise<void>;
  del: (...keys: string[]) => Promise<void>;
  /**
   * `undefined` is never cached — indistinguishable from a miss. `null` is.
   */
  remember: <T>(
    key: string,
    ttlSeconds: number,
    fn: () => Promise<T>
  ) => Promise<T>;
}

/**
 * Keys become `${namespace}:${key}`, on top of ioredis's global `keyPrefix`.
 */
export const createCache = (namespace: string): Cache => {
  const namespaced = (key: string): string => `${namespace}:${key}`;

  return {
    async del(...keys: string[]): Promise<void> {
      const client = redis.client();
      if (!client || keys.length === 0) {
        return;
      }

      try {
        await client.del(...keys.map(namespaced));
      } catch (error) {
        log.warn({
          action: "cache.del.failed",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    },

    async get<T>(key: string): Promise<T | undefined> {
      const client = redis.client();
      if (!client) {
        return undefined;
      }

      const namespacedKey = namespaced(key);
      try {
        const raw = await client.get(namespacedKey);
        if (raw === null) {
          return undefined;
        }
        try {
          return JSON.parse(raw) as T;
        } catch (parseError) {
          // Poisoned entry — treat as a miss and drop it so it stops failing.
          log.warn({
            action: "cache.get.failed",
            message:
              parseError instanceof Error
                ? parseError.message
                : String(parseError),
          });
          await client.del(namespacedKey).catch(() => {
            /* empty */
          });
          return undefined;
        }
      } catch (error) {
        log.warn({
          action: "cache.get.failed",
          message: error instanceof Error ? error.message : String(error),
        });
        return undefined;
      }
    },

    async remember<T>(
      key: string,
      ttlSeconds: number,
      fn: () => Promise<T>
    ): Promise<T> {
      const client = redis.client();
      if (!client) {
        return fn();
      }

      const namespacedKey = namespaced(key);
      try {
        const raw = await client.get(namespacedKey);
        if (raw !== null) {
          try {
            return JSON.parse(raw) as T;
          } catch (parseError) {
            log.warn({
              action: "cache.remember.failed",
              message:
                parseError instanceof Error
                  ? parseError.message
                  : String(parseError),
            });
            await client.del(namespacedKey).catch(() => {
              /* empty */
            });
          }
        }
      } catch (error) {
        log.warn({
          action: "cache.remember.failed",
          message: error instanceof Error ? error.message : String(error),
        });
      }

      const value = await fn();
      if (value === undefined) {
        return value;
      }

      try {
        await client.set(
          namespacedKey,
          JSON.stringify(value),
          "EX",
          ttlSeconds
        );
      } catch (error) {
        log.warn({
          action: "cache.remember.failed",
          message: error instanceof Error ? error.message : String(error),
        });
      }

      return value;
    },

    async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
      const client = redis.client();
      if (!client) {
        return;
      }

      try {
        await client.set(
          namespaced(key),
          JSON.stringify(value),
          "EX",
          ttlSeconds
        );
      } catch (error) {
        log.warn({
          action: "cache.set.failed",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    },
  };
};
