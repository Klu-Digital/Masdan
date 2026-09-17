import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

/** Configuration consumed by both the API process and background workers. */
export const sharedServerVariables = {
  DATABASE_URL: z.string().min(1),
  NODE_ENV: z
    .enum(["development", "production", "staging", "test"])
    .default("development"),
  /** Postgres schema pg-boss owns. Kept out of `public` so drizzle never sees it. */
  PGBOSS_SCHEMA: z.string().min(1).default("pgboss"),
  POSTHOG_HOST: z.url().default("https://eu.i.posthog.com"),
  POSTHOG_PROJECT_API_KEY: z.string().startsWith("phc_").optional(),
  PROMETHEUS_METRICS_PATH: z.string().startsWith("/").optional(),
  PROMETHEUS_METRICS_TOKEN: z.string().min(1).optional(),
  /** Wakes workers on NOTIFY rather than the polling interval. */
  QUEUE_LISTEN_NOTIFY: z.stringbool().default(true),
  /** Connections pg-boss holds, per process. Separate from the app's own pool. */
  QUEUE_POOL_MAX: z.coerce.number().int().positive().default(10),
  /** Prefixes every key. Set this when several environments share one instance. */
  REDIS_KEY_PREFIX: z.string().min(1).optional(),
  /** Redis-backed features degrade gracefully when unset. */
  REDIS_URL: z.string().min(1).optional(),
  /** Tags every log line, so a shared drain can distinguish processes. */
  SERVICE_NAME: z.string().min(1).default("masdan-server"),
  /** Workers spawned per queue, per process. */
  WORKERS_CONCURRENCY: z.coerce.number().int().positive().default(1),
  WORKERS_POLLING_INTERVAL_SECONDS: z.coerce.number().positive().default(2),
};

export const env = createEnv({
  emptyStringAsUndefined: true,
  runtimeEnv: process.env,
  server: sharedServerVariables,
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});
