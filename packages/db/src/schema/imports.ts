import { sql } from "drizzle-orm";
import {
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { organization, user } from "./auth";
import { category } from "./categories";
import { financialAccount } from "./financial-accounts";
import { file } from "./storage";
import { financialTransaction } from "./transactions";

export const transactionImportStatuses = [
  "validating",
  "ready",
  "committing",
  "completed",
  "failed",
  "discarded",
] as const;
export type TransactionImportStatus =
  (typeof transactionImportStatuses)[number];

export const transactionImportRowStatuses = [
  "valid",
  "invalid",
  "duplicate",
  "imported",
] as const;
export type TransactionImportRowStatus =
  (typeof transactionImportRowStatuses)[number];

export interface TransactionImportRowError {
  field: string;
  message: string;
}

/** One CSV upload mapped onto one account; rows land in the ledger. */
export const transactionImport = pgTable(
  "transaction_import",
  {
    accountId: uuid("account_id")
      .notNull()
      .references(() => financialAccount.id, { onDelete: "cascade" }),
    /** sha256 of the source bytes, set when the worker first reads the file. */
    checksum: text("checksum"),
    committedAt: timestamp("committed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    createdByUserId: uuid("created_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    defaultExpenseCategoryId: uuid("default_expense_category_id")
      .notNull()
      .references(() => category.id, { onDelete: "cascade" }),
    defaultIncomeCategoryId: uuid("default_income_category_id")
      .notNull()
      .references(() => category.id, { onDelete: "cascade" }),
    duplicateRows: integer("duplicate_rows").default(0).notNull(),
    error: text("error"),
    /** The status to resume from when a failed import is retried. */
    failedStatus: text("failed_status", {
      enum: ["validating", "committing"],
    }),
    fileName: text("file_name").notNull(),
    headers: jsonb("headers").$type<string[]>().default([]).notNull(),
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    importedRows: integer("imported_rows").default(0).notNull(),
    invalidRows: integer("invalid_rows").default(0).notNull(),
    /** Parsed with the import mapping schema on every read. */
    mapping: jsonb("mapping").$type<unknown>().notNull(),
    openingBalanceMode: text("opening_balance_mode", {
      enum: ["reject", "rebase", "include"],
    }).notNull(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    sourceFileId: uuid("source_file_id").references(() => file.id, {
      onDelete: "set null",
    }),
    status: text("status", { enum: transactionImportStatuses }).notNull(),
    totalRows: integer("total_rows").default(0).notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    validRows: integer("valid_rows").default(0).notNull(),
    validatedAt: timestamp("validated_at"),
  },
  (table) => [
    index("transaction_import_organization_idx").on(
      table.organizationId,
      table.id
    ),
    index("transaction_import_checksum_idx").on(
      table.organizationId,
      table.checksum
    ),
  ]
);

export const transactionImportRow = pgTable(
  "transaction_import_row",
  {
    amount: numeric("amount", { precision: 30, scale: 6 }),
    categoryId: uuid("category_id").references(() => category.id, {
      onDelete: "set null",
    }),
    description: text("description"),
    errors: jsonb("errors")
      .$type<TransactionImportRowError[]>()
      .default([])
      .notNull(),
    fingerprint: text("fingerprint"),
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    importId: uuid("import_id")
      .notNull()
      .references(() => transactionImport.id, { onDelete: "cascade" }),
    notes: text("notes"),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    raw: jsonb("raw").$type<string[]>().notNull(),
    /** Spreadsheet row number, header included, so users can find it. */
    rowNumber: integer("row_number").notNull(),
    status: text("status", { enum: transactionImportRowStatuses }).notNull(),
    transactionDate: date("transaction_date", { mode: "string" }),
    transactionId: uuid("transaction_id").references(
      () => financialTransaction.id,
      { onDelete: "set null" }
    ),
    type: text("type", { enum: ["income", "expense"] }),
  },
  (table) => [
    uniqueIndex("transaction_import_row_import_row_uidx").on(
      table.importId,
      table.rowNumber
    ),
    index("transaction_import_row_import_status_idx").on(
      table.importId,
      table.status,
      table.rowNumber
    ),
    index("transaction_import_row_transaction_idx").on(table.transactionId),
  ]
);
