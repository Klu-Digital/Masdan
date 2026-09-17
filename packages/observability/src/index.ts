import { env } from "@masdan/env/shared-server";
import { initLogger } from "evlog";

import { createDrain } from "./drain";

export const createObservability = (options?: { service?: string }) => {
  const { drain, flush } = createDrain();

  initLogger({
    drain,
    // Falls back to env so apps/workers gets its own service name without
    // re-running this — calling it again would strand the first drain's
    // batching timer.
    env: {
      environment: env.NODE_ENV,
      service: options?.service ?? env.SERVICE_NAME,
    },
  });

  return { drain, flush };
};

export const observability = createObservability();

export { createError, log, parseError } from "evlog";
