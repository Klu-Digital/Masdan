import {
  category,
  financialTransaction,
  member,
  organization,
  recurringSchedule,
  session,
} from "@masdan/db/schema/index";
import { getSessionFor, getTestDb, signUpTestUser } from "@masdan/testing";
import { call, ORPCError } from "@orpc/server";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vite-plus/test";

import { accountsRouter } from "../accounts/accounts.router";
import { categoriesRouter } from "../categories/categories.router";
import type { Context } from "../context";
import { householdToday } from "../reports/periods";
import { tagsRouter } from "../tags/tags.router";
import { transactionsRouter } from "../transactions/transactions.router";
import { addDays, initialNextOccurrence } from "./recurrence";
import { generateDueOccurrences } from "./recurring.generate";
import { recurringRouter } from "./recurring.router";

const caught = async (promise: Promise<unknown>): Promise<unknown> => {
  try {
    return await promise;
  } catch (error) {
    return error;
  }
};

const codeOf = async (
  promise: Promise<unknown>
): Promise<string | undefined> => {
  const error = await caught(promise);
  return error instanceof ORPCError ? error.code : undefined;
};

interface Household {
  context: { context: Context };
  organizationId: string;
}

const contextFor = async (headers: Headers): Promise<{ context: Context }> => ({
  context: {
    auth: null,
    db: getTestDb(),
    log: undefined,
    session: await getSessionFor(headers),
  } as unknown as Context,
});

const signUpHousehold = async (): Promise<Household> => {
  const { headers } = await signUpTestUser();
  const current = await getSessionFor(headers);
  const organizationId = current?.session.activeOrganizationId;
  if (!organizationId) {
    throw new Error("Test user has no active household");
  }
  return { context: await contextFor(headers), organizationId };
};

const joinAs = async (household: Household, role: string) => {
  const { headers, user } = await signUpTestUser();
  await getTestDb().insert(member).values({
    organizationId: household.organizationId,
    role,
    userId: user.id,
  });
  await getTestDb()
    .update(session)
    .set({ activeOrganizationId: household.organizationId })
    .where(eq(session.userId, user.id));
  return contextFor(headers);
};

const categoryId = async (household: Household, name: string) => {
  const [row] = await getTestDb()
    .select({ id: category.id })
    .from(category)
    .where(
      and(
        eq(category.organizationId, household.organizationId),
        eq(category.name, name)
      )
    );
  if (!row) {
    throw new Error(`Missing category ${name}`);
  }
  return row.id;
};

const createAccount = (household: Household, name = "BPI Savings") =>
  call(
    accountsRouter.create,
    {
      accountClass: "asset",
      accountType: "bank",
      liquidity: "liquid",
      name,
      openingBalance: "10000",
      openingBalanceDate: "2026-01-01",
      ownerMemberIds: [],
    },
    household.context
  );

const todayIn = async (household: Household) => {
  const [row] = await getTestDb()
    .select({ timezone: organization.timezone })
    .from(organization)
    .where(eq(organization.id, household.organizationId));
  return householdToday(row?.timezone ?? "Asia/Manila", new Date());
};

interface ScheduleOverrides {
  amount?: string;
  categoryId?: string;
  endDate?: string | null;
  frequency?: "daily" | "weekly" | "monthly";
  interval?: number;
  name?: string;
  notes?: string | null;
  startDate?: string;
  tagIds?: string[];
}

const rentValues = async (
  household: Household,
  accountId: string,
  overrides: ScheduleOverrides = {}
) => ({
  accountId,
  amount: "18000",
  categoryId: await categoryId(household, "Housing"),
  endDate: null,
  frequency: "monthly" as const,
  interval: 1,
  name: "Rent",
  notes: "Condo rent",
  paidStatus: "paid" as const,
  startDate: await todayIn(household),
  tagIds: [],
  ...overrides,
});

