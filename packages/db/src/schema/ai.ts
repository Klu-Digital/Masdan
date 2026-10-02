import {
  bigint,
  date,
  integer,
  pgTable,
  primaryKey,
  text,
  uuid,
} from "drizzle-orm/pg-core";

import { organization, user } from "./auth";
import { timestamptz } from "./columns";

// In Postgres, not Redis: a cap that resets on a flush is no cap.
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

export const aiTokenCap = pgTable("ai_token_cap", {
  feature: text("feature").primaryKey(),
  maxTokens: integer("max_tokens").notNull(),
  updatedAt: timestamptz("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
  /** Audit only. `set null` so removing an admin doesn't erase the change. */
  updatedBy: uuid("updated_by").references(() => user.id, {
    onDelete: "set null",
  }),
});
