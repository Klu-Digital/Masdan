import { category, file } from "@masdan/db/schema/index";
import type * as StorageModule from "@masdan/storage";
import {
  getSessionFor,
  getTestDb,
  signUpTestUser,
  startTestQueue,
  stopTestQueue,
} from "@masdan/testing";
import { call } from "@orpc/server";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { accountsRouter } from "../accounts/accounts.router";
import type { Context } from "../context";
import { processImport } from "../imports/imports.process";
import { importsRouter } from "../imports/imports.router";
import { transactionsRouter } from "../transactions/transactions.router";
import { reportsRouter } from "./reports.router";

const bucket = vi.hoisted(() => ({ objects: new Map<string, Uint8Array>() }));

vi.mock("@masdan/storage", async (importOriginal) => {
  const actual = await importOriginal<typeof StorageModule>();
  return {
    ...actual,
    storage: {
      bucket: "test-bucket",
      getObject: ({ key }: { key: string }) => bucket.objects.get(key) ?? null,
      isConfigured: () => true,
    },
  };
});

beforeAll(startTestQueue);
afterAll(stopTestQueue);

const CSV = [
  "Date,Description,Amount,Category",
  "2026-01-15,Payroll,2000,Salary",
  "2026-02-10,Puregold,-300,",
  "2026-03-05,Jeepney,-100,Transport",
].join("\n");

describe("reports over imported history", () => {
  it("counts imported rows exactly like manual ones", async () => {
    const { headers, user } = await signUpTestUser();
    const session = await getSessionFor(headers);
    const organizationId = session?.session.activeOrganizationId;
    if (!organizationId) {
      throw new Error("Test user has no active household");
    }
    const context = {
      context: {
        auth: null,
        db: getTestDb(),
        log: undefined,
        session,
      } as unknown as Context,
    };
    const categoryId = async (name: string) => {
      const [row] = await getTestDb()
        .select({ id: category.id })
        .from(category)
        .where(
          and(
            eq(category.organizationId, organizationId),
            eq(category.name, name)
          )
        );
      if (!row) {
        throw new Error(`Missing category ${name}`);
      }
      return row.id;
    };
    const groceries = await categoryId("Groceries");

    const account = await call(
      accountsRouter.create,
      {
        accountClass: "asset",
        accountType: "bank",
        liquidity: "liquid",
        name: "BPI Savings",
        openingBalance: "1000",
        openingBalanceDate: "2026-03-01",
        ownerMemberIds: [],
      },
      context
    );
    await call(
      transactionsRouter.create,
      {
        accountId: account.id,
        amount: "50",
        categoryId: groceries,
        paidStatus: "paid",
        tagIds: [],
        transactionDate: "2026-03-02",
      },
      context
    );

    const key = `${organizationId}/${crypto.randomUUID()}/bank.csv`;
    bucket.objects.set(key, new TextEncoder().encode(CSV));
    const [upload] = await getTestDb()
      .insert(file)
      .values({
        bucket: "test-bucket",
        contentType: "text/csv",
        key,
        name: "bank.csv",
        organizationId,
        size: CSV.length,
        status: "ready",
        userId: user.id,
      })
      .returning({ id: file.id });
    if (!upload) {
      throw new Error("Could not insert file");
    }
    const created = await call(
      importsRouter.create,
      {
        accountId: account.id,
        defaultExpenseCategoryId: groceries,
        defaultIncomeCategoryId: await categoryId("Salary"),
        fileId: upload.id,
        mapping: {
          amount: { column: 2, kind: "signed", negativeMeans: "expense" },
          categoryColumn: 3,
          dateColumn: 0,
          dateFormat: "ymd",
          decimalSeparator: ".",
          delimiter: ",",
          descriptionColumn: 1,
          hasHeaderRow: true,
          notesColumn: null,
        },
        openingBalanceMode: "include",
      },
      context
    );
    await processImport(getTestDb(), created.id);
    await call(importsRouter.commit, { importId: created.id }, context);
    await processImport(getTestDb(), created.id);
    await expect(
      call(importsRouter.get, { importId: created.id }, context)
    ).resolves.toMatchObject({ importedRows: 3, status: "completed" });

    const range = {
      dateFrom: "2026-01-01",
      dateTo: "2026-03-31",
      preset: "custom" as const,
    };
    const [netWorth, history, cashFlow, spending] = await Promise.all([
      call(reportsRouter.netWorth, undefined, context),
      call(
        reportsRouter.netWorthHistory,
        { ...range, granularity: "month" },
        context
      ),
      call(reportsRouter.cashFlow, range, context),
      call(reportsRouter.spendingByCategory, range, context),
    ]);

    // 1000 + 2000 − 300 − 100 imported − 50 manual.
    expect(netWorth.positions[0]?.netWorth).toBe("2550.000000");
    expect(
      history.points.map(({ date, positions }) => [
        date,
        positions[0]?.netWorth,
      ])
    ).toEqual([
      ["2026-01-31", "3000.000000"],
      ["2026-02-28", "2700.000000"],
      ["2026-03-31", "2550.000000"],
    ]);
    expect(history.dateFrom).toBe("2026-01-15");
    expect(cashFlow.totals).toEqual([
      {
        currencyCode: "PHP",
        expense: "450.000000",
        income: "2000.000000",
        net: "1550.000000",
      },
    ]);
    expect(
      spending.categories.map(({ count, name, total }) => [name, count, total])
    ).toEqual([
      ["Groceries", 2, "350.000000"],
      ["Transport", 1, "100.000000"],
    ]);
  });
});
