import { sql } from "drizzle-orm";
import { boolean, pgTable, text, uuid } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { timestamps } from "./columns";

/** Postgres 18+ native time-ordered UUID, used as the default for every id column. */
const uuidv7 = sql`uuidv7()`;

export const featureFlag = pgTable("feature_flag", {
  ...timestamps(),
  enabled: boolean("enabled").notNull(),
  id: uuid("id").primaryKey().default(uuidv7),
  name: text("name").notNull().unique(),
  /** Audit only. `set null` so removing an admin doesn't erase the toggle. */
  updatedBy: uuid("updated_by").references(() => user.id, {
    onDelete: "set null",
  }),
});
