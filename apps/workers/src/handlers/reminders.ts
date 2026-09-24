import {
  findHouseholdsToRefresh,
  refreshHouseholdReminders,
} from "@masdan/api/reminders/reminders.generate";
import { db } from "@masdan/db";
import { log } from "@masdan/observability";
import { queue } from "@masdan/queue";
import type { JobOf } from "@masdan/queue";

export const handleRemindersSweep = async (
  job: JobOf<"reminders.sweep">
): Promise<void> => {
  const organizationIds = await findHouseholdsToRefresh(db);
  for (const organizationId of organizationIds) {
    await queue.enqueue(
      "reminders.refresh",
      { organizationId },
      { singletonKey: organizationId }
    );
  }
  log.info({
    action: "reminders.sweep.completed",
    households: organizationIds.length,
    jobId: job.id,
  });
};

/** Throws on unexpected failures so pg-boss retries; a retry is idempotent. */
export const handleRemindersRefresh = async (
  job: JobOf<"reminders.refresh">
): Promise<void> => {
  const result = await refreshHouseholdReminders(
    db,
    job.data.organizationId,
    new Date()
  );
  log.info({
    action: "reminders.refresh.completed",
    jobId: job.id,
    organizationId: job.data.organizationId,
    ...result,
  });
};
