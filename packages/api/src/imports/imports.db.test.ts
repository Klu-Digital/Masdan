import {
  category,
  file,
  financialAccount,
  financialTransaction,
  organization,
  transactionImportRow,
} from "@masdan/db/schema/index";
import type * as StorageModule from "@masdan/storage";
import {
  getJobs,
  getSessionFor,
  getTestDb,
  signUpTestUser,
  startTestQueue,
  stopTestQueue,
  whileHolding,
} from "@masdan/testing";
import { call, ORPCError } from "@orpc/server";
import { and, asc, eq } from "drizzle-orm";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";

import { accountsRouter } from "../accounts/accounts.router";
import type { Context } from "../context";
import { getMonthlyCashFlow } from "../reports/reports.queries";
import { rulesRouter } from "../rules/rules.router";
import { tagsRouter } from "../tags/tags.router";
import { transactionsRouter } from "../transactions/transactions.router";
import { parseCsv } from "./csv";
import { processImport } from "./imports.process";
import { importsRouter } from "./imports.router";
import type { ImportMapping } from "./mapping";

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
beforeEach(() => {
  bucket.objects.clear();
});

const caught = async (promise: Promise<unknown>): Promise<unknown> => {
  try {
    return await promise;
  } catch (error) {
    return error;
  }
};

const codeOf = async (promise: Promise<unknown>) => {
  const error = await caught(promise);
  return error instanceof ORPCError ? error.code : undefined;
};

const mapping: ImportMapping = {
  amount: { column: 2, kind: "signed", negativeMeans: "expense" },
  categoryColumn: 3,
  dateColumn: 0,
  dateFormat: "ymd",
  decimalSeparator: ".",
  delimiter: ",",
  descriptionColumn: 1,
  hasHeaderRow: true,
  notesColumn: null,
};

const CSV = [
  "Date,Description,Amount,Category",
  '2026-02-01,Payroll,"25,000.00",Salary',
  "2026-02-03,Puregold,-1500.25,",
  "2026-02-03,Jeepney,-13,Transport",
  "2026-02-03,Jeepney,-13,Transport",
  "not a date,Broken,abc,",
  "2026-02-04,Mystery,-50,Nope",
  "2026-02-05,Wrong type,-10,Salary",
].join("\n");

interface Household {
  context: { context: Context };
  expenseCategoryId: string;
  incomeCategoryId: string;
  organizationId: string;
  userId: string;
}

const signUpHousehold = async (): Promise<Household> => {
  const { headers, user } = await signUpTestUser();
  const session = await getSessionFor(headers);
  const organizationId = session?.session.activeOrganizationId;
  if (!organizationId) {
    throw new Error("Test user has no active household");
  }
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
  return {
    context: {
      context: {
        auth: null,
        db: getTestDb(),
        log: undefined,
        session,
      } as unknown as Context,
    },
    expenseCategoryId: await categoryId("Groceries"),
    incomeCategoryId: await categoryId("Salary"),
    organizationId,
    userId: user.id,
  };
};

const createAccount = (
  household: Household,
  overrides: { openingBalance?: string; openingBalanceDate?: string } = {}
) =>
  call(
    accountsRouter.create,
    {
      accountClass: "asset",
      accountType: "bank",
      liquidity: "liquid",
      name: "BPI Savings",
      openingBalance: overrides.openingBalance ?? "1000",
      openingBalanceDate: overrides.openingBalanceDate ?? "2026-01-01",
      ownerMemberIds: [],
    },
    household.context
  );

const uploadCsv = async (household: Household, text: string) => {
  const key = `${household.organizationId}/${crypto.randomUUID()}/bank.csv`;
  bucket.objects.set(key, new TextEncoder().encode(text));
  const [row] = await getTestDb()
    .insert(file)
    .values({
      bucket: "test-bucket",
      contentType: "text/csv",
      key,
      name: "bank.csv",
      organizationId: household.organizationId,
      size: text.length,
      status: "ready",
      userId: household.userId,
    })
    .returning({ id: file.id, key: file.key });
  if (!row) {
    throw new Error("Could not insert file");
  }
  return row;
};

