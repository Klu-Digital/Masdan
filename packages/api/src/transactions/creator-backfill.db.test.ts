import backfill from "@masdan/db/post-migration-scripts/20261002083810_backfill_transaction_creator";
import {
  category,
  financialTransaction,
  interestCredit,
  recurringSchedule,
} from "@masdan/db/schema/index";
import { getSessionFor, getTestDb, signUpTestUser } from "@masdan/testing";
import { call } from "@orpc/server";
import { and, eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vite-plus/test";

import { accountsRouter } from "../accounts/accounts.router";
import type { Context } from "../context";
import { createTransaction } from "./transactions.write";

const quiet = { debug() {}, error() {}, info() {}, warn() {} };

describe("transaction creator backfill", () => {
  it("credits owners for past entries but leaves recurring and interest postings unattributed", async () => {
    const owner = await signUpTestUser();
    const currentSession = await getSessionFor(owner.headers);
    const organizationId = currentSession?.session.activeOrganizationId ?? "";
    const db = getTestDb();
    const context = {
      context: {
        auth: null,
        db,
        log: undefined,
        session: currentSession,
      } as unknown as Context,
    };
    const account = await call(
      accountsRouter.create,
      {
        accountClass: "asset",
        accountType: "bank",
        liquidity: "liquid",
        name: "Savings",
        openingBalance: "0",
        openingBalanceDate: "2026-01-01",
        ownerMemberIds: [],
      },
      context
    );
    const [groceries] = await db
      .select({ id: category.id })
      .from(category)
      .where(
        and(
          eq(category.organizationId, organizationId),
          eq(category.name, "Groceries")
        )
      );
    const entry = {
      accountId: account.id,
      amount: "10",
      categoryId: groceries?.id ?? "",
      notes: null,
      paidStatus: "paid" as const,
      splits: [],
      tagIds: [],
      transactionDate: "2026-01-05",
    };
    const [schedule] = await db
      .insert(recurringSchedule)
      .values({
        accountId: account.id,
        amount: "10",
        categoryId: entry.categoryId,
        frequency: "monthly",
        name: "Rent",
        nextOccurrenceDate: "2026-02-05",
        organizationId,
        startDate: "2026-01-05",
      })
      .returning({ id: recurringSchedule.id });

    const manual = await createTransaction(db, organizationId, entry);
    const recurring = await createTransaction(db, organizationId, entry, {
      occurrenceDate: "2026-01-05",
      scheduleId: schedule?.id ?? "",
    });
    const interest = await createTransaction(db, organizationId, entry);
    await db.insert(interestCredit).values({
      accountId: account.id,
      creditDate: "2026-01-31",
      gross: "1",
      net: "0.8",
      organizationId,
      periodEnd: "2026-01-31",
      periodStart: "2026-01-01",
      tax: "0.2",
      transactionId: interest?.id ?? null,
    });

    await backfill.up({ db, dryRun: false, log: quiet, sql });

    const rows = await db
      .select({
        createdByUserId: financialTransaction.createdByUserId,
        id: financialTransaction.id,
      })
      .from(financialTransaction)
      .where(eq(financialTransaction.organizationId, organizationId));
    const creators = new Map(rows.map((row) => [row.id, row.createdByUserId]));
    expect(creators.get(manual?.id ?? "")).toBe(owner.user.id);
    expect(creators.get(recurring?.id ?? "")).toBeNull();
    expect(creators.get(interest?.id ?? "")).toBeNull();
  });
});