const postedFor = (scheduleId: string) =>
  getTestDb()
    .select({
      amount: financialTransaction.amount,
      categoryId: financialTransaction.categoryId,
      id: financialTransaction.id,
      notes: financialTransaction.notes,
      transactionDate: financialTransaction.transactionDate,
    })
    .from(financialTransaction)
    .where(eq(financialTransaction.recurringScheduleId, scheduleId));

/** "Now" for the worker: noon on `date` in Manila, the test household's zone. */
const manilaNoon = (date: string) => new Date(`${date}T04:00:00Z`);

describe("recurring schedule lifecycle", () => {
  it("creates a schedule from transaction fields with an explicit next occurrence", async () => {
    const household = await signUpHousehold();
    const account = await createAccount(household);
    const bills = await call(
      tagsRouter.create,
      { color: "amber", name: "Bills" },
      household.context
    );
    const today = await todayIn(household);

    const created = await call(
      recurringRouter.create,
      await rentValues(household, account.id, { tagIds: [bills.id] }),
      household.context
    );

    expect(created).toMatchObject({
      accountId: account.id,
      accountName: "BPI Savings",
      amount: "18000.000000",
      categoryName: "Housing",
      currencyCode: "PHP",
      frequency: "monthly",
      interval: 1,
      lastError: null,
      lastOccurrenceDate: null,
      name: "Rent",
      nextOccurrenceDate: today,
      notes: "Condo rent",
      paidStatus: "paid",
      postedCount: 0,
      startDate: today,
      status: "active",
      type: "expense",
    });
    expect(created.tags.map(({ id }) => id)).toEqual([bills.id]);
    // The schedule is a template: creating it posts nothing by itself.
    expect(await postedFor(created.id)).toHaveLength(0);
    expect(await call(recurringRouter.list, {}, household.context)).toEqual([
      created,
    ]);
  });

  it("starts a schedule dated in the past from today instead of backfilling", async () => {
    const household = await signUpHousehold();
    const account = await createAccount(household);
    const today = await todayIn(household);
    const startDate = addDays(today, -45);

    const created = await call(
      recurringRouter.create,
      await rentValues(household, account.id, { startDate }),
      household.context
    );

    expect(created.startDate).toBe(startDate);
    expect(created.nextOccurrenceDate).toBe(
      initialNextOccurrence(
        { frequency: "monthly", interval: 1, startDate },
        today
      )
    );
    expect((created.nextOccurrenceDate ?? "") >= today).toBe(true);
  });

  it("supports custom intervals and rejects invalid recurrence settings", async () => {
    const household = await signUpHousehold();
    const account = await createAccount(household);

    const fortnightly = await call(
      recurringRouter.create,
      await rentValues(household, account.id, {
        frequency: "weekly",
        interval: 2,
        name: "Allowance",
      }),
      household.context
    );
    expect(fortnightly).toMatchObject({ frequency: "weekly", interval: 2 });

    expect(
      await codeOf(
        call(
          recurringRouter.create,
          await rentValues(household, account.id, { interval: 0 }),
          household.context
        )
      )
    ).toBe("BAD_REQUEST");
    expect(
      await codeOf(
        call(
          recurringRouter.create,
          {
            ...(await rentValues(household, account.id)),
            frequency: "yearly",
          } as never,
          household.context
        )
      )
    ).toBe("BAD_REQUEST");
  });

  it("pauses and resumes without backfilling occurrences missed while paused", async () => {
    const household = await signUpHousehold();
    const account = await createAccount(household);
    const today = await todayIn(household);
    const startDate = addDays(today, -60);
    const created = await call(
      recurringRouter.create,
      await rentValues(household, account.id, {
        frequency: "daily",
        startDate,
      }),
      household.context
    );

    const paused = await call(
      recurringRouter.pause,
      { scheduleId: created.id },
      household.context
    );
    expect(paused.status).toBe("paused");
    expect(paused.pausedAt).toBeInstanceOf(Date);
    // Pausing again is harmless.
    const pausedAgain = await call(
      recurringRouter.pause,
      { scheduleId: created.id },
      household.context
    );
    expect(pausedAgain.status).toBe("paused");

    // Pretend it has been paused for ten days.
    await getTestDb()
      .update(recurringSchedule)
      .set({ nextOccurrenceDate: addDays(today, -10) })
      .where(eq(recurringSchedule.id, created.id));
    expect(
      await generateDueOccurrences(getTestDb(), created.id, new Date())
    ).toMatchObject({ created: 0 });

    const resumed = await call(
      recurringRouter.resume,
      { scheduleId: created.id },
      household.context
    );
    expect(resumed).toMatchObject({
      lastError: null,
      nextOccurrenceDate: today,
      pausedAt: null,
      status: "active",
    });

    await generateDueOccurrences(getTestDb(), created.id, new Date());
    const posted = await postedFor(created.id);
    expect(posted.map(({ transactionDate }) => transactionDate)).toEqual([
      today,
    ]);
  });

  it("stops for good and keeps what it already posted", async () => {
    const household = await signUpHousehold();
    const account = await createAccount(household);
    const created = await call(
      recurringRouter.create,
      await rentValues(household, account.id),
      household.context
    );
    await generateDueOccurrences(getTestDb(), created.id, new Date());
    const before = await postedFor(created.id);
    expect(before).toHaveLength(1);

    const stopped = await call(
      recurringRouter.stop,
      { scheduleId: created.id },
      household.context
    );
    expect(stopped).toMatchObject({
      nextOccurrenceDate: null,
      postedCount: 1,
      status: "stopped",
    });
    expect(stopped.stoppedAt).toBeInstanceOf(Date);

    const weeksLater = new Date(Date.now() + 86_400_000 * 40);
    expect(
      await generateDueOccurrences(getTestDb(), created.id, weeksLater)
    ).toMatchObject({ created: 0 });
    expect(await postedFor(created.id)).toEqual(before);

    for (const procedure of [recurringRouter.pause, recurringRouter.resume]) {
      expect(
        await codeOf(
          call(procedure, { scheduleId: created.id }, household.context)
        )
      ).toBe("BAD_REQUEST");
    }
    expect(
      await codeOf(
        call(
          recurringRouter.update,
          {
            ...(await rentValues(household, account.id)),
            scheduleId: created.id,
          },
          household.context
        )
      )
    ).toBe("BAD_REQUEST");
  });

  it("applies edits to future occurrences only", async () => {
    const household = await signUpHousehold();
    const account = await createAccount(household);
    const other = await createAccount(household, "GCash");
    const created = await call(
      recurringRouter.create,
      await rentValues(household, account.id, { startDate: "2026-01-05" }),
      household.context
    );
    // Post January's rent.
    await getTestDb()
      .update(recurringSchedule)
      .set({ nextOccurrenceDate: "2026-01-05" })
      .where(eq(recurringSchedule.id, created.id));
    await generateDueOccurrences(
      getTestDb(),
      created.id,
      manilaNoon("2026-01-05")
    );
    const [january] = await postedFor(created.id);

    const utilities = await categoryId(household, "Utilities");
    const updated = await call(
      recurringRouter.update,
      {
        ...(await rentValues(household, other.id, {
          amount: "19500",
          categoryId: utilities,
          notes: "New lease",
          startDate: "2026-01-05",
        })),
        scheduleId: created.id,
      },
      household.context
    );
    // Same timing, so the next occurrence is untouched.
    expect(updated).toMatchObject({
      accountId: other.id,
      amount: "19500.000000",
      nextOccurrenceDate: "2026-02-05",
      notes: "New lease",
    });
    expect(await postedFor(created.id)).toEqual([january]);

    await generateDueOccurrences(
      getTestDb(),
      created.id,
      manilaNoon("2026-02-05")
    );
    const posted = await postedFor(created.id);
    expect(posted).toContainEqual(january);
    expect(posted).toContainEqual(
      expect.objectContaining({
        amount: "19500.000000",
        categoryId: utilities,
        notes: "New lease",
        transactionDate: "2026-02-05",
      })
    );
  });

  it("recalculates the next occurrence when the timing changes", async () => {
    const household = await signUpHousehold();
    const account = await createAccount(household);
    const today = await todayIn(household);
    const created = await call(
      recurringRouter.create,
      await rentValues(household, account.id, {
        startDate: addDays(today, 3),
      }),
      household.context
    );
    expect(created.nextOccurrenceDate).toBe(addDays(today, 3));

    const newStart = addDays(today, -20);
    const updated = await call(
      recurringRouter.update,
      {
        ...(await rentValues(household, account.id, {
          frequency: "weekly",
          interval: 2,
          startDate: newStart,
        })),
        scheduleId: created.id,
      },
      household.context
    );

    expect(updated.nextOccurrenceDate).toBe(
      initialNextOccurrence(
        { frequency: "weekly", interval: 2, startDate: newStart },
        today
      )
    );
  });

  it("takes an end date, rejecting one before the start or before anything would post", async () => {
    const household = await signUpHousehold();
    const account = await createAccount(household);
    const today = await todayIn(household);

    const ending = await call(
      recurringRouter.create,
      await rentValues(household, account.id, { endDate: addDays(today, 90) }),
      household.context
    );
    expect(ending).toMatchObject({
      endDate: addDays(today, 90),
      nextOccurrenceDate: today,
      status: "active",
    });

    expect(
      await codeOf(
        call(
          recurringRouter.create,
          await rentValues(household, account.id, {
            endDate: addDays(today, -1),
          }),
          household.context
        )
      )
    ).toBe("BAD_REQUEST");
    expect(
      await codeOf(
        call(
          recurringRouter.create,
          await rentValues(household, account.id, {
            endDate: addDays(today, -1),
            startDate: addDays(today, -45),
          }),
          household.context
        )
      )
    ).toBe("BAD_REQUEST");
  });

  it("stops a schedule whose edited end date comes before its next occurrence", async () => {
    const household = await signUpHousehold();
    const account = await createAccount(household);
    const today = await todayIn(household);
    const values = await rentValues(household, account.id, {
      frequency: "daily",
      startDate: addDays(today, -5),
    });
    const created = await call(
      recurringRouter.create,
      values,
      household.context
    );
    await generateDueOccurrences(getTestDb(), created.id, new Date());

    // Today's occurrence has posted, so it was the last one.
    const updated = await call(
      recurringRouter.update,
      { ...values, endDate: today, scheduleId: created.id },
      household.context
    );

    expect(await postedFor(created.id)).toHaveLength(1);
    expect(updated).toMatchObject({
      endDate: today,
      nextOccurrenceDate: null,
      status: "stopped",
    });
    expect(updated.stoppedAt).toBeInstanceOf(Date);
  });

  it("stops instead of resuming once the end date passed while paused", async () => {
    const household = await signUpHousehold();
    const account = await createAccount(household);
    const today = await todayIn(household);
    const created = await call(
      recurringRouter.create,
      await rentValues(household, account.id, {
        endDate: addDays(today, 5),
        frequency: "daily",
        startDate: addDays(today, -10),
      }),
      household.context
    );
    await call(
      recurringRouter.pause,
      { scheduleId: created.id },
      household.context
    );
    // Pretend it was paused before the end date and that day has gone by.
    await getTestDb()
      .update(recurringSchedule)
      .set({
        endDate: addDays(today, -1),
        nextOccurrenceDate: addDays(today, -3),
      })
      .where(eq(recurringSchedule.id, created.id));

    const resumed = await call(
      recurringRouter.resume,
      { scheduleId: created.id },
      household.context
    );

    expect(resumed).toMatchObject({
      nextOccurrenceDate: null,
      pausedAt: null,
      status: "stopped",
    });
  });

  it("resuming checks the template can still post", async () => {
    const household = await signUpHousehold();
    const account = await createAccount(household);
    const created = await call(
      recurringRouter.create,
      await rentValues(household, account.id),
      household.context
    );
    await call(
      recurringRouter.pause,
      { scheduleId: created.id },
      household.context
    );
    await call(
      accountsRouter.archive,
      { accountId: account.id },
      household.context
    );

    expect(
      await codeOf(
        call(
          recurringRouter.resume,
          { scheduleId: created.id },
          household.context
        )
      )
    ).toBe("NOT_FOUND");
  });
});