const startImport = (
  household: Household,
  accountId: string | null,
  fileId: string,
  overrides: Partial<{
    mapping: ImportMapping;
    openingBalanceMode: "reject" | "rebase" | "include";
  }> = {}
) =>
  call(
    importsRouter.create,
    {
      accountId,
      defaultExpenseCategoryId: household.expenseCategoryId,
      defaultIncomeCategoryId: household.incomeCategoryId,
      fileId,
      mapping: overrides.mapping ?? mapping,
      openingBalanceMode: overrides.openingBalanceMode ?? "reject",
    },
    household.context
  );

const validateAndCommit = async (household: Household, importId: string) => {
  await processImport(getTestDb(), importId);
  await call(importsRouter.commit, { importId }, household.context);
  await processImport(getTestDb(), importId);
  return call(importsRouter.get, { importId }, household.context);
};

const balanceOf = async (household: Household, accountId: string) => {
  const account = await call(
    accountsRouter.get,
    { accountId },
    household.context
  );
  return account.balance;
};

const accountTransactions = (accountId: string) =>
  getTestDb()
    .select({
      amount: financialTransaction.amount,
      importFingerprint: financialTransaction.importFingerprint,
      notes: financialTransaction.notes,
      transactionDate: financialTransaction.transactionDate,
    })
    .from(financialTransaction)
    .where(eq(financialTransaction.accountId, accountId))
    .orderBy(asc(financialTransaction.transactionDate));

describe("imports preview", () => {
  it("enqueues validation and reports row-level errors without discarding valid rows", async () => {
    const household = await signUpHousehold();
    const account = await createAccount(household);
    const source = await uploadCsv(household, CSV);

    const created = await startImport(household, account.id, source.id);
    expect(created.status).toBe("validating");
    const jobs = await getJobs("imports.process");
    expect(jobs.map((job) => job.data.importId)).toContain(created.id);

    await processImport(getTestDb(), created.id);

    const preview = await call(
      importsRouter.get,
      { importId: created.id },
      household.context
    );
    expect(preview).toMatchObject({
      duplicateRows: 0,
      headers: ["Date", "Description", "Amount", "Category"],
      importedRows: 0,
      invalidRows: 3,
      status: "ready",
      totalRows: 7,
      validRows: 4,
    });
    expect(preview.checksum).toMatch(/^[0-9a-f]{64}$/u);

    const { items } = await call(
      importsRouter.rows,
      { importId: created.id },
      household.context
    );
    expect(items.map(({ rowNumber, status }) => [rowNumber, status])).toEqual([
      [2, "valid"],
      [3, "valid"],
      [4, "valid"],
      [5, "valid"],
      [6, "invalid"],
      [7, "invalid"],
      [8, "invalid"],
    ]);
    expect(items[0]).toMatchObject({
      amount: "25000.000000",
      categoryId: household.incomeCategoryId,
      transactionDate: "2026-02-01",
      type: "income",
    });
    expect(items[1]).toMatchObject({
      amount: "1500.250000",
      categoryId: household.expenseCategoryId,
      type: "expense",
    });
    expect(items[4]?.raw).toEqual(["not a date", "Broken", "abc", ""]);
    expect(items[4]?.errors.map(({ field }) => field)).toEqual([
      "date",
      "amount",
    ]);
    expect(items[5]?.errors).toEqual([
      {
        field: "category",
        message:
          'No category named "Nope" in this household. Create it, or unmap the category column to use the defaults.',
      },
    ]);
    expect(items[6]?.errors[0]?.message).toBe(
      '"Salary" is an income category, but this row is money out.'
    );

    const invalidOnly = await call(
      importsRouter.rows,
      { importId: created.id, statuses: ["invalid"] },
      household.context
    );
    expect(invalidOnly.total).toBe(3);
    expect(await accountTransactions(account.id)).toEqual([]);
  });

  it("rejects a file that is not ready or not a CSV", async () => {
    const household = await signUpHousehold();
    const account = await createAccount(household);
    const source = await uploadCsv(household, CSV);
    await getTestDb()
      .update(file)
      .set({ status: "pending" })
      .where(eq(file.id, source.id));
    expect(await codeOf(startImport(household, account.id, source.id))).toBe(
      "CONFLICT"
    );
    await getTestDb()
      .update(file)
      .set({ contentType: "image/png", status: "ready" })
      .where(eq(file.id, source.id));
    expect(await codeOf(startImport(household, account.id, source.id))).toBe(
      "BAD_REQUEST"
    );
  });

  it("fails with an actionable message when the file is gone, and retries", async () => {
    const household = await signUpHousehold();
    const account = await createAccount(household);
    const source = await uploadCsv(household, CSV);
    const created = await startImport(household, account.id, source.id);
    const bytes = bucket.objects.get(source.key);
    bucket.objects.clear();

    await processImport(getTestDb(), created.id);
    const failed = await call(
      importsRouter.get,
      { importId: created.id },
      household.context
    );
    expect(failed).toMatchObject({
      error: "The uploaded file is no longer available. Upload it again.",
      failedStatus: "validating",
      status: "failed",
    });

    if (bytes) {
      bucket.objects.set(source.key, bytes);
    }
    await call(
      importsRouter.retry,
      { importId: created.id },
      household.context
    );
    await processImport(getTestDb(), created.id);
    await expect(
      call(importsRouter.get, { importId: created.id }, household.context)
    ).resolves.toMatchObject({ error: null, status: "ready", validRows: 4 });
  });

  it("re-validates with a new mapping", async () => {
    const household = await signUpHousehold();
    const account = await createAccount(household);
    const source = await uploadCsv(household, CSV);
    const created = await startImport(household, account.id, source.id);
    await processImport(getTestDb(), created.id);

    await call(
      importsRouter.update,
      {
        accountId: account.id,
        defaultExpenseCategoryId: household.expenseCategoryId,
        defaultIncomeCategoryId: household.incomeCategoryId,
        importId: created.id,
        mapping: { ...mapping, categoryColumn: null },
        openingBalanceMode: "reject",
      },
      household.context
    );
    await processImport(getTestDb(), created.id);
    await expect(
      call(importsRouter.get, { importId: created.id }, household.context)
    ).resolves.toMatchObject({ invalidRows: 1, status: "ready", validRows: 6 });
  });
});

