import { sql } from "drizzle-orm";
import {
  check,
  date,
  foreignKey,
  index,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { organization, user } from "./auth";
import { oneOf, timestamptz } from "./columns";
import { financialAccount } from "./financial-accounts";
import { financialTransaction, recurringSchedule } from "./transactions";

/** `recurring`: an expense schedule's occurrence; `card`: a credit card's due date. */
export const billKinds = ["recurring", "card"] as const;
export type BillKind = (typeof billKinds)[number];

/**
 * Proof that one bill occurrence was paid: a linked payment, or a member's
 * explicit confirmation when `transactionId` is null. A schedule posting its
 * own transaction never writes one of these — that is the point of the table.
 */
export const billPayment = pgTable(
  "bill_payment",
  {
    /** Card bills only. */
    accountId: uuid("account_id"),
    confirmedByUserId: uuid("confirmed_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamptz("created_at").defaultNow().notNull(),
    /** The occurrence's due date, a household calendar day. */
    dueDate: date("due_date", { mode: "string" }).notNull(),
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    kind: text("kind", { enum: billKinds }).notNull(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    /** Recurring bills only. */
    scheduleId: uuid("schedule_id"),
    transactionId: uuid("transaction_id"),
  },
  (table) => [
    check("bill_payment_kind_chk", oneOf(table.kind, billKinds)),
    foreignKey({
      columns: [table.organizationId, table.accountId],
      foreignColumns: [financialAccount.organizationId, financialAccount.id],
      name: "bill_payment_account_id_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.organizationId, table.scheduleId],
      foreignColumns: [recurringSchedule.organizationId, recurringSchedule.id],
      name: "bill_payment_schedule_id_fkey",
    }).onDelete("restrict"),
    // Deleting the payment deletes the proof with it.
    foreignKey({
      columns: [table.organizationId, table.transactionId],
      foreignColumns: [
        financialTransaction.organizationId,
        financialTransaction.id,
      ],
      name: "bill_payment_transaction_id_fkey",
    }).onDelete("cascade"),
    check(
      "bill_payment_source_chk",
      sql`(${table.kind} = 'recurring') = (${table.scheduleId} IS NOT NULL)
        AND (${table.kind} = 'card') = (${table.accountId} IS NOT NULL)`
    ),
    uniqueIndex("bill_payment_schedule_due_uidx")
      .on(table.scheduleId, table.dueDate)
      .where(sql`${table.scheduleId} IS NOT NULL`),
    uniqueIndex("bill_payment_account_due_uidx")
      .on(table.accountId, table.dueDate)
      .where(sql`${table.accountId} IS NOT NULL`),
    // One payment settles one bill, so it is never counted twice.
    uniqueIndex("bill_payment_transaction_uidx")
      .on(table.transactionId)
      .where(sql`${table.transactionId} IS NOT NULL`),
    index("bill_payment_organization_due_idx").on(
      table.organizationId,
      table.dueDate
    ),
  ]
);

/**
 * A member's read-only iCal subscription to one household's due dates. Only
 * the SHA-256 of the URL token is stored; replacing the row rotates the link
 * and deleting it revokes the link.
 */
export const billCalendarFeed = pgTable(
  "bill_calendar_feed",
  {
    createdAt: timestamptz("created_at").defaultNow().notNull(),
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    lastUsedAt: timestamptz("last_used_at"),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [
    uniqueIndex("bill_calendar_feed_token_uidx").on(table.tokenHash),
    uniqueIndex("bill_calendar_feed_user_organization_uidx").on(
      table.userId,
      table.organizationId
    ),
    index("bill_calendar_feed_organization_idx").on(table.organizationId),
  ]
);
