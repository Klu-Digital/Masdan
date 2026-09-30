import type { Database } from "@masdan/db";
import {
  financialAccount,
  organization,
  transactionImport,
  transactionImportRow,
} from "@masdan/db/schema/index";
import { and, asc, eq, sql } from "drizzle-orm";

import { neutralizeFormula, toCsv } from "../exports/csv";
import { notFound } from "../shared/errors";
import { importMappingSchema } from "./mapping";

export const importFields = {
  accountId: transactionImport.accountId,
  accountName: financialAccount.name,
  checksum: transactionImport.checksum,
  committedAt: transactionImport.committedAt,
  createdAt: transactionImport.createdAt,
  currencyCode: sql<string>`coalesce(${financialAccount.currencyCode}, (select ${organization.defaultCurrency} from ${organization} where ${organization.id} = ${transactionImport.organizationId}))`,
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
    .leftJoin(
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

export const exportAttentionRows = async (
  db: Database,
  organizationId: string,
  importId: string
) => {
  const current = await findImport(db, organizationId, importId);
  const rows = await db
    .select({
      errors: transactionImportRow.errors,
      raw: transactionImportRow.raw,
      rowNumber: transactionImportRow.rowNumber,
    })
    .from(transactionImportRow)
    .where(
      and(
        eq(transactionImportRow.organizationId, organizationId),
        eq(transactionImportRow.importId, importId),
        eq(transactionImportRow.status, "invalid")
      )
    )
    .orderBy(asc(transactionImportRow.rowNumber));
  return {
    csv: toCsv<(typeof rows)[number]>(
      [
        ...current.headers.map((header, index) => ({
          header: neutralizeFormula(header),
          text: true,
          value: (row: (typeof rows)[number]) => row.raw[index],
        })),
        { header: "Source row", value: (row) => row.rowNumber },
        {
          header: "Errors",
          text: true,
          value: (row) =>
            row.errors
              .map(({ field, message }) => `${field}: ${message}`)
              .join("; "),
        },
      ],
      rows
    ),
    fileName: `${current.fileName.replace(/\.csv$/iu, "")}-needs-attention.csv`,
    rowCount: rows.length,
  };
};
