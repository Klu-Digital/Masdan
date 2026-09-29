import { setTimeout as sleep } from "node:timers/promises";

import type { Database } from "@masdan/db";

import { getTestPool } from "./db";

const POLL_MS = 10;
const BLOCK_TIMEOUT_MS = 5000;

type Outcome<T> = { ok: true; value: T } | { error: unknown; ok: false };

const settle = async <T>(promise: Promise<T>): Promise<Outcome<T>> => {
  try {
    return { ok: true, value: await promise };
  } catch (error) {
    return { error, ok: false };
  }
};

/** Some backend on this worker's database is waiting on a lock. */
const lockWaitSeen = async (): Promise<boolean> => {
  const { rows } = await getTestPool().query<{ blocked: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM pg_stat_activity
       WHERE datname = current_database() AND wait_event_type = 'Lock'
     ) AS blocked`
  );
  return rows[0]?.blocked ?? false;
};

/** Resolves once a lock wait is seen, on timeout, or when `signal` aborts. */
const lockWait = async (signal: AbortSignal): Promise<void> => {
  const deadline = Date.now() + BLOCK_TIMEOUT_MS;
  while (!signal.aborted && Date.now() < deadline) {
    if (await lockWaitSeen()) {
      return;
    }
    await sleep(POLL_MS);
  }
};

/**
 * Runs `hold` in a transaction and keeps it open, its locks held, while
 * `contender` runs. The holder commits once the contender is seen waiting on
 * a lock, or has already finished (the missing-lock bug a test is looking
 * for). Returns the contender's result or rethrows its error.
 */
export const whileHolding = async <T>(
  db: Database,
  hold: (tx: Database) => Promise<unknown>,
  contender: () => Promise<T>
): Promise<T> => {
  const held = Promise.withResolvers<null>();
  const released = Promise.withResolvers<null>();
  const holder = db.transaction(async (tx) => {
    await hold(tx);
    held.resolve(null);
    await released.promise;
  });
  await Promise.race([held.promise, holder]);

  const outcome = settle(contender());
  const stop = new AbortController();
  await Promise.race([outcome, lockWait(stop.signal)]);
  stop.abort();

  released.resolve(null);
  await holder;
  const result = await outcome;
  if (!result.ok) {
    throw result.error;
  }
  return result.value;
};
