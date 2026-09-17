import { env } from "@k22i/env/shared-server";
import type { ConstructorOptions } from "pg-boss";

/** The API server produces, `apps/workers` consumes. The split is what keeps
 * maintenance and cron off the request path. */
export type QueueRole = "producer" | "consumer";

/**
 * Reads settings at call time, so merely importing this package does not trip
 * the frozen-`env` hazard.
 */
export const resolveQueueConfig = (role: QueueRole): ConstructorOptions => {
  const consumer = role === "consumer";

  // Keys are alphabetical for `sort-keys`. The two pairings that matter:
  // `migrate`/`createSchema` are off in both roles, since schema DDL belongs to
  // `pnpm queue:migrate`; `supervise`/`schedule` are consumer-only, which keeps
  // a scaled-out API tier from multiplying maintenance load.
  return {
    // Shows up in pg_stat_activity — the fastest way to tell which process is
    // holding a connection.
    application_name: consumer ? "k22i-workers" : "k22i-producer",
    connectionString: env.DATABASE_URL,
    createSchema: false,
    max: env.QUEUE_POOL_MAX,
    migrate: false,
    schedule: consumer,
    schema: env.PGBOSS_SCHEMA,
    supervise: consumer,
    useListenNotify: env.QUEUE_LISTEN_NOTIFY,
  };
};
