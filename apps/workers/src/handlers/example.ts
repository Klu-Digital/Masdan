import { log } from "@masdan/observability";
import type { JobOf } from "@masdan/queue";

/**
 * Reference handlers, safe to delete once real jobs replace them; only
 * `register.ts` imports them. Throwing hands the job back for retry per
 * `retryLimit`, so log-and-swallow what a retry cannot fix.
 */
export const handleEcho = (job: JobOf<"example.echo">): Promise<void> => {
  log.info({
    action: "job.example.echo",
    jobId: job.id,
    message: job.data.message,
  });
  return Promise.resolve();
};

export const handleHeartbeat = (
  job: JobOf<"example.heartbeat">
): Promise<void> => {
  log.info({
    action: "job.example.heartbeat",
    jobId: job.id,
    source: job.data.source,
  });
  return Promise.resolve();
};
