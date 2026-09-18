import { sql } from "drizzle-orm";
import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { organization } from "./auth";

/** Household-owned transaction metadata; archive instead of delete. */
export const tag = pgTable(
  "tag",
  {
    archivedAt: timestamp("archived_at"),
    color: text("color").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    name: text("name").notNull(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("tag_organization_archived_idx").on(
      table.organizationId,
      table.archivedAt
    ),
    uniqueIndex("tag_organization_name_uidx").on(
      table.organizationId,
      sql`lower(${table.name})`
    ),
  ]
);
