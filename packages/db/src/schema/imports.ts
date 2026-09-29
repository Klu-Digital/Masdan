import { sql } from "drizzle-orm";
import {
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { organization, user } from "./auth";
import { category } from "./categories";
import { money, timestamps, timestamptz } from "./columns";
import { financialAccount } from "./financial-accounts";
import type { TransactionRuleApplication } from "./rules";
import { file } from "./storage";
import type {
  TransactionImportRowSuggestion,
  TransactionSuggestionApplication,
} from "./suggestions";
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
    accountId: uuid("account_id").notNull(),
    /** sha256 of the source bytes, set when the worker first reads the file. */
    checksum: text("checksum"),
    committedAt: timestamptz("committed_at"),
    ...timestamps(),
    createdByUserId: uuid("created_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    defaultExpenseCategoryId: uuid("default_expense_category_id").notNull(),
    defaultIncomeCategoryId: uuid("default_income_category_id").notNull(),
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
    sourceFileId: uuid("source_file_id"),
    status: text("status", { enum: transactionImportStatuses }).notNull(),
    totalRows: integer("total_rows").default(0).notNull(),
    validRows: integer("valid_rows").default(0).notNull(),
    validatedAt: timestamptz("validated_at"),
  },
  (table) => [
    unique("transaction_import_organization_id_key").on(
      table.organizationId,
      table.id
    ),
    foreignKey({
      columns: [table.organizationId, table.accountId],
      foreignColumns: [financialAccount.organizationId, financialAccount.id],
      name: "transaction_import_account_id_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.organizationId, table.defaultExpenseCategoryId],
      foreignColumns: [category.organizationId, category.id],
      name: "transaction_import_default_expense_category_id_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.organizationId, table.defaultIncomeCategoryId],
      foreignColumns: [category.organizationId, category.id],
      name: "transaction_import_default_income_category_id_fkey",
    }).onDelete("restrict"),
    // The migration narrows this to `SET NULL (source_file_id)`, which drizzle
    // cannot express: nulling organization_id too would fail its NOT NULL.
    foreignKey({
      columns: [table.organizationId, table.sourceFileId],
      foreignColumns: [file.organizationId, file.id],
      name: "transaction_import_source_file_id_fkey",
    }).onDelete("set null"),
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
    amount: money("amount"),
    categoryId: uuid("category_id"),
    description: text("description"),
    errors: jsonb("errors")
      .$type<TransactionImportRowError[]>()
      .default([])
      .notNull(),
    fingerprint: text("fingerprint"),
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    importId: uuid("import_id").notNull(),
    notes: text("notes"),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    raw: jsonb("raw").$type<string[]>().notNull(),
    /** Spreadsheet row number, header included, so users can find it. */
    rowNumber: integer("row_number").notNull(),
    /** The rule that set this row's category/tags at preview; commit applies it as-is. */
    ruleApplication:
      jsonb("rule_application").$type<TransactionRuleApplication>(),
    status: text("status", { enum: transactionImportRowStatuses }).notNull(),
    /** An AI suggestion under review; the category moves only on accept. */
    suggestion: jsonb("suggestion").$type<TransactionImportRowSuggestion>(),
    /** The accepted suggestion; commit copies it onto the transaction. */
    suggestionApplication: jsonb(
      "suggestion_application"
    ).$type<TransactionSuggestionApplication>(),
    transactionDate: date("transaction_date", { mode: "string" }),
    transactionId: uuid("transaction_id"),
    type: text("type", { enum: ["income", "expense"] }),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.importId],
      foreignColumns: [transactionImport.organizationId, transactionImport.id],
      name: "transaction_import_row_import_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId, table.categoryId],
      foreignColumns: [category.organizationId, category.id],
      name: "transaction_import_row_category_id_fkey",
    }).onDelete("restrict"),
    // Narrowed to `SET NULL (transaction_id)` in the migration, as above.
    foreignKey({
      columns: [table.organizationId, table.transactionId],
      foreignColumns: [
        financialTransaction.organizationId,
        financialTransaction.id,
      ],
      name: "transaction_import_row_transaction_id_fkey",
    }).onDelete("set null"),
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
