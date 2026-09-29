import type { Database } from "@masdan/db";
import { financialAccount, transactionImport } from "@masdan/db/schema/index";
import { and, eq } from "drizzle-orm";

import { notFound } from "../shared/errors";
import { importMappingSchema } from "./mapping";

export const importFields = {
  accountId: transactionImport.accountId,
  accountName: financialAccount.name,
  checksum: transactionImport.checksum,
  committedAt: transactionImport.committedAt,
  createdAt: transactionImport.createdAt,
  currencyCode: financialAccount.currencyCode,
  defaultExpenseCategoryId: transactionImport.defaultExpenseCategoryId,
  defaultIncomeCategoryId: transactionImport.defaultIncomeCategoryId,
  duplicateRows: transactionImport.duplicateRows,
  error: transactionImport.error,
  failedStatus: transactionImport.failedStatus,
  fileName: transactionImport.fileName,
  headers: transactionImport.headers,
  id: transactionImport.id,
  importedRows: transactionImport.importedRows,
  invalidRows: transactionImport.invalidRows,
  mapping: transactionImport.mapping,
  openingBalanceDate: financialAccount.openingBalanceDate,
  openingBalanceMode: transactionImport.openingBalanceMode,
  sourceFileId: transactionImport.sourceFileId,
  status: transactionImport.status,
  totalRows: transactionImport.totalRows,
  updatedAt: transactionImport.updatedAt,
  validRows: transactionImport.validRows,
  validatedAt: transactionImport.validatedAt,
};

export const findImport = async (
  db: Database,
  organizationId: string,
  importId: string
) => {
  const [row] = await db
    .select(importFields)
    .from(transactionImport)
    .innerJoin(
      financialAccount,
      eq(financialAccount.id, transactionImport.accountId)
    )
    .where(
      and(
        eq(transactionImport.id, importId),
        eq(transactionImport.organizationId, organizationId)
      )
    )
    .limit(1);
  if (!row) {
    throw notFound("Import");
  }
  return { ...row, mapping: importMappingSchema.parse(row.mapping) };
};
