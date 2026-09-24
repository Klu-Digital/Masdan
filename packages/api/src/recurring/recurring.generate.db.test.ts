import {
  category,
  financialAccount,
  financialTransaction,
  financialTransactionTag,
  organization,
  recurringSchedule,
  recurringScheduleTag,
  tag,
} from "@masdan/db/schema/index";
import { getSessionFor, getTestDb, signUpTestUser } from "@masdan/testing";
import { and, asc, eq } from "drizzle-orm";
import { describe, expect, it } from "vite-plus/test";

import { getAccountBalance } from "../accounts/balances";
import { createTransaction } from "../transactions/transactions.write";
import {
  MAX_OCCURRENCES_PER_RUN,
  findDueSchedules,
  generateDueOccurrences,
} from "./recurring.generate";

/** 2026-10-01 00:00 in Manila (UTC+8). */
const MANILA_OCT_1 = new Date("2026-09-30T16:00:00Z");
const MINUTE_MS = 60_000;

interface Fixture {
  accountId: string;
  expenseCategoryId: string;
  organizationId: string;
}

const signUpHousehold = async (timezone = "Asia/Manila"): Promise<Fixture> => {
  const db = getTestDb();
  const { headers } = await signUpTestUser();
  const current = await getSessionFor(headers);
  const organizationId = current?.session.activeOrganizationId ?? "";
  await db
    .update(organization)
    .set({ timezone })
    .where(eq(organization.id, organizationId));
  const [account] = await db
    .insert(financialAccount)
    .values({
      accountClass: "asset",
      accountType: "bank",
      currencyCode: "PHP",
      name: "BPI Savings",
      openingBalance: "10000",
      openingBalanceDate: "2026-01-01",
      organizationId,
    })
    .returning({ id: financialAccount.id });
  const [rent] = await db
    .select({ id: category.id })
    .from(category)
    .where(
      and(
        eq(category.organizationId, organizationId),
        eq(category.type, "expense")
      )
    )
    .orderBy(asc(category.name))
    .limit(1);
  return {
    accountId: account?.id ?? "",
    expenseCategoryId: rent?.id ?? "",
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
      amount: "1500",
      categoryId: fixture.expenseCategoryId,
      frequency: "monthly",
      interval: 1,
      name: "Internet",
      nextOccurrenceDate: "2026-10-01",
      notes: "PLDT fiber",
      organizationId: fixture.organizationId,
      paidStatus: "unpaid",
      startDate: "2026-07-01",
      status: "active",
      ...values,
    })
    .returning({ id: recurringSchedule.id });
  return created?.id ?? "";
};

const postedFor = (scheduleId: string) =>
  getTestDb()
    .select({
      accountId: financialTransaction.accountId,
      amount: financialTransaction.amount,
      categoryId: financialTransaction.categoryId,
      currencyCode: financialTransaction.currencyCode,
      id: financialTransaction.id,
      notes: financialTransaction.notes,
      occurrenceDate: financialTransaction.recurringOccurrenceDate,
      paidStatus: financialTransaction.paidStatus,
      transactionDate: financialTransaction.transactionDate,
    })
    .from(financialTransaction)
    .where(eq(financialTransaction.recurringScheduleId, scheduleId))
    .orderBy(asc(financialTransaction.recurringOccurrenceDate));

const scheduleRow = async (scheduleId: string) => {
  const [row] = await getTestDb()
    .select()
    .from(recurringSchedule)
    .where(eq(recurringSchedule.id, scheduleId));
  return row;
};

const nextOccurrenceOf = async (scheduleId: string) => {
  const row = await scheduleRow(scheduleId);
  return row?.nextOccurrenceDate;
};

