import { serve } from "@hono/node-server";
import { env } from "@k22i/env/workers";
// Initializes the logger at module scope, so it must come before anything
// pulling in @k22i/db or @k22i/queue. Keep this import first.
import { log, observability, parseError } from "@k22i/observability";
import { queue } from "@k22i/queue";

import { createApp } from "./app";
import { registerWorkers } from "./register";

const server = serve(
  { fetch: createApp().fetch, port: env.WORKERS_PORT },
  (info) => {
    console.log(
      `Workers health server is running on http://localhost:${info.port}`
    );
  }
);

// Awaited and fatal, unlike the producer in apps/server: a worker that cannot
// reach the queue has nothing to do at all, so let the supervisor restart it.
await queue.start("consumer");
await registerWorkers();

/**
 * Shutdown order matters: health server first so an orchestrator stops
 * checking, then drain the queue rather than abandon in-flight jobs, then flush
 * logs.
 */
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
