import { queue } from "@k22i/queue";
import type { JobName, JobOf, JobPayload } from "@k22i/queue";
import type { JobWithMetadata } from "pg-boss";

/**
 * Starts against this worker's own database — `setup/db.ts` has already
 * repointed `@k22i/env/server` at it. Must not be called from module scope.
 */
export const startTestQueue = async (): Promise<void> => {
  await queue.start("producer");
};

/** Ungraceful on purpose: a test that leaves a job running has a bug, and
 * waiting on it only turns that into a timeout. */
export const stopTestQueue = async (): Promise<void> => {
  await queue.stop({ graceful: false });
};

/**
 * `boss.work()` without the worker: no polling, no timers. Returns how many
 * jobs were processed.
 */
export const drainQueue = async <N extends JobName>(
  name: N,
  handler: (job: JobOf<N>) => Promise<void>,
  options: { batchSize?: number } = {}
): Promise<number> => {
  const boss = queue.raw();
  const jobs = await boss.fetch<JobPayload<N>>(name, {
    batchSize: options.batchSize ?? 10,
  });

  for (const job of jobs) {
    try {
      await handler(job as JobOf<N>);
      await boss.complete(name, job.id);
    } catch (error) {
      // As a real worker would, so tests can assert on retry behaviour.
      await boss.fail(name, job.id, { message: String(error) });
    }
  }

  return jobs.length;
};

/** Every job on a queue, in any state, for assertions about what was enqueued. */
export const getJobs = <N extends JobName>(
  name: N
): Promise<JobWithMetadata<JobPayload<N>>[]> =>
  queue.raw().findJobs<JobPayload<N>>(name);

/** Jobs still waiting to be worked — `created` or `retry`, not yet active. */
export const getQueuedJobs = <N extends JobName>(
  name: N
): Promise<JobWithMetadata<JobPayload<N>>[]> =>
  queue.raw().findJobs<JobPayload<N>>(name, { queued: true });
