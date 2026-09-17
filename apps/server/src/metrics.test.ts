import type { EvlogVariables } from "@k22i/observability/hono";
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { mountMetrics } from "./metrics";

/**
 * t3-env freezes `env` at import, so `vi.stubEnv` cannot reach it — mock the
 * module instead.
 */
const mockEnv = vi.hoisted(() => ({
  PROMETHEUS_METRICS_PATH: undefined as string | undefined,
  PROMETHEUS_METRICS_TOKEN: undefined as string | undefined,
}));

vi.mock("@k22i/env/server", () => ({ env: mockEnv }));

beforeEach(() => {
  mockEnv.PROMETHEUS_METRICS_PATH = undefined;
  mockEnv.PROMETHEUS_METRICS_TOKEN = undefined;
});

describe("mountMetrics", () => {
  it("registers nothing when neither PROMETHEUS_METRICS_PATH nor PROMETHEUS_METRICS_TOKEN is set", async () => {
    const app = new Hono<EvlogVariables>();
    mountMetrics(app);

    const res = await app.request("/metrics");

    expect(res.status).toBe(404);
  });

  it("registers nothing when only PROMETHEUS_METRICS_PATH is set (token missing)", async () => {
    mockEnv.PROMETHEUS_METRICS_PATH = "/metrics";

    const app = new Hono<EvlogVariables>();
    mountMetrics(app);

    const res = await app.request("/metrics");

    expect(res.status).toBe(404);
  });

  it("returns 401 for the metrics path with no Authorization header when both are set", async () => {
    mockEnv.PROMETHEUS_METRICS_PATH = "/metrics";
    mockEnv.PROMETHEUS_METRICS_TOKEN = "secret-token";

    const app = new Hono<EvlogVariables>();
    mountMetrics(app);

    const res = await app.request("/metrics");

    expect(res.status).toBe(401);
  });

  it("returns 200 with Prometheus exposition text when both are set and the bearer token matches", async () => {
    mockEnv.PROMETHEUS_METRICS_PATH = "/metrics";
    mockEnv.PROMETHEUS_METRICS_TOKEN = "secret-token";

    const app = new Hono<EvlogVariables>();
    mountMetrics(app);

    const res = await app.request("/metrics", {
      headers: { Authorization: "Bearer secret-token" },
    });
    const body = await res.text();

    expect(res.status).toBe(200);
    expect(body).toMatch(/^# HELP/mu);
  });
});
