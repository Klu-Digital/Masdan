import { prometheus } from "@hono/prometheus";
import { env } from "@masdan/env/workers";
import { log, parseError } from "@masdan/observability";
import { queue } from "@masdan/queue";
import type { Hono } from "hono";
import { bearerAuth } from "hono/bearer-auth";
import { Gauge, Registry } from "prom-client";

/**
 * Metrics are off unless both the path and the token are set, so an
 * unconfigured deployment exposes nothing.
 */
export const mountMetrics = (app: Hono) => {
  const path = env.PROMETHEUS_METRICS_PATH;
  const token = env.PROMETHEUS_METRICS_TOKEN;

  if (!path || !token) {
    return;
  }

  const registry = new Registry();
  const { printMetrics, registerMetrics } = prometheus({
    collectDefaultMetrics: true,
    registry,
  });

  // One gauge with a `state` label, not four gauges: the refresh below stays a
  // single query however many states we report.
  const jobs = new Gauge({
    help: "Jobs currently in each queue, by state",
    labelNames: ["queue", "state"] as const,
    name: "masdan_queue_jobs",
    registers: [registry],
  });

  const refreshQueueDepth = async (): Promise<void> => {
    if (!queue.isStarted()) {
      return;
    }

    try {
      for (const q of await queue.raw().getQueues()) {
        jobs.set({ queue: q.name, state: "queued" }, q.queuedCount);
        jobs.set({ queue: q.name, state: "active" }, q.activeCount);
        jobs.set({ queue: q.name, state: "deferred" }, q.deferredCount);
        jobs.set({ queue: q.name, state: "total" }, q.totalCount);
      }
    } catch (error) {
      // A failed scrape must not take the worker down; a stale series reads as
      // a gap in Prometheus, which is the honest signal.
      log.error({ action: "metrics.queue_depth_failed", ...parseError(error) });
    }
  };

  app.use("*", registerMetrics);
  app.get(path, bearerAuth({ token }), async (c) => {
    await refreshQueueDepth();
    return printMetrics(c);
  });
};
