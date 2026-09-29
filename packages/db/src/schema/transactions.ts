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
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { organization } from "./auth";
import { category } from "./categories";
import { money, timestamps, timestamptz } from "./columns";
import { currency } from "./finance";
import { financialAccount } from "./financial-accounts";
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
    accountId: uuid("account_id")
      .notNull()
      .references(() => financialAccount.id, { onDelete: "cascade" }),
    amount: money("amount").notNull(),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => category.id, { onDelete: "cascade" }),
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
    scheduleId: uuid("schedule_id")
      .notNull()
      .references(() => recurringSchedule.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tag.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.scheduleId, table.tagId] }),
    index("recurring_schedule_tag_tag_idx").on(table.tagId),
  ]
);

export const financialTransfer = pgTable(
  "financial_transfer",
  {
    ...timestamps(),
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
    archivedAt: timestamptz("archived_at"),
    categoryId: uuid("category_id").references(() => category.id, {
      onDelete: "cascade",
    }),
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
    /**
     * The schedule occurrence this transaction was posted for. No `onDelete`:
     * schedules are stopped, never deleted, so history keeps its origin.
     */
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
    transferId: uuid("transfer_id").references(() => financialTransfer.id, {
      onDelete: "cascade",
    }),
    transferSide: transferSideEnum("transfer_side"),
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
    foreignKey({
      columns: [table.recurringScheduleId],
      foreignColumns: [recurringSchedule.id],
      name: "financial_transaction_recurring_schedule_id_fkey",
    }),
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
    createdAt: timestamptz("created_at").defaultNow().notNull(),
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