describe("imports attention export", () => {
  it("exports every rejected row with original cells and errors, safely quoted", async () => {
    const household = await signUpHousehold();
    const csv = [
      "Date,Description,Amount,Category",
      'not a date,"=SUM(1,2)\nquoted ""text""",-10,',
      ...Array.from(
        { length: 204 },
        (_, index) => `not a date,Rejected ${index},-10,`
      ),
      "2026-02-01,Valid,-10,",
    ].join("\n");
    const source = await uploadCsv(household, csv);
    const created = await startImport(household, null, source.id);
    await processImport(getTestDb(), created.id);
    const exported = await call(
      importsRouter.exportAttention,
      { importId: created.id },
      household.context
    );
    expect(exported).toMatchObject({
      fileName: "bank-needs-attention.csv",
      rowCount: 205,
    });
    const { records } = parseCsv(exported.csv, { delimiter: "," });
    expect(records).toHaveLength(206);
    expect(records[0]?.cells).toEqual([
      "Date",
      "Description",
      "Amount",
      "Category",
      "Source row",
      "Errors",
    ]);
    expect(records[1]?.cells).toEqual([
      "not a date",
      '\'=SUM(1,2)\nquoted "text"',
      "'-10",
      "",
      "2",
      expect.stringContaining("date: Can't read"),
    ]);
    expect(exported.csv).not.toContain(",Valid,");
    const other = await signUpHousehold();
    expect(
      await codeOf(
        call(
          importsRouter.exportAttention,
          { importId: created.id },
          other.context
        )
      )
    ).toBe("NOT_FOUND");
  });
});

