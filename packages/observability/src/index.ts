import { setTimeout as sleep } from "node:timers/promises";

import { env } from "@masdan/env/shared-server";
import { initLogger, log, parseError } from "evlog";

import { createDrain } from "./drain";

export const createObservability = (options?: { service?: string }) => {
  const { drain, flush } = createDrain();

  initLogger({
    drain,
    // Calling init again would strand the first drain's batching timer.
    env: {
      environment: env.NODE_ENV,
      service: options?.service ?? env.SERVICE_NAME,
    },
  });

  return { drain, flush };
};

export const observability = createObservability();

/** Under Docker's 10s stop grace, so a hung drain cannot keep a crashed process alive. */
const CRASH_FLUSH_TIMEOUT_MS = 5000;

let crashing = false;

const flushThenExit = async () => {
  try {
    await Promise.race([observability.flush(), sleep(CRASH_FLUSH_TIMEOUT_MS)]);
  } finally {
    process.exit(1);
  }
};

const crash = (action: string) => (error: unknown) => {
  if (crashing) {
    return;
  }
  crashing = true;
  log.error({ action, ...parseError(error) });
  void flushThenExit();
};

// Node's default prints to stderr and drops whatever the drain is still batching.
export const exitOnCrash = () => {
  process.on("uncaughtException", crash("process.uncaught_exception"));
  process.on("unhandledRejection", crash("process.unhandled_rejection"));
};

export { createError, log, parseError } from "evlog";
