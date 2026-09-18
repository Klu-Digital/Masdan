import { sql } from "drizzle-orm";
import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { organization } from "./auth";

/** Household-owned transaction classification; archive instead of delete. */
export const category = pgTable(
  "category",
  {
    archivedAt: timestamp("archived_at"),
    color: text("color").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    icon: text("icon").notNull(),
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    name: text("name").notNull(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").default(0).notNull(),
    type: text("type").notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("category_organization_archived_idx").on(
      table.organizationId,
      table.archivedAt
    ),
    uniqueIndex("category_organization_name_uidx").on(
      table.organizationId,
      sql`lower(${table.name})`
    ),
  ]
);