describe("imports commit", () => {
  it("imports accountless history into the household ledger and reports, with household-scoped duplicates", async () => {
    const household = await signUpHousehold();
    await getTestDb()
      .update(organization)
      .set({ defaultCurrency: "USD" })
      .where(eq(organization.id, household.organizationId));
    const source = await uploadCsv(household, CSV);
    const created = await call(
      importsRouter.create,
      {
        defaultExpenseCategoryId: household.expenseCategoryId,
        defaultIncomeCategoryId: household.incomeCategoryId,
        fileId: source.id,
        mapping,
        openingBalanceMode: "reject",
      },
      household.context
    );
    expect(created).toMatchObject({
      accountId: null,
      accountName: null,
      currencyCode: "USD",
    });
    expect(await validateAndCommit(household, created.id)).toMatchObject({
      importedRows: 4,
      invalidRows: 3,
      status: "completed",
    });
    expect(await call(importsRouter.list, {}, household.context)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ accountId: null, id: created.id }),
      ])
    );
    const ledger = await call(transactionsRouter.list, {}, household.context);
    expect(ledger.total).toBe(4);
    expect(ledger.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          accountId: null,
          accountName: null,
          currencyCode: "USD",
        }),
      ])
    );
    expect(
      await getMonthlyCashFlow(getTestDb(), household.organizationId, {
        dateFrom: "2026-02-01",
        dateTo: "2026-02-28",
      })
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          currencyCode: "USD",
          expense: "1526.250000",
          income: "25000.000000",
        }),
      ])
    );
    const account = await createAccount(household);
    expect(await balanceOf(household, account.id)).toBe("1000.000000");
    const repeated = await startImport(household, null, source.id);
    await processImport(getTestDb(), repeated.id);
    expect(
      await call(
        importsRouter.get,
        { importId: repeated.id },
        household.context
      )
    ).toMatchObject({
      duplicateRows: 4,
      previousImport: { id: created.id },
      validRows: 0,
    });
    const other = await signUpHousehold();
    const otherSource = await uploadCsv(other, CSV);
    const otherImport = await startImport(other, null, otherSource.id);
    expect(await validateAndCommit(other, otherImport.id)).toMatchObject({
      duplicateRows: 0,
      importedRows: 4,
    });
    const [transaction] = ledger.items;
    if (!transaction?.categoryId) {
      throw new Error("Missing imported transaction");
    }
    await call(
      transactionsRouter.update,
      {
        accountId: null,
        amount: transaction.amount,
        categoryId: transaction.categoryId,
        notes: "Edited history",
        paidStatus: "paid",
        transactionDate: transaction.transactionDate,
        transactionId: transaction.id,
      },
      household.context
    );
    await call(
      transactionsRouter.archive,
      { transactionId: transaction.id },
      household.context
    );
    await call(
      transactionsRouter.restore,
      { transactionId: transaction.id },
      household.context
    );
    expect(await balanceOf(household, account.id)).toBe("1000.000000");
  });
  it("backfills transactions on their original dates and moves the balance", async () => {
    const household = await signUpHousehold();
    const account = await createAccount(household);
    const source = await uploadCsv(household, CSV);
    const created = await startImport(household, account.id, source.id);

    const result = await validateAndCommit(household, created.id);
    expect(result).toMatchObject({
      duplicateRows: 0,
      importedRows: 4,
      invalidRows: 3,
      status: "completed",
      validRows: 0,
    });

    const rows = await accountTransactions(account.id);
    expect(
      rows.map(({ amount, notes, transactionDate }) => [
        transactionDate,
        amount,
        notes,
      ])
    ).toEqual([
      ["2026-02-01", "25000.000000", "Payroll"],
      ["2026-02-03", "1500.250000", "Puregold"],
      ["2026-02-03", "13.000000", "Jeepney"],
      ["2026-02-03", "13.000000", "Jeepney"],
    ]);
    // 1000 + 25000 - 1500.25 - 13 - 13
    expect(await balanceOf(household, account.id)).toBe("24473.750000");

    const ledger = await call(
      transactionsRouter.list,
      {
        accountIds: [account.id],
        dateFrom: "2026-02-03",
        dateTo: "2026-02-03",
      },
      household.context
    );
    expect(ledger.total).toBe(3);

    const imported = await getTestDb()
      .select({ transactionId: transactionImportRow.transactionId })
      .from(transactionImportRow)
      .where(
        and(
          eq(transactionImportRow.importId, created.id),
          eq(transactionImportRow.status, "imported")
        )
      );
    expect(imported.every(({ transactionId }) => transactionId !== null)).toBe(
      true
    );
  });

  it("changes a balance exactly like the same manual transaction", async () => {
    const household = await signUpHousehold();
    const manual = await createAccount(household);
    const importedAccount = await createAccount(household);

    await call(
      transactionsRouter.create,
      {
        accountId: manual.id,
        amount: "1500.25",
        categoryId: household.expenseCategoryId,
        notes: "Puregold",
        paidStatus: "paid",
        tagIds: [],
        transactionDate: "2025-06-01",
      },
      household.context
    );
    await getTestDb()
      .update(financialAccount)
      .set({ openingBalanceDate: "2025-01-01" })
      .where(eq(financialAccount.id, manual.id));
    await getTestDb()
      .update(financialAccount)
      .set({ openingBalanceDate: "2025-01-01" })
      .where(eq(financialAccount.id, importedAccount.id));

    const source = await uploadCsv(
      household,
      "Date,Description,Amount\n2025-06-01,Puregold,-1500.25\n"
    );
    const created = await startImport(
      household,
      importedAccount.id,
      source.id,
      {
        mapping: { ...mapping, categoryColumn: null },
      }
    );
    await validateAndCommit(household, created.id);

    const manualBalance = await balanceOf(household, manual.id);
    expect(manualBalance).toBe("-500.250000");
    expect(await balanceOf(household, importedAccount.id)).toBe(manualBalance);
  });

  it("is idempotent across retried jobs and re-imports of the same file", async () => {
    const household = await signUpHousehold();
    const account = await createAccount(household);
    const first = await uploadCsv(household, CSV);
    const created = await startImport(household, account.id, first.id);
    await validateAndCommit(household, created.id);

    // A duplicate job delivery after completion does nothing.
    await processImport(getTestDb(), created.id);
    expect(await accountTransactions(account.id)).toHaveLength(4);
    expect(
      await codeOf(
        call(importsRouter.commit, { importId: created.id }, household.context)
      )
    ).toBe("CONFLICT");

    const second = await uploadCsv(household, CSV);
    const again = await startImport(household, account.id, second.id);
    await processImport(getTestDb(), again.id);
    const preview = await call(
      importsRouter.get,
      { importId: again.id },
      household.context
    );
    expect(preview).toMatchObject({
      duplicateRows: 4,
      invalidRows: 3,
      previousImport: { id: created.id },
      validRows: 0,
    });
    expect(
      await codeOf(
        call(importsRouter.commit, { importId: again.id }, household.context)
      )
    ).toBe("BAD_REQUEST");
    expect(await accountTransactions(account.id)).toHaveLength(4);
    expect(await balanceOf(household, account.id)).toBe("24473.750000");
  });

  it("skips rows another import committed between preview and commit", async () => {
    const household = await signUpHousehold();
    const account = await createAccount(household);
    const firstFile = await uploadCsv(household, CSV);
    const secondFile = await uploadCsv(household, CSV);
    const one = await startImport(household, account.id, firstFile.id);
    const two = await startImport(household, account.id, secondFile.id);
    await processImport(getTestDb(), one.id);
    await processImport(getTestDb(), two.id);

    await call(importsRouter.commit, { importId: one.id }, household.context);
    await call(importsRouter.commit, { importId: two.id }, household.context);
    await processImport(getTestDb(), one.id);
    await processImport(getTestDb(), two.id);

    await expect(
      call(importsRouter.get, { importId: two.id }, household.context)
    ).resolves.toMatchObject({
      duplicateRows: 4,
      importedRows: 0,
      status: "completed",
    });
    expect(await accountTransactions(account.id)).toHaveLength(4);
  });
});

