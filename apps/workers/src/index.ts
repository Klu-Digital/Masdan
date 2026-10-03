import { serve } from "@hono/node-server";
import { env } from "@masdan/env/workers";
// Initializes the logger at module scope, so it must come before anything
// pulling in @masdan/db or @masdan/queue. Keep this import first.
import {
  exitOnCrash,
  log,
  observability,
  parseError,
} from "@masdan/observability";
import { queue } from "@masdan/queue";

import { createApp } from "./app";
import { registerWorkers } from "./register";

exitOnCrash();

const server = serve(
  { fetch: createApp().fetch, port: env.WORKERS_PORT },
  (info) => {
    log.info({ action: "workers.listening", port: info.port });
  }
);

// Awaited and fatal, unlike the producer in apps/server: a worker that cannot
// reach the queue has nothing to do at all, so let the supervisor restart it.
await queue.start("consumer");
await registerWorkers();

// Order: health server, then drain the queue, then flush logs.
let shuttingDown = false;

const handleShutdownSignal = (signal: "SIGTERM" | "SIGINT") => {
  // A second Ctrl-C during a long drain should not start a second shutdown.
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;

  void (async () => {
    log.info({ action: "workers.shutdown", signal });
    try {
      server.close();
      await queue.stop({ graceful: true });
    } catch (error) {
      log.error({ action: "workers.shutdown_failed", ...parseError(error) });
    } finally {
      await observability.flush().catch(() => {
        /* nothing actionable if the final flush fails */
      });
      process.exit(0);
    }
  })();
};

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => handleShutdownSignal(signal));
}
