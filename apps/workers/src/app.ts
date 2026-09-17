import { queue } from "@masdan/queue";
import { Hono } from "hono";

import { mountMetrics } from "./metrics";

/**
 * Not an API: a Docker healthcheck and a Prometheus scrape. No request logger,
 * or a 10s healthcheck would dominate the logs. A factory, so tests can
 * `app.request(...)` without a port.
 */
export const createApp = () => {
  const app = new Hono();

  mountMetrics(app);

  // Reports the queue connection, not just liveness: a worker running but
  // detached from Postgres is exactly what a healthcheck should catch.
  app.get("/", (c) =>
    queue.isStarted() ? c.text("OK") : c.text("queue not started", 503)
  );

  return app;
};
