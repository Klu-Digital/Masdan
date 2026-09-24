import {
  findDueSchedules,
  generateDueOccurrences,
} from "@masdan/api/recurring/recurring.generate";
import { db } from "@masdan/db";
import { log } from "@masdan/observability";
import { queue } from "@masdan/queue";
import type { JobOf } from "@masdan/queue";

/** Per sweep; anything beyond is picked up by the next tick. */
const SWEEP_LIMIT = 1000;

export const handleRecurringSweep = async (
  job: JobOf<"recurring.sweep">
): Promise<void> => {
  const scheduleIds = await findDueSchedules(db, new Date(), SWEEP_LIMIT);
  for (const scheduleId of scheduleIds) {
    await queue.enqueue("recurring.generate", { scheduleId });
  }
  log.info({
    action: "recurring.sweep.completed",
    due: scheduleIds.length,
    jobId: job.id,
  });
};

/** Throws on unexpected failures so pg-boss retries; a retry is idempotent. */
export const handleRecurringGenerate = async (
  job: JobOf<"recurring.generate">
): Promise<void> => {
  const result = await generateDueOccurrences(
    db,
    job.data.scheduleId,
    new Date()
  );
  log.info({
    action: "recurring.generate.completed",
    jobId: job.id,
    scheduleId: job.data.scheduleId,
    ...result,
  });
};