describe("recurring schedule references", () => {
  it("rejects another household's account, category and tags", async () => {
    const household = await signUpHousehold();
    const intruder = await signUpHousehold();
    const account = await createAccount(household);
    const theirAccount = await createAccount(intruder, "Their bank");
    const theirTag = await call(
      tagsRouter.create,
      { color: "rose", name: "Theirs" },
      intruder.context
    );

    expect(
      await codeOf(
        call(
          recurringRouter.create,
          await rentValues(household, theirAccount.id),
          household.context
        )
      )
    ).toBe("NOT_FOUND");
    expect(
      await codeOf(
        call(
          recurringRouter.create,
          await rentValues(household, account.id, {
            categoryId: await categoryId(intruder, "Housing"),
          }),
          household.context
        )
      )
    ).toBe("BAD_REQUEST");
    expect(
      await codeOf(
        call(
          recurringRouter.create,
          await rentValues(household, account.id, { tagIds: [theirTag.id] }),
          household.context
        )
      )
    ).toBe("BAD_REQUEST");

    const created = await call(
      recurringRouter.create,
      await rentValues(household, account.id),
      household.context
    );
    expect(
      await codeOf(
        call(
          recurringRouter.update,
          {
            ...(await rentValues(household, theirAccount.id)),
            scheduleId: created.id,
          },
          household.context
        )
      )
    ).toBe("NOT_FOUND");
    expect(
      await codeOf(
        call(
          recurringRouter.update,
          {
            ...(await rentValues(household, account.id, {
              categoryId: await categoryId(intruder, "Housing"),
            })),
            scheduleId: created.id,
          },
          household.context
        )
      )
    ).toBe("BAD_REQUEST");
  });

  it("rejects archived references on a new schedule", async () => {
    const household = await signUpHousehold();
    const account = await createAccount(household);
    const archivedCategory = await call(
      categoriesRouter.create,
      { color: "slate", icon: "🧾", name: "Old dues", type: "expense" },
      household.context
    );
    await call(
      categoriesRouter.archive,
      { categoryId: archivedCategory.id },
      household.context
    );

    expect(
      await codeOf(
        call(
          recurringRouter.create,
          await rentValues(household, account.id, {
            categoryId: archivedCategory.id,
          }),
          household.context
        )
      )
    ).toBe("BAD_REQUEST");
  });

  it("hides and protects schedules across households", async () => {
    const household = await signUpHousehold();
    const intruder = await signUpHousehold();
    const account = await createAccount(household);
    const created = await call(
      recurringRouter.create,
      await rentValues(household, account.id),
      household.context
    );

    expect(await call(recurringRouter.list, {}, intruder.context)).toEqual([]);
    for (const procedure of [
      recurringRouter.pause,
      recurringRouter.resume,
      recurringRouter.stop,
    ]) {
      expect(
        await codeOf(
          call(procedure, { scheduleId: created.id }, intruder.context)
        )
      ).toBe("NOT_FOUND");
    }
    expect(
      await codeOf(
        call(
          recurringRouter.postings,
          { scheduleId: created.id },
          intruder.context
        )
      )
    ).toBe("NOT_FOUND");
    const theirAccount = await createAccount(intruder, "Their bank");
    expect(
      await codeOf(
        call(
          recurringRouter.update,
          {
            ...(await rentValues(intruder, theirAccount.id)),
            scheduleId: created.id,
          },
          intruder.context
        )
      )
    ).toBe("NOT_FOUND");
    const [untouched] = await call(recurringRouter.list, {}, household.context);
    expect(untouched?.status).toBe("active");
  });
});

