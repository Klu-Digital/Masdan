import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { organization } from "./auth";
import { category } from "./categories";
import { currency } from "./finance";
import { financialAccount } from "./financial-accounts";
import type { TransactionRuleApplication } from "./rules";
import { file } from "./storage";
import { tag } from "./tags";

const money = (name: string) => numeric(name, { precision: 30, scale: 6 });

export const paidStatusEnum = pgEnum("paid_status", ["paid", "unpaid"]);
export const transferSideEnum = pgEnum("transfer_side", [
  "source",
  "destination",
]);

export const financialTransfer = pgTable(
  "financial_transfer",
  {
    createdAt: timestamp("created_at").defaultNow().notNull(),
    destinationAccountId: uuid("destination_account_id")
      .notNull()
      .references(() => financialAccount.id, { onDelete: "cascade" }),
    destinationAmount: money("destination_amount").notNull(),
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    notes: text("notes"),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    sourceAccountId: uuid("source_account_id")
      .notNull()
      .references(() => financialAccount.id, { onDelete: "cascade" }),
    sourceAmount: money("source_amount").notNull(),
    transactionDate: date("transaction_date", { mode: "string" }).notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    check(
      "financial_transfer_distinct_accounts_chk",
      sql`${table.sourceAccountId} <> ${table.destinationAccountId}`
    ),
    check(
      "financial_transfer_positive_amounts_chk",
      sql`${table.sourceAmount} > 0 AND ${table.destinationAmount} > 0`
    ),
    index("financial_transfer_organization_date_idx").on(
      table.organizationId,
      table.transactionDate,
      table.id
    ),
    index("financial_transfer_source_account_idx").on(
      table.sourceAccountId,
      table.transactionDate,
      table.id
    ),
    index("financial_transfer_destination_account_idx").on(
      table.destinationAccountId,
      table.transactionDate,
      table.id
    ),
  ]
);

export const financialTransaction = pgTable(
  "financial_transaction",
  {
    accountId: uuid("account_id")
      .notNull()
      .references(() => financialAccount.id, { onDelete: "cascade" }),
    amount: money("amount").notNull(),
    archivedAt: timestamp("archived_at"),
    categoryId: uuid("category_id").references(() => category.id, {
      onDelete: "cascade",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    currencyCode: text("currency_code")
      .notNull()
      .references(() => currency.code, { onDelete: "restrict" }),
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    /** Set by CSV import; unique per account so a re-import skips the row. */
    importFingerprint: text("import_fingerprint"),
    notes: text("notes"),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    paidStatus: paidStatusEnum("paid_status").default("paid").notNull(),
    /** The rule behind the current category/tags; cleared once they stop holding. */
    ruleApplication:
      jsonb("rule_application").$type<TransactionRuleApplication>(),
    transactionDate: date("transaction_date", { mode: "string" }).notNull(),
    transferId: uuid("transfer_id").references(() => financialTransfer.id, {
      onDelete: "cascade",
    }),
    transferSide: transferSideEnum("transfer_side"),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("financial_transaction_organization_date_idx").on(
      table.organizationId,
      table.archivedAt,
      table.transactionDate
    ),
    index("financial_transaction_account_date_idx").on(
      table.accountId,
      table.archivedAt,
      table.transactionDate
    ),
    check(
      "financial_transaction_category_or_transfer_chk",
      sql`(
        (${table.categoryId} IS NOT NULL AND ${table.transferId} IS NULL AND ${table.transferSide} IS NULL)
        OR
        (${table.categoryId} IS NULL AND ${table.transferId} IS NOT NULL AND ${table.transferSide} IS NOT NULL)
      )`
    ),
    index("financial_transaction_category_idx").on(table.categoryId),
    index("financial_transaction_transfer_idx").on(table.transferId),
    index("financial_transaction_organization_amount_idx").on(
      table.organizationId,
      table.archivedAt,
      table.amount,
      table.id
    ),
    uniqueIndex("financial_transaction_account_import_fingerprint_uidx")
      .on(table.accountId, table.importFingerprint)
      .where(sql`${table.importFingerprint} IS NOT NULL`),
  ]
);

export const financialTransactionSplit = pgTable(
  "financial_transaction_split",
  {
    amount: money("amount").notNull(),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => category.id, { onDelete: "cascade" }),
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    sortOrder: integer("sort_order").notNull(),
    transactionId: uuid("transaction_id")
      .notNull()
      .references(() => financialTransaction.id, { onDelete: "cascade" }),
  },
  (table) => [
    uniqueIndex("financial_transaction_split_transaction_order_uidx").on(
      table.transactionId,
      table.sortOrder
    ),
    index("financial_transaction_split_category_idx").on(table.categoryId),
  ]
);

/**
 * A file belongs to at most one transaction, so removing the attachment can
 * delete the file outright. Same-household is enforced by the attach procedure.
 */
export const financialTransactionAttachment = pgTable(
  "financial_transaction_attachment",
  {
    createdAt: timestamp("created_at").defaultNow().notNull(),
    fileId: uuid("file_id")
      .notNull()
      .references(() => file.id, { onDelete: "cascade" }),
    transactionId: uuid("transaction_id")
      .notNull()
      .references(() => financialTransaction.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.transactionId, table.fileId] }),
    uniqueIndex("financial_transaction_attachment_file_uidx").on(table.fileId),
  ]
);

export const financialTransactionTag = pgTable(
  "financial_transaction_tag",
  {
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tag.id, { onDelete: "cascade" }),
    transactionId: uuid("transaction_id")
      .notNull()
      .references(() => financialTransaction.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.transactionId, table.tagId] }),
    index("financial_transaction_tag_tag_transaction_idx").on(
      table.tagId,
      table.transactionId
    ),
  ]
);
