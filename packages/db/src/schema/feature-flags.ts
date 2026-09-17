import { sql } from "drizzle-orm";
import { boolean, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { user } from "./auth";

/** Postgres 18+ native time-ordered UUID, used as the default for every id column. */
const uuidv7 = sql`uuidv7()`;

/**
 * The runtime value of a feature flag. Flags are declared in code
 * (`featureFlagRegistry` in `@masdan/env/flags`); this table only overrides the
 * declared default, so a row exists only once an admin has touched it and a
 * newly declared flag works on first boot. Global on purpose: no
 * `organizationId`, no per-user targeting.
 */
export const featureFlag = pgTable("feature_flag", {
  createdAt: timestamp("created_at").defaultNow().notNull(),
  enabled: boolean("enabled").notNull(),
  id: uuid("id").primaryKey().default(uuidv7),
  /**
   * Plain text rather than a pg enum: deleting a flag from code then leaves a
   * harmless orphan row instead of requiring a migration before the code change
   * can ship.
   */
  name: text("name").notNull().unique(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
  /** Audit only. `set null` so removing an admin doesn't erase the toggle. */
  updatedBy: uuid("updated_by").references(() => user.id, {
    onDelete: "set null",
  }),
});
