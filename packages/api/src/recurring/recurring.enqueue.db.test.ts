import { financialTransaction } from "@masdan/db/schema/index";
import type { JobOf } from "@masdan/queue";
import {
  drainQueue,
  getQueuedJobs,
  getSessionFor,
  getTestDb,
  signUpTestUser,
  startTestQueue,
  stopTestQueue,
} from "@masdan/testing";
import { call } from "@orpc/server";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";

import { accountsRouter } from "../accounts/accounts.router";
import { categoriesRouter } from "../categories/categories.router";
import type { Context } from "../context";
import { householdToday } from "../reports/periods";
import { generateDueOccurrences } from "./recurring.generate";
import { recurringRouter } from "./recurring.router";

beforeAll(startTestQueue);
afterAll(stopTestQueue);

const today = () => householdToday("Asia/Manila", new Date());

/** What apps/workers runs for the job, minus its logging. */
const generate = async (job: JobOf<"recurring.generate">) => {
  await generateDueOccurrences(getTestDb(), job.data.scheduleId, new Date());
};

const setUp = async () => {
  const { headers } = await signUpTestUser();
  const household = {
    context: {
      auth: null,
      db: getTestDb(),
      log: undefined,
      session: await getSessionFor(headers),
    } as unknown as Context,
  };
  const account = await call(
    accountsRouter.create,
    {
      accountClass: "asset",
      accountType: "bank",
      liquidity: "liquid",
      name: "BPI Savings",
      openingBalance: "0",
      openingBalanceDate: "2026-01-01",
      ownerMemberIds: [],
    },
    household
  );
  const categories = await call(categoriesRouter.list, {}, household);
  const salary = categories.find(({ name }) => name === "Salary");
  const values = (startDate: string) => ({
    accountId: account.id,
    amount: "45000",
    categoryId: salary?.id ?? "",
    endDate: null,
    frequency: "monthly" as const,
    interval: 1,
    name: "Salary",
    notes: null,
    paidStatus: "paid" as const,
    startDate,
    tagIds: [],
  });
  return { household, values };
};

const postedFor = (scheduleId: string) =>
  getTestDb()
    .select({ date: financialTransaction.recurringOccurrenceDate })
    .from(financialTransaction)
    .where(eq(financialTransaction.recurringScheduleId, scheduleId));

describe("recurring schedule enqueueing", () => {
  it("enqueues generation when a new schedule is due today, and never posts itself", async () => {
    const { household, values } = await setUp();

    const created = await call(
      recurringRouter.create,
      values(today()),
      household
    );

    const queued = await getQueuedJobs("recurring.generate");
    expect(queued.map((job) => job.data)).toEqual([{ scheduleId: created.id }]);
    expect(await postedFor(created.id)).toHaveLength(0);

    await drainQueue("recurring.generate", generate);
    expect(await postedFor(created.id)).toEqual([{ date: today() }]);
  });

  it("leaves a future schedule to the sweep", async () => {
    const { household, values } = await setUp();

    await call(recurringRouter.create, values("2099-01-15"), household);

    expect(await getQueuedJobs("recurring.generate")).toHaveLength(0);
  });

  it("enqueues on resume only when the schedule is due", async () => {
    const { household, values } = await setUp();
    const created = await call(
      recurringRouter.create,
      values(today()),
      household
    );
    await call(recurringRouter.pause, { scheduleId: created.id }, household);
    await drainQueue("recurring.generate", generate);
    expect(await postedFor(created.id)).toHaveLength(0);

    await call(recurringRouter.resume, { scheduleId: created.id }, household);
    expect(await getQueuedJobs("recurring.generate")).toHaveLength(1);
    await drainQueue("recurring.generate", generate);
    expect(await postedFor(created.id)).toEqual([{ date: today() }]);
  });
});
