import { call } from "@orpc/server";
import { describe, expect, it, vi } from "vite-plus/test";

import type { Context } from "../context";

/**
 * `env` is frozen at import, so mock the module rather than reaching for
 * `vi.stubEnv`. Every field the handler might read has to exist here, or it
 * reads `undefined`.
 */
const mockEnv = vi.hoisted(() => ({
  AUTH_RATE_LIMIT_ENABLED: true,
  AUTH_RATE_LIMIT_MAX: 100,
  AUTH_RATE_LIMIT_WINDOW: 10,
  BETTER_AUTH_SECRET: "a-very-secret-value-that-must-never-leak-out",
  BETTER_AUTH_URL: "https://api.example.test",
  CORS_ORIGIN: "https://app.example.test",
  NODE_ENV: "test",
  PGBOSS_SCHEMA: "pgboss",
  PORT: 1900,
  PROMETHEUS_METRICS_PATH: "/metrics",
  PROMETHEUS_METRICS_TOKEN: "prometheus-bearer-token",
  QUEUE_LISTEN_NOTIFY: true,
  QUEUE_POOL_MAX: 10,
  REDIS_URL: "redis://user:hunter2@localhost:6379",
  S3_ACCESS_KEY_ID: "AKIA_TEST",
  S3_SECRET_ACCESS_KEY: "s3-secret-value",
  SERVICE_NAME: "masdan-server",
  STORAGE_MAX_UPLOAD_BYTES: 26_214_400,
  TRUST_PROXY_HEADERS: false,
  WORKERS_CONCURRENCY: 1,
  WORKERS_POLLING_INTERVAL_SECONDS: 2,
}));

vi.mock("@masdan/env/server", () => ({ env: mockEnv }));

const adminContext = {
  auth: null,
  db: undefined,
  ip: undefined,
  log: undefined,
  session: { session: {}, user: { role: "admin" } },
} as unknown as Context;

/** Every allow-listed field name it is fine for a URL to appear under — none
 * of these carry credentials the way `REDIS_URL` above does. */
const ALLOWED_URL_KEYS = new Set(["betterAuthUrl", "corsOrigin"]);

const flattenKeys = (value: unknown, prefix = ""): string[] => {
  if (typeof value !== "object" || value === null) {
    return [];
  }
  return Object.entries(value).flatMap(([key, nested]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return [path, ...flattenKeys(nested, path)];
  });
};

describe("admin.system.config", () => {
  it("never exposes a secret, token, password or credential-bearing URL", async () => {
    const { systemPlatformRouter } = await import("./system.platform");

    const config = await call(systemPlatformRouter.config, undefined, {
      context: adminContext,
    });

    const keys = flattenKeys(config);
    const suspicious = keys.filter((key) => {
      const leaf = key.split(".").pop() ?? key;
      if (ALLOWED_URL_KEYS.has(leaf)) {
        return false;
      }
      return /secret|token|password|credential|key$/iu.test(leaf);
    });

    expect(suspicious).toEqual([]);
  });

  it("never includes the raw REDIS_URL, S3 credentials or BETTER_AUTH_SECRET values anywhere in the payload", async () => {
    const { systemPlatformRouter } = await import("./system.platform");

    const config = await call(systemPlatformRouter.config, undefined, {
      context: adminContext,
    });

    const serialized = JSON.stringify(config);
    expect(serialized).not.toContain("hunter2");
    expect(serialized).not.toContain(mockEnv.S3_SECRET_ACCESS_KEY);
    expect(serialized).not.toContain(mockEnv.BETTER_AUTH_SECRET);
    expect(serialized).not.toContain(mockEnv.PROMETHEUS_METRICS_TOKEN);
  });
});
