import type { Database } from "@masdan/db";
import { queue } from "@masdan/queue";

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
