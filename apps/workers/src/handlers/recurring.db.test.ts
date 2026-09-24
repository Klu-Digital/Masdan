import { householdToday } from "@masdan/api/reports/periods";
import {
  category,
  financialAccount,
  financialTransaction,
  recurringSchedule,
} from "@masdan/db/schema/index";
import { queue } from "@masdan/queue";
import type { JobOf } from "@masdan/queue";
import {
  drainQueue,
  getJobs,
  getQueuedJobs,
  getSessionFor,
  getTestDb,
  signUpTestUser,
  startTestQueue,
  stopTestQueue,
} from "@masdan/testing";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";

import { handleRecurringGenerate, handleRecurringSweep } from "./recurring";

beforeAll(startTestQueue);
afterAll(stopTestQueue);

const today = () => householdToday("Asia/Manila", new Date());

interface Fixture {
  accountId: string;
  categoryId: string;
  organizationId: string;
}

const signUpHousehold = async (): Promise<Fixture> => {
  const db = getTestDb();
  const { headers } = await signUpTestUser();
  const current = await getSessionFor(headers);
  const organizationId = current?.session.activeOrganizationId ?? "";
  const [account] = await db
    .insert(financialAccount)
    .values({
      accountClass: "asset",
      accountType: "bank",
      currencyCode: "PHP",
      name: "BPI Savings",
      openingBalance: "0",
      openingBalanceDate: "2026-01-01",
      organizationId,
    })
    .returning({ id: financialAccount.id });
  const [salary] = await db
    .select({ id: category.id })
    .from(category)
    .where(
      and(
        eq(category.organizationId, organizationId),
        eq(category.name, "Salary")
      )
    );
  return {
    accountId: account?.id ?? "",
    categoryId: salary?.id ?? "",
    organizationId,
  };
};

const createSchedule = async (
  fixture: Fixture,
  values: Partial<typeof recurringSchedule.$inferInsert> = {}
): Promise<string> => {
  const [created] = await getTestDb()
    .insert(recurringSchedule)
    .values({
      accountId: fixture.accountId,
      amount: "45000",
      categoryId: fixture.categoryId,
      frequency: "monthly",
      interval: 1,
      name: "Salary",
      nextOccurrenceDate: today(),
      organizationId: fixture.organizationId,
      paidStatus: "paid",
      startDate: "2026-01-01",
      status: "active",
      ...values,
    })
    .returning({ id: recurringSchedule.id });
  return created?.id ?? "";
};

/** The work commits, then the worker dies before acknowledging the job. */
const crashAfterCommit = async (job: JobOf<"recurring.generate">) => {
  await handleRecurringGenerate(job);
  throw new Error("worker lost before ack");
};

const postedFor = (scheduleId: string) =>
  getTestDb()
    .select({ date: financialTransaction.recurringOccurrenceDate })
    .from(financialTransaction)
    .where(eq(financialTransaction.recurringScheduleId, scheduleId));

describe("recurring.sweep handler", () => {
  it("enqueues generation for due active schedules only", async () => {
    const fixture = await signUpHousehold();
    const due = await createSchedule(fixture);
    const overdue = await createSchedule(fixture, {
      frequency: "daily",
      nextOccurrenceDate: "2026-02-01",
    });
    const paused = await createSchedule(fixture, { status: "paused" });
    const stopped = await createSchedule(fixture, {
      nextOccurrenceDate: null,
      status: "stopped",
    });
    const future = await createSchedule(fixture, {
      nextOccurrenceDate: "2099-01-01",
    });

    await queue.enqueue("recurring.sweep", {});
    expect(await drainQueue("recurring.sweep", handleRecurringSweep)).toBe(1);

    const queuedJobs = await getQueuedJobs("recurring.generate");
    const queued = queuedJobs.map((job) => job.data.scheduleId);
    expect(queued.toSorted()).toEqual([due, overdue].toSorted());
    for (const scheduleId of [paused, stopped, future]) {
      expect(queued).not.toContain(scheduleId);
    }

    expect(
      await drainQueue("recurring.generate", handleRecurringGenerate)
    ).toBe(2);
    expect(await postedFor(due)).toEqual([{ date: today() }]);
    for (const scheduleId of [paused, stopped, future]) {
      expect(await postedFor(scheduleId)).toHaveLength(0);
    }
  });
});

describe("recurring.generate handler", () => {
  it("posts once when the same job is delivered twice", async () => {
    const fixture = await signUpHousehold();
    const scheduleId = await createSchedule(fixture);

    await queue.enqueue("recurring.generate", { scheduleId });
    await queue.enqueue("recurring.generate", { scheduleId });
    expect(
      await drainQueue("recurring.generate", handleRecurringGenerate)
    ).toBe(2);

    expect(await postedFor(scheduleId)).toHaveLength(1);
    const jobs = await getJobs("recurring.generate");
    expect(jobs.map(({ state }) => state)).toEqual(["completed", "completed"]);
  });

  it("does not duplicate when a job is retried after it already committed", async () => {
    const fixture = await signUpHousehold();
    const scheduleId = await createSchedule(fixture);

    await queue.enqueue("recurring.generate", { scheduleId });
    await drainQueue("recurring.generate", crashAfterCommit);
    const [failed] = await getJobs("recurring.generate");
    expect(failed?.state).toBe("retry");

    // pg-boss hands the same job back later.
    await handleRecurringGenerate(
      failed as unknown as JobOf<"recurring.generate">
    );
    expect(await postedFor(scheduleId)).toHaveLength(1);
  });

  it("posts once under overlapping deliveries", async () => {
    const fixture = await signUpHousehold();
    const scheduleId = await createSchedule(fixture, {
      frequency: "daily",
      nextOccurrenceDate: "2026-09-01",
    });
    for (let index = 0; index < 4; index += 1) {
      await queue.enqueue("recurring.generate", { scheduleId });
    }

    const jobs = await queue
      .raw()
      .fetch<{ scheduleId: string }>("recurring.generate", { batchSize: 4 });
    await Promise.all(
      jobs.map((job) =>
        handleRecurringGenerate(job as JobOf<"recurring.generate">)
      )
    );

    const posted = await postedFor(scheduleId);
    const dates = posted.map(({ date }) => date);
    expect(new Set(dates).size).toBe(dates.length);
    expect(dates).toContain("2026-09-01");
    expect(dates).toContain(today());
  });

  it("does nothing for a schedule paused or stopped after it was enqueued", async () => {
    const fixture = await signUpHousehold();
    const paused = await createSchedule(fixture);
    const stopped = await createSchedule(fixture);
    await queue.enqueue("recurring.generate", { scheduleId: paused });
    await queue.enqueue("recurring.generate", { scheduleId: stopped });
    await getTestDb()
      .update(recurringSchedule)
      .set({ pausedAt: new Date(), status: "paused" })
      .where(eq(recurringSchedule.id, paused));
    await getTestDb()
      .update(recurringSchedule)
      .set({
        nextOccurrenceDate: null,
        status: "stopped",
        stoppedAt: new Date(),
      })
      .where(eq(recurringSchedule.id, stopped));

    expect(
      await drainQueue("recurring.generate", handleRecurringGenerate)
    ).toBe(2);
    expect(await postedFor(paused)).toHaveLength(0);
    expect(await postedFor(stopped)).toHaveLength(0);
  });
});
