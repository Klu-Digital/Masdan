import { db } from "@masdan/db";
import { log, parseError } from "@masdan/observability";
import type { EvlogVariables } from "@masdan/observability/hono";
import { queue } from "@masdan/queue";
import { sql } from "drizzle-orm";
import type { Hono } from "hono";

/** `/` stays a liveness probe; this is the one that touches dependencies. */
export const mountHealth = (app: Hono<EvlogVariables>) => {
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
};
