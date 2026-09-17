import { env } from "@k22i/env/server";
import { jobNames, jobs, queue } from "@k22i/queue";
import type { JobDefinition, JobName } from "@k22i/queue";
import { sql } from "drizzle-orm";
import { z } from "zod";

import { adminMutationProcedure, adminProcedure } from "../procedures";

/**
 * pg-boss owns its own schema (`env.PGBOSS_SCHEMA`) and drizzle never models
 * it, so every query below reaches it with raw `sql` — always through
 * `sql.identifier`, never string interpolation.
 */
const pgBossSchema = () => sql.identifier(env.PGBOSS_SCHEMA);

const jobStates = [
  "created",
  "retry",
  "active",
  "completed",
  "cancelled",
  "failed",
] as const;

export const jobsPlatformRouter = {
  counts: adminProcedure.handler(async ({ context }) => {
    const result = await context.db.execute<{
      count: string;
      name: string;
      state: string;
    }>(
      sql`select name, state, count(*) as count
          from ${pgBossSchema()}.job
          group by name, state
          order by name, state`
    );

    return result.rows.map((row) => ({
      count: Number(row.count),
      name: row.name,
      state: row.state,
    }));
  }),

  /**
   * Enqueues on the producer's own pool (no `tx`): an operator action, not a
   * side effect of another write.
   */
  enqueue: adminMutationProcedure
    .input(
      z.object({
        name: z.enum(jobNames),
        payload: z.unknown(),
      })
    )
    .handler(async ({ context, input }) => {
      const definition = jobs[input.name];
      const payload = definition.schema.parse(input.payload);

      const jobId = await queue.enqueue(input.name, payload as never);

      context.log?.info("admin.jobs.enqueue", {
        action: "admin.jobs.enqueue",
        actorId: context.session.user.id,
        jobId,
        jobName: input.name,
      });

      return { jobId };
    }),

  recent: adminProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(200).default(50),
        name: z.enum(jobNames).optional(),
        state: z.enum(jobStates).optional(),
      })
    )
    .handler(async ({ context, input }) => {
      // Terminal-state jobs migrate out of `job` into `archive` on pg-boss's
      // own schedule, so both are queried.
      const terminal =
        input.state === "completed" ||
        input.state === "cancelled" ||
        input.state === "failed";

      const nameFilter = input.name ? sql`and name = ${input.name}` : sql``;
      const stateFilter = input.state ? sql`and state = ${input.state}` : sql``;

      const table = terminal ? sql`archive` : sql`job`;

      const result = await context.db.execute<{
        completed_on: string | null;
        created_on: string;
        id: string;
        name: string;
        output: unknown;
        retry_count: number;
        started_on: string | null;
        state: string;
      }>(
        sql`select id, name, state, retry_count, created_on, started_on, completed_on, output
            from ${pgBossSchema()}.${table}
            where true ${nameFilter} ${stateFilter}
            order by created_on desc
            limit ${input.limit}`
      );

      return result.rows.map((row) => ({
        completedOn: row.completed_on,
        createdOn: row.created_on,
        id: row.id,
        name: row.name,
        output: row.output,
        retryCount: row.retry_count,
        startedOn: row.started_on,
        state: row.state,
      }));
    }),

  /** Pure in-memory, no I/O — the source of truth for what jobs exist at all. */
  registry: adminProcedure.handler(() =>
    jobNames.map((name) => {
      // Widened to `JobDefinition`: indexing `jobs` with the `JobName` union
      // leaves `cron` unaddressable for the job that does not declare one.
      const definition: JobDefinition = jobs[name];
      return {
        cron: definition.cron
          ? { expression: definition.cron.expression, tz: definition.cron.tz }
          : null,
        name,
        queue: definition.queue ?? null,
      };
    })
  ),

  /**
   * Cron rows are registered by apps/workers from this same registry, so a
   * schedule with no registry entry means a job was deleted without being
   * unscheduled — pg-boss never removes one itself.
   */
  schedules: adminProcedure.handler(async ({ context }) => {
    const result = await context.db.execute<{
      cron: string;
      data: unknown;
      name: string;
      timezone: string;
    }>(
      sql`select name, cron, timezone, data
          from ${pgBossSchema()}.schedule
          order by name`
    );

    const registryCronNames = new Set(
      jobNames.filter((name) => (jobs[name] as JobDefinition).cron)
    );

    return result.rows.map((row) => ({
      cron: row.cron,
      data: row.data,
      inRegistry: registryCronNames.has(row.name as JobName),
      name: row.name,
      timezone: row.timezone,
    }));
  }),
};
