import { sql } from "drizzle-orm";
import {
  index,
  pgTable,
  text,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { organization } from "./auth";
import { timestamps, timestamptz } from "./columns";

/** Household-owned transaction metadata; archive instead of delete. */
export const tag = pgTable(
  "tag",
  {
    archivedAt: timestamptz("archived_at"),
    color: text("color").notNull(),
    ...timestamps(),
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    name: text("name").notNull(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
  },
  (table) => [
    unique("tag_organization_id_key").on(table.organizationId, table.id),
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
