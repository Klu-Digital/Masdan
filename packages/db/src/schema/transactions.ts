import { sql } from "drizzle-orm";
import {
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { organization } from "./auth";
import { category } from "./categories";
import { money, oneOf, timestamps, timestamptz } from "./columns";
import { currency } from "./finance";
import {
  financialAccount,
  financialAccountBalanceSnapshot,
} from "./financial-accounts";
import type { TransactionRuleApplication } from "./rules";
import { file } from "./storage";
import type { TransactionSuggestionApplication } from "./suggestions";
import { tag } from "./tags";

export const paidStatusEnum = pgEnum("paid_status", ["paid", "unpaid"]);
export const transferSideEnum = pgEnum("transfer_side", [
  "source",
  "destination",
]);

export const recurringScheduleStatuses = [
  "active",
  "paused",
  "stopped",
] as const;
export type RecurringScheduleStatus =
  (typeof recurringScheduleStatuses)[number];

export const recurringFrequencies = ["daily", "weekly", "monthly"] as const;
export type RecurringFrequency = (typeof recurringFrequencies)[number];

/** Upper bound on "every N days/weeks/months"; keeps date math in range. */
export const MAX_RECURRING_INTERVAL = 366;

/**
 * A template that posts an income or expense on a calendar rhythm. Occurrences
 * are household calendar days counted from `startDate`; `nextOccurrenceDate`
 * is the next one still to post, and is null once the schedule is stopped.
 */
export const recurringSchedule = pgTable(
  "recurring_schedule",
  {
    accountId: uuid("account_id").notNull(),
    amount: money("amount").notNull(),
    categoryId: uuid("category_id").notNull(),
    ...timestamps(),
    frequency: text("frequency", { enum: recurringFrequencies }).notNull(),
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    interval: integer("interval").default(1).notNull(),
    /** Why generation paused the schedule on its own, shown until resumed. */
    lastError: text("last_error"),
    name: text("name").notNull(),
    nextOccurrenceDate: date("next_occurrence_date", { mode: "string" }),
    notes: text("notes"),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    paidStatus: paidStatusEnum("paid_status").default("paid").notNull(),
    pausedAt: timestamptz("paused_at"),
    startDate: date("start_date", { mode: "string" }).notNull(),
    status: text("status", { enum: recurringScheduleStatuses })
      .default("active")
      .notNull(),
    stoppedAt: timestamptz("stopped_at"),
  },
  (table) => [
    check(
      "recurring_schedule_frequency_chk",
      oneOf(table.frequency, recurringFrequencies)
    ),
    check(
      "recurring_schedule_status_chk",
      oneOf(table.status, recurringScheduleStatuses)
    ),
    unique("recurring_schedule_organization_id_key").on(
      table.organizationId,
      table.id
    ),
    foreignKey({
      columns: [table.organizationId, table.accountId],
      foreignColumns: [financialAccount.organizationId, financialAccount.id],
      name: "recurring_schedule_account_id_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.organizationId, table.categoryId],
      foreignColumns: [category.organizationId, category.id],
      name: "recurring_schedule_category_id_fkey",
    }).onDelete("restrict"),
    check("recurring_schedule_positive_amount_chk", sql`${table.amount} > 0`),
    check(
      "recurring_schedule_interval_chk",
      sql`${table.interval} BETWEEN 1 AND ${sql.raw(String(MAX_RECURRING_INTERVAL))}`
    ),
    check(
      "recurring_schedule_next_occurrence_chk",
      sql`(${table.status} = 'stopped') = (${table.nextOccurrenceDate} IS NULL)
        AND (${table.nextOccurrenceDate} IS NULL OR ${table.nextOccurrenceDate} >= ${table.startDate})`
    ),
    index("recurring_schedule_organization_idx").on(
      table.organizationId,
      table.status,
      table.nextOccurrenceDate
    ),
    index("recurring_schedule_due_idx")
      .on(table.nextOccurrenceDate)
      .where(sql`${table.status} = 'active'`),
    index("recurring_schedule_account_idx").on(table.accountId),
    index("recurring_schedule_category_idx").on(table.categoryId),
  ]
);

export const recurringScheduleTag = pgTable(
  "recurring_schedule_tag",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    scheduleId: uuid("schedule_id").notNull(),
    tagId: uuid("tag_id").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.scheduleId, table.tagId] }),
    foreignKey({
      columns: [table.organizationId, table.scheduleId],
      foreignColumns: [recurringSchedule.organizationId, recurringSchedule.id],
      name: "recurring_schedule_tag_schedule_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId, table.tagId],
      foreignColumns: [tag.organizationId, tag.id],
      name: "recurring_schedule_tag_tag_id_fkey",
    }).onDelete("restrict"),
    index("recurring_schedule_tag_tag_idx").on(table.tagId),
  ]
);

