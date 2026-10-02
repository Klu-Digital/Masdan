import { env } from "@masdan/env/shared-server";
import { initLogger } from "evlog";

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

export { createError, log, parseError } from "evlog";
