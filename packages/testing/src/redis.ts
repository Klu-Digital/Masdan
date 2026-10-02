import Redis from "ioredis";

let client: Redis | undefined;

// Read at call time: `setup/db.ts` sets it per worker after import.
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

// Never `FLUSHALL`: it would wipe every other worker's database.
export const flushTestRedis = async (): Promise<void> => {
  await getTestRedis().flushdb();
};

// `quit()` rejects on a client that never dialled.
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
