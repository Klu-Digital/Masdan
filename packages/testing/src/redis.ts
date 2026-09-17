import Redis from "ioredis";

let client: Redis | undefined;

/**
 * Reads `process.env.REDIS_URL` at call time: `setup/db.ts` sets it per worker,
 * possibly after this import.
 */
export const getTestRedis = (): Redis => {
  if (!client) {
    client = new Redis(process.env.REDIS_URL as string);

    // Never remove: without an `error` listener ioredis re-emits connection
    // errors as an unhandled Node `'error'` and crashes the process.
    client.on("error", (error: Error) => {
      console.warn(`[testing/redis] connection error: ${error.message}`);
    });
  }
  return client;
};

/**
 * `FLUSHDB`, deliberately never `FLUSHALL`: each worker has its own numbered
 * logical database, and `FLUSHALL` would wipe every other worker's too.
 */
export const flushTestRedis = async (): Promise<void> => {
  await getTestRedis().flushdb();
};

/**
 * `quit()` rejects with "Connection is closed." on a client that never dialled,
 * so fall back to `disconnect()` rather than reject out of an `afterAll`.
 */
export const closeTestRedis = async (): Promise<void> => {
  if (!client) {
    return;
  }
  const instance = client;
  client = undefined;
  try {
    await instance.quit();
  } catch {
    instance.disconnect();
  }
};
