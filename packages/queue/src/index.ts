import { env } from "@k22i/env/shared-server";
import { createError, log, parseError } from "@k22i/observability";
import { sql } from "drizzle-orm";
import { fromDrizzle, PgBoss } from "pg-boss";
import type {
  DrizzleTransactionLike,
  Job,
  SendOptions,
  StopOptions,
  WorkOptions,
} from "pg-boss";

import { resolveQueueConfig } from "./config";
import type { QueueRole } from "./config";
import { DEFAULT_QUEUE_OPTIONS, jobs } from "./jobs";
import type { JobDefinition, JobName, JobPayload } from "./jobs";

// `Object.entries` yields a union of the individual job types, on which optional
// members like `cron` are not addressable. Widening is what makes it iterable.
const jobEntries = Object.entries(jobs) as [JobName, JobDefinition][];

/** Structurally typed by pg-boss, which keeps this package off `@k22i/db`. */
export type Transaction = DrizzleTransactionLike;

export type EnqueueOptions = Omit<SendOptions, "db"> & {
  /**
   * In practice `context.db` inside a `mutationProcedure`: the job row is
   * written on the caller's connection, so it commits with the rows it depends
   * on and disappears if they roll back. Omitting it enqueues on pg-boss's own
   * pool, which commits immediately.
   */
  tx?: Transaction;
};

/** The per-job view handed to a handler, with `data` already validated. */
export type JobOf<N extends JobName> = Job<JobPayload<N>>;

export const createQueueClient = () => {
  let boss: PgBoss | undefined;
  let starting: Promise<PgBoss> | undefined;

  const requireStarted = (): PgBoss => {
    if (!boss) {
      throw createError({
        code: "QUEUE_NOT_STARTED",
        fix: "Call queue.start('producer') during boot (see apps/server/src/index.ts)",
        message: "The job queue has not been started",
        status: 503,
        why: "queue.start() must resolve before jobs can be enqueued or worked",
      });
    }
    return boss;
  };

  /**
   * Idempotent: concurrent callers share one in-flight start. Queues are
   * registered here rather than in a migration, so a new job needs no migration
   * to work.
   */
  const start = (role: QueueRole): Promise<PgBoss> => {
    starting ??= (async () => {
      const instance = new PgBoss(resolveQueueConfig(role));

      // pg-boss surfaces background failures through events, not rejections.
      // Unhandled, 'error' would take the process down.
      instance.on("error", (error) => {
        log.error({ action: "queue.error", ...parseError(error) });
      });
      instance.on("warning", (warning) => {
        log.warn({ action: "queue.warning", ...warning });
      });

      await instance.start();

      for (const [name, definition] of jobEntries) {
        await instance.createQueue(name, {
          ...DEFAULT_QUEUE_OPTIONS,
          ...definition.queue,
        });
      }

      if (role === "consumer") {
        for (const [name, definition] of jobEntries) {
          if (!definition.cron) {
            continue;
          }
          const { expression, data, tz } = definition.cron;
          await instance.schedule(
            name,
            expression,
            data as object,
            tz ? { tz } : undefined
          );
        }
      }

      boss = instance;
      log.info({ action: "queue.started", queues: jobEntries.length, role });
      return instance;
    })();

    return starting;
  };

  /**
   * `async` so every failure path is a rejection: both guards below throw
   * synchronously, and a `Promise`-typed function that throws before returning
   * one never reaches `.catch()`.
   */
  const enqueue = async <N extends JobName>(
    name: N,
    payload: JobPayload<N>,
    options: EnqueueOptions = {}
  ): Promise<string | null> => {
    const { tx, ...sendOptions } = options;
    // Validated before the write so a bad payload fails at the call site rather
    // than in a worker minutes later.
    const data = jobs[name].schema.parse(payload) as object;

    return await requireStarted().send(name, data, {
      ...sendOptions,
      ...(tx ? { db: fromDrizzle(tx, sql) } : {}),
    });
  };

  /**
   * `batchSize` defaults to 1, so a throw fails exactly the job that threw.
   * Raise it and a throw retries the whole batch, including jobs in it that
   * already succeeded.
   */
  const work = <N extends JobName>(
    name: N,
    handler: (job: JobOf<N>) => Promise<void>,
    options: WorkOptions = {}
  ): Promise<string> =>
    requireStarted().work<JobPayload<N>>(
      name,
      {
        localConcurrency: env.WORKERS_CONCURRENCY,
        pollingIntervalSeconds: env.WORKERS_POLLING_INTERVAL_SECONDS,
        ...options,
      },
      async (batch) => {
        for (const job of batch) {
          // Re-validated: the row was written by another process, possibly an
          // older deploy whose payload shape has since changed.
          const data = jobs[name].schema.parse(job.data) as JobPayload<N>;
          await handler({ ...job, data });
        }
      }
    );

  /** Graceful by default, so in-flight jobs finish rather than expiring. */
  const stop = async (options: StopOptions = {}): Promise<void> => {
    if (!boss) {
      return;
    }
    await boss.stop({ graceful: true, ...options });
    boss = undefined;
    starting = undefined;
  };

  return {
    enqueue,
    isStarted: (): boolean => boss !== undefined,
    /** Escape hatch for the parts of pg-boss this wrapper deliberately doesn't cover. */
    raw: requireStarted,
    start,
    stop,
    work,
  };
};

export type QueueClient = ReturnType<typeof createQueueClient>;

export const queue: QueueClient = createQueueClient();

export { DEFAULT_QUEUE_OPTIONS, jobNames, jobs } from "./jobs";
export type { JobDefinition, JobName, JobPayload } from "./jobs";
export { resolveQueueConfig } from "./config";
export type { QueueRole } from "./config";
