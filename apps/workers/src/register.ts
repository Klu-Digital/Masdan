import { log } from "@k22i/observability";
import { queue } from "@k22i/queue";
import type { JobName, JobOf } from "@k22i/queue";

import { handleEcho, handleHeartbeat } from "./handlers/example";

type Handlers = {
  [N in JobName]: (job: JobOf<N>) => Promise<void>;
};

/**
 * The mapped type is the point: a registry entry with no handler here is a
 * compile error.
 */
const handlers: Handlers = {
  "example.echo": handleEcho,
  "example.heartbeat": handleHeartbeat,
};

/** Starts one worker per job. Call after `queue.start("consumer")` has resolved. */
export const registerWorkers = async (): Promise<void> => {
  for (const [name, handler] of Object.entries(handlers) as [
    JobName,
    (job: JobOf<JobName>) => Promise<void>,
  ][]) {
    await queue.work(name, handler);
    log.info({ action: "worker.registered", queue: name });
  }
};