describe("imports before the opening balance date", () => {
  const history =
    "Date,Description,Amount\n2025-12-01,Old salary,5000\n2025-12-15,Old rent,-2000\n2026-01-10,New,-100\n";
  const noCategory = { ...mapping, categoryColumn: null };

  it("rejects earlier rows by default", async () => {
    const household = await signUpHousehold();
    const account = await createAccount(household);
    const source = await uploadCsv(household, history);
    const created = await startImport(household, account.id, source.id, {
      mapping: noCategory,
    });
    await processImport(getTestDb(), created.id);
    const { items } = await call(
      importsRouter.rows,
      { importId: created.id, statuses: ["invalid"] },
      household.context
    );
    expect(items).toHaveLength(2);
    expect(items[0]?.errors[0]?.message).toContain("2026-01-01");
  });

  it("include: moves the opening date back so the rows count toward today", async () => {
    const household = await signUpHousehold();
    const account = await createAccount(household);
    const source = await uploadCsv(household, history);
    const created = await startImport(household, account.id, source.id, {
      mapping: noCategory,
      openingBalanceMode: "include",
    });
    await validateAndCommit(household, created.id);
    const updated = await call(
      accountsRouter.get,
      { accountId: account.id },
      household.context
    );
    expect(updated).toMatchObject({
      balance: "3900.000000",
      openingBalance: "1000.000000",
      openingBalanceDate: "2025-12-01",
    });
  });

  it("rebase: adds history but keeps today's balance", async () => {
    const household = await signUpHousehold();
    const account = await createAccount(household);
    const source = await uploadCsv(household, history);
    const created = await startImport(household, account.id, source.id, {
      mapping: noCategory,
      openingBalanceMode: "rebase",
    });
    await validateAndCommit(household, created.id);
    const updated = await call(
      accountsRouter.get,
      { accountId: account.id },
      household.context
    );
    // Only the in-range -100 moves today's balance; 1000 - 3000 = -2000 opens.
    expect(updated).toMatchObject({
      balance: "900.000000",
      openingBalance: "-2000.000000",
      openingBalanceDate: "2025-12-01",
    });
  });

  it("rebase: a posting that lands mid-commit still moves today's balance", async () => {
    const household = await signUpHousehold();
    const account = await createAccount(household);
    const source = await uploadCsv(household, history);
    const created = await startImport(household, account.id, source.id, {
      mapping: noCategory,
      openingBalanceMode: "rebase",
    });
    await processImport(getTestDb(), created.id);
    await call(
      importsRouter.commit,
      { importId: created.id },
      household.context
    );

    await whileHolding(
      getTestDb(),
      (tx) =>
        call(
          transactionsRouter.create,
          {
            accountId: account.id,
            amount: "50",
            categoryId: household.expenseCategoryId,
            paidStatus: "paid",
            tagIds: [],
            transactionDate: "2026-02-01",
          },
          { context: { ...household.context.context, db: tx } }
        ),
      () => processImport(getTestDb(), created.id)
    );

    // 1000 - 100 imported in range - 50 posted concurrently.
    expect(await balanceOf(household, account.id)).toBe("850.000000");
  });
});

