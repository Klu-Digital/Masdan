import { db } from "@masdan/db";
import { log, parseError } from "@masdan/observability";
import { queue } from "@masdan/queue";
import { sql } from "drizzle-orm";
import { Hono } from "hono";

import { mountMetrics } from "./metrics";

// No request logger: the 10s healthcheck would dominate the logs.
export const createApp = () => {
  const app = new Hono();

  mountMetrics(app);

  // Reports the queue connection, not just liveness: a worker running but
  // detached from Postgres is exactly what a healthcheck should catch.
  app.get("/", (c) =>
    queue.isStarted() ? c.text("OK") : c.text("queue not started", 503)
  );

  app.get("/health/ready", async (c) => {
    let database = true;
    try {
      await db.execute(sql`select 1`);
    } catch (error) {
      database = false;
      log.warn({ action: "health.db_unreachable", ...parseError(error) });
    }

    const queueStarted = queue.isStarted();
    const ready = database && queueStarted;

    return c.json(
      {
        database,
        queue: queueStarted,
        status: ready ? "ready" : "unavailable",
      },
      ready ? 200 : 503
    );
  });

  return app;
};
