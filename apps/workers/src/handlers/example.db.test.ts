import { queue } from "@masdan/queue";
import {
  drainQueue,
  getJobs,
  startTestQueue,
  stopTestQueue,
} from "@masdan/testing";
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";

import { handleEcho } from "./example";

/**
 * Handlers are driven directly rather than through `boss.work()`: `drainQueue`
 * settles synchronously.
 */

beforeAll(startTestQueue);
afterAll(stopTestQueue);

describe("example.echo handler", () => {
  it("completes the job it was given", async () => {
    await queue.enqueue("example.echo", { message: "hello" });

    const processed = await drainQueue("example.echo", handleEcho);

    expect(processed).toBe(1);

    const [job] = await getJobs("example.echo");
    expect(job?.state).toBe("completed");
  });

  it("receives the payload it was enqueued with", async () => {
    const seen: string[] = [];
    await queue.enqueue("example.echo", { message: "first" });
    await queue.enqueue("example.echo", { message: "second" });

    await drainQueue("example.echo", (job) => {
      seen.push(job.data.message);
      return Promise.resolve();
    });

    expect(seen).toEqual(expect.arrayContaining(["first", "second"]));
  });
});