describe("imports household isolation", () => {
  it("rejects another household's account, categories, and file", async () => {
    const mine = await signUpHousehold();
    const theirs = await signUpHousehold();
    const myAccount = await createAccount(mine);
    const theirAccount = await createAccount(theirs);
    const myFile = await uploadCsv(mine, CSV);
    const theirFile = await uploadCsv(theirs, CSV);

    expect(await codeOf(startImport(mine, theirAccount.id, myFile.id))).toBe(
      "NOT_FOUND"
    );
    expect(await codeOf(startImport(mine, myAccount.id, theirFile.id))).toBe(
      "NOT_FOUND"
    );
    expect(
      await codeOf(
        call(
          importsRouter.create,
          {
            accountId: myAccount.id,
            defaultExpenseCategoryId: theirs.expenseCategoryId,
            defaultIncomeCategoryId: mine.incomeCategoryId,
            fileId: myFile.id,
            mapping,
            openingBalanceMode: "reject",
          },
          mine.context
        )
      )
    ).toBe("BAD_REQUEST");
  });

  it("hides one household's imports from another", async () => {
    const mine = await signUpHousehold();
    const theirs = await signUpHousehold();
    const account = await createAccount(mine);
    const source = await uploadCsv(mine, CSV);
    const created = await startImport(mine, account.id, source.id);
    await processImport(getTestDb(), created.id);
    const input = { importId: created.id };

    expect(await codeOf(call(importsRouter.get, input, theirs.context))).toBe(
      "NOT_FOUND"
    );
    expect(await codeOf(call(importsRouter.rows, input, theirs.context))).toBe(
      "NOT_FOUND"
    );
    expect(
      await codeOf(call(importsRouter.commit, input, theirs.context))
    ).toBe("NOT_FOUND");
    expect(
      await codeOf(call(importsRouter.discard, input, theirs.context))
    ).toBe("NOT_FOUND");
    await expect(call(importsRouter.list, {}, theirs.context)).resolves.toEqual(
      []
    );
    await expect(
      call(importsRouter.list, {}, mine.context)
    ).resolves.toHaveLength(1);
  });

  it("never matches a category name from another household", async () => {
    const mine = await signUpHousehold();
    const theirs = await signUpHousehold();
    await getTestDb().insert(category).values({
      color: "red",
      icon: "x",
      name: "Their Secret",
      organizationId: theirs.organizationId,
      type: "expense",
    });
    const account = await createAccount(mine);
    const source = await uploadCsv(
      mine,
      "Date,Description,Amount,Category\n2026-02-01,x,-5,Their Secret\n"
    );
    const created = await startImport(mine, account.id, source.id);
    await processImport(getTestDb(), created.id);
    const { items } = await call(
      importsRouter.rows,
      { importId: created.id },
      mine.context
    );
    expect(items[0]?.status).toBe("invalid");
    expect(items[0]?.errors[0]?.field).toBe("category");
  });
});

