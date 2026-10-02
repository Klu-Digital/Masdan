import { queue } from "@masdan/queue";
import {
  getQueuedJobs,
  getTestDb,
  startTestQueue,
  stopTestQueue,
} from "@masdan/testing";
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";

beforeAll(startTestQueue);
afterAll(stopTestQueue);

const COMMITTED_ID = crypto.randomUUID();
const ROLLED_BACK_ID = crypto.randomUUID();

describe("transactional enqueue", () => {
  it("keeps the job when the surrounding transaction commits", async () => {
    await getTestDb().transaction(async (tx) => {
      await queue.enqueue(
        "recurring.generate",
        { scheduleId: COMMITTED_ID },
        { tx }
      );
    });

    const queued = await getQueuedJobs("recurring.generate");

    expect(queued).toHaveLength(1);
    expect(queued[0]?.data).toEqual({ scheduleId: COMMITTED_ID });
  });

  it("discards the job when the surrounding transaction rolls back", async () => {
    await expect(
      getTestDb().transaction(async (tx) => {
        await queue.enqueue(
          "recurring.generate",
          { scheduleId: ROLLED_BACK_ID },
          { tx }
        );
        // Anything after a successful enqueue can still fail, and the job must
        // not survive that.
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");

    expect(await getQueuedJobs("recurring.generate")).toHaveLength(0);
  });

  it("rejects a payload that does not match the job's schema", async () => {
    await expect(
      // @ts-expect-error -- the registry types this out; the runtime guard is
      // what protects a JS caller and an older deploy's payload shape.
      queue.enqueue("recurring.generate", { scheduleId: 42 })
    ).rejects.toThrow();

    expect(await getQueuedJobs("recurring.generate")).toHaveLength(0);
  });
});
