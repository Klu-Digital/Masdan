/**
 * An in-memory ioredis stand-in, for unit tests that need cache or rate-limit
 * behaviour. Lives here, not in `@k22i/testing`, which depends on `@k22i/auth`
 * -> `@k22i/redis`. Imports nothing from `@k22i/*`: it loads inside `vi.mock`
 * factories, where an `@k22i/env/shared-server` import would freeze `env` against
 * placeholders. Only the commands this repo issues.
 */

interface Entry {
  value: string;
  expiresAt: number | undefined;
}

export interface FakeRedis {
  get: (key: string) => Promise<string | null>;
  set: (
    key: string,
    value: string,
    mode?: "EX",
    ttlSeconds?: number
  ) => Promise<"OK">;
  del: (...keys: string[]) => Promise<number>;
  incr: (key: string) => Promise<number>;
  expire: (key: string, ttlSeconds: number) => Promise<number>;
  ttl: (key: string) => Promise<number>;
  flushdb: () => Promise<"OK">;
  defineCommand: (
    name: string,
    definition: { numberOfKeys: number; lua: string }
  ) => void;
  k22iIncrementWithTtl?: (
    key: string,
    ttlSeconds: string | number
  ) => Promise<number>;
  /** Test-only escape hatch: the raw store, with keys already prefixed. */
  readonly store: Map<string, Entry>;
  /** Test-only: make the next `count` commands reject, to exercise fail-open. */
  failNext: (count?: number) => void;
}

export const createFakeRedis = (
  options: { keyPrefix?: string } = {}
): FakeRedis => {
  const prefix = options.keyPrefix ?? "";
  const store = new Map<string, Entry>();
  let failures = 0;

  /** Mirrors ioredis, which applies `keyPrefix` to built-ins and custom commands alike. */
  const k = (key: string): string => `${prefix}${key}`;

  /** Expiry is lazy, as in Redis: a key is gone once something looks for it. */
  const read = (key: string): Entry | undefined => {
    const entry = store.get(key);
    if (!entry) {
      return undefined;
    }
    if (entry.expiresAt !== undefined && entry.expiresAt <= Date.now()) {
      store.delete(key);
      return undefined;
    }
    return entry;
  };

  // A rejection, not a synchronous throw: that is what a real ioredis command
  // does with the connection down, and what the fail-open callers expect.
  const guard = (): Promise<void> => {
    if (failures > 0) {
      failures -= 1;
      return Promise.reject(new Error("fake-redis: injected failure"));
    }
    return Promise.resolve();
  };

  const fake: FakeRedis = {
    /**
     * No Lua interpreter: the name is matched and a JS equivalent attached, so
     * this proves nothing about the script's atomicity — that is what
     * `redis.db.test.ts` is for.
     */
    defineCommand(name) {
      if (name !== "k22iIncrementWithTtl") {
        throw new Error(`fake-redis: unknown custom command "${name}"`);
      }
      if (fake.k22iIncrementWithTtl) {
        return;
      }
      fake.k22iIncrementWithTtl = async (key, ttlSeconds) => {
        await guard();
        const count = await fake.incr(key);
        if (count === 1) {
          await fake.expire(key, Number(ttlSeconds));
        }
        return count;
      };
    },

    async del(...keys) {
      await guard();
      let removed = 0;
      for (const key of keys) {
        if (store.delete(k(key))) {
          removed += 1;
        }
      }
      return removed;
    },

    async expire(key, ttlSeconds) {
      await guard();
      const full = k(key);
      const entry = read(full);
      if (!entry) {
        return 0;
      }
      entry.expiresAt = Date.now() + ttlSeconds * 1000;
      return 1;
    },

    failNext(count = 1) {
      failures = count;
    },

    async flushdb() {
      await guard();
      store.clear();
      return "OK";
    },

    async get(key) {
      await guard();
      return read(k(key))?.value ?? null;
    },

    async incr(key) {
      await guard();
      const full = k(key);
      const next = Number(read(full)?.value ?? "0") + 1;
      store.set(full, {
        expiresAt: read(full)?.expiresAt,
        value: String(next),
      });
      return next;
    },

    async set(key, value, mode, ttlSeconds) {
      await guard();
      const expiresAt =
        mode === "EX" && ttlSeconds !== undefined
          ? Date.now() + ttlSeconds * 1000
          : undefined;
      store.set(k(key), { expiresAt, value });
      return "OK";
    },

    store,

    async ttl(key) {
      await guard();
      const entry = read(k(key));
      if (!entry) {
        // Redis: key does not exist
        return -2;
      }
      if (entry.expiresAt === undefined) {
        // Redis: exists, no TTL
        return -1;
      }
      return Math.ceil((entry.expiresAt - Date.now()) / 1000);
    },
  };

  return fake;
};