describe("recurring schedule permissions", () => {
  it("lets viewers read, members manage, and only admins stop", async () => {
    const household = await signUpHousehold();
    const account = await createAccount(household);
    const created = await call(
      recurringRouter.create,
      await rentValues(household, account.id),
      household.context
    );
    const viewer = await joinAs(household, "viewer");
    const memberContext = await joinAs(household, "member");

    expect(await call(recurringRouter.list, {}, viewer)).toHaveLength(1);
    expect(
      await codeOf(
        call(
          recurringRouter.create,
          await rentValues(household, account.id),
          viewer
        )
      )
    ).toBe("FORBIDDEN");
    expect(
      await codeOf(
        call(recurringRouter.pause, { scheduleId: created.id }, viewer)
      )
    ).toBe("FORBIDDEN");

    const pausedByMember = await call(
      recurringRouter.pause,
      { scheduleId: created.id },
      memberContext
    );
    expect(pausedByMember.status).toBe("paused");
    expect(
      await codeOf(
        call(recurringRouter.stop, { scheduleId: created.id }, memberContext)
      )
    ).toBe("FORBIDDEN");
  });
});

describe("generated transactions", () => {
  it("are normal transactions in the ledger, balances and totals", async () => {
    const household = await signUpHousehold();
    const account = await createAccount(household);
    const created = await call(
      recurringRouter.create,
      await rentValues(household, account.id, {
        startDate: "2026-03-10",
      }),
      household.context
    );
    await getTestDb()
      .update(recurringSchedule)
      .set({ nextOccurrenceDate: "2026-03-10" })
      .where(eq(recurringSchedule.id, created.id));
    await generateDueOccurrences(
      getTestDb(),
      created.id,
      manilaNoon("2026-04-10")
    );

    const ledger = await call(
      transactionsRouter.list,
      { dateFrom: "2026-03-01", dateTo: "2026-04-30" },
      household.context
    );
    expect(ledger.items.map((item) => item.transactionDate)).toEqual([
      "2026-04-10",
      "2026-03-10",
    ]);
    const [latest] = ledger.items;
    expect(latest).toMatchObject({
      accountName: "BPI Savings",
      categoryName: "Housing",
      recurringOccurrenceDate: "2026-04-10",
      recurringScheduleId: created.id,
      recurringScheduleName: "Rent",
      type: "expense",
    });

    const totals = await call(
      transactionsRouter.totals,
      { dateFrom: "2026-03-01", dateTo: "2026-04-30" },
      household.context
    );
    expect(totals.currencies).toEqual([
      { currencyCode: "PHP", expense: "36000.000000", income: "0" },
    ]);
    const balance = await call(
      accountsRouter.get,
      { accountId: account.id },
      household.context
    );
    expect(balance.balance).toBe("-26000.000000");

    // A posted occurrence edits and archives like any other transaction.
    const edited = await call(
      transactionsRouter.update,
      {
        accountId: account.id,
        amount: "17000",
        categoryId: latest?.categoryId ?? "",
        notes: "Discounted",
        paidStatus: "paid",
        tagIds: [],
        transactionDate: "2026-04-11",
        transactionId: latest?.id ?? "",
      },
      household.context
    );
    expect(edited).toMatchObject({
      amount: "17000.000000",
      recurringOccurrenceDate: "2026-04-10",
    });
    // Its occurrence keeps its identity, so it is not posted again.
    await getTestDb()
      .update(recurringSchedule)
      .set({ nextOccurrenceDate: "2026-04-10" })
      .where(eq(recurringSchedule.id, created.id));
    expect(
      await generateDueOccurrences(
        getTestDb(),
        created.id,
        manilaNoon("2026-04-10")
      )
    ).toMatchObject({ created: 0, skipped: 1 });

    const postings = await call(
      recurringRouter.postings,
      { scheduleId: created.id },
      household.context
    );
    expect(postings.map(({ occurrenceDate }) => occurrenceDate)).toEqual([
      "2026-04-10",
      "2026-03-10",
    ]);
    const [listed] = await call(recurringRouter.list, {}, household.context);
    expect(listed).toMatchObject({
      lastOccurrenceDate: "2026-04-10",
      postedCount: 2,
    });
  });
});
