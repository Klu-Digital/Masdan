import { log } from "@masdan/observability";

import { redis } from "./client";
import { incrementWithTtl } from "./increment";

/** Past this many live windows the oldest are dropped, so spraying keys cannot grow the heap unbounded. */
const LOCAL_MAX_KEYS = 50_000;

export interface LocalCounter {
  increment: (key: string, windowSeconds: number) => number;
  clear: () => void;
}

// Per process, so N replicas allow N times the limit. Still beats failing open.
export const createLocalCounter = (
  options: { maxKeys?: number; now?: () => number } = {}
): LocalCounter => {
  const maxKeys = options.maxKeys ?? LOCAL_MAX_KEYS;
  const now = options.now ?? Date.now;
  const windows = new Map<string, { count: number; resetAt: number }>();

  const evict = (at: number): void => {
    for (const [key, entry] of windows) {
      if (entry.resetAt <= at) {
        windows.delete(key);
      }
    }
    // Map iterates in insertion order, so this drops the oldest windows first.
    for (const key of windows.keys()) {
      if (windows.size < maxKeys) {
        break;
      }
      windows.delete(key);
    }
  };

  return {
    clear() {
      windows.clear();
    },

    increment(key, windowSeconds) {
      const at = now();
      const entry = windows.get(key);
      if (entry && entry.resetAt > at) {
        entry.count += 1;
        return entry.count;
      }
      windows.delete(key);
      if (windows.size >= maxKeys) {
        evict(at);
      }
      windows.set(key, { count: 1, resetAt: at + windowSeconds * 1000 });
      return 1;
    },
  };
};

const localCounter = createLocalCounter();

/** Falls back to the in-process counter: limits must not vanish with Redis. */
export const countHit = async (
  key: string,
  windowSeconds: number
): Promise<number> => {
  const client = redis.client();
  if (client) {
    try {
      return await incrementWithTtl(client, key, windowSeconds);
    } catch (error) {
      // The key is never logged: it embeds the caller's identity, often an IP.
      log.warn({
        action: "ratelimit.fallback",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return localCounter.increment(key, windowSeconds);
};

/** Test-only: forget every in-process window. */
export const resetLocalRateLimits = (): void => {
  localCounter.clear();
};
