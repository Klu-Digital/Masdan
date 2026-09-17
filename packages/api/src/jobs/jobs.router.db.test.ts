import { queue } from "@masdan/queue";
import {
  getQueuedJobs,
  getSessionFor,
  getTestDb,
  signUpTestUser,
  startTestQueue,
  stopTestQueue,
} from "@masdan/testing";
import { call } from "@orpc/server";
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";

import type { Context } from "../context";
import { appRouter } from "../routers/index";

/**
 * The reason this project runs a Postgres-backed queue: a job enqueued inside a
 * transaction is part of it.
 */

beforeAll(startTestQueue);
afterAll(stopTestQueue);

const contextFor = async (headers: Headers): Promise<Context> =>
  ({
    auth: null,
    db: getTestDb(),
    log: undefined,
    session: await getSessionFor(headers),
  }) as unknown as Context;

describe("transactional enqueue", () => {
  it("keeps the job when the surrounding transaction commits", async () => {
    await getTestDb().transaction(async (tx) => {
      await queue.enqueue("example.echo", { message: "committed" }, { tx });
    });

    const queued = await getQueuedJobs("example.echo");

    expect(queued).toHaveLength(1);
    expect(queued[0]?.data).toEqual({ message: "committed" });
  });

  it("discards the job when the surrounding transaction rolls back", async () => {
    await expect(
      getTestDb().transaction(async (tx) => {
        await queue.enqueue("example.echo", { message: "rolled back" }, { tx });
        // Anything after a successful enqueue can still fail, and the job must
        // not survive that.
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");

    expect(await getQueuedJobs("example.echo")).toHaveLength(0);
  });

  it("rejects a payload that does not match the job's schema", async () => {
    await expect(
      // @ts-expect-error -- the registry types this out; the runtime guard is
      // what protects a JS caller and an older deploy's payload shape.
      queue.enqueue("example.echo", { message: 42 })
    ).rejects.toThrow();

    expect(await getQueuedJobs("example.echo")).toHaveLength(0);
  });
});

describe("jobs.enqueueExample", () => {
  it("enqueues through the router on the request's own transaction", async () => {
    const { headers } = await signUpTestUser();
    const context = await contextFor(headers);

    const result = await call(
      appRouter.jobs.enqueueExample,
      { message: "via orpc" },
      { context }
    );

    expect(result.jobId).toEqual(expect.any(String));

    const queued = await getQueuedJobs("example.echo");
    expect(queued).toHaveLength(1);
    expect(queued[0]?.id).toBe(result.jobId);
  });
});
