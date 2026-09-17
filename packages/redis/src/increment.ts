import type Redis from "ioredis";

/**
 * `INCR` then a separate `EXPIRE` is not atomic: a crash between them leaves a
 * counter with no TTL, locking that key's caller out of a rate limit that now
 * never resets.
 */
const INCREMENT_WITH_TTL = `
local n = redis.call('INCR', KEYS[1])
if n == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
return n`;

const COMMAND_NAME = "masdanIncrementWithTtl";

/** ioredis attaches custom commands as methods; this is the shape we add. */
type ClientWithIncrement = Redis & {
  [COMMAND_NAME]?: (
    key: string,
    ttlSeconds: string | number
  ) => Promise<number>;
};

/**
 * Idempotent: both rate limiters call this on the same singleton, and
 * `defineCommand` throws on a redefine.
 */
export const defineIncrementWithTtl = (client: Redis): void => {
  const withIncrement = client as ClientWithIncrement;
  if (typeof withIncrement[COMMAND_NAME] === "function") {
    return;
  }

  client.defineCommand(COMMAND_NAME, {
    lua: INCREMENT_WITH_TTL,
    numberOfKeys: 1,
  });
};

/**
 * Pass `key` unprefixed: ioredis applies the client's `keyPrefix` to `KEYS[1]`
 * for custom commands too.
 */
export const incrementWithTtl = (
  client: Redis,
  key: string,
  ttlSeconds: number
): Promise<number> => {
  defineIncrementWithTtl(client);
  const withIncrement = client as ClientWithIncrement;
  if (!withIncrement[COMMAND_NAME]) {
    throw new Error(`${COMMAND_NAME} was not registered on the Redis client`);
  }
  // Called as a method so ioredis's Commander gets `this` bound to the client.
  return withIncrement[COMMAND_NAME](key, ttlSeconds);
};
