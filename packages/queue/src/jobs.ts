import type { Queue } from "pg-boss";
import { z } from "zod";

export interface JobDefinition<T extends z.ZodType = z.ZodType> {
  /** Validated on the way in at `enqueue`, and again on the way out in the worker. */
  schema: T;
  /** Passed to `createQueue`, merged over `DEFAULT_QUEUE_OPTIONS`. */
  queue?: Omit<Queue, "name">;
  /** Registered by the consumer only. 5-field cron, UTC unless `tz` is set. */
  cron?: { expression: string; data: unknown; tz?: string };
}

const defineJobs = <T extends Record<string, JobDefinition>>(
  definitions: T
): T => definitions;

// Without it workers poll instead of waking on insert.
export const DEFAULT_QUEUE_OPTIONS = { notify: true } satisfies Omit<
  Queue,
  "name"
>;

/** Exhausted retries land here; nothing works it. */
export const DEAD_LETTER_QUEUE = "dead-letter";

// No `.default()` or transforms: `enqueue` takes the output type.
export const jobs = defineJobs({
  // Idempotent via `processed_at`. Payload holds message text: never log it.
  "chat.process": {
    queue: { retryBackoff: true, retryDelay: 5, retryLimit: 2 },
    schema: z.object({
      /** A registered channel name; the worker rejects anything else. */
      channel: z.string().min(1).max(32),
      command: z.discriminatedUnion("type", [
        z.object({ code: z.string().min(1).max(64), type: z.literal("link") }),
        z.object({
          text: z.string().min(1).max(4096),
          type: z.literal("entry"),
        }),
        z.object({
          caption: z.string().max(1024).nullable(),
          file: z.object({
            contentType: z.string().max(128).nullable(),
            name: z.string().max(256).nullable(),
            ref: z.string().min(1).max(512),
            size: z.number().int().nonnegative().nullable(),
          }),
          type: z.literal("receipt"),
        }),
      ]),
      /** Where the channel sends the reply: a chat, a phone number, a DM channel. */
      conversationId: z.string().min(1).max(128),
      messageId: z.string().min(1).max(128),
      sender: z.object({
        id: z.string().min(1).max(128),
        name: z.string().max(128).nullable(),
      }),
    }),
  },
  "fx.refresh": {
    cron: { data: {}, expression: "0 16 * * 1-5", tz: "UTC" },
    queue: {
      policy: "singleton",
      retryBackoff: true,
      retryDelay: 60,
      retryLimit: 3,
    },
    schema: z.object({}).strict(),
  },
  "imports.process": {
    queue: { retryBackoff: true, retryDelay: 5, retryLimit: 2 },
    schema: z.object({ importId: z.uuid() }),
  },
  "interest.post": {
    queue: {
      policy: "stately",
      retryBackoff: true,
      retryDelay: 30,
      retryLimit: 3,
    },
    schema: z.object({ accountId: z.uuid() }),
  },
  "interest.sweep": {
    cron: { data: {}, expression: "23 * * * *", tz: "UTC" },
    // `singleton` so a slow sweep can't stack up behind the next; the next tick
    // replaces a failed one.
    queue: { policy: "singleton", retryLimit: 0 },
    schema: z.object({}).strict(),
  },
  "recurring.generate": {
    queue: {
      policy: "stately",
      retryBackoff: true,
      retryDelay: 30,
      retryLimit: 5,
    },
    schema: z.object({ scheduleId: z.uuid() }),
  },
  // Due-ness is per household timezone; the cron only sets how often to look.
  "recurring.sweep": {
    cron: { data: {}, expression: "*/15 * * * *", tz: "UTC" },
    // `singleton` so a slow sweep can't stack up behind the next; the next tick
    // replaces a failed one.
    queue: { policy: "singleton", retryLimit: 0 },
    schema: z.object({}).strict(),
  },
  "reminders.refresh": {
    queue: {
      policy: "stately",
      retryBackoff: true,
      retryDelay: 30,
      retryLimit: 3,
    },
    schema: z.object({ organizationId: z.uuid() }),
  },
  "reminders.sweep": {
    cron: { data: {}, expression: "7 * * * *", tz: "UTC" },
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
