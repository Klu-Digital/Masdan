import { serve } from "@hono/node-server";
import { env } from "@masdan/env/server";
// Initializes the logger at module scope, so it must come before ./app, which
// pulls in @masdan/auth and @masdan/db. Keep this import first.
import { log, observability, parseError } from "@masdan/observability";
import { queue } from "@masdan/queue";
import { redis } from "@masdan/redis";

import { createApp } from "./app";

// Producer only — execution, cron and maintenance belong to apps/workers. Not
// awaited and not fatal: enqueue answers 503 until the connection is up.
void (async () => {
  try {
    await queue.start("producer");
  } catch (error) {
    log.error({ action: "queue.start_failed", ...parseError(error) });
  }
})();

serve(
  {
    fetch: createApp().fetch,
    port: env.PORT,
  },
  (info) => {
    console.log(`Server is running on http://localhost:${info.port}`);
  }
);

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    void (async () => {
      // allSettled, not all: a failed Redis quit must not prevent the log flush.
      await Promise.allSettled([
        observability.flush(),
        redis.quit(),
        queue.stop(),
      ]);
      process.exit(0);
    })();
  });
}
