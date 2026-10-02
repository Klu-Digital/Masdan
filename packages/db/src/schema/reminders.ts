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
import { oneOf, timestamps, timestamptz } from "./columns";
import { creditCardStatement, financialAccount } from "./financial-accounts";

/** `statement`: a closing date to record; `payment`: a due date to pay. */
export const cardReminderKinds = ["statement", "payment"] as const;
export type CardReminderKind = (typeof cardReminderKinds)[number];

export const cardReminderStatuses = [
  "active",
  "dismissed",
  "resolved",
] as const;
export type CardReminderStatus = (typeof cardReminderStatuses)[number];

export const cardReminderResolutions = [
  "recorded",
  "paid",
  "superseded",
  "expired",
  "account_archived",
] as const;
export type CardReminderResolution = (typeof cardReminderResolutions)[number];

// Kept after dismissal: the unique index stops the date regenerating.
export const creditCardReminder = pgTable(
  "credit_card_reminder",
  {
    accountId: uuid("account_id").notNull(),
    ...timestamps(),
    dismissedAt: timestamptz("dismissed_at"),
    dismissedByUserId: uuid("dismissed_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    /** The closing or due date, a household calendar day. */
    eventDate: date("event_date", { mode: "string" }).notNull(),
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    kind: text("kind", { enum: cardReminderKinds }).notNull(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    /** Payment reminders only: transfers into the card dated after this day pay it. */
    paymentsAfter: date("payments_after", { mode: "string" }),
    resolution: text("resolution", { enum: cardReminderResolutions }),
    resolvedAt: timestamptz("resolved_at"),
    /** Set when the due date came from a recorded statement; null when projected from the card's due day. */
    statementId: uuid("statement_id"),
    status: text("status", { enum: cardReminderStatuses })
      .default("active")
      .notNull(),
  },
  (table) => [
    check(
      "credit_card_reminder_kind_chk",
      oneOf(table.kind, cardReminderKinds)
    ),
    check(
      "credit_card_reminder_status_chk",
      oneOf(table.status, cardReminderStatuses)
    ),
    check(
      "credit_card_reminder_resolution_value_chk",
      oneOf(table.resolution, cardReminderResolutions)
    ),
    foreignKey({
      columns: [table.organizationId, table.accountId],
      foreignColumns: [financialAccount.organizationId, financialAccount.id],
      name: "credit_card_reminder_account_id_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.organizationId, table.statementId],
      foreignColumns: [
        creditCardStatement.organizationId,
        creditCardStatement.id,
      ],
      name: "credit_card_reminder_statement_id_fkey",
    }).onDelete("cascade"),
    check(
      "credit_card_reminder_resolution_chk",
      sql`(${table.status} = 'resolved') = (${table.resolution} IS NOT NULL)`
    ),
    check(
      "credit_card_reminder_payment_fields_chk",
      sql`(${table.kind} = 'payment') = (${table.paymentsAfter} IS NOT NULL)
        AND (${table.kind} = 'payment' OR ${table.statementId} IS NULL)`
    ),
    uniqueIndex("credit_card_reminder_account_kind_date_uidx").on(
      table.accountId,
      table.kind,
      table.eventDate
    ),
    index("credit_card_reminder_organization_status_idx").on(
      table.organizationId,
      table.status,
      table.eventDate
    ),
    index("credit_card_reminder_statement_idx").on(table.statementId),
  ]
);
