import { sql } from "drizzle-orm";
import {
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { organization, user } from "./auth";
import { financialTransaction } from "./transactions";

/**
 * Messaging apps a user can add transactions from. Adding one is a code change
 * (an adapter in `@masdan/api/chat/channels`), not a migration: the columns
 * below are plain text.
 */
export const chatChannels = ["telegram"] as const;
export type ChatChannel = (typeof chatChannels)[number];

/**
 * A short-lived, single-use code a user sends from any chat app as
 * `/link <code>`. Only the SHA-256 of the code is stored. In Postgres, not
 * Redis: Redis is optional, so linking would silently break without it.
 */
export const chatLinkCode = pgTable(
  "chat_link_code",
  {
    codeHash: text("code_hash").notNull(),
    consumedAt: timestamp("consumed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    expiresAt: timestamp("expires_at").notNull(),
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

/**
 * A chat-app account bound to one user in one household: a message carries no
 * session, so the household has to come from here. Membership and permission
 * are re-checked on every message, not trusted from the time of linking.
 */
export const chatLink = pgTable(
  "chat_link",
  {
    channel: text("channel", { enum: chatChannels }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
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
    uniqueIndex("chat_link_channel_external_user_uidx").on(
      table.channel,
      table.externalUserId
    ),
    uniqueIndex("chat_link_channel_user_organization_uidx").on(
      table.channel,
      table.userId,
      table.organizationId
    ),
  ]
);

/**
 * One row per delivered message. The key is what turns a channel's retries
 * into no-ops; `processedAt` does the same for a retried worker job.
 */
export const chatInboundMessage = pgTable(
  "chat_inbound_message",
  {
    channel: text("channel", { enum: chatChannels }).notNull(),
    /** The channel's own id for the delivery, e.g. Telegram's `update_id`. */
    messageId: text("message_id").notNull(),
    processedAt: timestamp("processed_at"),
    receivedAt: timestamp("received_at").defaultNow().notNull(),
    transactionId: uuid("transaction_id").references(
      () => financialTransaction.id,
      { onDelete: "set null" }
    ),
  },
  (table) => [primaryKey({ columns: [table.channel, table.messageId] })]
);
