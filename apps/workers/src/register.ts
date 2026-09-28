import { log } from "@masdan/observability";
import { queue } from "@masdan/queue";
import type { JobName, JobOf } from "@masdan/queue";

import { handleChatProcess } from "./handlers/chat";
import { handleEcho, handleHeartbeat } from "./handlers/example";
import { handleFxRefresh } from "./handlers/fx";
import { handleImportProcess } from "./handlers/imports";
import {
  handleRecurringGenerate,
  handleRecurringSweep,
} from "./handlers/recurring";
import {
  handleRemindersRefresh,
  handleRemindersSweep,
} from "./handlers/reminders";

type Handlers = {
  [N in JobName]: (job: JobOf<N>) => Promise<void>;
};

/**
 * The mapped type is the point: a registry entry with no handler here is a
 * compile error.
 */
const handlers: Handlers = {
  "chat.process": handleChatProcess,
  "example.echo": handleEcho,
  "example.heartbeat": handleHeartbeat,
  "fx.refresh": handleFxRefresh,
  "imports.process": handleImportProcess,
  "recurring.generate": handleRecurringGenerate,
  "recurring.sweep": handleRecurringSweep,
  "reminders.refresh": handleRemindersRefresh,
  "reminders.sweep": handleRemindersSweep,
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
