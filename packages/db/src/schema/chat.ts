import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { organization, user } from "./auth";
import { oneOf, timestamptz } from "./columns";
import { financialTransaction } from "./transactions";

export const chatChannels = ["telegram"] as const;
export type ChatChannel = (typeof chatChannels)[number];

// Only the code's SHA-256 is stored. Postgres, since Redis is optional.
export const chatLinkCode = pgTable(
  "chat_link_code",
  {
    codeHash: text("code_hash").notNull(),
    consumedAt: timestamptz("consumed_at"),
    createdAt: timestamptz("created_at").defaultNow().notNull(),
    expiresAt: timestamptz("expires_at").notNull(),
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    /** The household active when the code was made; the link binds to it. */
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [
    uniqueIndex("chat_link_code_hash_uidx").on(table.codeHash),
    index("chat_link_code_user_organization_idx").on(
      table.userId,
      table.organizationId
    ),
  ]
);

// Membership is re-checked on every message, not trusted from linking.
export const chatLink = pgTable(
  "chat_link",
  {
    channel: text("channel", { enum: chatChannels }).notNull(),
    createdAt: timestamptz("created_at").defaultNow().notNull(),
    /** Display only, as of linking, e.g. `@mj`; names change. */
    externalName: text("external_name"),
    /** Text, not a number: Discord snowflakes overflow a JS number. */
    externalUserId: text("external_user_id").notNull(),
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [
    check("chat_link_channel_chk", oneOf(table.channel, chatChannels)),
    uniqueIndex("chat_link_channel_external_user_uidx").on(
      table.channel,
      table.externalUserId
    ),
    uniqueIndex("chat_link_channel_user_organization_uidx").on(
      table.channel,
      table.userId,
      table.organizationId
    ),
    index("chat_link_organization_idx").on(table.organizationId),
  ]
);

// The key dedupes channel retries; `processedAt` dedupes job retries.
export const chatInboundMessage = pgTable(
  "chat_inbound_message",
  {
    channel: text("channel", { enum: chatChannels }).notNull(),
    /** The channel's own id for the delivery, e.g. Telegram's `update_id`. */
    messageId: text("message_id").notNull(),
    organizationId: uuid("organization_id").references(() => organization.id, {
      onDelete: "cascade",
    }),
    processedAt: timestamptz("processed_at"),
    receivedAt: timestamptz("received_at").defaultNow().notNull(),
    transactionId: uuid("transaction_id"),
  },
  (table) => [
    check(
      "chat_inbound_message_channel_chk",
      oneOf(table.channel, chatChannels)
    ),
    primaryKey({ columns: [table.channel, table.messageId] }),
    foreignKey({
      columns: [table.organizationId, table.transactionId],
      foreignColumns: [
        financialTransaction.organizationId,
        financialTransaction.id,
      ],
      name: "chat_inbound_message_transaction_id_fkey",
    }).onDelete("set null"),
    // MATCH SIMPLE skips the key above when either half is null.
    check(
      "chat_inbound_message_household_chk",
      sql`(${table.organizationId} IS NULL) = (${table.transactionId} IS NULL)`
    ),
  ]
);
