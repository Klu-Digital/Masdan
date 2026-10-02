import { env } from "@masdan/env/server";
import { log, parseError } from "@masdan/observability";
import { queue } from "@masdan/queue";
import { redis } from "@masdan/redis";
import { resolveStorageConfig } from "@masdan/storage";
import { sql } from "drizzle-orm";

import { adminProcedure } from "../procedures";

const processStartedAt = Date.now();

export const systemPlatformRouter = {
  /** Non-secret settings only, explicitly whitelisted — never spread `env`. */
  config: adminProcedure.handler(() => ({
    authRateLimit: {
      enabled: env.AUTH_RATE_LIMIT_ENABLED ?? null,
      max: env.AUTH_RATE_LIMIT_MAX,
      windowSeconds: env.AUTH_RATE_LIMIT_WINDOW,
    },
    betterAuthUrl: env.BETTER_AUTH_URL,
    corsOrigin: env.CORS_ORIGIN,
    metricsEnabled: Boolean(
      env.PROMETHEUS_METRICS_PATH && env.PROMETHEUS_METRICS_TOKEN
    ),
    nodeEnv: env.NODE_ENV,
    pgBossSchema: env.PGBOSS_SCHEMA,
    port: env.PORT,
    queue: {
      listenNotify: env.QUEUE_LISTEN_NOTIFY,
      poolMax: env.QUEUE_POOL_MAX,
    },
    serviceName: env.SERVICE_NAME,
    storageMaxUploadBytes: env.STORAGE_MAX_UPLOAD_BYTES,
    // Behind a proxy, `false` keys every rate limit to the proxy's IP.
    trustProxyHeaders: env.TRUST_PROXY_HEADERS,
  })),

  health: adminProcedure.handler(async ({ context }) => {
    const dbStart = performance.now();
    let dbLatencyMs: number | null = null;
    try {
      await context.db.execute(sql`select 1`);
      dbLatencyMs = performance.now() - dbStart;
    } catch (error) {
      log.warn({ action: "system.db_ping_failed", ...parseError(error) });
      dbLatencyMs = null;
    }

    const redisConfigured = redis.isConfigured();
    let redisReachable = false;
    if (redisConfigured) {
      try {
        // Redis fails open, so an unreachable one is a degraded reading here,
        // never a thrown error.
        const pong = await redis.client()?.ping();
        redisReachable = pong === "PONG";
      } catch (error) {
        log.warn({ action: "system.redis_ping_failed", ...parseError(error) });
        redisReachable = false;
      }
    }

    const storageConfig = resolveStorageConfig();

    return {
      database: { latencyMs: dbLatencyMs, reachable: dbLatencyMs !== null },
      nodeEnv: env.NODE_ENV,
      nodeVersion: process.version,
      queue: { started: queue.isStarted() },
      redis: { configured: redisConfigured, reachable: redisReachable },
      serviceName: env.SERVICE_NAME,
      storage: {
        bucket: storageConfig?.bucket ?? null,
        configured: storageConfig !== null,
      },
      uptimeSeconds: Math.floor((Date.now() - processStartedAt) / 1000),
    };
  }),
};
