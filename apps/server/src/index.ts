import { setTimeout as sleep } from "node:timers/promises";
import { promisify } from "node:util";

import { serve } from "@hono/node-server";
import type { ServerType } from "@hono/node-server";
import { env } from "@masdan/env/server";
// Initializes the logger at module scope, so it must come before ./app, which
// pulls in @masdan/auth and @masdan/db. Keep this import first.
import { log, observability, parseError } from "@masdan/observability";
import { queue } from "@masdan/queue";
import { redis } from "@masdan/redis";

import { createApp } from "./app";

/** Under Docker's 10s stop grace, so the flush below still runs before SIGKILL. */
const SHUTDOWN_DRAIN_MS = 8000;

// Producer only — execution, cron and maintenance belong to apps/workers. Not
// awaited and not fatal: enqueue answers 503 until the connection is up.
void (async () => {
  try {
    await queue.start("producer");
  } catch (error) {
    log.error({ action: "queue.start_failed", ...parseError(error) });
  }
})();

const server = serve(
  {
    fetch: createApp().fetch,
    port: env.PORT,
  },
  (info) => {
    log.info({ action: "server.listening", port: info.port });
  }
);

const close = async (httpServer: ServerType): Promise<"closed"> => {
  try {
    await promisify(httpServer.close.bind(httpServer))();
  } catch {
    // Already closed: nothing left to drain.
  }
  return "closed";
};

/**
 * Stops accepting connections and waits for in-flight requests. A streamed
 * response can hold a connection open indefinitely, hence the deadline.
 */
const drain = async (httpServer: ServerType): Promise<void> => {
  const outcome = await Promise.race([
    close(httpServer),
    sleep(SHUTDOWN_DRAIN_MS, "timeout" as const),
  ]);
  if (outcome === "timeout" && "closeAllConnections" in httpServer) {
    httpServer.closeAllConnections();
  }
};

let shuttingDown = false;

const handleShutdownSignal = (signal: "SIGTERM" | "SIGINT") => {
  // A second Ctrl-C during a long drain should not start a second shutdown.
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;

  void (async () => {
    log.info({ action: "server.shutdown", signal });
    await drain(server);
    // allSettled, not all: a failed Redis quit must not prevent the log flush.
    await Promise.allSettled([
      observability.flush(),
      redis.quit(),
      queue.stop(),
    ]);
    process.exit(0);
  })();
};

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => handleShutdownSignal(signal));
}
