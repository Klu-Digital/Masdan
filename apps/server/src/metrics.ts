import { prometheus } from "@hono/prometheus";
import { env } from "@masdan/env/server";
import type { EvlogVariables } from "@masdan/observability/hono";
import type { Hono } from "hono";
import { bearerAuth } from "hono/bearer-auth";

export const mountMetrics = (app: Hono<EvlogVariables>) => {
  const path = env.PROMETHEUS_METRICS_PATH;
  const token = env.PROMETHEUS_METRICS_TOKEN;

  if (!path || !token) {
    return;
  }

  const { printMetrics, registerMetrics } = prometheus({
    collectDefaultMetrics: true,
  });

  app.use("*", registerMetrics);
  app.get(path, bearerAuth({ token }), printMetrics);
};