const categoryNamed = async (household: Household, name: string) => {
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

const textRule = (
  household: Household,
  name: string,
  value: string,
  actions: { categoryId: string | null; tagIds: string[] }
) =>
  call(
    rulesRouter.create,
    {
      actions,
      conditions: {
        accountId: null,
        amountMax: null,
        amountMin: null,
        text: { operator: "contains", value },
        type: actions.categoryId ? "expense" : null,
      },
      name,
    },
    household.context
  );

const importedRows = (accountId: string) =>
  getTestDb()
    .select({
      categoryId: financialTransaction.categoryId,
      id: financialTransaction.id,
      notes: financialTransaction.notes,
      ruleApplication: financialTransaction.ruleApplication,
    })
    .from(financialTransaction)
    .where(eq(financialTransaction.accountId, accountId))
    .orderBy(
      asc(financialTransaction.transactionDate),
      asc(financialTransaction.id)
    );

describe("imports with categorization rules", () => {
  it("applies the first enabled match at preview and commits exactly what was previewed", async () => {
    const household = await signUpHousehold();
    const account = await createAccount(household);
    const pantry = await call(
      tagsRouter.create,
      { color: "green", name: "Pantry" },
      household.context
    );
    const commute = await call(
      tagsRouter.create,
      { color: "sky", name: "Commute" },
      household.context
    );
    const shopping = await categoryNamed(household, "Shopping");
    const dining = await categoryNamed(household, "Food & Dining");
    const transport = await categoryNamed(household, "Transport");

    const disabled = await textRule(
      household,
      "Old Puregold rule",
      "puregold",
      {
        categoryId: shopping,
        tagIds: [],
      }
    );
    await call(
      rulesRouter.setEnabled,
      { enabled: false, ruleId: disabled.id },
      household.context
    );
    const puregold = await textRule(household, "Puregold", "puregold", {
      categoryId: dining,
      tagIds: [pantry.id],
    });
    await textRule(household, "Jeepney", "jeepney", {
      categoryId: null,
      tagIds: [commute.id],
    });

    const source = await uploadCsv(household, CSV);
    const created = await startImport(household, account.id, source.id);
    await processImport(getTestDb(), created.id);

    const { items } = await call(
      importsRouter.rows,
      { importId: created.id, statuses: ["valid"] },
      household.context
    );
    const byDescription = new Map(items.map((row) => [row.description, row]));
    expect(byDescription.get("Payroll")?.ruleApplication).toBeNull();
    expect(byDescription.get("Puregold")).toMatchObject({
      categoryId: dining,
      ruleApplication: {
        categoryId: dining,
        conditions: { text: { operator: "contains", value: "puregold" } },
        ruleId: puregold.id,
        ruleName: "Puregold",
        tagIds: [pantry.id],
      },
    });
    // A tags-only rule leaves the category the file mapped.
    expect(byDescription.get("Jeepney")).toMatchObject({
      categoryId: transport,
      ruleApplication: { categoryId: null, ruleName: "Jeepney" },
    });

    // Editing the rule after the preview doesn't change what gets committed.
    await call(
      rulesRouter.update,
      {
        actions: { categoryId: shopping, tagIds: [] },
        conditions: {
          accountId: null,
          amountMax: null,
          amountMin: null,
          text: { operator: "contains", value: "puregold" },
          type: "expense",
        },
        name: "Puregold",
        ruleId: puregold.id,
      },
      household.context
    );
    await call(
      importsRouter.commit,
      { importId: created.id },
      household.context
    );
    await processImport(getTestDb(), created.id);

    const transactions = await importedRows(account.id);
    const committed = new Map(
      transactions.map((row) => [row.notes, row] as const)
    );
    expect(committed.get("Payroll")?.ruleApplication).toBeNull();
    expect(committed.get("Puregold")).toMatchObject({
      categoryId: dining,
      ruleApplication: { ruleName: "Puregold", tagIds: [pantry.id] },
    });

    const tagsOf = async (notes: string) => {
      const id = transactions.find((row) => row.notes === notes)?.id ?? "";
      const detail = await call(
        transactionsRouter.get,
        { transactionId: id },
        household.context
      );
      return detail.tags.map(({ name }) => name);
    };
    expect(await tagsOf("Puregold")).toEqual(["Pantry"]);
    expect(await tagsOf("Jeepney")).toEqual(["Commute"]);
    expect(await tagsOf("Payroll")).toEqual([]);
    expect(transactions.filter((row) => row.notes === "Jeepney")).toHaveLength(
      2
    );
  });

  it("rejects a row at commit when the rule's tag was archived after the preview", async () => {
    const household = await signUpHousehold();
    const account = await createAccount(household);
    const pantry = await call(
      tagsRouter.create,
      { color: "green", name: "Pantry" },
      household.context
    );
    await textRule(household, "Puregold", "puregold", {
      categoryId: null,
      tagIds: [pantry.id],
    });
    const source = await uploadCsv(household, CSV);
    const created = await startImport(household, account.id, source.id);
    await processImport(getTestDb(), created.id);

    await call(tagsRouter.archive, { tagId: pantry.id }, household.context);
    await call(
      importsRouter.commit,
      { importId: created.id },
      household.context
    );
    await processImport(getTestDb(), created.id);

    const { items } = await call(
      importsRouter.rows,
      { importId: created.id },
      household.context
    );
    const puregold = items.find((row) => row.description === "Puregold");
    expect(puregold?.status).toBe("invalid");
    expect(puregold?.errors[0]?.field).toBe("tags");
    const committed = await importedRows(account.id);
    expect(committed.map(({ notes }) => notes)).not.toContain("Puregold");
  });

  it("never applies another household's rules", async () => {
    const mine = await signUpHousehold();
    const theirs = await signUpHousehold();
    const theirTag = await call(
      tagsRouter.create,
      { color: "red", name: "Theirs" },
      theirs.context
    );
    await textRule(theirs, "Their Puregold", "puregold", {
      categoryId: null,
      tagIds: [theirTag.id],
    });

    const account = await createAccount(mine);
    const source = await uploadCsv(mine, CSV);
    const created = await startImport(mine, account.id, source.id);
    await processImport(getTestDb(), created.id);
    const { items } = await call(
      importsRouter.rows,
      { importId: created.id },
      mine.context
    );
    expect(items.every((row) => row.ruleApplication === null)).toBe(true);
  });
});
