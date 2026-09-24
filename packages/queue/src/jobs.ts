import type { Queue } from "pg-boss";
import { z } from "zod";

/**
 * The single source of truth shared by the producer (`@masdan/api`) and the
 * consumer (apps/workers), so neither declares a queue name or payload shape of
 * its own.
 */
export interface JobDefinition<T extends z.ZodType = z.ZodType> {
  /** Validated on the way in at `enqueue`, and again on the way out in the worker. */
  schema: T;
  /** Passed to `createQueue`, merged over `DEFAULT_QUEUE_OPTIONS`. */
  queue?: Omit<Queue, "name">;
  /** Registered by the consumer only. 5-field cron, UTC unless `tz` is set. */
  cron?: { expression: string; data: unknown; tz?: string };
}

/**
 * Identity function, so the literal below keeps the exact key and schema types
 * `JobName` / `JobPayload` derive from while still being checked.
 */
const defineJobs = <T extends Record<string, JobDefinition>>(
  definitions: T
): T => definitions;

/**
 * Pairs with the instance-level `useListenNotify`: without it workers wait out
 * their polling interval instead of waking on insert.
 */
export const DEFAULT_QUEUE_OPTIONS = { notify: true } satisfies Omit<
  Queue,
  "name"
>;

/**
 * Keep payload schemas free of `.default()` and other transforms: `enqueue`
 * accepts the inferred output type, so a mismatch makes the call site's type a
 * lie.
 */
export const jobs = defineJobs({
  /** Reference job. Delete once real jobs exist — nothing depends on it. */
  "example.echo": {
    queue: { retryBackoff: true, retryDelay: 1, retryLimit: 3 },
    schema: z.object({ message: z.string().min(1) }),
  },
  /** Reference schedule. Proves cron registration and survives an idle system. */
  "example.heartbeat": {
    cron: { data: { source: "cron" }, expression: "*/5 * * * *" },
    // `singleton` so a slow tick can't stack up behind the next. No retries: the
    // next tick replaces a missed heartbeat, and a retry would log stale news.
    queue: { policy: "singleton", retryLimit: 0 },
    schema: z.object({ source: z.enum(["cron", "manual"]) }),
  },
  /**
   * Validates or commits a CSV import, whichever its status asks for, so a
   * duplicate or retried job is a no-op once the import has moved on.
   */
  "imports.process": {
    queue: { retryBackoff: true, retryDelay: 5, retryLimit: 2 },
    schema: z.object({ importId: z.uuid() }),
  },
  /**
   * Posts one schedule's due occurrences. Safe to deliver twice or retry: the
   * unique (schedule, occurrence date) index turns a repeat into a no-op.
   */
  "recurring.generate": {
    queue: { retryBackoff: true, retryDelay: 30, retryLimit: 5 },
    schema: z.object({ scheduleId: z.uuid() }),
  },
  /**
   * Finds schedules due in their household's timezone and enqueues
   * `recurring.generate` for each. The cron only sets how often to look —
   * `tz` is stated so no one reads it as the household's clock, which it is
   * not: due-ness is decided per household when the sweep runs.
   */
  "recurring.sweep": {
    cron: { data: {}, expression: "*/15 * * * *", tz: "UTC" },
    // `singleton` so a slow sweep can't stack up behind the next; the next tick
    // replaces a failed one.
    queue: { policy: "singleton", retryLimit: 0 },
    schema: z.object({}).strict(),
  },
});

export type JobName = keyof typeof jobs & string;

/** The validated payload a given job accepts. */
export type JobPayload<N extends JobName> = z.infer<(typeof jobs)[N]["schema"]>;

export const jobNames = Object.keys(jobs) as JobName[];
