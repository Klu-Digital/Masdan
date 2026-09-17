import { sql } from "drizzle-orm";
import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

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
    createdAt: timestamp("created_at").defaultNow().notNull(),
    description: text("description").notNull(),
    durationMs: integer("duration_ms"),
    error: text("error"),
    finishedAt: timestamp("finished_at"),
    id: uuid("id").primaryKey().default(uuidv7),
    name: text("name").notNull().unique(),
    startedAt: timestamp("started_at").notNull(),
    status: text("status", { enum: postMigrationStatuses }).notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("post_migration_status_idx").on(table.status)]
);
