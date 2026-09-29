import { sql } from "drizzle-orm";
import {
  index,
  integer,
  pgTable,
  text,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { organization } from "./auth";
import { timestamps, timestamptz } from "./columns";

/** Household-owned transaction classification; archive instead of delete. */
export const category = pgTable(
  "category",
  {
    archivedAt: timestamptz("archived_at"),
    color: text("color").notNull(),
    ...timestamps(),
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
  },
  (table) => [
    unique("category_organization_id_key").on(table.organizationId, table.id),
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