describe("generateDueOccurrences", () => {
  it("posts a due occurrence as a normal transaction and advances the schedule", async () => {
    const fixture = await signUpHousehold();
    const [commute] = await getTestDb()
      .insert(tag)
      .values({
        color: "sky",
        name: "Bills",
        organizationId: fixture.organizationId,
      })
      .returning({ id: tag.id });
    const scheduleId = await createSchedule(fixture);
    await getTestDb()
      .insert(recurringScheduleTag)
      .values({ scheduleId, tagId: commute?.id ?? "" });

    const result = await generateDueOccurrences(
      getTestDb(),
      scheduleId,
      MANILA_OCT_1
    );

    expect(result).toEqual({ created: 1, pausedReason: null, skipped: 0 });
    const posted = await postedFor(scheduleId);
    expect(posted).toEqual([
      {
        accountId: fixture.accountId,
        amount: "1500.000000",
        categoryId: fixture.expenseCategoryId,
        currencyCode: "PHP",
        id: expect.any(String),
        notes: "PLDT fiber",
        occurrenceDate: "2026-10-01",
        paidStatus: "unpaid",
        transactionDate: "2026-10-01",
      },
    ]);
    const tags = await getTestDb()
      .select({ tagId: financialTransactionTag.tagId })
      .from(financialTransactionTag)
      .where(eq(financialTransactionTag.transactionId, posted[0]?.id ?? ""));
    expect(tags).toEqual([{ tagId: commute?.id }]);
    expect(await nextOccurrenceOf(scheduleId)).toBe("2026-11-01");
    // The ledger balance moves exactly as a manual expense would.
    expect(await getAccountBalance(getTestDb(), fixture.accountId)).toBe(
      "8500.000000"
    );
  });

  it("waits for local midnight in the household's timezone", async () => {
    const fixture = await signUpHousehold("Asia/Manila");
    const scheduleId = await createSchedule(fixture);

    const beforeMidnight = new Date(MANILA_OCT_1.getTime() - MINUTE_MS);
    expect(
      await generateDueOccurrences(getTestDb(), scheduleId, beforeMidnight)
    ).toMatchObject({ created: 0 });
    expect(await postedFor(scheduleId)).toHaveLength(0);

    expect(
      await generateDueOccurrences(getTestDb(), scheduleId, MANILA_OCT_1)
    ).toMatchObject({ created: 1 });
  });

  it("uses a household behind UTC's own calendar day", async () => {
    const fixture = await signUpHousehold("America/New_York");
    const scheduleId = await createSchedule(fixture);

    // Already October 1 in UTC, still September 30 in New York.
    const earlyUtc = new Date("2026-10-01T03:00:00Z");
    expect(
      await generateDueOccurrences(getTestDb(), scheduleId, earlyUtc)
    ).toMatchObject({ created: 0 });
    expect(
      await generateDueOccurrences(
        getTestDb(),
        scheduleId,
        new Date("2026-10-01T04:00:00Z")
      )
    ).toMatchObject({ created: 1 });
  });

  it("catches up occurrences missed while workers were down, in order", async () => {
    const fixture = await signUpHousehold();
    const scheduleId = await createSchedule(fixture, {
      frequency: "daily",
      nextOccurrenceDate: "2026-09-28",
      startDate: "2026-09-01",
    });

    await generateDueOccurrences(getTestDb(), scheduleId, MANILA_OCT_1);

    const posted = await postedFor(scheduleId);
    expect(posted.map(({ occurrenceDate }) => occurrenceDate)).toEqual([
      "2026-09-28",
      "2026-09-29",
      "2026-09-30",
      "2026-10-01",
    ]);
    expect(await nextOccurrenceOf(scheduleId)).toBe("2026-10-02");
  });

  it("bounds one run's catch-up and lets the next run continue", async () => {
    const fixture = await signUpHousehold();
    const scheduleId = await createSchedule(fixture, {
      frequency: "daily",
      nextOccurrenceDate: "2026-01-01",
      startDate: "2026-01-01",
    });

    const first = await generateDueOccurrences(
      getTestDb(),
      scheduleId,
      MANILA_OCT_1
    );
    expect(first.created).toBe(MAX_OCCURRENCES_PER_RUN);
    const second = await generateDueOccurrences(
      getTestDb(),
      scheduleId,
      MANILA_OCT_1
    );
    expect(second.created).toBe(MAX_OCCURRENCES_PER_RUN);
  });

  it("is a no-op when run again for the same day", async () => {
    const fixture = await signUpHousehold();
    const scheduleId = await createSchedule(fixture);

    await generateDueOccurrences(getTestDb(), scheduleId, MANILA_OCT_1);
    const again = await generateDueOccurrences(
      getTestDb(),
      scheduleId,
      MANILA_OCT_1
    );

    expect(again).toEqual({ created: 0, pausedReason: null, skipped: 0 });
    expect(await postedFor(scheduleId)).toHaveLength(1);
  });

  it("skips an occurrence that already has its transaction, as a retry would find it", async () => {
    const fixture = await signUpHousehold();
    const scheduleId = await createSchedule(fixture);
    await generateDueOccurrences(getTestDb(), scheduleId, MANILA_OCT_1);
    // A retry that read the schedule before the first run advanced it.
    await getTestDb()
      .update(recurringSchedule)
      .set({ nextOccurrenceDate: "2026-10-01" })
      .where(eq(recurringSchedule.id, scheduleId));

    const retry = await generateDueOccurrences(
      getTestDb(),
      scheduleId,
      MANILA_OCT_1
    );

    expect(retry).toEqual({ created: 0, pausedReason: null, skipped: 1 });
    expect(await postedFor(scheduleId)).toHaveLength(1);
    expect(await nextOccurrenceOf(scheduleId)).toBe("2026-11-01");
  });

  it("posts each occurrence once under overlapping runs", async () => {
    const fixture = await signUpHousehold();
    const scheduleId = await createSchedule(fixture, {
      frequency: "daily",
      nextOccurrenceDate: "2026-09-25",
      startDate: "2026-09-01",
    });

    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        generateDueOccurrences(getTestDb(), scheduleId, MANILA_OCT_1)
      )
    );

    const created = results.reduce((sum, { created: n }) => sum + n, 0);
    expect(created).toBe(7);
    const posted = await postedFor(scheduleId);
    expect(posted.map(({ occurrenceDate }) => occurrenceDate)).toEqual([
      "2026-09-25",
      "2026-09-26",
      "2026-09-27",
      "2026-09-28",
      "2026-09-29",
      "2026-09-30",
      "2026-10-01",
    ]);
  });

  it("lets the database reject a concurrent duplicate even without the schedule lock", async () => {
    const fixture = await signUpHousehold();
    const scheduleId = await createSchedule(fixture);
    const occurrence = { occurrenceDate: "2026-10-01", scheduleId };

    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        getTestDb().transaction((tx) =>
          createTransaction(
            tx,
            fixture.organizationId,
            {
              accountId: fixture.accountId,
              amount: "1500",
              categoryId: fixture.expenseCategoryId,
              notes: null,
              paidStatus: "paid",
              splits: [],
              tagIds: [],
              transactionDate: "2026-10-01",
            },
            occurrence
          )
        )
      )
    );

    expect(results.filter((result) => result !== null)).toHaveLength(1);
    expect(await postedFor(scheduleId)).toHaveLength(1);
  });

  it("does not post for paused or stopped schedules", async () => {
    const fixture = await signUpHousehold();
    const paused = await createSchedule(fixture, { status: "paused" });
    const stopped = await createSchedule(fixture, {
      nextOccurrenceDate: null,
      status: "stopped",
    });

    for (const scheduleId of [paused, stopped]) {
      expect(
        await generateDueOccurrences(getTestDb(), scheduleId, MANILA_OCT_1)
      ).toEqual({ created: 0, pausedReason: null, skipped: 0 });
      expect(await postedFor(scheduleId)).toHaveLength(0);
    }
    expect(await nextOccurrenceOf(paused)).toBe("2026-10-01");
  });

  it("pauses the schedule with a reason when the template can no longer post", async () => {
    const fixture = await signUpHousehold();
    const scheduleId = await createSchedule(fixture);
    await getTestDb()
      .update(financialAccount)
      .set({ archivedAt: new Date() })
      .where(eq(financialAccount.id, fixture.accountId));

    const result = await generateDueOccurrences(
      getTestDb(),
      scheduleId,
      MANILA_OCT_1
    );

    expect(result).toEqual({
      created: 0,
      pausedReason: "Financial account not found",
      skipped: 0,
    });
    expect(await postedFor(scheduleId)).toHaveLength(0);
    expect(await scheduleRow(scheduleId)).toMatchObject({
      lastError: "Financial account not found",
      nextOccurrenceDate: "2026-10-01",
      status: "paused",
    });
  });
});

describe("findDueSchedules", () => {
  it("finds active schedules due in each household's own timezone", async () => {
    const manila = await signUpHousehold("Asia/Manila");
    const newYork = await signUpHousehold("America/New_York");
    const dueInManila = await createSchedule(manila);
    const notYetInNewYork = await createSchedule(newYork);
    const paused = await createSchedule(manila, { status: "paused" });
    const future = await createSchedule(manila, {
      nextOccurrenceDate: "2026-10-02",
    });

    const due = await findDueSchedules(getTestDb(), MANILA_OCT_1, 100);

    expect(due).toContain(dueInManila);
    expect(due).not.toContain(notYetInNewYork);
    expect(due).not.toContain(paused);
    expect(due).not.toContain(future);
  });
});
