import {
  findAccountsToCredit,
  postAccountInterest,
} from "@masdan/api/interest/interest.post";
import { db } from "@masdan/db";
import { log } from "@masdan/observability";
import { queue } from "@masdan/queue";
import type { JobOf } from "@masdan/queue";

export const handleInterestSweep = async (
  job: JobOf<"interest.sweep">
): Promise<void> => {
  const accountIds = await findAccountsToCredit(db);
  for (const accountId of accountIds) {
    await queue.enqueue(
      "interest.post",
      { accountId },
      { singletonKey: accountId }
    );
  }
  log.info({
    accounts: accountIds.length,
    action: "interest.sweep.completed",
    jobId: job.id,
  });
};

/** Throws on unexpected failures so pg-boss retries; a retry is idempotent. */
export const handleInterestPost = async (
  job: JobOf<"interest.post">
): Promise<void> => {
  const result = await postAccountInterest(db, job.data.accountId, new Date());
  log.info({
    accountId: job.data.accountId,
    action: "interest.post.completed",
    jobId: job.id,
    ...result,
  });
};
