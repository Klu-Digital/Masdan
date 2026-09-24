import {
  category,
  file,
  financialAccount,
  financialTransaction,
  transactionImport,
} from "@masdan/db/schema/index";
import { queue } from "@masdan/queue";
import type * as StorageModule from "@masdan/storage";
import {
  drainQueue,
  getJobs,
  getSessionFor,
  getTestDb,
  signUpTestUser,
  startTestQueue,
  stopTestQueue,
} from "@masdan/testing";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { handleImportProcess } from "./imports";

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

const CSV =
  "﻿Date,Description,Amount\r\n2026-03-01,Salary,10000\r\n2026-03-02,Load,-100\r\n";

const createImport = async (): Promise<{
  accountId: string;
  importId: string;
}> => {
  const db = getTestDb();
  const { headers, user } = await signUpTestUser();
  const session = await getSessionFor(headers);
  const organizationId = session?.session.activeOrganizationId ?? "";
  const categoryId = async (name: string) => {
    const [row] = await db
      .select({ id: category.id })
      .from(category)
      .where(
        and(
          eq(category.organizationId, organizationId),
          eq(category.name, name)
        )
      );
    return row?.id ?? "";
  };
  const [account] = await db
    .insert(financialAccount)
    .values({
      accountClass: "asset",
      accountType: "bank",
      currencyCode: "PHP",
      name: "GCash",
      openingBalance: "0",
      openingBalanceDate: "2026-01-01",
      organizationId,
    })
    .returning({ id: financialAccount.id });
  const key = `${organizationId}/import/bank.csv`;
  bucket.objects.set(key, new TextEncoder().encode(CSV));
  const [source] = await db
    .insert(file)
    .values({
      bucket: "test-bucket",
      contentType: "text/csv",
      key,
      name: "bank.csv",
      organizationId,
      status: "ready",
      userId: user.id,
    })
    .returning({ id: file.id });
  const [created] = await db
    .insert(transactionImport)
    .values({
      accountId: account?.id ?? "",
      defaultExpenseCategoryId: await categoryId("Groceries"),
      defaultIncomeCategoryId: await categoryId("Salary"),
      fileName: "bank.csv",
      mapping: {
        amount: { column: 2, kind: "signed", negativeMeans: "expense" },
        categoryColumn: null,
        dateColumn: 0,
        dateFormat: "ymd",
        decimalSeparator: ".",
        delimiter: ",",
        descriptionColumn: 1,
        hasHeaderRow: true,
        notesColumn: null,
      },
      openingBalanceMode: "reject",
      organizationId,
      sourceFileId: source?.id ?? null,
      status: "validating",
    })
    .returning({ id: transactionImport.id });
  return { accountId: account?.id ?? "", importId: created?.id ?? "" };
};

const importStatus = async (importId: string) => {
  const [row] = await getTestDb()
    .select({
      importedRows: transactionImport.importedRows,
      status: transactionImport.status,
      validRows: transactionImport.validRows,
    })
    .from(transactionImport)
    .where(eq(transactionImport.id, importId));
  return row;
};

describe("imports.process handler", () => {
  it("validates, then commits, an import through the queue", async () => {
    const { accountId, importId } = await createImport();

    await queue.enqueue("imports.process", { importId });
    expect(await drainQueue("imports.process", handleImportProcess)).toBe(1);
    expect(await importStatus(importId)).toEqual({
      importedRows: 0,
      status: "ready",
      validRows: 2,
    });

    await getTestDb()
      .update(transactionImport)
      .set({ status: "committing" })
      .where(eq(transactionImport.id, importId));
    await queue.enqueue("imports.process", { importId });
    expect(await drainQueue("imports.process", handleImportProcess)).toBe(1);
    expect(await importStatus(importId)).toEqual({
      importedRows: 2,
      status: "completed",
      validRows: 0,
    });

    const transactions = await getTestDb()
      .select({ date: financialTransaction.transactionDate })
      .from(financialTransaction)
      .where(eq(financialTransaction.accountId, accountId));
    expect(transactions.map(({ date }) => date).toSorted()).toEqual([
      "2026-03-01",
      "2026-03-02",
    ]);
    const jobs = await getJobs("imports.process");
    expect(jobs.every((job) => job.state === "completed")).toBe(true);
  });

  it("treats a redelivered job as a no-op once the import has moved on", async () => {
    const { importId } = await createImport();
    await queue.enqueue("imports.process", { importId });
    await queue.enqueue("imports.process", { importId });

    expect(await drainQueue("imports.process", handleImportProcess)).toBe(2);
    expect(await importStatus(importId)).toMatchObject({
      status: "ready",
      validRows: 2,
    });
  });

  it("records a failure on the import instead of throwing for a retry", async () => {
    const { importId } = await createImport();
    bucket.objects.clear();
    await queue.enqueue("imports.process", { importId });

    await drainQueue("imports.process", handleImportProcess);
    expect(await importStatus(importId)).toMatchObject({ status: "failed" });
    const [job] = await getJobs("imports.process");
    expect(job?.state).toBe("completed");
  });
});
