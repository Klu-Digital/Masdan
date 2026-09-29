import {
  bigint,
  date,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { organization, user } from "./auth";

/**
 * AI tokens a household spent per UTC day, checked against
 * `AI_DAILY_TOKEN_BUDGET` before every model call. In Postgres, not Redis: a
 * spending cap that resets whenever Redis is flushed or absent is no cap.
 */
export const aiUsage = pgTable(
  "ai_usage",
  {
    day: date("day", { mode: "string" }).notNull(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    requests: integer("requests").default(0).notNull(),
    tokens: bigint("tokens", { mode: "number" }).default(0).notNull(),
  },
  (table) => [primaryKey({ columns: [table.organizationId, table.day] })]
);

/**
 * An admin's override of one AI feature's `max_tokens`. Defaults live in code
 * (`AI_FEATURES` in `@masdan/api`), so a row exists only once an admin has
 * changed one. Feature is plain text: removing a feature from code leaves a
 * harmless orphan row rather than needing a migration.
 */
export const aiTokenCap = pgTable("ai_token_cap", {
  feature: text("feature").primaryKey(),
  maxTokens: integer("max_tokens").notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
  /** Audit only. `set null` so removing an admin doesn't erase the change. */
  updatedBy: uuid("updated_by").references(() => user.id, {
    onDelete: "set null",
  }),
});
