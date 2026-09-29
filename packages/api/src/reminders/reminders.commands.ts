import type { Database } from "@masdan/db";
import { queue } from "@masdan/queue";

/**
 * Asks the worker to regenerate the household's reminders after a change to
 * its cards or statements, on the mutation's transaction so the job only
 * exists if the change commits. The hourly sweep covers it when the queue is
 * down; the per-household `singletonKey` collapses a burst of edits into one
 * queued refresh.
 */
export const enqueueReminderRefresh = async (
  db: Database,
  organizationId: string
): Promise<void> => {
  if (!queue.isStarted()) {
    return;
  }
  await queue.enqueue(
    "reminders.refresh",
    { organizationId },
    { singletonKey: organizationId, tx: db }
  );
};
