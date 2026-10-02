import { env } from "@masdan/env/shared-server";
import type { ConstructorOptions } from "pg-boss";

/** The API server produces, `apps/workers` consumes. The split is what keeps
 * maintenance and cron off the request path. */
export type QueueRole = "producer" | "consumer";

export const resolveQueueConfig = (role: QueueRole): ConstructorOptions => {
  const consumer = role === "consumer";

  // Schema DDL belongs to `pnpm queue:migrate`; maintenance is consumer-only.
  return {
    // Shows up in pg_stat_activity — the fastest way to tell which process is
    // holding a connection.
    application_name: consumer ? "masdan-workers" : "masdan-producer",
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