export const financialTransfer = pgTable(
  "financial_transfer",
  {
    ...timestamps(),
    destinationAccountId: uuid("destination_account_id").notNull(),
    destinationAmount: money("destination_amount").notNull(),
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    notes: text("notes"),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    sourceAccountId: uuid("source_account_id").notNull(),
    sourceAmount: money("source_amount").notNull(),
    transactionDate: date("transaction_date", { mode: "string" }).notNull(),
  },
  (table) => [
    unique("financial_transfer_organization_id_key").on(
      table.organizationId,
      table.id
    ),
    foreignKey({
      columns: [table.organizationId, table.sourceAccountId],
      foreignColumns: [financialAccount.organizationId, financialAccount.id],
      name: "financial_transfer_source_account_id_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.organizationId, table.destinationAccountId],
      foreignColumns: [financialAccount.organizationId, financialAccount.id],
      name: "financial_transfer_destination_account_id_fkey",
    }).onDelete("restrict"),
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
    accountId: uuid("account_id").notNull(),
    adjustmentDirection: text("adjustment_direction", {
      enum: ["increase", "decrease"],
    }),
    /** Positive magnitude; category, transfer side or adjustment direction supplies the sign. */
    amount: money("amount").notNull(),
    archivedAt: timestamptz("archived_at"),
    categoryId: uuid("category_id"),
    ...timestamps(),
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
    reconciliationSnapshotId: uuid("reconciliation_snapshot_id"),
    /** The schedule occurrence this transaction was posted for. */
    recurringOccurrenceDate: date("recurring_occurrence_date", {
      mode: "string",
    }),
    recurringScheduleId: uuid("recurring_schedule_id"),
    /** The rule behind the current category/tags; cleared once they stop holding. */
    ruleApplication:
      jsonb("rule_application").$type<TransactionRuleApplication>(),
    /** The accepted AI suggestion behind the category/tags, while it holds. */
    suggestionApplication: jsonb(
      "suggestion_application"
    ).$type<TransactionSuggestionApplication>(),
    transactionDate: date("transaction_date", { mode: "string" }).notNull(),
    transferId: uuid("transfer_id"),
    transferSide: transferSideEnum("transfer_side"),
  },
  (table) => [
    unique("financial_transaction_organization_id_key").on(
      table.organizationId,
      table.id
    ),
    // Accounts, categories and schedules are archived or stopped, never
    // deleted, so a stray delete must not take ledger history with it.
    foreignKey({
      columns: [table.organizationId, table.accountId],
      foreignColumns: [financialAccount.organizationId, financialAccount.id],
      name: "financial_transaction_account_id_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.organizationId, table.categoryId],
      foreignColumns: [category.organizationId, category.id],
      name: "financial_transaction_category_id_fkey",
    }).onDelete("restrict"),
    // Deleting a transfer deletes both of its legs.
    foreignKey({
      columns: [table.organizationId, table.transferId],
      foreignColumns: [financialTransfer.organizationId, financialTransfer.id],
      name: "financial_transaction_transfer_id_fkey",
    }).onDelete("cascade"),
    check(
      "financial_transaction_positive_amount_chk",
      sql`${table.amount} > 0`
    ),
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
        (${table.reconciliationSnapshotId} IS NULL AND ${table.adjustmentDirection} IS NULL AND (
          (${table.categoryId} IS NOT NULL AND ${table.transferId} IS NULL AND ${table.transferSide} IS NULL)
          OR
          (${table.categoryId} IS NULL AND ${table.transferId} IS NOT NULL AND ${table.transferSide} IS NOT NULL)
        ))
        OR
        (${table.reconciliationSnapshotId} IS NOT NULL AND ${table.adjustmentDirection} IS NOT NULL
          AND ${table.adjustmentDirection} IN ('increase', 'decrease')
          AND ${table.categoryId} IS NULL AND ${table.transferId} IS NULL AND ${table.transferSide} IS NULL
          AND ${table.recurringScheduleId} IS NULL AND ${table.recurringOccurrenceDate} IS NULL
          AND ${table.importFingerprint} IS NULL AND ${table.ruleApplication} IS NULL AND ${table.suggestionApplication} IS NULL)
      )`
    ),
    foreignKey({
      columns: [
        table.organizationId,
        table.accountId,
        table.reconciliationSnapshotId,
      ],
      foreignColumns: [
        financialAccountBalanceSnapshot.organizationId,
        financialAccountBalanceSnapshot.accountId,
        financialAccountBalanceSnapshot.id,
      ],
      name: "transaction_reconciliation_snapshot_fkey",
    }).onDelete("restrict"),
    uniqueIndex("transaction_reconciliation_snapshot_uidx").on(
      table.reconciliationSnapshotId
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
    foreignKey({
      columns: [table.organizationId, table.recurringScheduleId],
      foreignColumns: [recurringSchedule.organizationId, recurringSchedule.id],
      name: "financial_transaction_recurring_schedule_id_fkey",
    }).onDelete("restrict"),
    check(
      "financial_transaction_recurring_occurrence_chk",
      sql`(${table.recurringScheduleId} IS NULL) = (${table.recurringOccurrenceDate} IS NULL)`
    ),
    // One transaction per schedule occurrence, however many workers race for it.
    uniqueIndex("financial_transaction_recurring_occurrence_uidx")
      .on(table.recurringScheduleId, table.recurringOccurrenceDate)
      .where(sql`${table.recurringScheduleId} IS NOT NULL`),
  ]
);

export const financialTransactionSplit = pgTable(
  "financial_transaction_split",
  {
    amount: money("amount").notNull(),
    categoryId: uuid("category_id").notNull(),
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull(),
    transactionId: uuid("transaction_id").notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.transactionId],
      foreignColumns: [
        financialTransaction.organizationId,
        financialTransaction.id,
      ],
      name: "financial_transaction_split_transaction_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId, table.categoryId],
      foreignColumns: [category.organizationId, category.id],
      name: "financial_transaction_split_category_id_fkey",
    }).onDelete("restrict"),
    check(
      "financial_transaction_split_positive_amount_chk",
      sql`${table.amount} > 0`
    ),
    uniqueIndex("financial_transaction_split_transaction_order_uidx").on(
      table.transactionId,
      table.sortOrder
    ),
    index("financial_transaction_split_category_idx").on(table.categoryId),
  ]
);

/** A file belongs to at most one transaction, so removing the attachment can delete the file outright. */
export const financialTransactionAttachment = pgTable(
  "financial_transaction_attachment",
  {
    createdAt: timestamptz("created_at").defaultNow().notNull(),
    fileId: uuid("file_id").notNull(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    transactionId: uuid("transaction_id").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.transactionId, table.fileId] }),
    foreignKey({
      columns: [table.organizationId, table.fileId],
      foreignColumns: [file.organizationId, file.id],
      name: "financial_transaction_attachment_file_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId, table.transactionId],
      foreignColumns: [
        financialTransaction.organizationId,
        financialTransaction.id,
      ],
      name: "financial_transaction_attachment_transaction_id_fkey",
    }).onDelete("cascade"),
    uniqueIndex("financial_transaction_attachment_file_uidx").on(table.fileId),
  ]
);

export const financialTransactionTag = pgTable(
  "financial_transaction_tag",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id").notNull(),
    transactionId: uuid("transaction_id").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.transactionId, table.tagId] }),
    foreignKey({
      columns: [table.organizationId, table.tagId],
      foreignColumns: [tag.organizationId, tag.id],
      name: "financial_transaction_tag_tag_id_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.organizationId, table.transactionId],
      foreignColumns: [
        financialTransaction.organizationId,
        financialTransaction.id,
      ],
      name: "financial_transaction_tag_transaction_id_fkey",
    }).onDelete("cascade"),
    index("financial_transaction_tag_tag_transaction_idx").on(
      table.tagId,
      table.transactionId
    ),
  ]
);
