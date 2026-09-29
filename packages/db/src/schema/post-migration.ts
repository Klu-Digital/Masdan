import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  text,
  uuid,
} from "drizzle-orm/pg-core";

import { oneOf, timestamps, timestamptz } from "./columns";

const uuidv7 = sql`uuidv7()`;

export const postMigrationStatuses = ["running", "success", "failed"] as const;
export type PostMigrationStatus = (typeof postMigrationStatuses)[number];

/**
 * One row per script `name`, overwritten on each attempt — a failed row is the
 * debugging trail.
 */
export const postMigration = pgTable(
  "post_migration",
  {
    appliedBy: text("applied_by").notNull(),
    checksum: text("checksum").notNull(),
    ...timestamps(),
    description: text("description").notNull(),
    durationMs: integer("duration_ms"),
    error: text("error"),
    finishedAt: timestamptz("finished_at"),
    id: uuid("id").primaryKey().default(uuidv7),
    name: text("name").notNull().unique(),
    startedAt: timestamptz("started_at").notNull(),
    status: text("status", { enum: postMigrationStatuses }).notNull(),
  },
  (table) => [
    check(
      "post_migration_status_chk",
      oneOf(table.status, postMigrationStatuses)
    ),
    index("post_migration_status_idx").on(table.status),
  ]
);
