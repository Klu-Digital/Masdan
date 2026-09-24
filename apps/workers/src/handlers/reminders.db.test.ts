import { addDays } from "@masdan/api/recurring/recurrence";
import { householdToday } from "@masdan/api/reports/periods";
import {
  creditCardReminder,
  creditCardStatement,
  financialAccount,
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
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";

import { handleRemindersRefresh, handleRemindersSweep } from "./reminders";

beforeAll(startTestQueue);
afterAll(stopTestQueue);

const today = () => householdToday("Asia/Manila", new Date());

const signUpHousehold = async (): Promise<string> => {
  const { headers } = await signUpTestUser();
  const current = await getSessionFor(headers);
  return current?.session.activeOrganizationId ?? "";
};

const createCard = async (
  organizationId: string,
  values: Partial<typeof financialAccount.$inferInsert> = {}
): Promise<string> => {
  const [card] = await getTestDb()
    .insert(financialAccount)
    .values({
      accountClass: "liability",
      accountType: "credit_card",
      currencyCode: "PHP",
      name: "BPI Visa",
      openingBalance: "12000",
      openingBalanceDate: "2026-01-01",
      organizationId,
      ...values,
    })
    .returning({ id: financialAccount.id });
  return card?.id ?? "";
};

const recordStatement = async (organizationId: string, accountId: string) => {
  await getTestDb()
    .insert(creditCardStatement)
    .values({
      accountId,
      dueDate: addDays(today(), 3),
      organizationId,
      periodEnd: addDays(today(), -20),
      periodStart: addDays(today(), -50),
      statementBalance: "12000",
      statementDate: addDays(today(), -20),
    });
};

const remindersOf = (organizationId: string) =>
  getTestDb()
    .select()
    .from(creditCardReminder)
    .where(eq(creditCardReminder.organizationId, organizationId));

/** The work commits, then the worker dies before acknowledging the job. */
const crashAfterCommit = async (job: JobOf<"reminders.refresh">) => {
  await handleRemindersRefresh(job);
  throw new Error("worker lost before ack");
};

describe("reminders.sweep handler", () => {
  it("enqueues a refresh for households with cards to remind about only", async () => {
    const withStatement = await signUpHousehold();
    await recordStatement(withStatement, await createCard(withStatement));
    const withDueDay = await signUpHousehold();
    await createCard(withDueDay, { paymentDueDay: 10 });
    const bare = await signUpHousehold();
    await createCard(bare);
    const archived = await signUpHousehold();
    await createCard(archived, {
      archivedAt: new Date(),
      statementClosingDay: 12,
    });
    const noCards = await signUpHousehold();

    await queue.enqueue("reminders.sweep", {});
    expect(await drainQueue("reminders.sweep", handleRemindersSweep)).toBe(1);

    const queuedJobs = await getQueuedJobs("reminders.refresh");
    const queued = queuedJobs.map((job) => job.data.organizationId);
    expect(queued.toSorted()).toEqual([withStatement, withDueDay].toSorted());
    for (const organizationId of [bare, archived, noCards]) {
      expect(queued).not.toContain(organizationId);
    }

    await drainQueue("reminders.refresh", handleRemindersRefresh);
    expect(await remindersOf(withStatement)).toEqual([
      expect.objectContaining({
        eventDate: addDays(today(), 3),
        kind: "payment",
        status: "active",
      }),
    ]);
  });

  it("keeps one queued refresh per household however many are asked for", async () => {
    const organizationId = await signUpHousehold();
    await createCard(organizationId, { paymentDueDay: 10 });

    await queue.enqueue("reminders.sweep", {});
    await drainQueue("reminders.sweep", handleRemindersSweep);
    await queue.enqueue("reminders.sweep", {});
    await drainQueue("reminders.sweep", handleRemindersSweep);

    expect(await getQueuedJobs("reminders.refresh")).toHaveLength(1);
  });
});

describe("reminders.refresh handler", () => {
  it("creates each reminder once when a job is retried after it committed", async () => {
    const organizationId = await signUpHousehold();
    await recordStatement(organizationId, await createCard(organizationId));

    await queue.enqueue("reminders.refresh", { organizationId });
    await drainQueue("reminders.refresh", crashAfterCommit);
    const [failed] = await getJobs("reminders.refresh");
    expect(failed?.state).toBe("retry");

    await handleRemindersRefresh(
      failed as unknown as JobOf<"reminders.refresh">
    );
    expect(await remindersOf(organizationId)).toHaveLength(1);
  });

  it("only writes the household it was asked about", async () => {
    const mine = await signUpHousehold();
    await recordStatement(mine, await createCard(mine));
    const theirs = await signUpHousehold();
    await recordStatement(theirs, await createCard(theirs));

    await queue.enqueue("reminders.refresh", { organizationId: mine });
    await drainQueue("reminders.refresh", handleRemindersRefresh);

    expect(await remindersOf(mine)).toHaveLength(1);
    expect(await remindersOf(theirs)).toEqual([]);
  });

  it("does nothing for a household that no longer exists", async () => {
    await queue.enqueue("reminders.refresh", {
      organizationId: "0190d6b4-0000-7000-8000-000000000000",
    });
    expect(await drainQueue("reminders.refresh", handleRemindersRefresh)).toBe(
      1
    );
    const [job] = await getJobs("reminders.refresh");
    expect(job?.state).toBe("completed");
  });
});
