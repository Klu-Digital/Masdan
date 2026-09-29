import { user } from "@masdan/db/schema/index";
import { jobNames } from "@masdan/queue";
import {
  getQueuedJobs,
  getSessionFor,
  getTestDb,
  signUpTestUser,
  startTestQueue,
  stopTestQueue,
} from "@masdan/testing";
import { call, ORPCError } from "@orpc/server";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";

import type { Context } from "../context";
import { appRouter } from "../routers/index";

beforeAll(startTestQueue);
afterAll(stopTestQueue);

const contextFor = async (headers: Headers): Promise<Context> =>
  ({
    auth: null,
    db: getTestDb(),
    log: undefined,
    session: await getSessionFor(headers),
  }) as unknown as Context;

const grantPlatformAdmin = async (userId: string) => {
  await getTestDb()
    .update(user)
    .set({ role: "admin" })
    .where(eq(user.id, userId));
};

const adminContext = async (): Promise<Context> => {
  const admin = await signUpTestUser();
  await grantPlatformAdmin(admin.user.id);
  return contextFor(admin.headers);
};

describe("admin.jobs.registry", () => {
  it("matches @masdan/queue's job registry exactly", async () => {
    const context = await adminContext();

    const registry = await call(appRouter.admin.jobs.registry, undefined, {
      context,
    });

    expect(registry.map((job) => job.name).toSorted()).toEqual(
      jobNames.toSorted()
    );
  });
});

describe("admin.jobs.enqueue", () => {
  it("enqueues a job matching its own schema", async () => {
    const context = await adminContext();

    const result = await call(
      appRouter.admin.jobs.enqueue,
      {
        name: "recurring.generate",
        payload: { scheduleId: crypto.randomUUID() },
      },
      { context }
    );

    expect(result.jobId).toEqual(expect.any(String));
    const queued = await getQueuedJobs("recurring.generate");
    expect(queued.some((job) => job.id === result.jobId)).toBe(true);
  });

  it("rejects a payload the job's registry schema refuses", async () => {
    const context = await adminContext();

    await expect(
      call(
        appRouter.admin.jobs.enqueue,
        { name: "recurring.generate", payload: { scheduleId: 42 } },
        { context }
      )
    ).rejects.toThrow();
  });
});

describe("admin.jobs.counts", () => {
  it("runs against the real pgboss schema and reflects an enqueued job", async () => {
    const context = await adminContext();

    await call(
      appRouter.admin.jobs.enqueue,
      {
        name: "recurring.generate",
        payload: { scheduleId: crypto.randomUUID() },
      },
      { context }
    );

    const counts = await call(appRouter.admin.jobs.counts, undefined, {
      context,
    });

    const generateCounts = counts.filter(
      (row) => row.name === "recurring.generate"
    );
    expect(generateCounts.length).toBeGreaterThan(0);
    expect(
      generateCounts.reduce((sum, row) => sum + row.count, 0)
    ).toBeGreaterThan(0);
  });
});

describe("admin.jobs.schedules", () => {
  it("flags a schedule row with no matching registry entry as out of sync", async () => {
    const context = await adminContext();
    const { queue } = await import("@masdan/queue");
    const boss = queue.raw();

    // `recurring.generate` is a real queue but declares no `cron`, so scheduling it
    // by hand reproduces exactly the drift `schedules` exists to surface.
    await boss.schedule("recurring.generate", "0 0 * * *", {
      scheduleId: crypto.randomUUID(),
    });

    const schedules = await call(appRouter.admin.jobs.schedules, undefined, {
      context,
    });

    const drifted = schedules.find((s) => s.name === "recurring.generate");
    expect(drifted?.inRegistry).toBe(false);
  });
});

const codeOf = async (
  promise: Promise<unknown>
): Promise<string | undefined> => {
  const caught: unknown = await promise
    .then(() => {})
    .catch((error: unknown) => error);
  return caught instanceof ORPCError ? caught.code : undefined;
};

describe("admin.jobs access", () => {
  it("is gated the same as every other admin procedure", async () => {
    const { headers } = await signUpTestUser();
    const context = await contextFor(headers);

    expect(
      await codeOf(call(appRouter.admin.jobs.registry, undefined, { context }))
    ).toBe("FORBIDDEN");
  });
});
